from sqlmodel import Session
from backend.init import engine
from backend.research.paper.services import PaperServices

with Session(engine) as session:
    service = PaperServices(session)

    papers = service.get_detailed_papers(
        limit=10,
        offset=0
    )

    for paper in papers:
        print(f"\nPaper: {paper.title}")

        print("Authors:")
        for author in sorted(
            paper.authors,
            key=lambda a: a.author_order
        ):
            print(f" - {author.author_name}")

        print("Topics:")
        for topic in sorted(
            paper.topics,
            key=lambda t: (
                t.relevance_score is not None,
                t.relevance_score or 0
            ),
            reverse=True
        ):
            print(
                f" - {topic.topic_name}: "
                f"{topic.relevance_score}"
            )