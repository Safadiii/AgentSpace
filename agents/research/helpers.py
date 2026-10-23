from typing import Any
from backend.research.schemas import PaperCreate, PaperAuthorCreate, PaperTopicCreate


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

    topics = [
        PaperTopicCreate(
            topic_name=topic["display_name"],
            openalex_topic_id=topic.get("id"),
            relevance_score=topic.get("score"),
        ) for topic in (work.get("topics") or [])
        if topic.get("display_name")
    ]

    # Extract publication locations
    primary_location = work.get("primary_location") or {}
    oa_location = work.get("best_oa_location") or {}


    # Reconstruct abstract
    abstract = reconstruct_abstract(
        work.get("abstract_inverted_index")
    )
    
    source = primary_location.get("source") or {}

    return PaperCreate(
        openalex_id=work["id"],
        title=work.get("title") or "Untitled",
        publication_year=work.get("publication_year"),
        authors=authors,
        cited_by_count=work.get("cited_by_count") or 0,
        doi=work.get("doi"),
        landing_page_url=(
            primary_location.get("landing_page_url")
            or work["id"]
        ),
        venue=source.get("display_name"),
        topics=topics,
        abstract=abstract,
    )