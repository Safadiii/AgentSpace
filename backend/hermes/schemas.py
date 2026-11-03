from datetime import datetime
from pydantic import BaseModel, Field

from agents.hermes.queries import MAX_SEARCH_CHARS, Scope, Window
from backend.hermes.providers.llm_drafter import Tone

from storage.hermes.models import EmailAction, EmailCategory


class ProcessEmailRequest(BaseModel):
    message_id: str | None = None   # None -> newest email in `scope`
    scope: Scope = "unread"
    window: Window = "any"
    search: str | None = Field(default=None, max_length=MAX_SEARCH_CHARS)
    dry_run: bool | None = None     # None -> HERMES_DRY_RUN env (default true)


class ProcessEmailResponse(BaseModel):
    audit_id: int | None
    message_id: str
    sender: str
    subject: str
    category: EmailCategory
    priority: int
    confidence: float
    reason: str
    action: EmailAction
    dry_run: bool
    executed: bool
    error: str | None = None


class ActionLogRead(BaseModel):
    id: int
    message_id: str
    sender: str
    subject: str
    category: EmailCategory
    priority: int
    confidence: float
    reason: str
    action: EmailAction
    dry_run: bool
    executed: bool
    error: str | None = None
    created_at: datetime
    undone_at: datetime | None = None


class ActionPage(BaseModel):
    items: list[ActionLogRead]
    total: int   # rows matching the filters, ignoring limit/offset


class Meeting(BaseModel):
    id: str
    title: str
    start: str                  # ISO timestamp (or a plain date for all-day events)
    end: str | None = None
    all_day: bool = False
    location: str | None = None
    link: str | None = None     # Meet link when there is one, else the event page


class MeetingsResponse(BaseModel):
    connected: bool
    problem: str | None = None
    meetings: list[Meeting] = Field(default_factory=list)


class DraftRequest(BaseModel):
    tone: Tone = "professional"
    notes: str | None = Field(default=None, max_length=500)   # the owner's wishes for the reply


class GmailStatus(BaseModel):
    connected: bool
    email: str | None = None
    problem: str | None = None


class ProtectedSenderCreate(BaseModel):
    value: str   # "boss@co.com" (exact address) or "co.com" (whole domain)


class ProtectedSenderRead(BaseModel):
    id: int
    value: str
    created_at: datetime
