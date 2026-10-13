from langgraph.graph import MessagesState, StateGraph, START, END
import os
from dotenv import load_dotenv

from langchain_nvidia_ai_endpoints import ChatNVIDIA

load_dotenv()

model = ChatNVIDIA (
    model="nvidia/nemotron-3-super-120b-a12b",
    api_key=os.environ["NVIDIA_API_KEY"],
)

response = model.invoke("Explain what an AI AGENT IS")
print(response.content)

