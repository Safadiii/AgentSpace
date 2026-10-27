from typing import Any

from backend.research.schemas import (
    PaperCreate,
    PaperAuthorCreate,
    PaperTopicCreate,
)


def reconstruct_abstract(
    inverted_index: dict[str, list[int]] | None
) -> str | None:
    """
    Reconstruct an abstract from OpenAlex's inverted index.
    """
    if not inverted_index:
        return None

    max_position = max(
        (pos for positions in inverted_index.values() for pos in positions),
        default=-1,
    )

    if max_position < 0:
        return None

    words = [""] * (max_position + 1)

    for word, positions in inverted_index.items():
        for position in positions:
            words[position] = word

    return " ".join(words)


def resolve_oa_pdf(work: dict[str, Any]) -> str | None:
    """
    Find an open-access PDF URL from OpenAlex locations.
    """

    open_access = work.get("open_access") or {}

    if open_access.get("is_oa") is not True:
        return None

    locations = [
        work.get("best_oa_location"),
        *(work.get("locations") or []),
    ]

    for location in locations:
        if not isinstance(location, dict):
            continue

        if location.get("is_oa") is not True:
            continue

        pdf_url = location.get("pdf_url")

        if isinstance(pdf_url, str) and pdf_url.strip():
            return pdf_url.strip()

    return None


def parse_work(work: dict[str, Any]) -> PaperCreate:
    """
    Convert an OpenAlex work into our Paper model.
    """

    # Extract authors
    authors = [
        PaperAuthorCreate(
            author_name=authorship["author"]["display_name"],
            openalex_author_id=authorship["author"].get("id"),
            author_order=index,
        )
        for index, authorship in enumerate(
            work.get("authorships") or []
        )
        if authorship.get("author", {}).get("display_name")
    ]

    # Extract topics
    topics = [
        PaperTopicCreate(
            topic_name=topic["display_name"],
            openalex_topic_id=topic.get("id"),
            relevance_score=topic.get("score"),
        )
        for topic in (work.get("topics") or [])
        if topic.get("display_name")
    ]

    # Extract publication locations
    primary_location = work.get("primary_location") or {}
    best_oa_location = work.get("best_oa_location") or {}

    source = primary_location.get("source") or {}

    # Extract open-access metadata
    open_access = work.get("open_access") or {}

    is_open_access = open_access.get("is_oa") is True
    pdf_url = resolve_oa_pdf(work)

    # Prefer an open-access landing page
    landing_page_url = (
        (
            best_oa_location.get("landing_page_url")
            or open_access.get("oa_url")
        )
        if is_open_access
        else None
    )

    landing_page_url = (
        landing_page_url
        or primary_location.get("landing_page_url")
        or work["id"]
    )

    # Reconstruct abstract
    abstract = reconstruct_abstract(
        work.get("abstract_inverted_index")
    )

    return PaperCreate(
        openalex_id=work["id"],
        title=work.get("title") or "Untitled",

        publication_year=work.get("publication_year"),
        publication_date=work.get("publication_date"),

        authors=authors,
        cited_by_count=work.get("cited_by_count") or 0,
        doi=work.get("doi"),

        landing_page_url=landing_page_url,
        venue=source.get("display_name"),

        topics=topics,
        abstract=abstract,

        # New fields
        is_open_access=is_open_access,
        pdf_url=pdf_url,
    )