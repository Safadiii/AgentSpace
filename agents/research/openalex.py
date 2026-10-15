# OpenAlex API Implementation
from dotenv import load_dotenv
from agents.research.state import Paper
from agents.research.helpers import parse_work
import os
import httpx


class OpenAlexClient:

    BASE_URL="https://api.openalex.org/works"

    def __init__(self, api_key: str | None = None) -> None:
        self.api_key = os.getenv("OPENALEX_API_KEY")

    async def search(
        self,
        query: str,
        *,
        limit: int = 10,
        from_year: int | None = None,
    ) -> list[Paper]:

        params = {
            "search.semantic": query,
            "per_page": limit,
        }

        if from_year is not None:
            params["filter"] = (
                f"publication_year:>{from_year - 1}"
            )

        headers = (
            {"Authorization": f"Bearer {self.api_key}"}
            if self.api_key else {}
        )

        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.get(
                self.BASE_URL,
                params=params,
                headers=headers
            )
            response.raise_for_status()
            data = response.json()

        return [
            parse_work(work)
            for work in data.get("results", [])
        ]
