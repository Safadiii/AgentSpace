
import os
import asyncio
import logging

from time import monotonic
from typing import Any

import httpx

from backend.research.schemas import PaperCreate
from agents.research.helpers import parse_work

logger = logging.getLogger(__name__)

# Shared between OpenAlexClient instances in this process.
_semantic_lock = asyncio.Lock()
_last_semantic_request = 0.0


async def wait_for_semantic_slot():
    global _last_semantic_request

    async with _semantic_lock:
        elapsed = monotonic() - _last_semantic_request
        wait_time = max(0.0, 1.1 - elapsed)

        if wait_time:
            await asyncio.sleep(wait_time)

        _last_semantic_request = monotonic()


class OpenAlexClient:

    BASE_URL = "https://api.openalex.org/works"

    def __init__(self, api_key: str | None = None):
        self.api_key = api_key or os.getenv("OPENALEX_API_KEY")

    async def search(
        self,
        query: str,
        *,
        limit: int = 5,
        from_year: int | None = None,
    ) -> list[PaperCreate]:

        if not query.strip():
            raise ValueError("Search query cannot be empty")

        if not 1 <= limit <= 50:
            raise ValueError("Semantic search limit must be 1-50")

        params: dict[str, Any] = {
            "search.semantic": query,
            "per_page": limit,
            "api_key": self.api_key
        }

        if from_year is not None:
            params["filter"] = (
                f"publication_year:>{from_year - 1}"
            )

        max_attempts = 4

        async with httpx.AsyncClient(timeout=30.0) as client:
            for attempt in range(max_attempts):
                await wait_for_semantic_slot()

                response = await client.get(
                    self.BASE_URL,
                    params=params,
                )

                if response.status_code == 429:
                    try:
                        error_data = response.json()
                    except ValueError:
                        error_data = {}

                    remaining = response.headers.get(
                        "X-RateLimit-Remaining"
                    )
                    reset = response.headers.get(
                        "X-RateLimit-Reset"
                    )
                    logger.warning(
                        "OpenAlex 429: error=%s remaining=%s reset=%s",
                        error_data,
                        remaining,
                        reset,
                    )
                    if (
                        error_data.get("error") == "not_enough_credits"
                        or remaining == "0"
                    ):
                        raise RuntimeError(
                            "OpenAlex daily API budget exhausted. "
                            f"Reset in approximately {reset} seconds."
                        )

                    if attempt == max_attempts - 1:
                        response.raise_for_status()

                    retry_after = response.headers.get(
                        "Retry-After"
                    )
                    delay = 2 ** (attempt + 1)

                    if retry_after:
                        try:
                            delay = max(delay, float(retry_after))
                        except ValueError:
                            pass

                    logger.warning(
                        "Rate limited. Retrying in %.1f seconds",
                        delay,
                    )

                    await asyncio.sleep(delay)
                    continue

                response.raise_for_status()

                data = response.json()

                return [
                    parse_work(work)
                    for work in data.get("results", [])
                ]

        raise RuntimeError("OpenAlex request failed")
