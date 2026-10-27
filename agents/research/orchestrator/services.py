
import asyncio
import logging
from dataclasses import dataclass
from math import ceil
from typing import Callable, Literal

from sqlmodel import Session

from backend.research.paper.services import (
    ResearchQueryServices,
    RecommendationRunServices,
    PaperServices,
)
from backend.research.schemas import PaperCreate
from storage.research.models import RecommendationItem

from agents.research.orchestrator.interfaces import SearchProvider, TopicExplorer

logger = logging.getLogger(__name__)

@dataclass
class ResearchCandidate:
    paper: PaperCreate
    query: str
    source: Literal["core", "exploration"]
    search_rank: int

@dataclass
class ResearchResult:
    run_id: int
    topic: str
    saved_count: int
    related_topics: list[str]


class ResearchOrchestrator:

    ANGLES = (
        "applications",
        "methodological approaches",
        "adjacent research fields",
    )

    def __init__(self, session_factory: Callable[[], Session], searcher: SearchProvider, explorer: TopicExplorer | None = None):
        self.session_factory = session_factory
        self.searcher = searcher
        self.explorer = explorer

    async def execute_search(self, user_id: int, prompt: str | None = None, paper_count: int = 10,
                             exploration_agents: int = 2, exploration_ratio: float = 0.30) -> ResearchResult:
        if not 1 <= paper_count <= 30:
            raise ValueError("paper_count must be between 1 and 30")

        if not 0 <= exploration_agents <= 3:
            raise ValueError("exploration_agents must be between 0 and 3")

        if not 0 <= exploration_ratio <= 0.5:
            raise ValueError("exploration_ratio must be between 0 and 0.5")

        if exploration_agents and self.explorer is None:
            raise ValueError("Topic explorer is not configured")

        with self.session_factory() as session:
            resolver = ResearchQueryServices(session)
            run_service = RecommendationRunServices(session)

            mode, topic = resolver.resolve_query(prompt)

            run = run_service.start_run(
               mode, topic, algorithm_version="v1"
            )

            run_id = run.id

        assert run_id is not None

        try:
            core_limit = min(50, max(20, paper_count * 2))

            core_papers = await self.searcher.search(
                topic, limit=core_limit
            )

            core_candidates = [
                ResearchCandidate(
                    paper=paper,
                    query=topic,
                    source="core",
                    search_rank=index
                )
                for index, paper in enumerate(core_papers, start=1)
            ]

            related_topics = await self._get_related_topics(topic, exploration_agents)

            exploration_candidates = [ ]

            if related_topics:
                per_query = min(50, max(5, ceil(paper_count * exploration_ratio * 2 / len(related_topics))))

                for related_topic in related_topics:
                    try:
                        papers = await self.searcher.search(
                            related_topic, limit=per_query
                        )

                        exploration_candidates.extend(
                            ResearchCandidate(
                                paper=paper,
                                query=related_topic,
                                source="exploration",
                                search_rank=index,
                            ) for index, paper in enumerate(papers, start = 1)
                        )
                    except Exception:
                        logger.exception(
                            "Exploration search failed: %s",
                            related_topic,
                        )

            # Filter papers before selecting recommendations
            accessible_core = [
                candidate
                for candidate in core_candidates
                if candidate.paper.is_open_access
                and candidate.paper.pdf_url
            ]

            accessible_exploration = [
                candidate
                for candidate in exploration_candidates
                if candidate.paper.is_open_access
                and candidate.paper.pdf_url
            ]

            selected = self._select_candidates(
                accessible_core,
                accessible_exploration,
                paper_count,
                exploration_ratio if related_topics else 0.0,
            )

            with self.session_factory() as session:
                paper_services = PaperServices(session)
                run_service = RecommendationRunServices(session)

                recommendation_items = []

                for rank, candidate in enumerate(selected, start=1):
                    db_paper = paper_services.add_detailed_paper(
                        candidate.paper
                    )

                    assert db_paper.id is not None

                    rank_score = round(1.0 / candidate.search_rank, 6)

                    recommendation_items.append(
                        RecommendationItem(
                            run_id=run_id,
                            paper_id=db_paper.id,
                            rank=rank,
                            relevance_score=rank_score,
                            score_breakdown={
                                "method": "rank_proxy_v1",
                                "search_rank": candidate.search_rank,
                                "source": candidate.source,
                                "search_query": candidate.query
                            },
                            explanation=(f"Found through {candidate.source}"
                                         f"research: {candidate.query}")
                        )
                    )
                run_service.complete_run(run_id=run_id, items=recommendation_items)
            return ResearchResult(run_id=run_id, topic=topic, saved_count=len(selected), related_topics=related_topics)
        except Exception as exc:
            logger.exception(
                "Research run %s failed",
                run_id
            )

            try:
                with self.session_factory() as session:
                    run_service = RecommendationRunServices(session)

                    run_service.fail_run(run_id=run_id, error_message=str(exc)[:2000])
            except Exception:
                logger.exception(
                    "Unable to mark recommendation run %s failed",
                    run_id,
                )
            raise

    # Right now statically defined topics
    #TODO: Change into an LLM call or classification model to detect topics close in similarity
    async def _get_related_topics(self, topic: str, agent_count: int) -> list[str]:
        if agent_count == 0:
            return []

        tasks = [
            self.explorer.suggest_topic(topic, angle)
            for angle in self.ANGLES[:agent_count]
        ]

        results = await asyncio.gather(
            *tasks, return_exceptions=True
        )

        topics = []
        seen = {topic.casefold()}

        for result in results:
            if isinstance(result, asyncio.CancelledError):
                raise result

            if isinstance(result, BaseException):
                logger.warning(
                    "Topic exploration failed: %s", result
                )
                continue

            proposed = " ".join(result.split())

            if proposed and proposed.casefold() not in seen:
                topics.append(proposed)
                seen.add(proposed.casefold())

        return topics

    @staticmethod
    def _select_candidates(
        core: list[ResearchCandidate],
        exploration: list[ResearchCandidate],
        count: int,
        exploration_ratio: float,
    ) -> list[ResearchCandidate]:

        seen = set()
        unique_core = []
        unique_exploration = []

        for candidate in core + exploration:
            paper_id = candidate.paper.openalex_id

            if not paper_id or not candidate.paper.title:
                continue

            if paper_id in seen:
                continue

            seen.add(paper_id)

            if candidate.source == "core":
                unique_core.append(candidate)
            else:
                unique_exploration.append(candidate)

        exploration_slots = min(
            round(count * exploration_ratio),
            len(unique_exploration),
        )

        core_slots = count - exploration_slots

        selected = (
            unique_core[:core_slots]
            + unique_exploration[:exploration_slots]
        )

        selected_ids = {
            candidate.paper.openalex_id
            for candidate in selected
        }

        for candidate in unique_core + unique_exploration:
            if len(selected) >= count:
                break

            paper_id = candidate.paper.openalex_id

            if paper_id not in selected_ids:
                selected.append(candidate)
                selected_ids.add(paper_id)

        return selected

