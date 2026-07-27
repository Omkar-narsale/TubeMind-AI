from typing import List
import numpy as np
from sentence_transformers import SentenceTransformer


class EmbeddingModel:
    def __init__(self, model_name: str = "sentence-transformers/all-MiniLM-L6-v2"):
        self.model_name = model_name
        self._model = None

    @property
    def model(self) -> SentenceTransformer:
        """Lazy load the sentence-transformer model on CPU."""
        if self._model is None:
            # Explicitly force CPU to conserve memory and maintain consistency
            self._model = SentenceTransformer(self.model_name, device="cpu")
        return self._model

    def encode(self, texts: List[str]) -> np.ndarray:
        """Generates embeddings for a list of strings."""
        embeddings = self.model.encode(texts, convert_to_numpy=True)
        # Ensure outputs are float32 for FAISS index alignment
        return np.array(embeddings, dtype=np.float32)


# Global singleton instance for injection
embedding_model = EmbeddingModel()
