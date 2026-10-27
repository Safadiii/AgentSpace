from datetime import date, datetime
from typing import Any

from sqlmodel import Field, SQLModel
from storage.research.models import PaperAction


class PaperAuthorCreate(SQLModel):
    author_name: str
    openalex_author_id: str | None = Field(default=None, max_length=255)
    author_order: int = Field(default=0, ge=0)


class PaperTopicCreate(SQLModel):
    topic_name: str = Field(min_length=1, max_length=255)
    openalex_topic_id: str | None = Field(default=None, max_length=255)
    relevance_score: float | None = Field(default=None, ge=0.0, le=1.0)


class PaperCreate(SQLModel):
    openalex_id: str = Field(min_length=1, max_length=255)
    title: str = Field(min_length=1, max_length=2000)

    doi: str | None = Field(default=None, max_length=512)
    abstract: str | None = None
    publication_year: int | None = None
    publication_date: date | None = None
    venue: str | None = Field(default=None, max_length=1000)
    cited_by_count: int | None = Field(default=None, ge=0)
    landing_page_url: str | None = Field(default=None, max_length=2000)
    source_metadata: dict[str, Any] = Field(default_factory=dict)
    is_open_access: bool = False
    pdf_url: str | None = None
    oa_url: str | None = None

    authors: list[PaperAuthorCreate] = Field(default_factory=list)
    topics: list[PaperTopicCreate] = Field(default_factory=list)


# Compact for the paper list and POST /papers response.
class PaperRead(SQLModel):
    id: int
    openalex_id: str
    title: str
    doi: str | None = None
    abstract: str | None = None
    publication_year: int | None = None


class PaperAuthorRead(SQLModel):
    id: int
    author_name: str
    author_order: int
    openalex_author_id: str | None = None


class PaperTopicRead(SQLModel):
    id: int
    topic_name: str
    relevance_score: float | None = None
    openalex_topic_id: str | None = None


class PaperDetailedRead(SQLModel):
    id: int
    openalex_id: str
    title: str
    doi: str | None = None
    abstract: str | None = None
    publication_year: int | None = None
    publication_date: date | None = None
    venue: str | None = None
    cited_by_count: int | None = None
    landing_page_url: str | None = None
    source_metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime
    is_open_access: bool = False
    pdf_url: str | None = None
    oa_url: str | None = None

    authors: list[PaperAuthorRead] = Field(default_factory=list)
    topics: list[PaperTopicRead] = Field(default_factory=list)


class ResearchPaperResponse(SQLModel):
    rank: int
    id: int  # Paper.id (NOT the RecommendationItem.id)
    title: str
    abstract: str | None = None
    openalex_id: str

    recommendation_item_id: int
    relevance_score: float
    score_breakdown: dict[str, Any] = Field(default_factory=dict)
    explanation: str | None = None


class ResearchRunResponse(SQLModel):
    run_id: int
    status: str
    user_id: int
    mode: str
    query: str | None = None
    algorithm_version: str
    configuration_snapshot: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    completed_at: datetime | None = None
    error_message: str | None = None

    papers: list[ResearchPaperResponse] = Field(default_factory=list)


class PaperInteractionCreate(SQLModel):
    recommendation_item_id: int | None = Field(default=None, ge=1)
    source_agent: str = Field(default="research", min_length=1, max_length=100)
    action: PaperAction
    interaction_metadata: dict[str, Any] = Field(default_factory=dict)


class PaperInteractionRead(SQLModel):
    id: int
    user_id: int
    paper_id: int
    recommendation_item_id: int | None = None
    action: PaperAction
    created_at: datetime

class PaperStateRead(SQLModel):
    user_id: int
    paper_id: int 

    liked: bool = False
    disliked: bool = False
    saved: bool = False

