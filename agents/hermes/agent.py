import logging
from typing import Callable

from langgraph.graph import END, START, StateGraph
from sqlmodel import Session, select

from agents.hermes.heuristics import analyze, fast_classification
from agents.hermes.interfaces import EmailClassifier, MailProvider
from agents.hermes.policy import decide_action
from agents.hermes.state import Classification, HermesEmailState
from core.base_agent import BaseAgent
from core.models import AgentDefinition
from storage.hermes.models import (
    EmailAction, EmailActionLog, EmailCategory, ProtectedSender,
)

logger = logging.getLogger(__name__)


class HermesEmailAgent(BaseAgent[HermesEmailState]):
    definition = AgentDefinition(
        id="hermes",
        name="Hermes",
        version="0.1.0",
        description="Triage a single email: rank priority, remove ads and scams",
        capabilities=["email_triage", "spam_removal", "priority_ranking"],
    )

    state_schema = HermesEmailState

    def __init__(
        self,
        mailbox: MailProvider,
        classifier: EmailClassifier,
        session_factory: Callable[[], Session],
        vip_senders: frozenset[str] = frozenset(),
    ):
        # Set dependencies BEFORE super().__init__(): it builds the graph, and
        # the graph holds references to our bound methods (same as ResearchAgent).
        self.mailbox = mailbox
        self.classifier = classifier
        self.session_factory = session_factory
        self.vip_senders = vip_senders
        super().__init__()

    # ---- nodes: each takes the state and returns ONLY the fields it changes ----

    async def fetch_email(self, state: HermesEmailState) -> dict:
        return {"message": await self.mailbox.get_message(state.request)}

    def analyze_signals(self, state: HermesEmailState) -> dict:
        assert state.message is not None
        return {"signals": analyze(state.message)}

    def route_after_signals(self, state: HermesEmailState) -> str:
        assert state.signals is not None
        return "fast" if state.signals.decisive_category else "llm"

    def fast_classify(self, state: HermesEmailState) -> dict:
        assert state.signals is not None
        return {"classification": fast_classification(state.signals)}

    async def llm_classify(self, state: HermesEmailState) -> dict:
        assert state.message is not None and state.signals is not None
        try:
            result = await self.classifier.classify(state.message, state.signals)
        except Exception as exc:  # LLM down / schema mismatch -> fail SAFE
            logger.warning("LLM classification failed: %s", exc)
            result = Classification(
                category=EmailCategory.NORMAL, priority=3, confidence=0.0,
                reason=f"Classifier unavailable ({type(exc).__name__}); left untouched.",
            )
        return {"classification": result}

    def protected_senders(self) -> frozenset[str]:
        """User-managed list (DB, read fresh every run) plus the optional env seed."""
        with self.session_factory() as session:
            rows = session.exec(select(ProtectedSender.value)).all()
        return self.vip_senders | frozenset(rows)

    def decide(self, state: HermesEmailState) -> dict:
        assert state.message is not None and state.classification is not None
        action = decide_action(
            state.message, state.classification, self.protected_senders()
        )
        return {"action": action}

    async def execute(self, state: HermesEmailState) -> dict:
        assert state.classification is not None and state.action is not None
        if state.dry_run or state.action in (EmailAction.KEEP, EmailAction.NEEDS_REVIEW):
            return {"executed": False}
        try:
            await self.mailbox.apply(
                state.request, state.action, state.classification.priority
            )
            return {"executed": True}
        except Exception as exc:
            logger.exception("Mailbox action failed")
            return {"executed": False, "error": f"{type(exc).__name__}: {exc}"}

    def record(self, state: HermesEmailState) -> dict:
        assert state.message and state.classification and state.action
        with self.session_factory() as session:
            log = EmailActionLog(
                message_id=state.message.id,
                thread_id=state.message.thread_id,
                sender=state.message.sender[:320],
                subject=state.message.subject[:998],
                category=state.classification.category,
                priority=state.classification.priority,
                confidence=state.classification.confidence,
                reason=state.classification.reason[:1000],
                action=state.action,
                dry_run=state.dry_run,
                executed=state.executed,
                error=state.error[:2000] if state.error else None,
            )
            session.add(log)
            session.commit()
            session.refresh(log)
            return {"audit_id": log.id}

    def define_graph(self, graph: StateGraph) -> None:
        graph.add_node("fetch_email", self.fetch_email)
        graph.add_node("analyze_signals", self.analyze_signals)
        graph.add_node("fast_classify", self.fast_classify)
        graph.add_node("llm_classify", self.llm_classify)
        graph.add_node("decide", self.decide)
        graph.add_node("execute", self.execute)
        graph.add_node("record", self.record)

        graph.add_edge(START, "fetch_email")
        graph.add_edge("fetch_email", "analyze_signals")
        graph.add_conditional_edges(
            "analyze_signals",
            self.route_after_signals,
            {"fast": "fast_classify", "llm": "llm_classify"},
        )
        graph.add_edge("fast_classify", "decide")
        graph.add_edge("llm_classify", "decide")
        graph.add_edge("decide", "execute")
        graph.add_edge("execute", "record")
        graph.add_edge("record", END)
