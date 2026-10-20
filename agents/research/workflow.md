# Research Agent
Research Agent is an agent built to provide the user with latest recommendations for Articles, Scientific Research 
& research papers relevant to the user. It uses a recommendation algorithm which records interaction of users with candidates
and updates the scores over time. 

## Workflow

#### Retrieval

Using OpenAlex API, we retrieve the top relevant papers of a topic with Semantic Search Endpoint. The found papers are then cleaned 
up.

#### Paper Type
```
class Paper(BaseModel):
    """ Each research paper instance modelled """
    id: str
    title: str
    year: int | None = None
    authors: list[str] = Field(default_factory=list)
    citations: int = 0
    doi: str | None = None
    url: str
    pdf_url: str | None = None
    source: str | None = None
    abstract: str | None = None
```

### Recommendation

Through use of interactions to particular papers, topics, authors & publishing date, we can determine a profile for tendency
or interests of a user and use that to recommend more relevant papers in the future.

