from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient
import numpy as np

from app.main import app
from app.rag.chunker import chunk_transcript
from app.rag.embeddings import EmbeddingModel
from app.rag.vector_store import RAGVectorStore
from app.rag.retriever import RAGRetriever
from app.rag.service import RAGService
from app.rag.models import SemanticChunk

client = TestClient(app)


# --- Helper Mocks ---
class MockSegment:
    def __init__(self, text, start, duration):
        self.text = text
        self.start = start
        self.duration = duration


# Mock Transcript Response
MOCK_TRANSCRIPT = {
    "success": True,
    "video_id": "mockvideo11",
    "language": "en",
    "generated": False,
    "segments": [
        {"text": "Artificial Intelligence is fascinating. " * 15, "start": 0.0, "duration": 5.0},
        {"text": "Attention mechanisms revolutionized deep learning. " * 15, "start": 5.0, "duration": 6.0},
        {"text": "Self-attention layers process sequences in parallel. " * 15, "start": 11.0, "duration": 5.5},
        {"text": "This is a completely unrelated segment about standard programming. " * 15, "start": 16.5, "duration": 4.0},
    ]
}


@pytest.fixture(autouse=True)
def clear_vector_store():
    from app.rag.vector_store import rag_vector_store
    rag_vector_store.clear()


# --- Unit Tests ---

def test_chunking_strategy():
    # Setup short segments to trigger chunking limits
    segments = [
        {"text": "Hello world.", "start": 0.0, "duration": 2.0},
        {"text": "This is segment two.", "start": 2.0, "duration": 3.0},
        {"text": "Third short phrase.", "start": 5.0, "duration": 1.0},
    ]
    
    # 35 chars total; chunk size = 20, overlap = 5
    chunks = chunk_transcript(segments, chunk_size=20, overlap=5)
    
    assert len(chunks) > 0
    # verify schema attributes
    assert isinstance(chunks[0], SemanticChunk)
    assert chunks[0].chunk_index == 0
    assert chunks[0].start_time == 0.0
    assert chunks[0].end_time > 0.0
    # Check text concatenation
    assert "Hello world." in chunks[0].text


def test_embeddings_generation():
    model = EmbeddingModel()
    texts = ["Testing embeddings generator.", "Another mock segment."]
    embeddings = model.encode(texts)
    
    assert isinstance(embeddings, np.ndarray)
    assert len(embeddings) == 2
    assert embeddings.shape[1] == 384 # MiniLM dimensions
    assert embeddings.dtype == np.float32


def test_faiss_vector_store():
    store = RAGVectorStore()
    chunks = [
        SemanticChunk(text="Chunk one", start_time=0.0, end_time=2.0, chunk_index=0),
        SemanticChunk(text="Chunk two", start_time=2.0, end_time=4.0, chunk_index=1),
    ]
    # mock dimensions 384
    mock_embeddings = np.random.rand(2, 384).astype(np.float32)
    
    # Add index
    store.create_index("vid12345678", chunks, mock_embeddings)
    assert store.has_index("vid12345678") is True
    
    # Search mock vector
    query_vector = np.random.rand(1, 384).astype(np.float32)
    results = store.search("vid12345678", query_vector[0], top_k=1)
    
    assert len(results) == 1
    assert isinstance(results[0][1], SemanticChunk)
    assert results[0][0] >= 0.0


# --- Integration & Route Tests ---

@patch("app.rag.service.TranscriptService.get_transcript")
def test_rag_service_orchestration_and_search(mock_get_transcript):
    mock_get_transcript.return_value = MOCK_TRANSCRIPT
    
    service = RAGService()
    results = service.search_transcript("mockvideo11", query="attention mechanisms", top_k=2)
    
    # Top matching chunk should be about attention mechanisms
    assert len(results) == 2
    assert "Attention" in results[0].text
    # Verify score presence
    assert results[0].score > 0.0
    # Verify timestamp preservation
    assert results[0].start == 5.0
    assert results[0].end == 11.0


@patch("app.rag.service.TranscriptService.get_transcript")
def test_rag_api_endpoint(mock_get_transcript):
    mock_get_transcript.return_value = MOCK_TRANSCRIPT
    
    payload = {
        "video_id": "mockvideo11",
        "query": "artificial intelligence"
    }
    
    response = client.post("/api/v1/rag/search", json=payload)
    
    assert response.status_code == 200
    json_data = response.json()
    assert json_data["success"] is True
    assert len(json_data["results"]) > 0
    assert "Artificial" in json_data["results"][0]["text"]
    assert json_data["results"][0]["score"] > 0.0
