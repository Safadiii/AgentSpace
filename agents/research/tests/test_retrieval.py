from agents.research.state import PaperChunk
from agents.research.embedding import EmbeddingService, RetrievalService

# 1. Initialize services
embedding_service = EmbeddingService()
retrieval_service = RetrievalService(embedding_service)

# 2. Create sample chunks
texts = [
    "Transformer neural networks use self-attention mechanisms to understand relationships between words in a sequence.",
    "Climate change is causing global temperatures to rise due to increased greenhouse gas emissions.",
    "Cancer immunotherapy helps the immune system recognize and destroy cancer cells."
]

chunks = [
    PaperChunk(
        paper_id=1,
        chunk_index=i,
        content=text,
        page_start=i + 1,
        page_end=i + 1
    )
    for i, text in enumerate(texts)
]

# 3. Generate document embeddings
chunk_embeddings = embedding_service.embed_chunks(chunks)

# 4. Ask a question
question = "How do attention mechanisms help language models?"

# 5. Retrieve relevant chunks
results = retrieval_service.retrieve_chunks(
    question=question,
    chunks=chunks,
    chunk_embeddings=chunk_embeddings,
    top_k=3
)

# 6. Display results
for rank, (chunk, score) in enumerate(results, start=1):
    print(f"\nRank: {rank}")
    print(f"Similarity: {score:.4f}")
    print(f"Content: {chunk.content}")
    print(f"Page: {chunk.page_start}")