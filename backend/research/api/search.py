from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session
from langchain_nvidia_ai_endpoints import ChatNVIDIA

from backend.init import engine
from agents.research.orchestrator.services import ResearchOrchestrator
from backend.research.providers.topic_explorer import NVIDIATopicExplorer
from agents.research.openalex import OpenAlexClient
import os
import logging

logger = logging.getLogger(__name__)


search_router = APIRouter(prefix="/research", tags=["Research"])


class ResearchRequest(BaseModel):
    user_id: int
    prompt: str = Field(min_length=1)
    paper_count: int = Field(default=5, ge=1, le=50)
    exploration_agents: int = Field(default=2, ge=0, le=3)
    exploration_ratio: float = Field(default=0.3, ge=0, le=1)


def session_factory():
    return Session(engine)

@search_router.post("/search")
async def search_papers(request: ResearchRequest):
    llm = ChatNVIDIA(
        model=os.environ["NVIDIA_MODEL"],
        temperature=0.3
    )

    orchestrator = ResearchOrchestrator(
        session_factory=session_factory,
        searcher=OpenAlexClient(),
        explorer=NVIDIATopicExplorer(llm)
    )

    try: 
        result = await orchestrator.execute_search(
            user_id=request.user_id,
            prompt=request.prompt,
            paper_count=request.paper_count,
            exploration_agents=request.exploration_agents,
            exploration_ratio=request.exploration_ratio
        )
    except Exception:
        logger.exception("Research execution failed")

        raise HTTPException(
            status_code=500,
            detail="Research execution failed"
        )
    
    return {
        "run_id": result.run_id,
        "topic": result.topic,
        "saved_count": result.saved_count,
        "related_topics": result.related_topics,
    }