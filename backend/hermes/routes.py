import os
from datetime import datetime, timezone
from functools import lru_cache
from typing import Annotated
from urllib.parse import urlencode

from typing import Literal

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from google.auth.exceptions import RefreshError
from googleapiclient.errors import HttpError
from langchain_nvidia_ai_endpoints import ChatNVIDIA
from sqlalchemy.exc import IntegrityError
from sqlalchemy import func, or_
from sqlmodel import Session, select

from agents.hermes.agent import HermesEmailAgent
from agents.hermes.policy import normalize_protected
from agents.hermes.queries import Scope, Window, build_query
from agents.hermes.state import EmailSummary
from agents.hermes.state import HermesEmailState
from backend.hermes import connect
from backend.hermes.providers.calendar import CalendarAuthError, GoogleCalendarProvider
from backend.hermes.providers.gmail import GmailAuthError, GmailProvider
from backend.hermes.providers.llm_drafter import Draft, LLMEmailDrafter
from backend.hermes.providers.llm_classifier import CachingClassifier, LLMEmailClassifier
from backend.hermes.schemas import (
    ActionPage, ConnectKeyRequest, ConnectStartRequest, ConnectStartResponse, DraftRequest, GmailStatus, MeetingsResponse, ProcessEmailRequest, ProcessEmailResponse,
    ProtectedSenderCreate, ProtectedSenderRead, ActionLogRead,
)
from backend.init import engine, get_session
from storage.hermes.models import (
    EmailAction, EmailActionLog, EmailCategory, ProtectedSender,
)

hermes_router = APIRouter(prefix="/hermes", tags=["Hermes"])

DBSession = Annotated[Session, Depends(get_session)]


# Errors carry a stable `code` so the UI can show a helpful message and next step.
def _error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"detail": {"code": code, "message": message}})


GMAIL_LOGIN_LOST = "Hermes lost access to Gmail (the login expired or was revoked)."


def register_error_handlers(app: FastAPI) -> None:
    def lost_login() -> JSONResponse:
        get_mailbox.cache_clear()   # next request rebuilds with whatever token is on disk
        return _error(503, "gmail_auth", GMAIL_LOGIN_LOST)

    @app.exception_handler(GmailAuthError)
    async def _gmail_auth(_: Request, exc: GmailAuthError):
        get_mailbox.cache_clear()
        return _error(503, "gmail_auth", str(exc))

    @app.exception_handler(RefreshError)
    async def _refresh(_: Request, exc: RefreshError):
        return lost_login()

    @app.exception_handler(HttpError)
    async def _gmail_http(_: Request, exc: HttpError):
        status = exc.resp.status
        if status == 401:
            return lost_login()
        if status == 404:
            return _error(404, "gmail_not_found", "That email is no longer in Gmail.")
        if status == 429 or (status == 403 and b"ateLimit" in exc.content):
            return _error(429, "gmail_rate_limit", "Gmail is rate limiting Hermes. Wait a minute and try again.")
        return _error(502, "gmail_error", "Gmail returned an error. Try again in a moment.")


def session_factory() -> Session:
    return Session(engine)


@lru_cache
def get_mailbox() -> GmailProvider:
    return GmailProvider(str(connect.token_path()))


def default_dry_run() -> bool:
    return os.getenv("HERMES_DRY_RUN", "true").lower() != "false"


def vip_senders() -> frozenset[str]:
    # Comma-separated: full addresses (a@b.com) and/or whole domains (b.com).
    raw = os.getenv("HERMES_VIP_SENDERS", "")
    return frozenset(s.strip().lower() for s in raw.split(",") if s.strip())


@lru_cache
def get_calendar() -> GoogleCalendarProvider:
    return GoogleCalendarProvider(
        os.getenv("CALENDAR_TOKEN_FILE", "secrets/calendar_token.json")
    )


def build_llm(temperature: float = 0, max_tokens: int = 2000) -> ChatNVIDIA:
    # Reasoning models can think for minutes. "low" keeps replies to ~20s; set
    # NVIDIA_REASONING_EFFORT= (empty) for a model that does not accept the option.
    effort = os.getenv("NVIDIA_REASONING_EFFORT", "low")
    return ChatNVIDIA(
        model=os.environ["NVIDIA_MODEL"],
        api_key=os.environ["NVIDIA_API_KEY"],
        temperature=temperature,
        timeout=150,            # fail safe instead of hanging on a slow model
        max_tokens=max_tokens,
        **({"model_kwargs": {"reasoning_effort": effort}} if effort else {}),
    )


# Module-level so a preview and the Apply that follows share one verdict.
_classifier: CachingClassifier | None = None


