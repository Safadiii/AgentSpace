from typing import Any
from agents.research.state import Paper


def reconstruct_abstract(
    inverted_index: dict[str, list[int]] | None
) -> str | None:
    """
    Reconstruct an abstract from OpenAlex's inverted index.
    """

    if not inverted_index:
        return None

    max_position = max(
        pos
        for positions in inverted_index.values()
        for pos in positions
    )

    words = [""] * (max_position + 1)

    for word, positions in inverted_index.items():
        for position in positions:
            words[position] = word

    return " ".join(words)


def parse_work(work: dict[str, Any]) -> Paper:
    """
    Convert an OpenAlex work into our Paper model.
    """

    # Extract authors
    authors = [
        authorship["author"]["display_name"]
        for authorship in work.get("authorships", [])
        if authorship.get("author", {}).get("display_name")
    ]

    # Extract publication locations
    primary_location = work.get("primary_location") or {}
    oa_location = work.get("best_oa_location") or {}

    # Prefer open-access PDFs
    pdf_url = (
        oa_location.get("pdf_url")
        or primary_location.get("pdf_url")
    )

    # Get publication source (journal, repository, etc.)
    source_data = (
        primary_location.get("source")
        or oa_location.get("source")
        or {}
    )

    source = source_data.get("display_name")

    # Reconstruct abstract
    abstract = reconstruct_abstract(
        work.get("abstract_inverted_index")
    )

    # Prefer DOI, then publication URL, then OpenAlex ID
    url = (
        work.get("doi")
        or primary_location.get("landing_page_url")
        or work["id"]
    )

    return Paper(
        id=work["id"],
        title=work.get("title") or "Untitled",
        year=work.get("publication_year"),
        authors=authors,
        citations=work.get("cited_by_count") or 0,
        doi=work.get("doi"),
        url=url,
        pdf_url=pdf_url,
        source=source,
        abstract=abstract,
    )