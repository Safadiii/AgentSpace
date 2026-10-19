from sqlmodel import Session
from backend.research.paper.repository import PaperRepository, PaperAuthorRepository, PaperTopicRepository
from storage.research.models import Paper, PaperAuthor, PaperTopic
from typing import List
from backend.research.schemas import PaperCreate, PaperRead


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

        
        
