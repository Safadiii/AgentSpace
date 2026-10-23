from datetime import date
from typing import Any

from sqlmodel import Field, SQLModel


class PaperCreate(SQLModel):
    openalex_id: str = Field(min_length=1, max_length=255)
    title: str = Field(min_length=1, max_length=2000)

    doi: str | None = Field(default=None, max_length=512)
    abstract: str | None = None
    publication_year: int | None = None
    publication_date: date | None = None
    venue: str | None = Field(default=None, max_length=1000)
    cited_by_count: int | None = Field(default=None, ge=0)
    landing_page_url: str | None = Field(
        default=None, max_length=2000
    )

    source_metadata: dict[str, Any] = Field(
        default_factory=dict
    )

    authors: list[PaperAuthorCreate] = Field(
        default_factory=list
    )

    topics: list[PaperTopicCreate] = Field(
        default_factory=list
    )


class PaperRead(SQLModel):
    id: int
    openalex_id: str
    title: str
    doi: str | None = None
    publication_year: int | None = None

class PaperAuthorCreate(SQLModel):
    author_name: str
    openalex_author_id: str | None = Field(default=None, max_length=255)
    author_order: int = Field(default=0, ge=0)

class PaperTopicCreate(SQLModel):
    topic_name: str = Field(min_length=1, max_length=255)
    openalex_topic_id: str | None = Field(default=None, max_length=255)
    relevance_score: float | None = Field(default=None, ge=0.0, le=1.0)


class PaperAuthorRead(SQLModel):
    id: int
    author_name: str
    author_order: int
    openalex_author_id: str | None = None


class PaperTopicRead(SQLModel):
    id: int
    topic_name: str
    relevance_score: float | None = None


class PaperDetailedRead(SQLModel):
    id: int
    openalex_id: str
    title: str
    publication_year: int | None = None

    authors: list[PaperAuthorRead] = Field(
        default_factory=list
    )

    topics: list[PaperTopicRead] = Field(
        default_factory=list
    )

class ResearchPaperResponse(SQLModel):
    rank: int
    id: int
    title: str
    abstract: str | None = None
    openalex_id: str


class ResearchRunResponse(SQLModel):
    run_id: int
    status: str
    papers: list[ResearchPaperResponse] = Field(
        default_factory=list
    )

