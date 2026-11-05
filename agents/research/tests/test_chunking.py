import pytest

from agents.research.state import PageText
from agents.research.chunking import chunk_pages, split_long_sentence
# Adjust the import above to your actual module path.


def test_single_chunk():
    pages = [
        PageText(page_number=1, text="Athena reads scientific papers.")
    ]

    chunks = chunk_pages(1, pages, chunk_size=10, overlap=2)

    assert len(chunks) == 1
    assert chunks[0].content == "Athena reads scientific papers."
    assert chunks[0].chunk_index == 0
    assert chunks[0].page_start == 1
    assert chunks[0].page_end == 1


def test_chunk_spans_multiple_pages():
    pages = [
        PageText(page_number=1, text="Athena reads papers."),
        PageText(page_number=2, text="She evaluates evidence.")
    ]

    chunks = chunk_pages(1, pages, chunk_size=10, overlap=2)

    assert len(chunks) == 1
    assert chunks[0].page_start == 1
    assert chunks[0].page_end == 2
    assert chunks[0].content == (
        "Athena reads papers. She evaluates evidence."
    )


def test_sentence_boundaries():
    pages = [
        PageText(
            page_number=1,
            text=(
                "Alpha beta gamma delta. "
                "Epsilon zeta eta theta. "
                "Iota kappa lambda mu."
            )
        )
    ]

    chunks = chunk_pages(1, pages, chunk_size=7, overlap=0)

    assert len(chunks) == 3
    assert [chunk.content for chunk in chunks] == [
        "Alpha beta gamma delta.",
        "Epsilon zeta eta theta.",
        "Iota kappa lambda mu."
    ]


def test_sentence_overlap():
    pages = [
        PageText(
            page_number=1,
            text="One two three. Four five six. Seven eight nine."
        )
    ]

    chunks = chunk_pages(1, pages, chunk_size=6, overlap=3)

    assert len(chunks) == 2

    assert chunks[0].content == (
        "One two three. Four five six."
    )
    assert chunks[1].content == (
        "Four five six. Seven eight nine."
    )


def test_split_long_sentence():
    sentence = " ".join(f"word{i}" for i in range(180))

    chunks = split_long_sentence(
        sentence,
        chunk_size=100,
        overlap=20
    )

    assert len(chunks) == 2

    first = chunks[0].split()
    second = chunks[1].split()

    assert len(first) == 100
    assert len(second) == 100

    # Verify the 20-word overlap
    assert first[-20:] == second[:20]
    assert first[0] == "word0"
    assert second[-1] == "word179"


def test_oversized_sentence_with_surrounding_text():
    long_sentence = " ".join(f"word{i}" for i in range(12)) + "."

    pages = [
        PageText(page_number=1, text="Short introduction here."),
        PageText(page_number=2, text=long_sentence),
        PageText(page_number=3, text="Final conclusion here.")
    ]

    chunks = chunk_pages(1, pages, chunk_size=7, overlap=2)

    assert len(chunks) == 4
    assert [c.chunk_index for c in chunks] == [0, 1, 2, 3]

    assert chunks[0].content == "Short introduction here."
    assert chunks[0].page_start == 1

    assert len(chunks[1].content.split()) == 7
    assert len(chunks[2].content.split()) == 7
    assert chunks[1].page_start == 2
    assert chunks[2].page_end == 2

    assert chunks[3].content == "Final conclusion here."
    assert chunks[3].page_start == 3


def test_empty_page():
    pages = [
        PageText(page_number=1, text=""),
        PageText(page_number=2, text="Athena evaluates evidence.")
    ]

    chunks = chunk_pages(1, pages, chunk_size=10, overlap=2)

    assert len(chunks) == 1
    assert chunks[0].page_start == 2
    assert chunks[0].page_end == 2


def test_no_pages():
    with pytest.raises(ValueError):
        chunk_pages(1, [])


@pytest.mark.parametrize(
    "chunk_size, overlap",
    [
        (0, 0),
        (-1, 0),
        (10, -1),
        (10, 10),
        (10, 15)
    ]
)
def test_invalid_parameters(chunk_size, overlap):
    pages = [PageText(page_number=1, text="Hello world.")]

    with pytest.raises(ValueError):
        chunk_pages(
            1,
            pages,
            chunk_size=chunk_size,
            overlap=overlap
        )


def test_none_page_text():
    pages = [
        PageText(page_number=1, text=""),
        PageText(page_number=2, text="Valid research sentence.")
    ]

    chunks = chunk_pages(1, pages, chunk_size=10, overlap=2)

    assert len(chunks) == 1
    assert chunks[0].page_start == 2