def get_classifier() -> CachingClassifier:
    global _classifier
    if _classifier is None:
        # The verdict is a small JSON object; a low cap stops the model rambling.
        _classifier = CachingClassifier(LLMEmailClassifier(build_llm(max_tokens=800)))
    return _classifier


def build_agent(mailbox: GmailProvider) -> HermesEmailAgent:
    return HermesEmailAgent(
        mailbox=mailbox,
        classifier=get_classifier(),   # temperature 0: deterministic
        session_factory=session_factory,
        vip_senders=vip_senders(),
    )


@hermes_router.post("/email/process", response_model=ProcessEmailResponse)
async def process_email(request: ProcessEmailRequest):
    mailbox = get_mailbox()

    message_id = request.message_id or await mailbox.latest_unread_id(
        build_query(request.scope, request.window, request.search)
    )
    if message_id is None:
        raise HTTPException(status_code=404, detail="No matching emails in the inbox")

    dry_run = default_dry_run() if request.dry_run is None else request.dry_run
    state = await build_agent(mailbox).run(
        HermesEmailState(request=message_id, dry_run=dry_run)
    )

    assert state.message and state.classification and state.action
    return ProcessEmailResponse(
        audit_id=state.audit_id,
        message_id=state.message.id,
        sender=state.message.sender,
        subject=state.message.subject,
        category=state.classification.category,
        priority=state.classification.priority,
        confidence=state.classification.confidence,
        reason=state.classification.reason,
        action=state.action,
        dry_run=state.dry_run,
        executed=state.executed,
        error=state.error,
    )


@hermes_router.get("/emails", response_model=list[EmailSummary])
async def find_emails(
    scope: Scope = "unread",
    window: Window = "any",
    search: str | None = Query(None, max_length=100),
    limit: int = Query(10, ge=1, le=25),
):
    """List matching emails (newest first) so the user can pick one to triage."""
    return await get_mailbox().search(build_query(scope, window, search), limit)


@hermes_router.post("/emails/{message_id}/draft", response_model=Draft)
async def draft_reply(message_id: str, body: DraftRequest):
    """Write a reply draft with the AI. It is only text for the user to review: nothing is sent or saved."""
    message = await get_mailbox().get_message(message_id)
    try:
        return await LLMEmailDrafter(build_llm(temperature=0.4)).draft(message, body.tone, body.notes)
    except Exception:
        raise HTTPException(status_code=502, detail={
            "code": "llm_error", "message": "The AI could not write a draft right now. Try again in a moment.",
        })


@hermes_router.get("/meetings", response_model=MeetingsResponse)
async def upcoming_meetings(limit: int = Query(5, ge=1, le=10)):
    """Next calendar events, for the countdown. Not connected is a normal state, not an error."""
    try:
        return MeetingsResponse(connected=True, meetings=await get_calendar().upcoming(limit))
    except CalendarAuthError as exc:
        get_calendar.cache_clear()
        return MeetingsResponse(connected=False, problem=str(exc))
    except RefreshError:
        get_calendar.cache_clear()
        return MeetingsResponse(connected=False, problem="Hermes lost access to Google Calendar (the login expired or was revoked).")
    except HttpError as exc:
        if exc.resp.status == 403 and b"ccessNotConfigured" in exc.content:
            problem = "The Google Calendar API is not enabled in your Google Cloud project."
        elif exc.resp.status in (401, 403):
            problem = "Google Calendar refused access. Log in to Calendar again."
        else:
            problem = "Google Calendar returned an error. Try again in a moment."
        return MeetingsResponse(connected=False, problem=problem)


@hermes_router.get("/status", response_model=GmailStatus)
async def gmail_status():
    """Is Gmail connected? Lets the UI warn before the user hits a failure."""
    has_key = connect.has_client_key()
    if not connect.token_path().exists():
        return GmailStatus(connected=False, problem="Gmail is not connected yet.", has_credentials=has_key)
    try:
        return GmailStatus(connected=True, email=await get_mailbox().profile_email(), has_credentials=has_key)
    except (GmailAuthError, RefreshError) as exc:
        get_mailbox.cache_clear()
        problem = str(exc) if isinstance(exc, GmailAuthError) else GMAIL_LOGIN_LOST
        return GmailStatus(connected=False, problem=problem, has_credentials=has_key)


@hermes_router.post("/connect/key", status_code=204)
def save_connect_key(body: ConnectKeyRequest):
    """Step 1 of connecting: store the Google key the user downloaded."""
    try:
        connect.save_client_key(body.credentials)
    except connect.ConnectError as exc:
        raise HTTPException(status_code=422, detail={"code": "connect_key", "message": str(exc)}) from exc


