
import asyncio
import pytest

from agents.research.summary_agent import SummaryAgent
from agents.research.state import PaperAnalysisState

from sqlmodel import Session


def session_factory() -> Session:
    raise AssertionError(
        "Database should not be accessed during routing tests"
    )


@pytest.mark.parametrize(
    "tasks, pdf_url, extraction_ok, expected_path",
    [
        (
            ["summary"],
            "https://example.com/paper.pdf",
            True,
            [
                "load_paper",
                "extract_pdf",
                "index_sections",
                "retrieve_summary",
                "summarize",
            ],
        ),
        (
            ["credibility"],
            "https://example.com/paper.pdf",
            True,
            [
                "load_paper",
                "extract_pdf",
                "index_sections",
                "retrieve_credibility",
                "assess_credibility",
            ],
        ),
        (
            ["summary", "credibility"],
            "https://example.com/paper.pdf",
            True,
            [
                "load_paper",
                "extract_pdf",
                "index_sections",
                "retrieve_summary",
                "summarize",
                "retrieve_credibility",
                "assess_credibility",
            ],
        ),
        (
            ["credibility", "summary"],
            "https://example.com/paper.pdf",
            True,
            [
                "load_paper",
                "extract_pdf",
                "index_sections",
                "retrieve_credibility",
                "assess_credibility",
                "retrieve_summary",
                "summarize",
            ],
        ),
        (
            ["summary"],
            None,
            False,
            [
                "load_paper",
                "use_abstract",
                "index_sections",
                "retrieve_summary",
                "summarize",
            ],
        ),
        (
            ["credibility"],
            "https://example.com/paper.pdf",
            False,
            [
                "load_paper",
                "extract_pdf",
                "use_abstract",
                "index_sections",
                "retrieve_credibility",
                "assess_credibility",
            ],
        ),
    ],
)
def test_graph_routes(
    monkeypatch,
    tasks,
    pdf_url,
    extraction_ok,
    expected_path,
):
    # Mock external operations, not routing logic.

    def fake_load_paper(self, state):
        return {
            "title": "Test Research Paper",
            "abstract": "This paper evaluates a research method.",
            "pdf_url": pdf_url,
        }

    async def fake_extract_pdf(self, state):
        if not extraction_ok:
            return {
                "pages": [],
                "extraction_ok": False,
                "content_source": None,
            }

        return {
            "pages": [
                {
                    "page_number": 1,
                    "text": (
                        "# Abstract\n"
                        "This paper studies a new method.\n\n"
                        "# Methodology\n"
                        "We compare the method against baselines.\n\n"
                        "# Results\n"
                        "The experiments report improvements.\n\n"
                        "# Conclusion\n"
                        "The method performs well in these tests."
                    ),
                }
            ],
            "extraction_ok": True,
            "content_source": "pdf",
        }

    async def fake_summarize(self, state):
        assert state.active_context

        return {
            "summary": "## Overview\nTest summary.",
            "completed_tasks": [
                *state.completed_tasks,
                "summary",
            ],
        }

    async def fake_assess_credibility(self, state):
        assert state.active_context

        return {
            "credibility": {
                "scope": "paper_internal",
                "report": "## Assessment\nTest assessment.",
                "evidence_index": [],
                "content_source": state.content_source,
            },
            "completed_tasks": [
                *state.completed_tasks,
                "credibility",
            ],
        }

    # Patch methods BEFORE constructing the agent.
    # LangGraph captures node references during compilation.
    monkeypatch.setattr(
        SummaryAgent, "load_paper", fake_load_paper
    )
    monkeypatch.setattr(
        SummaryAgent, "extract_pdf", fake_extract_pdf
    )
    monkeypatch.setattr(
        SummaryAgent, "summarize", fake_summarize
    )
    monkeypatch.setattr(
        SummaryAgent, "assess_credibility",
        fake_assess_credibility,
    )

    async def run_case():
        agent = SummaryAgent(
            session_factory=session_factory
        )

        executed_nodes = []
        final_updates = {}

        async for event in agent.graph.astream(
            {
                "paper_id": 22,
                "requested_tasks": tasks,
            },
            stream_mode="updates",
        ):
            for node_name, update in event.items():
                executed_nodes.append(node_name)

                if isinstance(update, dict):
                    final_updates.update(update)

        print("\nRequested:", tasks)
        print("Executed:", " -> ".join(executed_nodes))

        # Verify the exact route
        assert executed_nodes == expected_path

        # Verify each requested task completed
        assert final_updates["completed_tasks"] == tasks

        # Ensure extraction and indexing happen once
        assert executed_nodes.count("index_sections") == 1
        assert executed_nodes.count("load_paper") == 1

        if "summary" in tasks:
            assert final_updates["summary"]

        if "credibility" in tasks:
            assert final_updates["credibility"]["report"]

        expected_source = (
            "pdf"
            if pdf_url and extraction_ok
            else "abstract"
        )

        assert final_updates["content_source"] == expected_source

    asyncio.run(run_case())
