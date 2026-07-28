from typing import Dict, Tuple, List, Any, Optional
import faiss
import numpy as np
from app.rag.models import SemanticChunk


class RAGVectorStore:
    def __init__(self):
        # Map (video_id, language) -> (faiss_index, list_of_semantic_chunks, embedding_vectors, hash_string)
        self.indices: Dict[Tuple[str, str], Tuple[faiss.IndexFlatIP, List[SemanticChunk], np.ndarray, str]] = {}

    def has_index(self, video_id: str, current_hash: Optional[str] = None, language: str = "en") -> bool:
        key = (video_id, language)
        if key not in self.indices:
            # Backward compatibility check for tests that only pass video_id
            for k in self.indices.keys():
                if k[0] == video_id:
                    if current_hash is None or self.indices[k][3] == current_hash:
                        return True
            return False
        if current_hash is None:
            return True
        _, _, _, stored_hash = self.indices[key]
        return stored_hash == current_hash

    def get_index(self, video_id: str, language: str = "en") -> Tuple[faiss.IndexFlatIP, List[SemanticChunk]]:
        key = (video_id, language)
        if key not in self.indices:
            # Fallback
            for k in self.indices.keys():
                if k[0] == video_id:
                    return self.indices[k][0], self.indices[k][1]
            raise KeyError(f"Index not found for video: {video_id}")
        entry = self.indices[key]
        return entry[0], entry[1]

    def get_embeddings(self, video_id: str, language: str = "en") -> Optional[np.ndarray]:
        key = (video_id, language)
        if key not in self.indices:
            for k in self.indices.keys():
                if k[0] == video_id:
                    return self.indices[k][2]
            return None
        return self.indices[key][2]

    def create_index(
        self, 
        video_id: str, 
        chunks: List[SemanticChunk], 
        embeddings: np.ndarray,
        transcript_hash: str = "",
        language: str = "en"
    ) -> None:
        """
        Creates a FAISS in-memory IndexFlatIP (Inner Product) index.
        Normalizes embeddings to perform exact Cosine Similarity matches.
        """
        if not chunks or len(chunks) == 0:
            return

        dimension = embeddings.shape[1]
        
        # Clone array and normalize for Cosine Similarity
        norm_embeddings = embeddings.copy()
        faiss.normalize_L2(norm_embeddings)
        
        index = faiss.IndexFlatIP(dimension)
        index.add(norm_embeddings)
        
        key = (video_id, language)
        self.indices[key] = (index, chunks, embeddings, transcript_hash)

    def search(
        self, 
        video_id: str, 
        query_embedding: np.ndarray, 
        top_k: int = 5,
        language: str = "en"
    ) -> List[Tuple[float, SemanticChunk]]:
        """
        Searches the FAISS index of a specific video ID and language.
        Returns a list of (score, SemanticChunk) tuples sorted in descending order of similarity.
        """
        key = (video_id, language)
        if key not in self.indices:
            # Fallback
            found_key = None
            for k in self.indices.keys():
                if k[0] == video_id:
                    found_key = k
                    break
            if not found_key:
                return []
            key = found_key

        index, chunks, _, _ = self.indices[key]
        
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
            clipped_score = max(0.0, float(score))
            results.append((clipped_score, chunks[idx]))
            
        return results

    def clear(self) -> None:
        self.indices.clear()


# Global vector store instance
rag_vector_store = RAGVectorStore()
