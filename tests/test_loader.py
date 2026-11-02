
import asyncio
from sqlmodel import Session

from backend.init import engine

from agents.research.state import PaperAnalysisState
from agents.research.summary_agent import SummaryAgent

def session_factory():
    return Session(engine)


async def run_agent():

    agent = SummaryAgent(
        session_factory=session_factory
    )

    result = await agent.graph.ainvoke({
        "paper_id": 22,
        "requested_tasks": ["summary"]
    })

    state = PaperAnalysisState.model_validate(result)

    print("\n--- EXECUTION RESULTS ---")

    print("Paper:", state.title)
    print("Content source:", state.content_source)
    print("Pages extracted:", len(state.pages))
    print("Sections indexed:", len(state.sections))
    print("Sections selected:", len(state.active_context))

    print("\n--- GENERATED SUMMARY ---")

    assert state.summary is not None
    assert len(state.summary.strip()) > 0

    print("\n--- GENERATED SUMMARY ---")
    print(state.summary)

    assert "summary" in state.completed_tasks

    print("\nCompleted tasks:", state.completed_tasks)

    assert "summary" in state.completed_tasks


def test_complete_graph():
    asyncio.run(run_agent())
