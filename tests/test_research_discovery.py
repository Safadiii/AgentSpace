"""Integration tests for ResearchPreferenceService and ResearchQueryResolver.

These tests use a SEPARATE, pre-created MySQL database named by DB_TEST_NAME.
They never use backend.init.engine (your application database engine).

Run from the Agents project root:
    python -m pytest -v tests/test_research_discovery.py
"""

import os
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from dotenv import load_dotenv
from sqlalchemy import URL
from sqlmodel import Session, SQLModel, create_engine, select

import backend.research.paper.services as preference_module
from backend.research.paper.repository import ResearchInterestRepository
from backend.research.paper.services import ResearchPreferenceServices
from backend.research.paper.services import (
    NoSearchHistoryError,
    ResearchQueryServices,
)
from storage.research.models import (
    InterestType,
    RecommendationMode,
    ResearchInterest,
    UserProfile,
)

load_dotenv()


@pytest.fixture(scope="session")
def test_engine():
    """Create tables only in the explicitly named MySQL test database."""
    test_db = os.getenv("DB_TEST_NAME", "").strip()
    main_db = os.getenv("DB_NAME", "").strip()

    if not test_db.endswith("_test") or test_db == main_db:
        raise RuntimeError(
            "Set DB_TEST_NAME to a separate database ending in '_test' "
            "(for example, agent_os_test). Never use your normal DB_NAME."
        )

    url = URL.create(
        "mysql+pymysql",
        username=os.environ["DB_USER"],
        password=os.environ["DB_PASSWORD"],
        host=os.getenv("DB_HOST", "localhost"),
        port=int(os.getenv("DB_PORT", "3306")),
        database=test_db,
        query={"charset": "utf8mb4"},
    )
    engine = create_engine(url, pool_pre_ping=True)

    # Every SQLModel table defined in storage.research.models is already
    # registered through the import above.
    SQLModel.metadata.create_all(engine)

    yield engine
    engine.dispose()


@pytest.fixture
def db_session(test_engine):
    with Session(test_engine) as session:
        yield session


@pytest.fixture
def make_user(db_session):
    """Make independent test users and remove only their data afterwards."""
    user_ids: list[int] = []

    def create_user() -> int:
        user = UserProfile(name=f"pytest-{uuid4().hex}")
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)
        assert user.id is not None
        user_ids.append(user.id)
        return user.id

    yield create_user

    # Services commit their own transactions, so a fixture-wide rollback
    # would NOT undo their writes. Delete only records owned by test users.
    db_session.rollback()
    for user_id in user_ids:
        interests = db_session.exec(
            select(ResearchInterest).where(ResearchInterest.user_id == user_id)
        ).all()
        for interest in interests:
            db_session.delete(interest)
    db_session.flush()

    for user_id in user_ids:
        user = db_session.get(UserProfile, user_id)
        if user is not None:
            db_session.delete(user)
    db_session.commit()


@pytest.fixture
def user_id(make_user):
    return make_user()


# ---- Previous step: ResearchPreferenceService ----------------------------

def test_records_new_topic_and_normalizes_whitespace(db_session, user_id):
    service = ResearchPreferenceServices(db_session)

    interest = service.record_research_interest(user_id, "  Machine   Learning  ")

    assert interest.topic_name == "Machine Learning"
    assert interest.interest_type == InterestType.INCLUDE
    assert interest.search_count == 1
    assert interest.last_searched_at is not None
    assert interest.user_id == user_id


def test_repeated_search_updates_existing_interest(db_session, user_id):
    service = ResearchPreferenceServices(db_session)

    first = service.record_research_interest(user_id, "Machine Learning")
    second = service.record_research_interest(user_id, "  machine learning ")

    assert second.id == first.id
    assert second.search_count == 2
    assert len(service.get_interests(user_id)) == 1


def test_get_interests_includes_excluded_topics(db_session, user_id):
    service = ResearchPreferenceServices(db_session)
    service.record_research_interest(user_id, "Robotics")

    db_session.add(
        ResearchInterest(
            user_id=user_id,
            topic_name="Quantum Computing",
            interest_type=InterestType.EXCLUDE,
        )
    )
    db_session.commit()

    interests = service.get_interests(user_id)
    assert {i.topic_name for i in interests} == {"Robotics", "Quantum Computing"}
    assert {i.interest_type for i in interests} == {
        InterestType.INCLUDE, InterestType.EXCLUDE
    }


