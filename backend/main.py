from fastapi import FastAPI
from backend.init import init_db
from contextlib import asynccontextmanager

from backend.research.paper.routes import paper_router
from backend.research.api.search import search_router
import os 

from dotenv import load_dotenv

load_dotenv()

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI()

app.include_router(paper_router)
app.include_router(search_router)

@app.get("/")
def root():
    return {"message": "Root"}

@app.get("/health")
def health_check():
    return {"message": "Healthy"}