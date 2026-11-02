
import asyncio
from types import SimpleNamespace

from sqlmodel import Session, select

from backend.init import engine
from storage.research.models import Paper
from agents.research.summary_agent import SummaryAgent
from agents.research.state import PaperAnalysisState


def test_extract_pdf():
    with Session(engine) as session:
        paper = session.exec(
            select(Paper)
            .where(Paper.pdf_url.is_not(None))
        ).first()

        assert paper is not None
        paper_id = paper.id
        pdf_url = paper.pdf_url

    state = SummaryAgent(
        paper_id=paper_id,
        pdf_url=pdf_url,
        requested_tasks=["summary"],
    )

    # The node does not use self, so we can
    # call it without initializing LangGraph.
    result = asyncio.run(
        SummaryAgent.extract_pdf(
            SimpleNamespace(),
            state,
        )
    )

    print("\n--- PDF EXTRACTION ---")
    print("Paper ID:", paper_id)
    print("Extraction successful:", result["extraction_ok"])
    print("Pages:", len(result["pages"]))

    if result["pages"]:
        print("First page:")
        print(result["pages"][0]["text"][:500])

    assert "extraction_ok" in result
    assert "pages" in result
    assert "content_source" in result

    if result["extraction_ok"]:
        assert len(result["pages"]) > 0
        assert result["pages"][0]["page_number"] == 1
        assert result["content_source"] == "pdf"
