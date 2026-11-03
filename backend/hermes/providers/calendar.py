import asyncio
from datetime import datetime, timedelta, timezone

from googleapiclient.discovery import build

from backend.hermes.providers.gmail import GmailAuthError, _load_credentials
from backend.hermes.schemas import Meeting

# Read-only, events only. Kept separate from the Gmail login so adding the
# calendar never touches (or risks) the Gmail token.
CALENDAR_SCOPES = ["https://www.googleapis.com/auth/calendar.events.readonly"]
HORIZON_DAYS = 14


class CalendarAuthError(GmailAuthError):
    pass


def parse_event(raw: dict) -> Meeting | None:
    """Calendar API event -> Meeting. None for cancelled or declined events (pure, testable)."""
    if raw.get("status") == "cancelled":
        return None
    if any(a.get("self") and a.get("responseStatus") == "declined" for a in raw.get("attendees", [])):
        return None
    start, end = raw.get("start", {}), raw.get("end", {})
    when = start.get("dateTime") or start.get("date")
    if not when:
        return None
    return Meeting(
        id=raw["id"],
        title=raw.get("summary") or "(no title)",
        start=when,
        end=end.get("dateTime") or end.get("date"),
        all_day="date" in start and "dateTime" not in start,
        location=raw.get("location"),
        link=raw.get("hangoutLink") or raw.get("htmlLink"),
    )


class GoogleCalendarProvider:
    def __init__(self, token_file: str):
        creds = _load_credentials(
            token_file, CALENDAR_SCOPES, "Google Calendar", "python -m scripts.calendar_auth",
            error=CalendarAuthError,
        )
        self._service = build("calendar", "v3", credentials=creds, cache_discovery=False)
        self._lock = asyncio.Lock()   # the HTTP client is not thread-safe

    def _list(self, limit: int) -> list[dict]:
        now = datetime.now(timezone.utc)
        resp = self._service.events().list(
            calendarId="primary", timeMin=now.isoformat(),
            timeMax=(now + timedelta(days=HORIZON_DAYS)).isoformat(),
            singleEvents=True, orderBy="startTime", maxResults=limit * 3,
        ).execute()
        return resp.get("items", [])

    async def upcoming(self, limit: int = 5) -> list[Meeting]:
        async with self._lock:
            items = await asyncio.to_thread(self._list, limit)
        meetings = [m for m in map(parse_event, items) if m]
        return meetings[:limit]
