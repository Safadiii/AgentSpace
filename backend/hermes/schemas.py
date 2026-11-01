from datetime import datetime

from pydantic import BaseModel

from storage.hermes.models import EmailAction, EmailCategory


class ProcessEmailRequest(BaseModel):
    message_id: str | None = None   # None -> newest unread inbox email
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
    action: EmailAction
    dry_run: bool
    executed: bool
    created_at: datetime
    undone_at: datetime | None = None


class ProtectedSenderCreate(BaseModel):
    value: str   # "boss@co.com" (exact address) or "co.com" (whole domain)


class ProtectedSenderRead(BaseModel):
    id: int
    value: str
    created_at: datetime
