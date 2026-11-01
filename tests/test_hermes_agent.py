import asyncio

from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

from agents.hermes.agent import HermesEmailAgent
from agents.hermes.state import Classification, EmailMessage, HermesEmailState
from storage.hermes.models import (
    EmailAction, EmailActionLog, EmailCategory, ProtectedSender,
)


class FakeMailbox:
    def __init__(self, message):
        self.message, self.applied = message, []

    async def get_message(self, message_id):
        return self.message

    async def apply(self, message_id, action, priority=None):
        self.applied.append((message_id, action))


class FakeClassifier:
    def __init__(self, result=None, error=None):
        self.result, self.error, self.calls = result, error, 0

    async def classify(self, message, signals):
        self.calls += 1
        if self.error:
            raise self.error
        return self.result


def make_agent(message, classifier):
    engine = create_engine("sqlite://", poolclass=StaticPool,
                           connect_args={"check_same_thread": False})
    # only our table: research tables use MySQL-specific constraints
    SQLModel.metadata.create_all(engine, tables=[EmailActionLog.__table__, ProtectedSender.__table__])
    mailbox = FakeMailbox(message)
    agent = HermesEmailAgent(mailbox, classifier, lambda: Session(engine))
    return agent, mailbox, engine


PROMO = EmailMessage(
    id="m1", sender="Shop <d@shop.com>", sender_email="d@shop.com", subject="50% off",
    labels=["CATEGORY_PROMOTIONS"], headers={"list-unsubscribe": "<mailto:u@shop.com>"},
)


def test_obvious_ad_skips_llm_and_is_trashed_when_live():
    classifier = FakeClassifier()
    agent, mailbox, engine = make_agent(PROMO, classifier)

    state = asyncio.run(agent.run(HermesEmailState(request="m1", dry_run=False)))

    assert classifier.calls == 0
    assert state.action == EmailAction.TRASH and state.executed
    assert mailbox.applied == [("m1", EmailAction.TRASH)]
    with Session(engine) as s:
        assert s.exec(select(EmailActionLog)).one().category == EmailCategory.ADVERTISEMENT


def test_dry_run_records_but_does_not_touch_mailbox():
    agent, mailbox, _ = make_agent(PROMO, FakeClassifier())
    state = asyncio.run(agent.run(HermesEmailState(request="m1", dry_run=True)))
    assert state.action == EmailAction.TRASH and not state.executed
    assert mailbox.applied == [] and state.audit_id is not None


def test_llm_failure_leaves_email_untouched():
    plain = EmailMessage(id="m2", sender="a@b.com", sender_email="a@b.com", subject="hi")
    agent, mailbox, _ = make_agent(plain, FakeClassifier(error=RuntimeError("down")))
    state = asyncio.run(agent.run(HermesEmailState(request="m2", dry_run=False)))
    assert state.action == EmailAction.KEEP and mailbox.applied == []


def test_llm_priority_result_is_labelled():
    plain = EmailMessage(id="m3", sender="a@b.com", sender_email="a@b.com", subject="interview")
    result = Classification(category=EmailCategory.PRIORITY, priority=1,
                            confidence=0.9, reason="interview invite")
    agent, mailbox, _ = make_agent(plain, FakeClassifier(result=result))
    state = asyncio.run(agent.run(HermesEmailState(request="m3", dry_run=False)))
    assert mailbox.applied == [("m3", EmailAction.LABEL_PRIORITY)]


def test_protected_sender_added_by_user_is_not_trashed():
    agent, mailbox, engine = make_agent(PROMO, FakeClassifier())
    with Session(engine) as s:
        s.add(ProtectedSender(value="shop.com"))
        s.commit()

    state = asyncio.run(agent.run(HermesEmailState(request="m1", dry_run=False)))

    assert state.action == EmailAction.KEEP and mailbox.applied == []
