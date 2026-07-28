import hashlib
from typing import List, Dict, Any, Optional
from app.transcript.service import TranscriptService
from app.rag.chunker import chunk_transcript
from app.rag.embeddings import embedding_model, EmbeddingModel
from app.rag.vector_store import rag_vector_store, RAGVectorStore
from app.rag.retriever import RAGRetriever
from app.rag.models import RAGSearchResult, SemanticChunk


class RAGService:
    def __init__(
        self,
        transcript_service: TranscriptService = None,
        embedding: EmbeddingModel = embedding_model,
        vector_store: RAGVectorStore = rag_vector_store,
        retriever: RAGRetriever = None
    ):
        self.transcript_service = transcript_service or TranscriptService()
        self.embedding = embedding
        self.vector_store = vector_store
        self.retriever = retriever or RAGRetriever(embedding=embedding, vector_store=vector_store)

    def search_transcript(
        self, 
        video_id: str, 
        query: str, 
        top_k: int = 5,
        language: Optional[str] = "auto"
    ) -> List[RAGSearchResult]:
        """
        Executes semantic search against a video's transcript.
        Automatically chunks and indexes the transcript in FAISS if not cached/fingerprinted.
        """
        # Fetch transcript segments to compute fingerprint hash
        transcript_data = self.transcript_service.get_transcript(video_id, target_language=language)
        segments = transcript_data.get("segments", [])
        actual_lang = transcript_data.get("language", "en")
        
        if not segments:
            return []

        raw_text = " ".join([s["text"] for s in segments])
        current_hash = hashlib.sha256(raw_text.encode("utf-8")).hexdigest()

        # Check has_index with language keying
        if not self.vector_store.has_index(video_id, current_hash, language=actual_lang):
            self.index_video_with_data(video_id, current_hash, segments, language=actual_lang)

        # Retrieve results
        return self.retriever.retrieve(video_id, query, top_k=top_k, language=actual_lang)

    def index_video(self, video_id: str) -> None:
        """
        Retrieves the transcript, chunks it, embeds each chunk, and caches it in FAISS.
        Legacy method for backward compatibility.
        """
        transcript_data = self.transcript_service.get_transcript(video_id)
        segments = transcript_data.get("segments", [])
        if not segments:
            return
            
        raw_text = " ".join([s["text"] for s in segments])
        current_hash = hashlib.sha256(raw_text.encode("utf-8")).hexdigest()
        self.index_video_with_data(video_id, current_hash, segments, language=transcript_data.get("language", "en"))

    def index_video_with_data(
        self, 
        video_id: str, 
        current_hash: str, 
        segments: List[Dict[str, Any]],
        language: str = "en"
    ) -> None:
        """Indexes the video using loaded segments and attaches a transcript fingerprint hash."""
        # Chunk transcript segments
        chunks: List[SemanticChunk] = chunk_transcript(segments)
        if not chunks:
            return

        # Generate embeddings for all chunks
        chunk_texts = [c.text for c in chunks]
        embeddings = self.embedding.encode(chunk_texts)

        # Save to vector store FAISS index with hash fingerprint
        self.vector_store.create_index(video_id, chunks, embeddings, current_hash, language=language)
