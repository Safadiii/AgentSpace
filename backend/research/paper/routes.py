from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session
from backend.init import engine

from storage.research.models import Paper
from backend.init import get_session
from backend.research.schemas import PaperRead, PaperSummaryResponse, PaperCreate, PaperDetailedRead, ResearchRunResponse, PaperInteractionRead, PaperInteractionCreate, PaperStateRead, PaperCredibilityResponse
from backend.research.paper.services import PaperServices, RecommendationRunServices, PaperInteractionServices, ImpressionNotFoundError
from typing import List
from agents.research.summary_agent import SummaryAgent
from agents.research.state import PaperAnalysisState
import logging

logger = logging.getLogger(__name__)

def session_factory() -> Session:
    return Session(engine)

paper_router = APIRouter(
    prefix="/research",
    tags=["Research"]
)

DBSession = Annotated[Session, Depends(get_session)]

@paper_router.get("/papers", response_model=List[PaperRead])
def get_papers(
    session: DBSession,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0)
):
    service = PaperServices(session)
    return service.get_papers(limit, offset)

@paper_router.get("/papers/{paper_id}", response_model=PaperRead)
def get_paper(paper_id: int, session: DBSession):
    service = PaperServices(session)
    paper = service.get_paper(paper_id)

    if paper is None:
        raise HTTPException(
            status_code=404,
            detail="Paper not found"
        )

    return paper

@paper_router.get("/papers/{paper_id}/detailed", response_model=PaperDetailedRead)
def get_detailed_paper(paper_id: int, session: DBSession):
    service = PaperServices(session)

    paper = service.get_paper_with_details(paper_id)

    if paper is None:
        raise HTTPException(
            status_code=404,
            detail="Paper not found"
        )

    return paper

@paper_router.get("/detailed/papers", response_model=List[PaperDetailedRead])
def get_detailed_papers(session: DBSession, limit: int = 20, offset: int = 0):
    service = PaperServices(session)

    return service.get_detailed_papers(limit, offset)


@paper_router.post("/papers", response_model=PaperRead)
def add_paper(data: PaperCreate, session: DBSession):
    service = PaperServices(session)
    return service.add_paper(data)

@paper_router.get("/runs/{run_id}",response_model=ResearchRunResponse)
def get_research_run(
    run_id: int,
    session: DBSession
):
    service = RecommendationRunServices(session)

    try:
        return service.get_research_run(run_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=404,
            detail=str(exc),
        ) from exc

@paper_router.get(
    "/papers/{paper_id}/interactions",
    response_model=PaperStateRead
)
def get_paper_state(
    paper_id: int,
    session: DBSession
):
    service = PaperInteractionServices(session)

    return service.get_paper_status(paper_id)

@paper_router.post(
    "/papers/{paper_id}/interactions",
    response_model=PaperInteractionRead
)
def record_paper_interaction(
    paper_id: int,
    data: PaperInteractionCreate,
    session: DBSession,
):
    service = PaperInteractionServices(session)

    try:
        return service.record_interaction(
            paper_id=paper_id,
            action=data.action,
            recommendation_item_id=data.recommendation_item_id,
            source_agent=data.source_agent,
            metadata=data.interaction_metadata,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=str(exc)
        ) from exc

@paper_router.post(
    "/papers/{paper_id}/summary",
    response_model=PaperSummaryResponse
)
async def generate_paper_summary(paper_id: int):

    with session_factory() as session:
        paper = session.get(Paper, paper_id)

        if paper is None:
            raise HTTPException(
                status_code=404,
                detail=f"Paper {paper_id} not found"
            )

    try:
        agent = SummaryAgent(
            session_factory=session_factory
        )

        result = await agent.graph.ainvoke({
            "paper_id": paper_id,
            "requested_tasks": ["summary"]
        })

        state = PaperAnalysisState.model_validate(result)

    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=str(exc)
        ) from exc

    except Exception as exc:
        logger.exception(
            "Summary generation failed for paper %s",
            paper_id
        )

        raise HTTPException(
            status_code=500,
            detail="Failed to generate paper summary"
        ) from exc

    if not state.summary or not state.summary.strip():
        raise HTTPException(
            status_code=502,
            detail="The analysis completed without a summary"
        )

    return PaperSummaryResponse(
        paper_id=paper_id,
        title=state.title,
        summary=state.summary,
        content_source=state.content_source
    )


@paper_router.post(
    "/papers/{paper_id}/credibility",
    response_model=PaperCredibilityResponse,
)
async def generate_credibility(paper_id: int, session: DBSession):
    service = PaperServices(session)
    return await service.generate_credibility(paper_id)