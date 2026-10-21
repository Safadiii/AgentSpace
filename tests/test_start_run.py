
import pytest

from sqlmodel import Session, select

from backend.init import engine, init_db
from backend.research.paper.services import (
    ResearchQueryServices,
    RecommendationRunServices,
)

from storage.research.models import (
    UserProfile,
    Paper,
    RecommendationItem,
    RecommendationMode,
    RecommendationStatus,
)


# ------------------------------------------
# PYTEST FIXTURES
# ------------------------------------------

@pytest.fixture(scope="session", autouse=True)
def prepare_test_database():
    database_name = engine.url.database or ""

    if not database_name.endswith("_test"):
        raise RuntimeError(
            f"Refusing to test against: {database_name}. "
            "Use a database ending in _test."
        )

    # Create tables once, outside test transactions
    init_db()


@pytest.fixture
def db_session(prepare_test_database):
    with engine.connect() as connection:
        transaction = connection.begin()

        try:
            with Session(
                bind=connection,
                join_transaction_mode="create_savepoint",
            ) as session:
                yield session
        finally:
            # Undo ALL database changes from this test
            transaction.rollback()


# ------------------------------------------
# TEST HELPERS
# ------------------------------------------

def get_test_user_id(session: Session) -> int:
    user = session.exec(
        select(UserProfile).where(
            UserProfile.name == "Integration Test User"
        )
    ).first()

    if user is None:
        user = UserProfile(name="Integration Test User")
        session.add(user)
        session.commit()
        session.refresh(user)

    assert user.id is not None
    return user.id


def get_test_paper(session: Session) -> Paper:
    paper = session.exec(
        select(Paper).where(
            Paper.openalex_id == "W_TEST_RUN_001"
        )
    ).first()

    if paper is None:
        paper = Paper(
            openalex_id="W_TEST_RUN_001",
            title="Testing Reinforcement Learning",
            publication_year=2025,
        )
        session.add(paper)
        session.commit()
        session.refresh(paper)

    return paper


# ------------------------------------------
# TEST 1: START RUN
# ------------------------------------------

def test_start_run(db_session):
    session = db_session

    user_id = get_test_user_id(session)

    resolver = ResearchQueryServices(session)
    service = RecommendationRunServices(session)

    mode, query = resolver.resolve_query(
        user_id=user_id,
        prompt="Reinforcement Learning"
    )

    assert mode == RecommendationMode.TOPIC

    run = service.start_run(
        user_id=user_id,
        mode=mode,
        query=query,
        algorithm_version="v1",
    )

    assert run.id is not None
    assert run.user_id == user_id
    assert run.query == "Reinforcement Learning"
    assert run.status == RecommendationStatus.PENDING
    assert run.algorithm_version == "v1"

    fallback_mode, fallback_query = resolver.resolve_query(
        user_id=user_id,
        prompt=None
    )

    assert fallback_mode == RecommendationMode.PERSONALIZED
    assert fallback_query == "Reinforcement Learning"

    print(f"\nStarted run: {run.id}")


# ------------------------------------------
# TEST 2: COMPLETE RUN
# ------------------------------------------

def test_complete_run(db_session):
    session = db_session

    user_id = get_test_user_id(session)
    paper = get_test_paper(session)

    service = RecommendationRunServices(session)

    run = service.start_run(
        user_id=user_id,
        mode=RecommendationMode.TOPIC,
        query="Reinforcement Learning",
    )

    run_id = run.id
    paper_id = paper.id

    item = RecommendationItem(
        run_id=run_id,
        paper_id=paper_id,
        rank=1,
        relevance_score=0.95,
        score_breakdown={
            "semantic_similarity": 0.95
        },
        explanation="Highly relevant to the query"
    )

    completed = service.complete_run(
        run_id=run_id,
        items=[item]
    )

    assert completed.status == RecommendationStatus.COMPLETED
    assert completed.completed_at is not None

    # Clear cached ORM objects and read from DB
    session.expunge_all()

    saved_items = service.item_repository.get_by_run_id(
        run_id
    )

    assert len(saved_items) == 1
    assert saved_items[0].paper_id == paper_id
    assert saved_items[0].rank == 1
    assert saved_items[0].relevance_score == pytest.approx(0.95)

    print(f"\nCompleted run: {run_id}")


# ------------------------------------------
# TEST 3: GET RUN WITH ITEMS
# ------------------------------------------

def test_get_run_with_items(db_session):
    session = db_session

    user_id = get_test_user_id(session)
    paper = get_test_paper(session)

    service = RecommendationRunServices(session)

    run = service.start_run(
        user_id=user_id,
        mode=RecommendationMode.TOPIC,
        query="Reinforcement Learning",
    )

    run_id = run.id
    paper_id = paper.id

    service.complete_run(
        run_id=run_id,
        items=[
            RecommendationItem(
                run_id=run_id,
                paper_id=paper_id,
                rank=1,
                relevance_score=0.95,
                score_breakdown={
                    "semantic_similarity": 0.95
                },
            )
        ]
    )

    # Remove cached objects to test eager loading
    session.expunge_all()

    saved_run = service.get_run_with_items(run_id)

    assert saved_run is not None
    assert saved_run.status == RecommendationStatus.COMPLETED

    # Detach everything to verify eager loading worked
    session.expunge_all()

    ranked_items = sorted(
        saved_run.items,
        key=lambda item: item.rank
    )

    assert len(ranked_items) == 1

    item = ranked_items[0]

    assert item.rank == 1
    assert item.paper_id == paper_id
    assert item.relevance_score == pytest.approx(0.95)
    assert item.paper.title == "Testing Reinforcement Learning"

    print(f"\nRetrieved run: {run_id}")
    print("Paper:", item.paper.title)
    print("Rank:", item.rank)


# ------------------------------------------
# TEST 4: FAIL RUN
# ------------------------------------------

def test_fail_run(db_session):
    session = db_session

    user_id = get_test_user_id(session)

    service = RecommendationRunServices(session)

    run = service.start_run(
        user_id=user_id,
        mode=RecommendationMode.TOPIC,
        query="Failed Research Search",
    )

    run_id = run.id

    assert run.status == RecommendationStatus.PENDING

    failed = service.fail_run(
        run_id=run_id,
        error_message="OpenAlex API request failed"
    )

    assert failed.status == RecommendationStatus.FAILED
    assert failed.error_message == "OpenAlex API request failed"
    assert failed.completed_at is not None

    # Verify stored values rather than cached objects
    session.expunge_all()

    saved_run = service.get_run_with_items(run_id)

    assert saved_run is not None
    assert saved_run.status == RecommendationStatus.FAILED
    assert saved_run.error_message == "OpenAlex API request failed"
    assert len(saved_run.items) == 0

    print(f"\nFailed run: {run_id}")
