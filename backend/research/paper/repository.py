from sqlmodel import select, Session, func
from datetime import datetime

from storage.research.models import Paper, PaperAuthor, PaperTopic, ResearchInterest, InterestType, UserProfile, RecommendationRun, RecommendationItem, PaperInteraction, PaperAction
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


class RecommendationRunRepository:
    def __init__(self, session: Session):
        self.session = session

    def add(self, run: RecommendationRun) -> None:
        self.session.add(run)

    def get(self, run_id: int) -> RecommendationRun | None:
        return self.session.get(RecommendationRun, run_id)

    def get_by_user(self, user_id: int, limit: int = 20, offset: int = 0) -> List[RecommendationRun]:
        statement = (
            select(RecommendationRun)
            .where(RecommendationRun.user_id == user_id)
            .order_by(
                RecommendationRun.created_at.desc(),
                RecommendationRun.id.desc())
            .offset(offset)
            .limit(limit)
        )

        return list(self.session.exec(statement).all())
    def get_with_items(self, run_id: int) -> RecommendationRun | None:
        statement =  (select(RecommendationRun)
                      .where(RecommendationRun.id == run_id)
                      .options(selectinload(RecommendationRun.items).selectinload(RecommendationItem.paper)))
        return self.session.exec(statement).one_or_none()

class RecommendationItemRepository:
    def __init__(self, session: Session):
        self.session = session
    def add(self, item: RecommendationItem) -> None:
        self.session.add(item)
    def get_by_run_id(self, run_id: int) -> List[RecommendationItem]:
        statement = (
            select(RecommendationItem)
            .where(RecommendationItem.run_id == run_id)
            .order_by(RecommendationItem.rank.asc())
        )

        return list(self.session.exec(statement).all())
    def get_by_paper_id(self, paper_id: int) -> List[RecommendationItem]:
        statement = (
            select(RecommendationItem)
            .where(RecommendationItem.paper_id == paper_id)
            .order_by(RecommendationItem.rank.asc())
        )

        return list(self.session.exec(statement).all())

class PaperInteractionRepository:
    def __init__(self, session: Session):
        self.session = session

    def lock_user(self, user_id: int) -> UserProfile | None:
        # Serialize impression writes for a user on MySQL/InnoDB. Avoids duplicate
        # rows when several viewport events arrive concurrently.
        statement = select(UserProfile).where(UserProfile.id == user_id).with_for_update()
        return self.session.exec(statement).one_or_none()

    def get_impression(
        self,
        *,
        user_id: int,
        paper_id: int,
        recommendation_item_id: int | None,
        source_agent: str,
        day_start: datetime,
        next_day: datetime,
    ) -> PaperInteraction | None:
        statement = select(PaperInteraction).where(
            PaperInteraction.user_id == user_id,
            PaperInteraction.action == PaperAction.IMPRESSION,
        )

        if recommendation_item_id is not None:
            # A recommended paper is counted once per recommendation item.
            statement = statement.where(
                PaperInteraction.recommendation_item_id == recommendation_item_id
            )
        else:
            # Unattributed library impressions are counted once per UTC day.
            statement = statement.where(
                PaperInteraction.paper_id == paper_id,
                PaperInteraction.recommendation_item_id.is_(None),
                PaperInteraction.source_agent == source_agent,
                PaperInteraction.created_at >= day_start,
                PaperInteraction.created_at < next_day,
            )

        return self.session.exec(statement.order_by(PaperInteraction.id.desc())).first()

    def get_interaction(
        self,
        *,
        user_id: int,
        paper_id: int,
        action: PaperAction,
        recommendation_item_id: int | None = None,
        source_agent: str | None = None,
        day_start: datetime | None = None,
        next_day: datetime | None = None,
    ) -> PaperInteraction | None:

        statement = select(PaperInteraction).where(
            PaperInteraction.user_id == user_id,
            PaperInteraction.paper_id == paper_id,
            PaperInteraction.action == action,
        )

        if recommendation_item_id is not None:
            statement = statement.where(
                PaperInteraction.recommendation_item_id == recommendation_item_id
            )
        else:
            statement = statement.where(
                PaperInteraction.recommendation_item_id.is_(None)
            )

        if source_agent is not None:
            statement = statement.where(
                PaperInteraction.source_agent == source_agent
            )

        if day_start is not None:
            statement = statement.where(PaperInteraction.created_at >= day_start)

        if next_day is not None:
            statement = statement.where(PaperInteraction.created_at < next_day)

        return self.session.exec(
            statement.order_by(PaperInteraction.id.desc())
        ).first()

    def get_paper_state(self, user_id: int, paper_id: int) -> list[PaperInteraction]:
        actions = [
            PaperAction.SAVE,
            PaperAction.UNSAVE,
            PaperAction.DISLIKE,
            PaperAction.LIKE,

        ]

        statement = (
            select(PaperInteraction)
            .where(PaperInteraction.user_id == user_id,
                   PaperInteraction.paper_id == paper_id,
                   PaperInteraction.action.in_(actions))
            .order_by(PaperInteraction.created_at.desc(),
                      PaperInteraction.id.desc())
        )

        return list(self.session.exec(statement).all())
    def add(self, interaction: PaperInteraction) -> None:
        self.session.add(interaction)

