"""Turns a UI choice (scope + time window + keyword) into a Gmail search query.

The client never sends a raw query: scopes and windows are fixed lists, and the
keyword is wrapped in quotes so it cannot smuggle in Gmail operators
(`in:trash`, `label:`, `from:`...). Pure and unit-tested.
"""
from typing import Literal

Scope = Literal["unread", "promotions", "jobs", "business", "security", "important", "all"]
Window = Literal["any", "1d", "7d", "30d"]

_JOB_WORDS = (
    'job OR jobs OR interview OR application OR applied OR recruiter OR recruiting OR '
    'hiring OR career OR careers OR vacancy OR candidate OR resume OR CV OR '
    '"job offer" OR "offer letter" OR "next steps" OR "open position"'
)
_JOB_SITES = (
    "linkedin.com OR indeed.com OR glassdoor.com OR greenhouse.io OR lever.co OR "
    "workable.com OR smartrecruiters.com OR myworkday.com OR wuzzuf.net OR bayt.com"
)
_BUSINESS_WORDS = (
    'invoice OR receipt OR payment OR billing OR contract OR agreement OR proposal OR '
    'quote OR quotation OR meeting OR client OR project OR "purchase order" OR "follow up"'
)
_SECURITY_WORDS = (
    '"security alert" OR "sign-in" OR "new login" OR "verify your" OR password OR '
    '"suspicious" OR "account suspended" OR "confirm your"'
)

SCOPE_QUERIES: dict[str, str] = {
    "unread": "in:inbox is:unread",
    "promotions": "in:inbox category:promotions",
    "jobs": f"in:inbox (subject:({_JOB_WORDS}) OR from:({_JOB_SITES}))",
    "business": (
        f"in:inbox -category:promotions -category:social -from:({_JOB_SITES}) "
        f"(subject:({_BUSINESS_WORDS}) OR (has:attachment filename:pdf))"
    ),
    "security": f"in:inbox subject:({_SECURITY_WORDS})",
    "important": "in:inbox is:important",
    "all": "in:inbox",
}

WINDOW_FILTERS: dict[str, str] = {
    "any": "", "1d": "newer_than:1d", "7d": "newer_than:7d", "30d": "newer_than:30d",
}

MAX_SEARCH_CHARS = 100


def clean_keyword(text: str | None) -> str:
    """Plain words only: no quotes or backslashes, whitespace collapsed."""
    if not text:
        return ""
    return " ".join(text.replace('"', " ").replace("\\", " ").split())[:MAX_SEARCH_CHARS]


def build_query(scope: str = "unread", window: str = "any", search: str | None = None) -> str:
    parts = [SCOPE_QUERIES[scope], WINDOW_FILTERS[window]]
    word = clean_keyword(search)
    if word:
        parts.append(f'"{word}"')
    return " ".join(p for p in parts if p)
