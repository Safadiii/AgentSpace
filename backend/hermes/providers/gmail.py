import asyncio
import base64
import html
import re
from email.utils import parseaddr
from pathlib import Path

from bs4 import BeautifulSoup
from google.auth.exceptions import RefreshError
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

from agents.hermes.state import EmailMessage, EmailSummary
from storage.hermes.models import EmailAction

# gmail.modify = read + label + trash + spam. It CANNOT permanently delete.
SCOPES = ["https://www.googleapis.com/auth/gmail.modify"]

MAX_BODY_CHARS = 6000
MAX_LINKS = 50
KEPT_HEADERS = {
    "from", "subject", "date", "reply-to", "return-path",
    "list-unsubscribe", "precedence", "authentication-results",
}
# Marketing mail pads previews with invisible characters (combining grapheme joiner, zero-width).
INVISIBLE_RE = re.compile(r"[\u034f\u00ad\u200b-\u200f\u2060\ufeff]")


def clean_snippet(text: str) -> str:
    return " ".join(INVISIBLE_RE.sub("", html.unescape(text)).split())


URL_RE = re.compile(r"https?://[^\s<>\"')]+", re.I)


class GmailAuthError(RuntimeError):
    pass


def _load_credentials(
    token_file: str,
    scopes: list[str] | None = None,
    service: str = "Gmail",
    login_command: str = "python -m scripts.gmail_auth",
    error: type[GmailAuthError] = GmailAuthError,
) -> Credentials:
    path = Path(token_file)
    if not path.exists():
        raise error(f"{token_file} not found. Run: {login_command}")
    try:
        creds = Credentials.from_authorized_user_file(str(path), scopes or SCOPES)
        if creds.expired and creds.refresh_token:
            creds.refresh(Request())
            path.write_text(creds.to_json())
    except (RefreshError, ValueError) as exc:
        # Google apps in Testing mode expire refresh tokens after 7 days.
        raise error(
            f"Hermes lost access to {service} (the login expired or was revoked)."
        ) from exc
    return creds


def _decode(data: str) -> str:
    padded = data + "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(padded).decode("utf-8", errors="replace")


def _collect_parts(part: dict, out: dict[str, str]) -> None:
    mime = part.get("mimeType", "")
    data = part.get("body", {}).get("data")
    if data and mime in ("text/plain", "text/html"):
        out[mime] = out.get(mime, "") + _decode(data)
    for sub in part.get("parts") or []:
        _collect_parts(sub, out)


def parse_message(raw: dict) -> EmailMessage:
    """Gmail API `format=full` response -> EmailMessage (pure, testable)."""
    payload = raw.get("payload", {})
    headers = {
        h["name"].lower(): h["value"]
        for h in payload.get("headers", [])
        if h["name"].lower() in KEPT_HEADERS
    }

    parts: dict[str, str] = {}
    _collect_parts(payload, parts)
    html = parts.get("text/html", "")
    soup = BeautifulSoup(html, "html.parser") if html else None

    if parts.get("text/plain"):
        text = parts["text/plain"]
    elif soup:
        for tag in soup(["script", "style"]):
            tag.decompose()
        text = soup.get_text(" ", strip=True)
    else:
        text = ""

    links = URL_RE.findall(parts.get("text/plain", ""))
    if soup:
        links += [a["href"] for a in soup.find_all("a", href=True)]
    links = list(dict.fromkeys(l for l in links if l.startswith("http")))

    sender = headers.get("from", "")
    return EmailMessage(
        id=raw["id"],
        thread_id=raw.get("threadId"),
        sender=sender,
        sender_email=parseaddr(sender)[1].lower(),
        subject=headers.get("subject", ""),
        snippet=raw.get("snippet", ""),
        body_text=text[:MAX_BODY_CHARS],
        links=links[:MAX_LINKS],
        labels=raw.get("labelIds", []),
        headers=headers,
    )


def parse_summary(raw: dict) -> EmailSummary:
    """Gmail API `format=metadata` response -> EmailSummary (pure, testable)."""
    headers = {h["name"].lower(): h["value"] for h in raw.get("payload", {}).get("headers", [])}
    return EmailSummary(
        id=raw["id"],
        sender=headers.get("from", ""),
        subject=headers.get("subject", ""),
        snippet=clean_snippet(raw.get("snippet", "")),
        date=headers.get("date"),
        unread="UNREAD" in raw.get("labelIds", []),
    )


