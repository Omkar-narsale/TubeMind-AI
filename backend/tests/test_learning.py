from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

MOCK_TRANSCRIPT = {
    "success": True,
    "video_id": "mock_vid_123",
    "language": "en",
    "generated": False,
    "segments": [
        {"text": "Hello world", "start": 0.0, "duration": 2.0},
        {"text": "This is a neural network", "start": 2.0, "duration": 2.0}
    ]
}


@patch("app.learning.service.TranscriptService.get_transcript")
@patch("groq.resources.chat.completions.AsyncCompletions.create")
def test_generate_summary(mock_create, mock_transcript):
    mock_transcript.return_value = MOCK_TRANSCRIPT
    
    mock_response = MagicMock()
    mock_choice = MagicMock()
    mock_message = MagicMock()
    mock_message.content = "This is a mock summary content."
    mock_choice.message = mock_message
    mock_response.choices = [mock_choice]
    
    async def mock_coro(*args, **kwargs):
        return mock_response
    mock_create.side_effect = mock_coro

    payload = {
        "video_id": "mock_vid_123",
        "summary_type": "short"
    }
    
    response = client.post("/api/v1/learning/summary", json=payload)
    assert response.status_code == 200
    json_data = response.json()
    assert json_data["success"] is True
    assert json_data["data"] == "This is a mock summary content."


@patch("app.learning.service.TranscriptService.get_transcript")
@patch("groq.resources.chat.completions.AsyncCompletions.create")
def test_generate_notes(mock_create, mock_transcript):
    mock_transcript.return_value = MOCK_TRANSCRIPT
    
    mock_response = MagicMock()
    mock_choice = MagicMock()
    mock_message = MagicMock()
    mock_message.content = "This is a mock notes content."
    mock_choice.message = mock_message
    mock_response.choices = [mock_choice]
    
    async def mock_coro(*args, **kwargs):
        return mock_response
    mock_create.side_effect = mock_coro

    payload = {
        "video_id": "mock_vid_123"
    }
    
    response = client.post("/api/v1/learning/study-notes", json=payload)
    assert response.status_code == 200
    json_data = response.json()
    assert json_data["success"] is True
    assert json_data["data"] == "This is a mock notes content."


@patch("app.learning.service.TranscriptService.get_transcript")
@patch("groq.resources.chat.completions.AsyncCompletions.create")
def test_generate_takeaways(mock_create, mock_transcript):
    mock_transcript.return_value = MOCK_TRANSCRIPT
    
    mock_response = MagicMock()
    mock_choice = MagicMock()
    mock_message = MagicMock()
    mock_message.content = "✓ Neural networks learn weights."
    mock_choice.message = mock_message
    mock_response.choices = [mock_choice]
    
    async def mock_coro(*args, **kwargs):
        return mock_response
    mock_create.side_effect = mock_coro

    payload = {
        "video_id": "mock_vid_123"
    }
    
    response = client.post("/api/v1/learning/key-takeaways", json=payload)
    assert response.status_code == 200
    json_data = response.json()
    assert json_data["success"] is True
    assert json_data["data"] == "✓ Neural networks learn weights."


@patch("app.learning.service.TranscriptService.get_transcript")
@patch("groq.resources.chat.completions.AsyncCompletions.create")
def test_generate_flashcards(mock_create, mock_transcript):
    mock_transcript.return_value = MOCK_TRANSCRIPT

    mock_response = MagicMock()
    mock_choice = MagicMock()
    mock_message = MagicMock()
    mock_message.content = '[{"front": "What is FAISS?", "back": "A vector search library.", "category": "AI", "timestamp": "01:20"}]'
    mock_choice.message = mock_message
    mock_response.choices = [mock_choice]

    async def mock_coro(*args, **kwargs):
        return mock_response
    mock_create.side_effect = mock_coro

    payload = {"video_id": "mock_vid_123"}
    response = client.post("/api/v1/learning/flashcards", json=payload)
    assert response.status_code == 200
    json_data = response.json()
    assert json_data["success"] is True
    assert "What is FAISS?" in json_data["data"]


@patch("app.learning.service.TranscriptService.get_transcript")
@patch("groq.resources.chat.completions.AsyncCompletions.create")
def test_generate_quiz(mock_create, mock_transcript):
    mock_transcript.return_value = MOCK_TRANSCRIPT

    mock_response = MagicMock()
    mock_choice = MagicMock()
    mock_message = MagicMock()
    mock_message.content = '[{"question": "What is a neuron?", "options": ["Cell", "Variable", "Loop", "Function"], "correct_index": 0, "explanation": "Basic unit", "timestamp": "02:00"}]'
    mock_choice.message = mock_message
    mock_response.choices = [mock_choice]

    async def mock_coro(*args, **kwargs):
        return mock_response
    mock_create.side_effect = mock_coro

    payload = {"video_id": "mock_vid_123"}
    response = client.post("/api/v1/learning/quiz", json=payload)
    assert response.status_code == 200
    json_data = response.json()
    assert json_data["success"] is True
    assert "What is a neuron?" in json_data["data"]
