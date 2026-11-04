from pydantic import Field, BaseModel
from typing import Literal, Any
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
        default=10, le=50, ge=1
    )

    papers: list[PaperCreate] = Field(default_factory=list)


Analysis_Task = Literal["summary", "notes", "credibility"]

class PaperSection(BaseModel):
    heading: str
    text: str
    page_start: int | None = None
    page_end: int | None = None

class PaperSummary(BaseModel):
    overview: str = Field(
        description="Concise overview of the paper and its main contribution"
    )

    research_question: str | None = Field(
        default=None,
        description="The main research problem or objective"
    )

    methodology: str | None = Field(
        default=None,
        description="Methods, techniques, and experimental approach used"
    )

    key_findings: list[str] = Field(
        default_factory=list,
        description="Important findings supported by the paper"
    )

    limitations: list[str] = Field(
        default_factory=list,
        description="Limitations of the research or methodology"
    )

    conclusions: list[str] = Field(
        default_factory=list,
        description="Main conclusions and contributions"
    )

class PaperAnalysisState(AgentState):
    paper_id: int
    requested_tasks: list[Analysis_Task] = Field(default_factory=lambda: ["summary"])
    request: str = ""

    title: str | None = None
    abstract: str | None = None
    pdf_url: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)

    pages: list[dict[str, Any]] = Field(default_factory=list)
    extraction_ok: bool = False
    content_source: Literal["pdf", "abstract"] | None = None

    sections: list[PaperSection] = Field(default_factory=list)
    archive_context: list[PaperSection] = Field(default_factory=list)
    active_context: list[PaperSection] = Field(default_factory=list)

    completed_tasks: list[Analysis_Task] = Field(default_factory=list)

    summary: str | None = None
    notes: list[str] = Field(default_factory=list)
    credibility: dict[str, Any] | None = None
    evidence_candidates: list[PaperEvidence] = Field(default_factory=list)

class PaperEvidence(BaseModel):
    source_id: str
    section_index: int
    heading: str
    excerpt: str

    page_start: int | None = None
    page_end: int | None = None