def test_latest_interest_uses_last_search_not_creation_time(
    db_session, user_id, monkeypatch
):
    # MySQL DATETIME may have only second precision. Controlled timestamps
    # make ordering tests deterministic without sleeping.
    timestamps = iter(
        [
            datetime(2026, 10, 18, 9, 0, tzinfo=timezone.utc),
            datetime(2026, 10, 18, 10, 0, tzinfo=timezone.utc),
            datetime(2026, 10, 18, 11, 0, tzinfo=timezone.utc),
        ]
    )
    monkeypatch.setattr(preference_module, "utc_now", lambda: next(timestamps))

    service = ResearchPreferenceServices(db_session)
    service.record_research_interest(user_id, "Machine Learning")
    service.record_research_interest(user_id, "Robotics")
    service.record_research_interest(user_id, "Machine Learning")

    assert service.get_fallback_topic(user_id) == "Machine Learning"
    assert ResearchInterestRepository(db_session).get_latest_interest(user_id).topic_name == "Machine Learning"


def test_fallback_ignores_excluded_and_never_searched(db_session, user_id):
    service = ResearchPreferenceServices(db_session)
    service.record_research_interest(user_id, "Robotics")

    db_session.add_all(
        [
            ResearchInterest(
                user_id=user_id,
                topic_name="Do Not Recommend",
                interest_type=InterestType.EXCLUDE,
                last_searched_at=datetime.now(timezone.utc) + timedelta(days=1),
            ),
            ResearchInterest(
                user_id=user_id,
                topic_name="Unsearched Topic",
                interest_type=InterestType.INCLUDE,
                last_searched_at=None,
            ),
        ]
    )
    db_session.commit()

    assert service.get_fallback_topic(user_id) == "Robotics"


def test_invalid_topic_does_not_add_interest(db_session, user_id):
    service = ResearchPreferenceServices(db_session)

    for invalid in ("   ", "x" * 256):
        with pytest.raises(ValueError):
            service.record_research_interest(user_id, invalid)

    assert service.get_interests(user_id) == []


# ---- Current step: ResearchQueryResolver --------------------------------

def test_explicit_prompt_returns_topic_mode_and_records_interest(db_session, user_id):
    resolver = ResearchQueryServices(db_session)

    mode, query = resolver.resolve_query(user_id, "  Reinforcement   Learning  ")

    assert mode == RecommendationMode.TOPIC
    assert query == "Reinforcement Learning"

    interests = ResearchPreferenceServices(db_session).get_interests(user_id)
    assert len(interests) == 1
    assert interests[0].topic_name == query
    assert interests[0].search_count == 1


def test_empty_prompt_falls_back_without_incrementing_count(db_session, user_id):
    resolver = ResearchQueryServices(db_session)
    mode1, query1 = resolver.resolve_query(user_id, "Federated Learning")

    service = ResearchPreferenceServices(db_session)
    before = service.get_interests(user_id)[0].search_count

    mode2, query2 = resolver.resolve_query(user_id, None)
    mode3, query3 = resolver.resolve_query(user_id, "   ")

    after = service.get_interests(user_id)[0].search_count
    assert (mode1, query1) == (RecommendationMode.TOPIC, "Federated Learning")
    assert (mode2, query2) == (RecommendationMode.PERSONALIZED, "Federated Learning")
    assert (mode3, query3) == (RecommendationMode.PERSONALIZED, "Federated Learning")
    assert before == after == 1


def test_empty_prompt_without_history_raises(db_session, user_id):
    resolver = ResearchQueryServices(db_session)

    with pytest.raises(NoSearchHistoryError, match="No search history found, search for something first"):
        resolver.resolve_query(user_id, None)

    with pytest.raises(NoSearchHistoryError):
        resolver.resolve_query(user_id, "   ")


def test_interests_are_isolated_by_user(db_session, make_user):
    alice_id = make_user()
    bob_id = make_user()
    resolver = ResearchQueryServices(db_session)

    resolver.resolve_query(alice_id, "Computer Vision")

    assert ResearchPreferenceServices(db_session).get_fallback_topic(bob_id) is None
    with pytest.raises(NoSearchHistoryError):
        resolver.resolve_query(bob_id, None)

    resolver.resolve_query(bob_id, "Robotics")
    assert resolver.resolve_query(alice_id, None)[1] == "Computer Vision"
    assert resolver.resolve_query(bob_id, None)[1] == "Robotics"