@hermes_router.post("/connect/start", response_model=ConnectStartResponse)
def start_connect(body: ConnectStartRequest):
    """Step 2: the Google sign-in address the browser should open."""
    try:
        return ConnectStartResponse(url=connect.pending.start(body.origin))
    except connect.ConnectError as exc:
        raise HTTPException(status_code=422, detail={"code": "connect_start", "message": str(exc)}) from exc


@hermes_router.get("/connect/callback", include_in_schema=False)
def finish_connect(state: str = "", code: str = "", error: str = ""):
    """Google sends the browser here after sign-in; we save the token and go back to the app."""
    origin = connect.pending.origin_of(state)
    if origin is None:
        return HTMLResponse(
            "<p>This sign-in link has expired. Close this tab and press Connect again in Hermes.</p>", status_code=400,
        )
    try:
        if error or not code:
            connect.pending.discard(state)
            raise connect.ConnectError("Google sign-in was cancelled. Press Connect to try again.")
        connect.pending.finish(state, code)
    except connect.ConnectError as exc:
        return RedirectResponse(f"{origin}/messages?{urlencode({'gmail': 'error', 'reason': str(exc)})}")
    get_mailbox.cache_clear()
    return RedirectResponse(f"{origin}/messages?gmail=connected")


@hermes_router.get("/actions", response_model=ActionPage)
def list_actions(
    session: DBSession,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    category: EmailCategory | None = None,
    action: EmailAction | None = None,
    # applied = really changed the mailbox and not undone; preview = dry run;
    # undone = reverted; failed = tried and errored
    status: Literal["applied", "preview", "undone", "failed"] | None = None,
    q: str | None = Query(None, max_length=100),
):
    conditions = []
    if category:
        conditions.append(EmailActionLog.category == category)
    if action:
        conditions.append(EmailActionLog.action == action)
    if status == "applied":
        conditions += [EmailActionLog.executed == True, EmailActionLog.undone_at == None]  # noqa: E712
    elif status == "preview":
        conditions.append(EmailActionLog.dry_run == True)  # noqa: E712
    elif status == "undone":
        conditions.append(EmailActionLog.undone_at != None)  # noqa: E711
    elif status == "failed":
        conditions.append(EmailActionLog.error != None)  # noqa: E711
    if q and q.strip():
        like = f"%{q.strip()}%"
        conditions.append(or_(EmailActionLog.subject.ilike(like), EmailActionLog.sender.ilike(like)))

    total = session.exec(select(func.count()).select_from(EmailActionLog).where(*conditions)).one()
    rows = session.exec(
        select(EmailActionLog).where(*conditions)
        .order_by(EmailActionLog.created_at.desc(), EmailActionLog.id.desc())
        .offset(offset).limit(limit)
    ).all()
    return ActionPage(
        items=[ActionLogRead.model_validate(r, from_attributes=True) for r in rows],
        total=total,
    )


@hermes_router.post("/actions/{action_id}/undo", response_model=ActionLogRead)
async def undo_action(action_id: int, session: DBSession):
    log = session.get(EmailActionLog, action_id)
    if log is None:
        raise HTTPException(status_code=404, detail="Action not found")
    if not log.executed or log.undone_at is not None:
        raise HTTPException(status_code=409, detail="Nothing to undo")
    if log.action not in (EmailAction.TRASH, EmailAction.SPAM):
        raise HTTPException(status_code=409, detail="This action type needs no undo")

    await get_mailbox().undo(log.message_id, log.action)
    log.undone_at = datetime.now(timezone.utc)
    session.add(log)
    session.commit()
    session.refresh(log)
    return log


@hermes_router.get("/protected-senders", response_model=list[ProtectedSenderRead])
def list_protected_senders(session: DBSession):
    return session.exec(select(ProtectedSender).order_by(ProtectedSender.value)).all()


@hermes_router.post("/protected-senders", response_model=ProtectedSenderRead, status_code=201)
def add_protected_sender(body: ProtectedSenderCreate, session: DBSession):
    try:
        value = normalize_protected(body.value)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    sender = ProtectedSender(value=value)
    session.add(sender)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(status_code=409, detail=f"{value} is already protected")
    session.refresh(sender)
    return sender


@hermes_router.delete("/protected-senders/{sender_id}", status_code=204)
def remove_protected_sender(sender_id: int, session: DBSession):
    sender = session.get(ProtectedSender, sender_id)
    if sender is None:
        raise HTTPException(status_code=404, detail="Protected sender not found")
    session.delete(sender)
    session.commit()
