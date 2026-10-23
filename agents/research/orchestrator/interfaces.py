
from typing import Protocol

from backend.research.schemas import PaperCreate


class SearchProvider(Protocol):
    async def search(
        self,
        query: str,
        *,
        limit: int = 10,
    ) -> list[PaperCreate]:
        ...


class TopicExplorer(Protocol):

    async def suggest_topic(
        self,
        base_topic: str,
        angle: str
    ) -> str:
        ...
