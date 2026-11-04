
from agents.research.state import (
    PaperAnalysisState,
    PaperSection,
)
from agents.research.summary_agent import SummaryAgent


def make_state() -> PaperAnalysisState:
    section = PaperSection(
        heading="Experimental Evaluation",
        text=(
            "We evaluate the proposed model using "
            "three baseline systems and two datasets. "
            "The experiments compare accuracy and latency "
            "against previously published approaches."
        ),
        page_start=4,
        page_end=5,
    )

    return PaperAnalysisState(
        paper_id=22,
        requested_tasks=["credibility"],
        content_source="pdf",
        sections=[section],
        active_context=[section],
    )


def test_prepare_evidence_uses_source_text():
    state = make_state()

    # The node does not access self or the LLM.
    result = SummaryAgent.prepare_evidence(
        None, state
    )

    evidence = result["evidence_candidates"]

    assert len(evidence) > 0
    assert evidence[0].source_id == "S1"

    for item in evidence:
        original = state.active_context[
            item.section_index
        ]

        assert item.excerpt in original.text
        assert item.page_start == 4
        assert item.page_end == 5


def test_verify_evidence_rejects_unknown_ids():
    state = make_state()

    prepared = SummaryAgent.prepare_evidence(
        None, state
    )

    state.evidence_candidates = prepared[
        "evidence_candidates"
    ]

    state.credibility = {
        "scope": "paper_internal",
        "report": (
            "The authors evaluate three baseline "
            "systems [S1]. Another experiment "
            "is discussed [S99]."
        ),
        "content_source": "pdf",
    }

    result = SummaryAgent.verify_evidence(
        None, state
    )

    report = result["credibility"]

    assert report["citation_status"] == "partial"
    assert len(report["evidence_index"]) == 1
    assert report["evidence_index"][0]["source_id"] == "S1"
    assert "(unverified citation S99)" in report["report"]
    assert "credibility" in result["completed_tasks"]


def test_verify_evidence_detects_modified_excerpt():
    state = make_state()

    prepared = SummaryAgent.prepare_evidence(
        None, state
    )

    state.evidence_candidates = prepared[
        "evidence_candidates"
    ]

    # Simulate corrupted or fabricated evidence.
    state.evidence_candidates[0].excerpt = (
        "This sentence does not exist in the paper."
    )

    state.credibility = {
        "scope": "paper_internal",
        "report": "The results are promising [S1].",
        "content_source": "pdf",
    }

    result = SummaryAgent.verify_evidence(
        None, state
    )

    report = result["credibility"]

    assert report["citation_status"] == "unverified"
    assert report["evidence_index"] == []
    assert report["citation_warnings"]
