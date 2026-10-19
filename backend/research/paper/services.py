from sqlmodel import Session
from backend.research.paper.repository import PaperRepository
from storage.research.models import Paper
from typing import List
from backend.research.schemas import PaperCreate, PaperRead


class PaperServices:

    def __init__(self, session: Session):
        self.session = session
        self.repository = PaperRepository(session)

    def get_paper(self, id: int) -> Paper | None:
        return self.repository.get_by_id(id)

    def get_paper_by_openalex_id(self, openalexid: str) -> Paper | None:
        return self.repository.get_by_openalex_id(openalexid)

    def get_papers(self, limit: int = 20, offset: int = 0) -> List[Paper]:
        if not 1 <= limit <= 100 or offset < 0:
            raise ValueError("Invalid pagination parameters")

        return self.repository.get_papers(
            limit=limit, offset=offset
        )

    def add_paper(self, data: PaperCreate) -> Paper:

        existing = self.repository.get_by_openalex_id(
            data.openalex_id
        )

        if existing is not None:
            return existing

        paper = Paper(**data.model_dump())


        self.repository.add(paper)

        try:
            self.session.commit()
        except Exception:
            self.session.rollback()
            raise

        self.session.refresh(paper)

        return paper