"""One-time login. Opens a browser, saves a refresh token to secrets/token.json.

Run from the repo root:  python -m scripts.gmail_auth
"""
import os
from pathlib import Path

from dotenv import load_dotenv
from google_auth_oauthlib.flow import InstalledAppFlow

from backend.hermes.providers.gmail import SCOPES

load_dotenv()

if __name__ == "__main__":
    flow = InstalledAppFlow.from_client_secrets_file(
        os.environ["GMAIL_CREDENTIALS_FILE"], SCOPES
    )
    creds = flow.run_local_server(port=0)
    Path(os.environ["GMAIL_TOKEN_FILE"]).write_text(creds.to_json())
    print("Saved token.")
