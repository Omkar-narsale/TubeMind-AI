from typing import List
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

    def search_transcript(self, video_id: str, query: str, top_k: int = 5) -> List[RAGSearchResult]:
        """
        Executes semantic search against a video's transcript.
        Automatically chunks and indexes the transcript in FAISS if not cached.
        """
        # If the video has not been indexed, index it first
        if not self.vector_store.has_index(video_id):
            self.index_video(video_id)

        # Retrieve results
        return self.retriever.retrieve(video_id, query, top_k=top_k)

    def index_video(self, video_id: str) -> None:
        """
        Retrieves the transcript, chunks it, embeds each chunk, and caches it in FAISS.
        """
        # 1. Fetch transcript segments
        transcript_data = self.transcript_service.get_transcript(video_id)
        segments = transcript_data.get("segments", [])

        if not segments:
            return

        # 2. Chunk transcript segments
        chunks: List[SemanticChunk] = chunk_transcript(segments)
        if not chunks:
            return

        # 3. Generate embeddings for all chunks
        chunk_texts = [c.text for c in chunks]
        embeddings = self.embedding.encode(chunk_texts)

        # 4. Save to vector store FAISS index
        self.vector_store.create_index(video_id, chunks, embeddings)
