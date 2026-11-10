# Using the BAAI/bge-small-en-v1.5 embeddings from huggingFace

from langchain_huggingface import HuggingFaceEmbeddings

from agents.research.state import PaperChunk
import numpy as np


def cosine_similarity(vec_a: list[float], vec_b: list[float]) -> float:
    ''' finding the cos similarity of two vectors '''
    return float(np.dot(vec_a, vec_b))


class EmbeddingService:
    def __init__(self):
        self.model = HuggingFaceEmbeddings(
            model_name = "BAAI/bge-small-en-v1.5",
            encode_kwargs = {"normalize_embeddings": True}
        )

    def embed_chunks(self, chunks: list[PaperChunk]) -> list[list[float]]:
        ''' Takes a paper chunks and turns into embeddings which are of the form [ [1.0, 0.3, 0.6, etc...]]'''

        if not chunks:
            return []

        texts = [chunk.content for chunk in chunks]

        final_embeddings = self.model.embed_documents(texts)

        return final_embeddings

    def embed_question(self, question: str) -> list[float]:
        ''' Takes the users question and turns it into an embedding '''
        if not question.strip():
            raise ValueError("A question can't be empty")
        return self.model.embed_query(question)


class RetrievalService:
    def __init__(self, embedding_service: EmbeddingService):
        self.embedding_service = embedding_service

    def retrieve_chunks(self, question: str, chunks: list[PaperChunk], chunk_embeddings: list[list[float]], top_k: int = 5) -> list[tuple[PaperChunk, float]]:
        if top_k <= 0:
            raise ValueError("Top_K must be greater than 0")

        if len(chunks) != len(chunk_embeddings):
            raise ValueError("Chunks and embeddings must have matching lengths")

        if not chunks:
            return []
        
        query_vector = self.embedding_service.embed_question(question)

        query_mtx = np.asarray(query_vector, dtype=np.float32)
        chunk_mtx = np.asarray(chunk_embeddings, dtype=np.float32)

        scores = chunk_mtx @ query_mtx


        top_indices = np.argsort(scores)[::-1][:top_k]

        return [(chunks[index], float(scores[index])) for index in top_indices]

