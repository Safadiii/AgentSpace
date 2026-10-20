from datetime import date, datetime, timezone
from enum import Enum
from typing import Any, ClassVar, Optional

from sqlalchemy import CheckConstraint, Column, JSON, UniqueConstraint
from sqlalchemy.ext.mutable import MutableDict
from sqlmodel import Field, Relationship, SQLModel


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class InterestType(str, Enum):
    INCLUDE = "INCLUDE"
    EXCLUDE = "EXCLUDE"


class RecommendationMode(str, Enum):
    TOPIC = "TOPIC"
    PERSONALIZED = "PERSONALIZED"


class RecommendationStatus(str, Enum):
    PENDING = "PENDING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class PaperAction(str, Enum):
    IMPRESSION = "IMPRESSION"
    LIKE = "LIKE"
    DISLIKE = "DISLIKE"
    SAVE = "SAVE"
    UNSAVE = "UNSAVE"
    READ = "READ"
    OPEN = "OPEN"
    SKIP = "SKIP"


class UserProfile(SQLModel, table=True):
    __tablename__: ClassVar[Any] = "user_profiles"

    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(max_length=255)
    created_at: datetime = Field(default_factory=utc_now)

    research_preferences: Optional["ResearchPreferences"] = Relationship(
        back_populates="user"
    )

    research_interests: list["ResearchInterest"] = Relationship(
        back_populates="user"
    )

    recommendation_runs: list["RecommendationRun"] = Relationship(
        back_populates="user"
    )

    paper_interactions: list["PaperInteraction"] = Relationship(
        back_populates="user"
    )


class ResearchPreferences(SQLModel, table=True):
    __tablename__: ClassVar[Any] = "research_preferences"    
    __table_args__ = (
        CheckConstraint("recency_days >= 1", name="ck_research_recency_positive"),
        CheckConstraint(
            "exploration_ratio >= 0 AND exploration_ratio <= 1",
            name="ck_research_exploration_range",
        ),
    )

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user_profiles.id", unique=True, index=True)

    recency_days: int = Field(default=3650, ge=1)
    exploration_ratio: float = Field(default=0.10, ge=0.0, le=1.0)
    ranking_settings: dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(MutableDict.as_mutable(JSON), nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=utc_now,
        nullable=False,
        sa_column_kwargs={"onupdate": utc_now},
    )

    user: UserProfile = Relationship(back_populates="research_preferences")


class ResearchInterest(SQLModel, table=True):
    __tablename__: ClassVar[Any] = "research_interests"
    __table_args__ = (
        UniqueConstraint("user_id", "topic_name", name="uq_interest_user_topic"),
    )

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user_profiles.id", index=True)
    topic_name: str = Field(index=True, min_length=1, max_length=255)
    interest_type: InterestType = Field(default=InterestType.INCLUDE, index=True)
    created_at: datetime = Field(default_factory=utc_now, nullable=False)
    last_searched_at: datetime | None = Field(default=None, index=True)
    search_count: int = Field(default=0, ge=0)

    user: UserProfile = Relationship(back_populates="research_interests")

class Paper(SQLModel, table=True):
    __tablename__: ClassVar[Any] = "papers"
    __table_args__ = (
        CheckConstraint("cited_by_count >= 0", name="ck_paper_citations_nonnegative"),
    )

    id: int | None = Field(default=None, primary_key=True)
    openalex_id: str = Field(unique=True, index=True, max_length=255)
    doi: str | None = Field(default=None, index=True, max_length=512)
    title: str = Field(max_length=2000)
    abstract: str | None = Field(default=None)
    publication_year: int | None = Field(default=None, index=True)
    publication_date: date | None = Field(default=None)
    venue: str | None = Field(default=None, max_length=1000)
    cited_by_count: int | None = Field(default=None, ge=0)
    landing_page_url: str | None = Field(default=None, max_length=2000)

    source_metadata: dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column("metadata", MutableDict.as_mutable(JSON), nullable=False),
    )
    created_at: datetime = Field(default_factory=utc_now, nullable=False)
    updated_at: datetime = Field(
        default_factory=utc_now,
        nullable=False,
        sa_column_kwargs={"onupdate": utc_now},
    )

    authors: list["PaperAuthor"] = Relationship(
        back_populates="paper"
    )

    topics: list["PaperTopic"] = Relationship(
        back_populates="paper"
    )

    recommendation_items: list["RecommendationItem"] = Relationship(
        back_populates="paper"
    )

    interactions: list["PaperInteraction"] = Relationship(
        back_populates="paper"
    )


