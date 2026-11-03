"""One-time Google Calendar login (read-only). Saves a separate token so the Gmail login is untouched.

Run from the repo root:  python -m scripts.calendar_auth
"""
import os
from pathlib import Path

from dotenv import load_dotenv
from google_auth_oauthlib.flow import InstalledAppFlow

from backend.hermes.providers.calendar import CALENDAR_SCOPES

load_dotenv()

if __name__ == "__main__":
    flow = InstalledAppFlow.from_client_secrets_file(
        os.environ["GMAIL_CREDENTIALS_FILE"], CALENDAR_SCOPES
    )
    creds = flow.run_local_server(port=0)
    token = Path(os.getenv("CALENDAR_TOKEN_FILE", "secrets/calendar_token.json"))
    token.write_text(creds.to_json())
    token.chmod(0o600)
    print(f"Saved {token}.")
