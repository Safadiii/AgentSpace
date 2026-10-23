from pydantic import Field, BaseModel
from backend.research.schemas import PaperCreate
from core.models import AgentState

class Paper(BaseModel):
    """ Each research paper instance modelled """
    id: str
    title: str
    year: int | None = None
    authors: list[str] = Field(default_factory=list)
    citations: int = 0
    doi: str | None = None
    url: str
    pdf_url: str | None = None
    source: str | None = None
    abstract: str | None = None

class ResearchState(AgentState):
    search_query: str = ""

    from_year: int | None = Field(
        default=None, le=2028, ge=1900
    )

    limit: int = Field(
        default=10, le=10, ge=1
    )

    papers: list[PaperCreate] = Field(default_factory=list)