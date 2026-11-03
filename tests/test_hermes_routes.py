from datetime import datetime, timedelta, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from google.auth.exceptions import RefreshError
from googleapiclient.errors import HttpError
from httplib2 import Response
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from backend.hermes import routes
from backend.hermes.providers.gmail import GmailAuthError
from backend.init import get_session
from storage.hermes.models import EmailAction, EmailActionLog, EmailCategory

NOW = datetime.now(timezone.utc)


def row(n, **kw):
    base = dict(message_id=f"m{n}", sender="Shop <d@shop.com>", subject=f"Mail {n}",
                category=EmailCategory.NORMAL, priority=3, confidence=0.9, reason="r",
                action=EmailAction.KEEP, dry_run=False, executed=False,
                created_at=NOW - timedelta(minutes=n))
    return EmailActionLog(**{**base, **kw})


@pytest.fixture
def client():
    engine = create_engine("sqlite://", poolclass=StaticPool,
                           connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine, tables=[EmailActionLog.__table__])
    with Session(engine) as s:
        s.add_all([
            row(1, action=EmailAction.TRASH, category=EmailCategory.ADVERTISEMENT, executed=True),
            row(2, action=EmailAction.SPAM, category=EmailCategory.SCAM, executed=True,
                undone_at=NOW, sender="Bad <x@evil.io>"),
            row(3, action=EmailAction.TRASH, category=EmailCategory.ADVERTISEMENT, dry_run=True),
            row(4, action=EmailAction.TRASH, executed=False, error="boom"),
            row(5, subject="Interview invite", category=EmailCategory.PRIORITY,
                action=EmailAction.LABEL_PRIORITY, executed=True),
        ])
        s.commit()

    app = FastAPI()
    app.include_router(routes.hermes_router)
    routes.register_error_handlers(app)
    app.dependency_overrides[get_session] = lambda: Session(engine)
    return TestClient(app, raise_server_exceptions=False)


def subjects(resp):
    return [i["subject"] for i in resp.json()["items"]]


def test_unfiltered_newest_first_with_total(client):
    body = client.get("/hermes/actions").json()
    assert body["total"] == 5
    assert [i["subject"] for i in body["items"]] == [f"Mail {n}" if n != 5 else "Interview invite" for n in range(1, 6)]
    assert body["items"][0]["reason"] == "r"


def test_paging_reports_full_total(client):
    body = client.get("/hermes/actions?limit=2&offset=2").json()
    assert body["total"] == 5 and len(body["items"]) == 2


@pytest.mark.parametrize("query,expected", [
    ("category=SCAM", ["Mail 2"]),
    ("action=LABEL_PRIORITY", ["Interview invite"]),
    ("status=applied", ["Mail 1", "Interview invite"]),
    ("status=preview", ["Mail 3"]),
    ("status=undone", ["Mail 2"]),
    ("status=failed", ["Mail 4"]),
    ("q=interview", ["Interview invite"]),
    ("q=evil", ["Mail 2"]),
    ("category=ADVERTISEMENT&status=applied", ["Mail 1"]),
])
def test_filters(client, query, expected):
    assert subjects(client.get(f"/hermes/actions?{query}")) == expected


def test_bad_filter_value_is_422(client):
    assert client.get("/hermes/actions?status=nonsense").status_code == 422


def test_gmail_auth_error_has_code_and_clears_cache(client, monkeypatch):
    def boom():
        raise GmailAuthError("token.json not found. Run: python -m scripts.gmail_auth")
    monkeypatch.setattr(routes, "get_mailbox", boom, raising=True)
    monkeypatch.setattr(boom, "cache_clear", lambda: None, raising=False)
    resp = client.post("/hermes/email/process", json={"dry_run": True})
    assert resp.status_code == 503
    assert resp.json()["detail"]["code"] == "gmail_auth"


def _http(status, content=b"{}"):
    return HttpError(Response({"status": status}), content)


@pytest.mark.parametrize("exc,status,code", [
    (RefreshError("invalid_grant"), 503, "gmail_auth"),
    (_http(401), 503, "gmail_auth"),
    (_http(404), 404, "gmail_not_found"),
    (_http(429), 429, "gmail_rate_limit"),
    (_http(403, b'{"error": {"errors": [{"reason": "userRateLimitExceeded"}]}}'), 429, "gmail_rate_limit"),
    (_http(500), 502, "gmail_error"),
])
def test_gmail_failures_map_to_codes(client, monkeypatch, exc, status, code):
    class Broken:
        async def latest_unread_id(self, query):
            raise exc
    broken = Broken()
    broken_get = lambda: broken  # noqa: E731
    broken_get.cache_clear = lambda: None
    monkeypatch.setattr(routes, "get_mailbox", broken_get)
    resp = client.post("/hermes/email/process", json={"dry_run": True})
    assert resp.status_code == status
    assert resp.json()["detail"]["code"] == code


