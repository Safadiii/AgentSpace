import pytest

from agents.hermes.queries import SCOPE_QUERIES, build_query, clean_keyword
from backend.hermes.providers.gmail import parse_summary


def test_default_is_newest_unread():
    assert build_query() == "in:inbox is:unread"


def test_window_and_keyword_are_appended():
    assert build_query("jobs", "7d", "backend engineer").endswith('newer_than:7d "backend engineer"')


def test_every_scope_stays_in_the_inbox():
    assert all(q.startswith("in:inbox") for q in SCOPE_QUERIES.values())


@pytest.mark.parametrize("attack", [
    'x" OR in:trash "',
    "label:secret",
    'a\\" in:anywhere',
])
def test_keyword_cannot_inject_operators(attack):
    query = build_query("unread", "any", attack)
    keyword_part = query.removeprefix("in:inbox is:unread ")
    assert keyword_part.startswith('"') and keyword_part.endswith('"')
    assert keyword_part.count('"') == 2          # one closed phrase, nothing escapes it
    assert "\\" not in keyword_part


def test_blank_keyword_is_ignored_and_long_one_truncated():
    assert build_query("all", "any", '  "" ') == "in:inbox"
    assert len(clean_keyword("a" * 500)) == 100


def test_parse_summary_reads_headers_and_unread_flag():
    raw = {
        "id": "m1", "snippet": "Hi there", "labelIds": ["INBOX", "UNREAD"],
        "payload": {"headers": [
            {"name": "From", "value": "Recruiter <r@corp.com>"},
            {"name": "Subject", "value": "Interview"},
            {"name": "Date", "value": "Mon, 2 Nov 2026 10:00:00 +0000"},
        ]},
    }
    s = parse_summary(raw)
    assert (s.id, s.subject, s.unread) == ("m1", "Interview", True)
    assert s.sender == "Recruiter <r@corp.com>" and s.date.startswith("Mon")


def test_business_scope_excludes_job_sites():
    assert "-from:(linkedin.com" in SCOPE_QUERIES["business"]


def test_gmail_calls_never_overlap():
    """The google client's HTTP connection is not thread-safe; calls must queue."""
    import asyncio
    import threading
    import time

    from backend.hermes.providers.gmail import GmailProvider

    active, peak = 0, 0
    guard = threading.Lock()

    class Req:
        def execute(self):
            nonlocal active, peak
            with guard:
                active += 1
                peak = max(peak, active)
            time.sleep(0.05)
            with guard:
                active -= 1
            return {}

    provider = GmailProvider.__new__(GmailProvider)
    provider._lock = asyncio.Lock()

    async def go():
        await asyncio.gather(*(provider._run(Req()) for _ in range(6)))

    asyncio.run(go())
    assert peak == 1


def test_parse_summary_cleans_snippet_noise():
    raw = {"id": "m2", "snippet": "See Khalil&#39;s network ͏ ͏  more", "payload": {"headers": []}}
    assert parse_summary(raw).snippet == "See Khalil's network more"
