from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session

from backend.init import get_session
from backend.research.schemas import PaperRead, PaperCreate
from backend.research.paper.services import PaperServices
from typing import List


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


@paper_router.post("/papers", response_model=PaperRead)
def add_paper(data: PaperCreate, session: DBSession):
    service = PaperServices(session)
    return service.add_paper(data)