def test_status_reports_needs_login(client, monkeypatch):
    def boom():
        raise GmailAuthError("Hermes lost access to Gmail (the login expired or was revoked).")
    boom.cache_clear = lambda: None
    monkeypatch.setattr(routes, "get_mailbox", boom)
    body = client.get("/hermes/status").json()
    assert body["connected"] is False and "lost access" in body["problem"]


def test_find_emails_builds_query_from_choices(client, monkeypatch):
    from agents.hermes.state import EmailSummary
    seen = {}

    class Box:
        async def search(self, query, limit):
            seen.update(query=query, limit=limit)
            return [EmailSummary(id="m1", sender="R <r@c.com>", subject="Interview")]

    monkeypatch.setattr(routes, "get_mailbox", lambda: Box())
    resp = client.get("/hermes/emails?scope=jobs&window=7d&search=engineer&limit=5")
    assert resp.status_code == 200 and resp.json()[0]["subject"] == "Interview"
    assert seen["limit"] == 5
    assert "newer_than:7d" in seen["query"] and seen["query"].endswith('"engineer"')


def test_find_emails_rejects_unknown_scope_and_huge_limit(client):
    assert client.get("/hermes/emails?scope=in:trash").status_code == 422
    assert client.get("/hermes/emails?limit=500").status_code == 422


# ---- drafts and meetings ----
class FakeDraftMailbox:
    async def get_message(self, message_id):
        from agents.hermes.state import EmailMessage
        return EmailMessage(id=message_id, sender="Sara <s@acme.com>", sender_email="s@acme.com",
                            subject="Interview", body_text="Confirm 10am?")


def test_draft_endpoint_returns_text_and_never_sends(client, monkeypatch):
    class LLM:
        async def ainvoke(self, messages):
            class R: content = "Hi Sara,\nYes.\n[Your name]"
            return R()
    monkeypatch.setattr(routes, "get_mailbox", lambda: FakeDraftMailbox())
    monkeypatch.setattr(routes, "build_llm", lambda temperature=0: LLM())
    body = client.post("/hermes/emails/abc/draft", json={"tone": "friendly", "notes": "accept"}).json()
    assert body["subject"] == "Re: Interview" and body["body"].startswith("Hi Sara")


def test_draft_failure_is_a_clear_502(client, monkeypatch):
    class LLM:
        async def ainvoke(self, messages):
            raise TimeoutError("slow")
    monkeypatch.setattr(routes, "get_mailbox", lambda: FakeDraftMailbox())
    monkeypatch.setattr(routes, "build_llm", lambda temperature=0: LLM())
    resp = client.post("/hermes/emails/abc/draft", json={})
    assert resp.status_code == 502 and resp.json()["detail"]["code"] == "llm_error"


def test_draft_rejects_unknown_tone(client):
    assert client.post("/hermes/emails/abc/draft", json={"tone": "rude"}).status_code == 422


def _calendar(monkeypatch, upcoming=None, exc=None):
    class Cal:
        async def upcoming(self, limit):
            if exc:
                raise exc
            return upcoming
    getter = lambda: Cal()  # noqa: E731
    getter.cache_clear = lambda: None
    monkeypatch.setattr(routes, "get_calendar", getter)


def test_meetings_connected(client, monkeypatch):
    from backend.hermes.schemas import Meeting
    _calendar(monkeypatch, [Meeting(id="e", title="Standup", start="2026-11-03T10:00:00+03:00")])
    body = client.get("/hermes/meetings").json()
    assert body["connected"] is True and body["meetings"][0]["title"] == "Standup"


def test_meetings_not_connected_is_not_an_error(client, monkeypatch):
    from backend.hermes.providers.calendar import CalendarAuthError
    _calendar(monkeypatch, exc=CalendarAuthError("calendar_token.json not found. Run: python -m scripts.calendar_auth"))
    resp = client.get("/hermes/meetings")
    assert resp.status_code == 200 and resp.json()["connected"] is False
    assert "calendar_auth" in resp.json()["problem"]


def test_meetings_api_not_enabled_is_explained(client, monkeypatch):
    _calendar(monkeypatch, exc=_http(403, b'{"error": {"errors": [{"reason": "accessNotConfigured"}]}}'))
    assert "not enabled" in client.get("/hermes/meetings").json()["problem"]
