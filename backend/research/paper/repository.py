from sqlmodel import select, Session

from storage.research.models import Paper
from typing import List

class PaperRepository:
    def __init__(self, session: Session):
        self.session = session

    def get_by_id(self, paper_id: int) -> Paper | None:
        return self.session.get(Paper, paper_id)

    def get_by_openalex_id(self, openalexid: str) -> Paper | None:
        statement = select(Paper).where(
            Paper.openalex_id == openalexid
        )
        return self.session.exec(statement).first()
    def get_papers(self, limit: int = 20, offset: int = 0) -> List[Paper]:
        statement = (select(Paper)
                    .order_by(Paper.id.desc())
                    .offset(offset)
                    .limit(limit))
        return list(self.session.exec(statement).all())
    def add(self, paper: Paper) -> None:
        self.session.add(paper)