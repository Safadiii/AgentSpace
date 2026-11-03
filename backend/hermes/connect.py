"""Connect Gmail from the UI: store the user's Google key, run the sign-in, save the token.

Replaces editing .env and running scripts.gmail_auth by hand. Everything stays in
the local secrets folder (chmod 600); nothing here is sent anywhere but Google.
"""
import json
import os
import re
import secrets
import time
from pathlib import Path

from google_auth_oauthlib.flow import Flow

from backend.hermes.providers.gmail import SCOPES

MAX_KEY_BYTES = 20_000
PENDING_SECONDS = 600
MAX_PENDING = 20
CALLBACK_PATH = "/hermes/connect/callback"

# Only the app's own page may receive Google's answer: a local dev address.
LOCAL_ORIGIN = re.compile(r"^http://(localhost|127\.0\.0\.1):\d{2,5}$")
KEY_FIELDS = ("client_id", "client_secret", "auth_uri", "token_uri")


class ConnectError(ValueError):
    """A problem the user can fix; the message is safe to show them."""


def credentials_path() -> Path:
    return Path(os.getenv("GMAIL_CREDENTIALS_FILE", "secrets/credentials.json"))


def token_path() -> Path:
    return Path(os.getenv("GMAIL_TOKEN_FILE", "secrets/token.json"))


def parse_client_key(raw: str) -> dict:
    """Validate the JSON Google lets you download, keeping only what the sign-in needs."""
    if len(raw.encode()) > MAX_KEY_BYTES:
        raise ConnectError("That file is too big to be a Google key. Download the JSON again.")
    try:
        data = json.loads(raw)
    except ValueError:
        raise ConnectError("That is not valid JSON. Paste the whole contents of the downloaded file.") from None
    if not isinstance(data, dict):
        raise ConnectError("That does not look like a Google key file.")
    if "web" in data and "installed" not in data:
        raise ConnectError(
            "This key is for a Web application. In Google Cloud create a new OAuth client "
            "with type Desktop app and download that one instead."
        )
    key = data.get("installed")
    if not isinstance(key, dict) or any(not isinstance(key.get(f), str) or not key[f] for f in KEY_FIELDS):
        raise ConnectError("That does not look like a Google OAuth key. Download the JSON of a Desktop app client.")
    return {"installed": {f: key[f] for f in KEY_FIELDS}}


def write_private(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        f.write(text)
    os.chmod(path, 0o600)   # the mode above only applies to newly created files


def save_client_key(raw: str) -> None:
    write_private(credentials_path(), json.dumps(parse_client_key(raw)))


def has_client_key() -> bool:
    try:
        parse_client_key(credentials_path().read_text())
        return True
    except (OSError, ConnectError):
        return False


def check_origin(origin: str) -> str:
    origin = origin.rstrip("/")
    if not LOCAL_ORIGIN.match(origin):
        raise ConnectError("Connecting is only allowed from the app running on this computer.")
    return origin


class PendingLogins:
    """Sign-ins waiting for Google's answer, kept in memory and forgotten after a while."""

    def __init__(self, seconds: float = PENDING_SECONDS):
        self.seconds = seconds
        self._items: dict[str, tuple[float, Flow, str]] = {}

    def _expire(self) -> None:
        now = time.monotonic()
        for state in [s for s, (t, _, _) in self._items.items() if now - t > self.seconds]:
            del self._items[state]
        while len(self._items) >= MAX_PENDING:
            del self._items[next(iter(self._items))]

    def start(self, origin: str) -> str:
        origin = check_origin(origin)
        if not has_client_key():
            raise ConnectError("Add your Google key first.")
        flow = Flow.from_client_config(
            json.loads(credentials_path().read_text()), scopes=SCOPES,
            redirect_uri=f"{origin}{CALLBACK_PATH}",
        )
        state = secrets.token_urlsafe(24)
        # select_account lets a user pick a different Gmail; consent guarantees a refresh token.
        url, _ = flow.authorization_url(
            state=state, access_type="offline", prompt="consent select_account",
        )
        self._expire()
        self._items[state] = (time.monotonic(), flow, origin)
        return url

    def origin_of(self, state: str) -> str | None:
        item = self._items.get(state)
        return item[2] if item else None

    def discard(self, state: str) -> None:
        self._items.pop(state, None)

    def finish(self, state: str, code: str) -> None:
        """Trade Google's code for a token and save it. Raises ConnectError on any problem."""
        item = self._items.pop(state, None)
        if item is None or time.monotonic() - item[0] > self.seconds:
            raise ConnectError("This sign-in took too long or was already used. Press Connect again.")
        flow = item[1]
        try:
            flow.fetch_token(code=code)
        except Exception:   # oauthlib raises many types (scope changed, bad grant…)
            raise ConnectError(
                "Google did not accept the sign-in. Press Connect again and tick the Gmail permission box."
            ) from None
        creds = flow.credentials
        if not creds.refresh_token:
            raise ConnectError("Google did not give Hermes a lasting login. Press Connect again.")
        if not set(SCOPES) <= set(creds.scopes or []):
            raise ConnectError("The Gmail permission was not ticked. Press Connect again and allow it.")
        write_private(token_path(), creds.to_json())


pending = PendingLogins()
