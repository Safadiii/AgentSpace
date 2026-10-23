
import os
import asyncio
from uuid import uuid4

import pytest
from dotenv import load_dotenv
from sqlmodel import Session
from langchain_nvidia_ai_endpoints import ChatNVIDIA

load_dotenv()

from backend.init import engine, init_db

from agents.research.orchestrator.services import (
    ResearchOrchestrator,
)
from backend.research.providers.topic_explorer import (
    NVIDIATopicExplorer,
)
from agents.research.openalex import OpenAlexClient

from backend.research.paper.services import RecommendationRunServices
from storage.research.models import (
    UserProfile,
    RecommendationStatus,
)


# ------------------------------------------
# FIXTURE: ISOLATED DATABASE TRANSACTION
# ------------------------------------------

@pytest.fixture
def session_factory():

    database_name = engine.url.database or ""

    if not database_name.endswith("_test"):
        pytest.fail(
            f"Unsafe test database: {database_name}. "
            "Use a dedicated database ending in _test."
        )

    init_db()

    with engine.connect() as connection:
        transaction = connection.begin()

        def create_session():
            return Session(
                bind=connection,
                join_transaction_mode="create_savepoint",
            )

        try:
            yield create_session
        finally:
            transaction.rollback()


# ------------------------------------------
# TEST: RESEARCH ORCHESTRATOR
# ------------------------------------------

def test_research_orchestrator(session_factory):

    # Live API calls must be explicitly enabled
    if os.getenv("RUN_LIVE_RESEARCH_TESTS") != "1":
        pytest.skip("Live research tests are disabled")

    if not os.getenv("NVIDIA_MODEL"):
        pytest.skip("NVIDIA_MODEL is missing")

    if not os.getenv("NVIDIA_API_KEY"):
        pytest.skip("NVIDIA_API_KEY is missing")

    # 1. Create an isolated test user
    with session_factory() as session:
        user = UserProfile(
            name=f"Research Test {uuid4().hex[:8]}"
        )

        session.add(user)
        session.commit()
        session.refresh(user)

        user_id = user.id

    assert user_id is not None

    async def run_research():

        # 2. Initialize NVIDIA LLM
        llm = ChatNVIDIA(
            model=os.environ["NVIDIA_MODEL"],
            temperature=0.3,
        )

        # 3. Initialize providers
        searcher = OpenAlexClient()
        explorer = NVIDIATopicExplorer(llm)

        # 4. Initialize orchestrator
        orchestrator = ResearchOrchestrator(
            session_factory=session_factory,
            searcher=searcher,
            explorer=explorer,
        )

        # 5. Execute research
        return await orchestrator.execute_search(
            user_id=user_id,
            prompt="Architectural Design of AI Agents",
            paper_count=5,
            exploration_agents=3,
            exploration_ratio=0.30,
        )

    # 6. Run async research inside pytest
    result = asyncio.run(run_research())

    # --------------------------------------
    # VERIFY ORCHESTRATOR RESULT
    # --------------------------------------

    assert result.run_id is not None
    assert result.topic == "Architectural Design of AI Agents"
    assert 1 <= result.saved_count <= 10
    assert len(result.related_topics) <= 3

    print("\n--- Research Results ---")
    print("Run ID:", result.run_id)
    print("Topic:", result.topic)
    print("Papers saved:", result.saved_count)
    print("Related topics:", result.related_topics)

    # --------------------------------------
    # VERIFY DATABASE PERSISTENCE
    # --------------------------------------

    with session_factory() as session:

        service = RecommendationRunServices(session)

        saved_run = service.get_run_with_items(
            result.run_id
        )

        assert saved_run is not None
        assert saved_run.status == RecommendationStatus.COMPLETED

        assert len(saved_run.items) == result.saved_count

        # Verify rankings are unique and sequential
        ranked_items = sorted(
            saved_run.items,
            key=lambda item: item.rank
        )

        assert [
            item.rank for item in ranked_items
        ] == list(range(1, result.saved_count + 1))

        # Verify that papers are actually persisted
        for item in ranked_items:

            assert item.paper is not None
            assert item.paper.id is not None
            assert item.paper.title
            assert item.paper.openalex_id

            print(
                f"{item.rank}. {item.paper.title}"
            )

