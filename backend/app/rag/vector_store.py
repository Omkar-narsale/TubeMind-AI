from typing import Dict, Tuple, List, Any
import faiss
import numpy as np
from app.rag.models import SemanticChunk


class RAGVectorStore:
    def __init__(self):
        # Map video_id -> (faiss_index, list_of_semantic_chunks)
        self.indices: Dict[str, Tuple[faiss.IndexFlatIP, List[SemanticChunk]]] = {}

    def has_index(self, video_id: str) -> bool:
        return video_id in self.indices

    def get_index(self, video_id: str) -> Tuple[faiss.IndexFlatIP, List[SemanticChunk]]:
        return self.indices[video_id]

    def create_index(self, video_id: str, chunks: List[SemanticChunk], embeddings: np.ndarray) -> None:
        """
        Creates a FAISS in-memory IndexFlatIP (Inner Product) index.
        Normalizes embeddings to perform exact Cosine Similarity matches.
        """
        if not chunks or len(chunks) == 0:
            return

        dimension = embeddings.shape[1]
        
        # Clone array and normalize for Cosine Similarity (IP search on normalized vectors)
        norm_embeddings = embeddings.copy()
        faiss.normalize_L2(norm_embeddings)
        
        index = faiss.IndexFlatIP(dimension)
        index.add(norm_embeddings)
        
        self.indices[video_id] = (index, chunks)

    def search(self, video_id: str, query_embedding: np.ndarray, top_k: int = 5) -> List[Tuple[float, SemanticChunk]]:
        """
        Searches the FAISS index of a specific video ID.
        Returns a list of (score, SemanticChunk) tuples sorted in descending order of similarity.
        """
        if not self.has_index(video_id):
            return []

        index, chunks = self.get_index(video_id)
        
        # FAISS search expects a 2D array (batch_size, dimensions)
        query_norm = query_embedding.copy()
        if len(query_norm.shape) == 1:
            query_norm = np.expand_dims(query_norm, axis=0)
            
        faiss.normalize_L2(query_norm)

        # Run query
        scores, indices = index.search(query_norm, min(top_k, len(chunks)))
        
        results = []
        for score, idx in zip(scores[0], indices[0]):
            if idx == -1:
                continue
            # Clip negative similarities to 0.0 for clean visual score representation
            clipped_score = max(0.0, float(score))
            results.append((clipped_score, chunks[idx]))
            
        return results

    def clear(self) -> None:
        self.indices.clear()


# Global vector store instance
rag_vector_store = RAGVectorStore()
