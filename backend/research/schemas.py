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


class PaperRead(SQLModel):
    id: int
    openalex_id: str
    title: str
    doi: str | None = None
    publication_year: int | None = None

class PaperAuthorCreate(SQLModel):
    paper_id: int
    author_name: str