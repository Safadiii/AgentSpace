from abc import ABC, abstractmethod
from pydantic import BaseModel, Field, ConfigDict


class AgentDefinition(BaseModel):
    """Static Information about an agent"""

    id: str = Field(pattern=r"^[a-z][a-z0-9_-]*$")
    name: str
    description: str

    version: str = "0.1.0"
    capabilities: list[str] = Field(description="Capabilities of a specified agent", default_factory=list)

    recursion_limit: int = Field(default=50, ge=1)

class AgentState(BaseModel):
    """Base State Stored by all agents"""

    # We use extra = forbid to disallow any extra fields, and validate assignment to revalidate updates to a Field for a model
    model_config = ConfigDict(
        extra="forbid",
        validate_assignment=True
    )

    request: str = Field(min_length=1)
    result: str | None


    