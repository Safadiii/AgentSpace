
from sqlmodel import Session, select

from backend.init import engine
from backend.research.paper.services import (
    ResearchQueryServices,
    RecommendationRunServices,
)

from storage.research.models import (
    Paper,
    RecommendationItem,
    RecommendationMode,
    RecommendationStatus,
)


USER_ID = 1  # Must exist in your database


def test_start_run():
    with Session(engine) as session:
        resolver = ResearchQueryServices(session)
        recommendation_service = RecommendationRunServices(session)

        # 1. Search with an explicit topic
        mode, query = resolver.resolve_query(
            user_id=USER_ID,
            prompt="Reinforcement Learning"
        )

        assert mode == RecommendationMode.TOPIC

        # 2. Create recommendation run
        run = recommendation_service.start_run(
            user_id=USER_ID,
            mode=mode,
            query=query,
            algorithm_version="v1",
        )

        # 3. Verify the run
        assert run.id is not None
        assert run.user_id == USER_ID
        assert run.query == "Reinforcement Learning"
        assert run.status == RecommendationStatus.PENDING
        assert run.algorithm_version == "v1"

        print(f"\nCreated run: {run.id}")

        # 4. Test fallback search
        fallback_mode, fallback_query = resolver.resolve_query(
            user_id=USER_ID,
            prompt=None
        )

        assert fallback_mode == RecommendationMode.PERSONALIZED
        assert fallback_query == "Reinforcement Learning"

        print("Fallback query:", fallback_query)


def test_complete_run():
    with Session(engine) as session:
        recommendation_service = RecommendationRunServices(session)

        # 1. Get or create a test paper
        paper = session.exec(
            select(Paper).where(
                Paper.openalex_id == "W_TEST_RUN_001"
            )
        ).first()

        if paper is None:
            paper = Paper(
                openalex_id="W_TEST_RUN_001",
                title="Testing Reinforcement Learning",
                publication_year=2025
            )

            session.add(paper)
            session.commit()
            session.refresh(paper)

        # 2. Start a new recommendation run
        run = recommendation_service.start_run(
            user_id=USER_ID,
            mode=RecommendationMode.TOPIC,
            query="Reinforcement Learning",
            algorithm_version="v1"
        )

        assert run.id is not None
        assert paper.id is not None
        assert run.status == RecommendationStatus.PENDING

        print(f"\nStarted run: {run.id}")

        # 3. Create a recommendation item
        item = RecommendationItem(
            run_id=run.id,
            paper_id=paper.id,
            rank=1,
            relevance_score=0.95,
            score_breakdown={
                "semantic_similarity": 0.95
            },
            explanation="Highly relevant to the query"
        )

        # 4. Complete the run
        completed_run = recommendation_service.complete_run(
            run_id=run.id,
            items=[item]
        )

        # 5. Verify the run's status
        assert completed_run.status == RecommendationStatus.COMPLETED
        assert completed_run.completed_at is not None

        # 6. Retrieve saved recommendation items
        saved_items = recommendation_service.item_repository.get_by_run_id(
            run.id
        )

        # 7. Verify the recommendations
        assert len(saved_items) == 1
        assert saved_items[0].paper_id == paper.id
        assert saved_items[0].rank == 1
        assert saved_items[0].relevance_score == 0.95

        print("Completed run:", completed_run.id)
        print("Status:", completed_run.status)
        print("Completed at:", completed_run.completed_at)
        print("Saved items:", len(saved_items))


if __name__ == "__main__":
    test_start_run()
    test_complete_run()
    print("\nAll tests passed!")
