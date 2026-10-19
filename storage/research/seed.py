
from sqlmodel import Session, select

from backend.init import engine, init_db
from storage.research.models import (
    UserProfile,
    ResearchPreferences,
)


def seed_db():
    init_db()

    with Session(engine) as session:
        user = session.exec(
            select(UserProfile).where(
                UserProfile.name == "Safadi"
            )
        ).first()

        if user is None:
            user = UserProfile(name="Safadi")
            session.add(user)
            session.flush()

        preferences = session.exec(
            select(ResearchPreferences).where(
                ResearchPreferences.user_id == user.id
            )
        ).first()

        if preferences is None:
            preferences = ResearchPreferences(
                user_id=user.id,
                recency_days=3650,
                exploration_ratio=0.10,
                ranking_settings={
                    "topic_weight": 0.5,
                    "recency_weight": 0.3,
                    "citation_weight": 0.2,
                },
            )
            session.add(preferences)

        session.commit()


if __name__ == "__main__":
    seed_db()
