
import asyncio

from sqlmodel import Session

from backend.init import engine
from agents.research.summary_agent import SummaryAgent
from agents.research.state import PaperAnalysisState


def session_factory():
    return Session(engine)


async def run_full_analysis():

    agent = SummaryAgent(
        session_factory=session_factory
    )

    paper_id = 22

    print("\n========== STARTING ANALYSIS ==========")

    result = await agent.graph.ainvoke({
        "paper_id": paper_id,
        "requested_tasks": [
            "summary",
            "credibility"
        ]
    })

    state = PaperAnalysisState.model_validate(result)

    # Verify paper loading and extraction
    assert state.title
    assert state.sections
    assert state.content_source in ("pdf", "abstract")

    print("\n========== PAPER ==========")
    print("Title:", state.title)
    print("Source:", state.content_source)
    print("Pages:", len(state.pages))
    print("Indexed sections:", len(state.sections))

    # Verify summary
    assert state.summary is not None
    assert state.summary.strip()

    print("\n========== SUMMARY ==========\n")
    print(state.summary)

    # Verify credibility
    assert state.credibility is not None
    assert state.credibility["report"].strip()

    print("\n========== CREDIBILITY ==========\n")
    print(state.credibility["report"])

    print("\n========== EVIDENCE INDEX ==========\n")
    evidence_index = state.credibility["evidence_index"]

    for evidence in evidence_index:
        print(
            f"[{evidence['source_id']}] "
            f"{evidence['heading']} "
            f"(pages {evidence['page_start']}-{evidence['page_end']})"
        )

    # Verify every requested task completed
    assert state.completed_tasks == [
        "summary",
        "credibility"
    ]

    # Check source IDs mentioned in the report
    source_ids = {
        item["source_id"]
        for item in evidence_index
    }

    import re

    referenced_ids = set(
        re.findall(r"\[S\d+\]", state.credibility["report"])
    )

    unknown_ids = {
        ref.strip("[]")
        for ref in referenced_ids
        if ref.strip("[]") not in source_ids
    }

    assert not unknown_ids, (
        f"Unknown source references: {unknown_ids}"
    )

    print("\n========== TEST PASSED ==========")
    print("Completed:", state.completed_tasks)


def test_real_paper_analysis():
    asyncio.run(run_full_analysis())
