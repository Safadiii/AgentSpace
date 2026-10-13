from abc import ABC, abstractmethod
from typing import Any, Generic, TypeVar
from core.models import AgentState, AgentDefinition
from langgraph.graph import StateGraph
from langgraph.graph.state import CompiledStateGraph

StateT = TypeVar("StateT", bound=AgentState)

class BaseAgent(ABC, Generic[StateT]):
    """ Base Class for all agents later to be created """

    definition: AgentDefinition
    state_schema: type[StateT]
    #context schema

    def __init__(self):
        graph = StateGraph(self.state_schema)

        self.define_graph(graph)

        self.graph: CompiledStateGraph = graph.compile(
            name=self.definition.id
        )

    @abstractmethod
    def define_graph(self, graph: StateGraph) -> None:
        """Define the agents nodes and edges
            ** Per Agent Graph
        """
        pass

    async def run(self, state:StateT) -> StateT:
        """Execute agent and return a validated state"""

        output = await self.graph.ainvoke(
            state.model_dump(exclude_unset=True)
        )

        return self.state_schema.model_validate(output)