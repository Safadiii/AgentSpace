from datetime import datetime, timezone
from enum import Enum
from typing import Any, ClassVar

from sqlmodel import Field, SQLModel


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class EmailCategory(str, Enum):
    PRIORITY = "PRIORITY"
    NORMAL = "NORMAL"
    ADVERTISEMENT = "ADVERTISEMENT"
    SCAM = "SCAM"


class EmailAction(str, Enum):
    KEEP = "KEEP"
    LABEL_PRIORITY = "LABEL_PRIORITY"
    TRASH = "TRASH"
    SPAM = "SPAM"
    NEEDS_REVIEW = "NEEDS_REVIEW"


class EmailActionLog(SQLModel, table=True):
    """One row per email Hermes looked at. Bodies are NOT stored (privacy)."""

    __tablename__: ClassVar[Any] = "hermes_email_actions"

    id: int | None = Field(default=None, primary_key=True)
    message_id: str = Field(index=True, max_length=255)
    thread_id: str | None = Field(default=None, max_length=255)
    sender: str = Field(max_length=320)
    subject: str = Field(max_length=998)

    category: EmailCategory = Field(index=True)
    priority: int = Field(ge=1, le=4)
    confidence: float = Field(ge=0.0, le=1.0)
    reason: str = Field(max_length=1000)

    action: EmailAction = Field(index=True)
    dry_run: bool = True
    executed: bool = False
    error: str | None = Field(default=None, max_length=2000)

    created_at: datetime = Field(default_factory=utc_now, nullable=False, index=True)
    undone_at: datetime | None = None


class ProtectedSender(SQLModel, table=True):
    """A sender Hermes must never trash or spam. `value` is either a full
    address (a@b.com, exact match) or a bare domain (b.com, covers subdomains)."""

    __tablename__: ClassVar[Any] = "hermes_protected_senders"

    id: int | None = Field(default=None, primary_key=True)
    value: str = Field(unique=True, index=True, max_length=320)
    created_at: datetime = Field(default_factory=utc_now, nullable=False)
