from sqlmodel import Session
from backend.research.paper.repository import PaperRepository, PaperAuthorRepository, PaperTopicRepository, ResearchInterestRepository
from storage.research.models import Paper, PaperAuthor, PaperTopic, ResearchInterest, utc_now, InterestType, RecommendationMode
from typing import List
from backend.research.schemas import PaperCreate, PaperRead


class NoSearchHistoryError(Exception):
    pass

class PaperServices:

    def __init__(self, session: Session):
        self.session = session
        self.repository = PaperRepository(session)
        self.authorrepository = PaperAuthorRepository(session)
        self.topicrepository = PaperTopicRepository(session)

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
        

        paper_data = data.model_dump(
            exclude={"authors", "topics"}
        )

        paper = Paper(**paper_data)


        self.repository.add(paper)

        try:
            self.session.commit()
        except Exception:
            self.session.rollback()
            raise

        self.session.refresh(paper)

        return paper
    
    def add_detailed_paper(self, data: PaperCreate) -> Paper:
        existing = self.repository.get_by_openalex_id(
            data.openalex_id
        )

        if existing is not None:
            return existing

        paper_data = data.model_dump(
            exclude={"authors", "topics"}
        )

        paper = Paper(**paper_data)
        try:
            self.repository.add(paper)
            self.session.flush()

            for author_data in data.authors:
                author = PaperAuthor(
                    paper_id=paper.id,
                    **author_data.model_dump()
                )

                self.authorrepository.add(author)

            for topic_data in data.topics:
                topic = PaperTopic(
                    paper_id=paper.id,
                    **topic_data.model_dump()
                )

                self.topicrepository.add(topic)
                
            self.session.commit()
        except Exception:
            self.session.rollback()
            raise

        self.session.refresh(paper)

        return paper
    
    def get_paper_with_details(
        self,
        paper_id: int
    ) -> Paper | None:

        if paper_id <= 0:
            raise ValueError("Paper ID must be positive")

        return self.repository.get_paper_with_details(
            paper_id
        )

    def get_detailed_papers(
            self, limit: int = 20, offset: int = 0
    ) -> List[Paper]:

        if not 1 <= limit <= 100:
            raise ValueError("Limit must be between 1 and 100")

        if offset < 0:
            raise ValueError("Offset cant be negative")

        return self.repository.get_detailed_papers(limit, offset)

        
        
class ResearchPreferenceServices:
    def __init__(self, session: Session):
        self.session = session
        self.repository = ResearchInterestRepository(session)

    def record_research_interest(self, user_id: int, topic: str) -> ResearchInterest:
        topic = " ".join(topic.split())

        if user_id <= 0:
            raise ValueError("Invalid User ID")

        if not topic or len(topic) > 255:
            raise ValueError("Invalid topic length (Must be between 1 and 255)")

        try:
            existing = self.repository.get_user_topic_interest(user_id, topic)

            now = utc_now()

            if existing is not None:
                existing.interest_type = InterestType.INCLUDE
                existing.search_count += 1
                existing.last_searched_at = now
                interest = existing
            else:
                interest = ResearchInterest(
                    user_id=user_id,
                    topic_name=topic,
                    interest_type=InterestType.INCLUDE,
                    last_searched_at=now,
                    search_count=1
                )

                self.repository.add(interest)
            self.session.commit()
        except:
            self.session.rollback()
            raise

        self.session.refresh(interest)

        return interest

    def get_interests(
        self,
        user_id: int
    ) -> list[ResearchInterest]:

        return self.repository.get_all_users_interests(user_id)
    def get_fallback_topic(self, user_id: int) -> str | None:
        latest = self.repository.get_latest_interest(
            user_id
        )

        if latest is None:
            return None

        return latest.topic_name

class ResearchQueryServices:
    def __init__(self, session: Session):
        self.preference = ResearchPreferenceServices(session)

    def resolve_query(self, user_id: int, prompt: str | None) -> tuple[RecommendationMode, str]:
        if user_id <= 0:
            raise ValueError("Invalid User ID")

        query = " ".join(prompt.split()) if prompt else ""

        if query:
            interest = self.preference.record_research_interest(user_id, topic=query)

            return (RecommendationMode.TOPIC, interest.topic_name)

        fallback = self.preference.get_fallback_topic(user_id=user_id)

        if fallback is None:
            raise NoSearchHistoryError("No search history found, search for something first")

        return (RecommendationMode.PERSONALIZED, fallback)
