import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient

from app.main import app
from app.playlist.extractor import extract_playlist_id
from app.playlist.models import (
    PlaylistVideoItem,
    PlaylistChunk,
    PlaylistIndexStatus,
)
from app.playlist.vector_store import PlaylistVectorStore
from app.playlist.service import PlaylistRAGService
from app.playlist.chat_service import PlaylistChatService

client = TestClient(app)


def test_extract_playlist_id():
    assert extract_playlist_id("PL1234567890abcdef") == "PL1234567890abcdef"
    assert extract_playlist_id("https://www.youtube.com/playlist?list=PLrAXtmErZgOdP_8GzKtO4Gdi74t928iNq") == "PLrAXtmErZgOdP_8GzKtO4Gdi74t928iNq"
    assert extract_playlist_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLrAXtmErZgOdP_8GzKtO4Gdi74t928iNq&index=1") == "PLrAXtmErZgOdP_8GzKtO4Gdi74t928iNq"
    assert extract_playlist_id("") is None


def test_playlist_vector_store():
    store = PlaylistVectorStore()
    pid = "PL_test_course"

    chunks = [
        PlaylistChunk(
            video_id="vid_1",
            video_title="Lecture 1: Intro to Python",
            text="Python is a dynamic programming language.",
            start_time=10.0,
            end_time=40.0,
            chunk_index=0,
        ),
        PlaylistChunk(
            video_id="vid_2",
            video_title="Lecture 2: Neural Networks",
            text="Neural networks use backpropagation to update weights.",
            start_time=120.0,
            end_time=180.0,
            chunk_index=0,
        ),
    ]

    import numpy as np
    # Mock 4-dimensional embeddings for 2 chunks
    embeddings = np.array([
        [1.0, 0.0, 0.0, 0.0],
        [0.0, 1.0, 0.0, 0.0],
    ], dtype=np.float32)

    status = PlaylistIndexStatus(
        playlist_id=pid,
        title="Complete AI Course",
        total_videos=2,
        indexed_videos=2,
        failed_videos=0,
        total_chunks=2,
        is_ready=True,
    )

    store.create_index(pid, chunks, embeddings, status)
    assert store.has_index(pid) is True
    assert store.get_status(pid).indexed_videos == 2

    # Query matching 2nd chunk
    query_emb = np.array([[0.0, 0.9, 0.0, 0.0]], dtype=np.float32)
    results = store.search(pid, query_emb, top_k=1)

    assert len(results) == 1
    assert results[0].video_id == "vid_2"
    assert "Neural Networks" in results[0].video_title
    assert results[0].score > 0.8
    assert "@ 2:00" in results[0].formatted_citation


@pytest.mark.asyncio
async def test_playlist_rag_service_indexing_and_search():
    mock_transcript_service = MagicMock()
    # Return different transcripts for vid_1 and vid_2
    def mock_get_transcript(vid, target_language="en"):
        if vid == "vid_1":
            return {
                "segments": [
                    {"text": "Welcome to Python basics. Variables and loops.", "start": 0.0, "duration": 30.0}
                ],
                "language": "en"
            }
        else:
            return {
                "segments": [
                    {"text": "Advanced backpropagation in deep neural networks.", "start": 60.0, "duration": 40.0}
                ],
                "language": "en"
            }

    mock_transcript_service.get_transcript.side_effect = mock_get_transcript

    service = PlaylistRAGService(
        transcript_service=mock_transcript_service,
        vector_store=PlaylistVectorStore(),
    )

    videos = [
        PlaylistVideoItem(video_id="vid_1", title="L1: Python"),
        PlaylistVideoItem(video_id="vid_2", title="L2: Deep Learning"),
    ]

    status = await service.index_playlist(
        playlist_id="PL_mock_ai",
        playlist_title="AI Masters",
        videos=videos,
        max_videos=2,
    )

    assert status.is_ready is True
    assert status.indexed_videos == 2
    assert status.total_chunks == 2

    # Cross-video search
    results = service.search_playlist("PL_mock_ai", "neural networks backpropagation", top_k=2)
    assert len(results) > 0
    # Top result should be Deep Learning lecture
    assert results[0].video_id == "vid_2"
    assert "Deep Learning" in results[0].video_title


@pytest.mark.asyncio
async def test_playlist_chat_service():
    mock_rag_service = MagicMock()
    from app.playlist.models import PlaylistSearchResult
    mock_rag_service.search_playlist.return_value = [
        PlaylistSearchResult(
            video_id="vid_2",
            video_title="Lecture 2: Neural Networks",
            score=0.92,
            text="Backpropagation calculates gradients of the loss function.",
            start=60.0,
            end=120.0,
            chunk_index=1,
            formatted_citation="[Lecture 2 @ 1:00]",
        )
    ]

    mock_groq = MagicMock()
    async def mock_generate(*args, **kwargs):
        return "In Lecture 2 (at 01:00), the instructor discusses backpropagation."
    mock_groq.generate.side_effect = mock_generate

    chat_service = PlaylistChatService(
        rag_service=mock_rag_service,
        groq_client=mock_groq,
    )

    resp = await chat_service.chat(
        playlist_id="PL_course",
        query="Explain backpropagation",
    )

    assert resp.success is True
    assert "Lecture 2" in resp.answer
    assert resp.total_sources == 1


def test_playlist_status_endpoint_not_found():
    response = client.get("/api/v1/playlist/status/PL_non_existent")
    assert response.status_code == 404