class PaperAuthor(SQLModel, table=True):
    __tablename__: ClassVar[Any] = "paper_authors"
    __table_args__ = (
        UniqueConstraint("paper_id", "author_order", name="uq_paper_author_order"),
        CheckConstraint("author_order >= 0", name="ck_author_order_nonnegative"),
    )

    id: int | None = Field(default=None, primary_key=True)
    paper_id: int = Field(foreign_key="papers.id", index=True)
    author_name: str = Field(max_length=500)
    openalex_author_id: str | None = Field(default=None, index=True, max_length=255)
    author_order: int = Field(default=0, ge=0)

    paper: Paper = Relationship(back_populates="authors")


class PaperTopic(SQLModel, table=True):
    __tablename__: ClassVar[Any] =  "paper_topics"
    __table_args__ = (
        UniqueConstraint("paper_id", "topic_name", name="uq_paper_topic_name"),
        UniqueConstraint("paper_id", "openalex_topic_id", name="uq_paper_topic_openalex_id"),
        CheckConstraint("relevance_score >= 0", name="ck_topic_relevance_nonnegative"),
    )

    id: int | None = Field(default=None, primary_key=True)
    paper_id: int = Field(foreign_key="papers.id", index=True)
    topic_name: str = Field(index=True, max_length=255)
    openalex_topic_id: str | None = Field(default=None, index=True, max_length=255)
    relevance_score: float | None = Field(default=None, ge=0.0)

    paper: Paper = Relationship(back_populates="topics")


class RecommendationRun(SQLModel, table=True):
    __tablename__: ClassVar[Any] = "recommendation_runs"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user_profiles.id", index=True)
    mode: RecommendationMode = Field(index=True)
    query: str | None = Field(default=None, max_length=4000)
    algorithm_version: str = Field(default="v1", max_length=100)

    configuration_snapshot: dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSON, nullable=False),
    )
    status: RecommendationStatus = Field(
        default=RecommendationStatus.PENDING, index=True
    )
    created_at: datetime = Field(default_factory=utc_now, nullable=False, index=True)
    completed_at: datetime | None = Field(default=None)
    error_message: str | None = Field(default=None, max_length=4000)

    user: UserProfile = Relationship(back_populates="recommendation_runs")
    items: list[RecommendationItem] = Relationship(back_populates="run")


class RecommendationItem(SQLModel, table=True):
    __tablename__: ClassVar[Any] = "recommendation_items"
    __table_args__ = (
        UniqueConstraint("run_id", "rank", name="uq_recommendation_run_rank"),
        UniqueConstraint("run_id", "paper_id", name="uq_recommendation_run_paper"),
        CheckConstraint("`rank` >= 1", name="ck_recommendation_rank_positive"),
    )

    id: int | None = Field(default=None, primary_key=True)
    run_id: int = Field(foreign_key="recommendation_runs.id", index=True)
    paper_id: int = Field(foreign_key="papers.id", index=True)
    rank: int = Field(ge=1)
    relevance_score: float
    score_breakdown: dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(MutableDict.as_mutable(JSON), nullable=False),
    )
    explanation: str | None = Field(default=None, max_length=4000)

    run: RecommendationRun = Relationship(back_populates="items")
    paper: Paper = Relationship(back_populates="recommendation_items")
    interactions: list[PaperInteraction] = Relationship(
        back_populates="recommendation_item"
    )


class PaperInteraction(SQLModel, table=True):
    __tablename__: ClassVar[Any] = "paper_interactions"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user_profiles.id", index=True)
    paper_id: int = Field(foreign_key="papers.id", index=True)
    recommendation_item_id: int | None = Field(
        default=None,
        foreign_key="recommendation_items.id",
        index=True,
    )
    action: PaperAction = Field(index=True)
    source_agent: str = Field(default="research", max_length=100)
    created_at: datetime = Field(default_factory=utc_now, nullable=False, index=True)
    interaction_metadata: dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column("metadata", MutableDict.as_mutable(JSON), nullable=False),
    )

    user: UserProfile = Relationship(back_populates="paper_interactions")
    paper: Paper = Relationship(back_populates="interactions")
    recommendation_item: RecommendationItem | None = Relationship(
        back_populates="interactions"
    )
