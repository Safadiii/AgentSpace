from pydantic import BaseModel, Field

from core.models import AgentState
from storage.hermes.models import EmailAction, EmailCategory


class EmailMessage(BaseModel):
    """A parsed email. Only what triage needs, not the raw MIME."""

    id: str
    thread_id: str | None = None
    sender: str                       # raw "Name <addr>" header
    sender_email: str                 # lower-cased address
    subject: str = ""
    snippet: str = ""
    body_text: str = ""               # plain text, truncated
    links: list[str] = Field(default_factory=list)
    labels: list[str] = Field(default_factory=list)       # Gmail label ids
    headers: dict[str, str] = Field(default_factory=dict) # lower-cased subset


class EmailSummary(BaseModel):
    """One row in a search result list (headers only, no body)."""

    id: str
    sender: str
    subject: str = ""
    snippet: str = ""
    date: str | None = None           # raw Date header
    unread: bool = False


class HeuristicSignals(BaseModel):
    has_unsubscribe: bool = False
    is_bulk: bool = False
    in_promotions: bool = False
    auth_failed: bool = False
    reply_to_mismatch: bool = False
    suspicious_links: list[str] = Field(default_factory=list)
    scam_phrases: list[str] = Field(default_factory=list)
    flagged_links: list[str] = Field(default_factory=list)  # Safe Browsing (later)

    scam_score: float = Field(default=0.0, ge=0.0, le=1.0)
    ad_score: float = Field(default=0.0, ge=0.0, le=1.0)
    decisive_category: EmailCategory | None = None
    reasons: list[str] = Field(default_factory=list)


class Classification(BaseModel):
    category: EmailCategory
    priority: int = Field(ge=1, le=4, description="1 = urgent today, 4 = ignorable")
    confidence: float = Field(ge=0.0, le=1.0)
    reason: str = Field(max_length=300)


class HermesEmailState(AgentState):
    """`request` (inherited) holds the Gmail message id."""

    dry_run: bool = True

    message: EmailMessage | None = None
    signals: HeuristicSignals | None = None
    classification: Classification | None = None
    action: EmailAction | None = None
    executed: bool = False
    error: str | None = None
    audit_id: int | None = None
