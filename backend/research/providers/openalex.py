
from typing import Any, Awaitable, Callable

from backend.research.schemas import PaperCreate

# Update to your existing parser's location
from agents.research.helpers import parse_work



#Type annotation
RawSearch = Callable[
    [str, int],
    Awaitable[list[dict[str, Any]]]
]


class OpenAlexSearchProvider:
    def __init__(self, fetch_works: RawSearch):
        self.fetch_works = fetch_works

    async def search(
        self,
        topic: str,
        limit: int
    ) -> list[PaperCreate]:

        topic = " ".join(topic.split())

        if not topic:
            raise ValueError("Search topic cannot be empty")

        if not 1 <= limit <= 50:
            raise ValueError("Limit must be between 1 and 50")

        works = await self.fetch_works(topic, limit)

        papers = []
        seen_ids = set()

        for work in works:
            paper = parse_work(work)

            if paper.openalex_id in seen_ids:
                continue

            seen_ids.add(paper.openalex_id)
            papers.append(paper)

            if len(papers) >= limit:
                break

        return papers
