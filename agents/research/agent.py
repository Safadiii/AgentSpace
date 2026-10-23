from core.base_agent import BaseAgent
from core.models import AgentDefinition
from agents.research.state import ResearchState
from agents.research.openalex import OpenAlexClient
from langgraph.graph import START, END, StateGraph
import os

class ResearchAgent(BaseAgent[ResearchState]):
    definition = AgentDefinition(
        id="research",
        name="Research Agent",
        version="0.1.0",
        description="Find and search for academic papers using OpenAlex",
        capabilities=["paper_search", 
                      "academic_paper_research"]
    )

    state_schema = ResearchState

    def __init__(self, client: OpenAlexClient | None = None):
        self.client = client or OpenAlexClient(
            api_key=os.getenv("OPENALEX_API_KEY")
        )
        super().__init__()

    def prepare_query(self, state: ResearchState) -> dict:
        query = state.request.strip()

        if not query:
            raise ValueError("Research Topic can not be blank")

        return {"search_query": query}

    async def fetch_papers(self, state: ResearchState) -> dict:
        papers = await self.client.search(
            state.search_query,
            limit=state.limit,
            from_year=state.from_year
        )

        return {"papers": papers}

    def prepare_results(self, state: ResearchState) -> dict:
        if not state.papers:
            return {"result": f"No papers found in search: {state.search_query}"}

        lines = [
            f"Found {len(state.papers)} papers for: {state.search_query}"
        ]

        for i, paper in enumerate(state.papers, start=1):
            year = paper.publication_year if paper.publication_year is not None else "n.d."
            lines.append(
                f"{i}. {paper.title} ({year}) - {paper.landing_page_url}"
            )

        return {"result": "\n".join(lines)}

    def define_graph(self, graph: StateGraph) -> None:
        graph.add_node("prepare_query", self.prepare_query)
        graph.add_node("fetch_papers", self.fetch_papers)
        graph.add_node("prepare_results", self.prepare_results)

        graph.add_edge(START, "prepare_query")
        graph.add_edge("prepare_query", "fetch_papers")
        graph.add_edge("fetch_papers", "prepare_results")
        graph.add_edge("prepare_results", END)