class GmailProvider:
    def __init__(self, token_file: str):
        creds = _load_credentials(token_file)
        self._service = build("gmail", "v1", credentials=creds, cache_discovery=False)
        self._label_ids: dict[str, str] = {}
        # The client's HTTP connection is NOT thread-safe: two requests at once
        # corrupt it (SSL errors, hangs). One Gmail call at a time.
        self._lock = asyncio.Lock()

    # The google client is blocking; build the request here, execute in a thread
    # so we never stall the FastAPI event loop.
    async def _run(self, request):
        async with self._lock:
            return await asyncio.to_thread(request.execute)

    def _messages(self):
        return self._service.users().messages()

    async def profile_email(self) -> str:
        resp = await self._run(self._service.users().getProfile(userId="me"))
        return resp["emailAddress"]

    async def latest_unread_id(self, query: str = "in:inbox is:unread") -> str | None:
        resp = await self._run(
            self._messages().list(userId="me", q=query, maxResults=1)
        )
        messages = resp.get("messages", [])
        return messages[0]["id"] if messages else None

    async def search(self, query: str, limit: int = 10) -> list[EmailSummary]:
        resp = await self._run(
            self._messages().list(userId="me", q=query, maxResults=limit)
        )
        ids = [m["id"] for m in resp.get("messages", [])]
        if not ids:
            return []
        async with self._lock:
            raws = await asyncio.to_thread(self._fetch_metadata, ids)
        return [parse_summary(r) for r in raws]   # Gmail returns newest first

    def _fetch_metadata(self, ids: list[str]) -> list[dict]:
        """One batched HTTP request for all headers instead of N round trips."""
        found: dict[str, dict] = {}

        def collect(request_id, response, exception):
            if exception is None:       # a message deleted mid-search is just skipped
                found[request_id] = response

        batch = self._service.new_batch_http_request(callback=collect)
        for message_id in ids:
            batch.add(
                self._messages().get(
                    userId="me", id=message_id, format="metadata",
                    metadataHeaders=["From", "Subject", "Date"],
                ),
                request_id=message_id,
            )
        batch.execute()
        return [found[i] for i in ids if i in found]

    async def get_message(self, message_id: str) -> EmailMessage:
        raw = await self._run(
            self._messages().get(userId="me", id=message_id, format="full")
        )
        return parse_message(raw)

    async def _label_id(self, name: str) -> str:
        if name not in self._label_ids:
            resp = await self._run(self._service.users().labels().list(userId="me"))
            self._label_ids = {l["name"]: l["id"] for l in resp.get("labels", [])}
        if name not in self._label_ids:
            created = await self._run(
                self._service.users().labels().create(
                    userId="me",
                    body={"name": name, "labelListVisibility": "labelShow",
                          "messageListVisibility": "show"},
                )
            )
            self._label_ids[name] = created["id"]
        return self._label_ids[name]

    async def _modify(self, message_id: str, add: list[str], remove: list[str]) -> None:
        await self._run(
            self._messages().modify(
                userId="me", id=message_id,
                body={"addLabelIds": add, "removeLabelIds": remove},
            )
        )

    async def apply(
        self, message_id: str, action: EmailAction, priority: int | None = None
    ) -> None:
        if action == EmailAction.TRASH:
            await self._run(self._messages().trash(userId="me", id=message_id))
        elif action == EmailAction.SPAM:
            await self._modify(message_id, add=["SPAM"], remove=["INBOX"])
        elif action == EmailAction.LABEL_PRIORITY:
            level = priority or 2
            add = [await self._label_id(f"Hermes/P{level}")]
            if level == 1:
                add.append("STARRED")
            await self._modify(message_id, add=add, remove=[])
        # KEEP / NEEDS_REVIEW: nothing to do

    async def undo(self, message_id: str, action: EmailAction) -> None:
        if action == EmailAction.TRASH:
            await self._run(self._messages().untrash(userId="me", id=message_id))
        elif action == EmailAction.SPAM:
            await self._modify(message_id, add=["INBOX"], remove=["SPAM"])
