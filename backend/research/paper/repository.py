from sqlmodel import select, Session, func

from storage.research.models import Paper, PaperAuthor, PaperTopic, ResearchInterest, InterestType
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

class ResearchInterestRepository:
    '''
    Repository of functions handling the DB for actions or code related to interests
    '''

    def __init__(self, session: Session):
        self.session = session


    # Returns the users interest in a topic or not
    def get_user_topic_interest(self, user_id: int, topic: str) -> ResearchInterest | None:
        statement = (
            select(ResearchInterest)
            .where(
                ResearchInterest.user_id == user_id,
                func.lower(ResearchInterest.topic_name)
                == topic.lower()
            )
        )

        return self.session.exec(statement).first()

    def add(self, interest: ResearchInterest) -> None:
        self.session.add(interest)

    # Retrieves the users last search interest, helpful for algorithm + used as fallback if no topic is being searched
    def get_latest_interest(self, user_id: int) -> ResearchInterest | None:
        statement = (
            select(ResearchInterest)
            .where(
                ResearchInterest.user_id == user_id,
                ResearchInterest.interest_type == InterestType.INCLUDE,
                ResearchInterest.last_searched_at.is_not(None)
            )
            .order_by(
                ResearchInterest.last_searched_at.desc(),
                ResearchInterest.id.desc()
            )
        )

        return self.session.exec(statement).first()

    def get_all_users_interests(self, user_id: int) -> List[ResearchInterest]:
        statement = (
            select(ResearchInterest)
            .where(ResearchInterest.user_id == user_id)
            .order_by(ResearchInterest.created_at.desc())
        )

        return list(self.session.exec(statement).all())
