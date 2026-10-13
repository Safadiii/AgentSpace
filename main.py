from langgraph.graph import MessagesState, StateGraph, START, END
import os
from dotenv import load_dotenv

from langchain_nvidia_ai_endpoints import ChatNVIDIA

import asyncio

from agents.research.agent import ResearchAgent
from agents.research.state import ResearchState

# load_dotenv()

# model = ChatNVIDIA (
#     model="nvidia/nemotron-3-super-120b-a12b",
#     api_key=os.environ["NVIDIA_API_KEY"],
# )

# response = model.invoke("Explain what an AI AGENT IS")
# print(response.content)

async def main():
    agent = ResearchAgent()

    result = await agent.run(
        ResearchState(
            request="Artificial Intelligence",
            from_year=2022,
            limit=5,
        )
    )

    print(result.result)

    for paper in result.papers:
        print(f"\nTitle: {paper.title}")
        print(f"Authors: {', '.join(paper.authors)}")
        print(f"Year: {paper.year}")
        print(f"URL: {paper.url}")
        print(f"Abstract: {paper.abstract}")


if __name__ == "__main__":
    asyncio.run(main())

