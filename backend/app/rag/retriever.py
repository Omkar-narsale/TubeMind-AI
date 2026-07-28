from typing import List, Optional
from app.rag.embeddings import embedding_model, EmbeddingModel
from app.rag.vector_store import rag_vector_store, RAGVectorStore
from app.rag.models import RAGSearchResult


class RAGRetriever:
    def __init__(self, embedding: EmbeddingModel = embedding_model, vector_store: RAGVectorStore = rag_vector_store):
        self.embedding = embedding
        self.vector_store = vector_store

    def retrieve(self, video_id: str, query: str, top_k: int = 5, language: str = "en") -> List[RAGSearchResult]:
        """
        Embeds the search query and retrieves the top_k matching chunks
        from the cached FAISS index of the specified video.
        """
        if not self.vector_store.has_index(video_id, language=language):
            return []

        # Encode query string into an embedding vector
        query_vector = self.embedding.encode([query])
        
        # Query FAISS
        matches = self.vector_store.search(video_id, query_vector[0], top_k=top_k, language=language)
        
        # Format results
        results: List[RAGSearchResult] = []
        for score, chunk in matches:
            results.append(RAGSearchResult(
                score=round(score, 4),
                text=chunk.text,
                start=chunk.start_time,
                end=chunk.end_time,
                chunk_index=chunk.chunk_index
            ))
            
        return results
