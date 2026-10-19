from sqlmodel import select, Session

from storage.research.models import Paper, PaperAuthor, PaperTopic
from typing import List
from sqlalchemy.orm import selectinload

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


    def get_paper_with_details(
        self,
        paper_id: int
    ) -> Paper | None:

        statement = (
            select(Paper)
            .where(Paper.id == paper_id)
            .options(
                selectinload(Paper.authors),
                selectinload(Paper.topics)
            )
        )

        return self.session.exec(statement).first()

    def get_detailed_papers(
            self,
            limit: int = 20,
            offset: int = 0
    ) -> List[Paper]:

        statement = (
            select(Paper)
            .options(
                selectinload(Paper.authors),
                selectinload(Paper.topics)
            )
            .order_by(Paper.id.desc())
            .offset(offset)
            .limit(limit)
        )

        return list(self.session.exec(statement).all())


class PaperAuthorRepository:

    def __init__(self, session: Session):
        self.session = session

    def get_by_paper_id(self, paper_id: int) -> list[PaperAuthor]:
        statement = (select(PaperAuthor)
                     .where(PaperAuthor.paper_id == paper_id)
                     .order_by(PaperAuthor.author_order.desc())
        )
        return list(self.session.exec(statement).all())

    def add(self, author: PaperAuthor) -> None:
        self.session.add(author)

class PaperTopicRepository:

    def __init__(self, session: Session):
        self.session = session

    def get_by_paper_id(self, paper_id: int) -> list[PaperTopic]:
        statement = (select(PaperTopic)
                     .where(PaperTopic.paper_id == paper_id)
                     .order_by(PaperTopic.relevance_score.desc())
        )
        return list(self.session.exec(statement).all())

    def add(self, topic: PaperTopic) -> None:
        self.session.add(topic)
    