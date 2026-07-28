from unittest.mock import patch, MagicMock
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.llm.token_manager import TokenBudgetManager
from app.llm.service import LLMChatService

client = TestClient(app)

def test_token_budget_manager_estimation():
    text = "Hello world!"
    # 12 chars / 4 = 3 tokens
    assert TokenBudgetManager.estimate_tokens(text) == 3

def test_token_budget_manager_fit_to_budget():
    text = "This is a sentence. And another one here."
    # Budget of 4 tokens = 16 characters target.
    # Truncated text before 16 characters is "This is a sentence."
    res = TokenBudgetManager.compress_prompt_context(text, 5)
    assert "This is a sentence." in res

def test_rule_based_routing():
    service = LLMChatService()
    assert service.classify_query_rule_based("Can you summarize the video?") == "SUMMARY"
    assert service.classify_query_rule_based("Please explain how backpropagation works") == "EXPLANATION"
    assert service.classify_query_rule_based("Is there a practice test?") == "PRACTICE"
    assert service.classify_query_rule_based("Tell me a random fact about space") == "FACTUAL"

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
def test_learning_quiz_flashcards_interview_endpoints(mock_create, mock_transcript):
    mock_transcript.return_value = MOCK_TRANSCRIPT
    
    mock_response = MagicMock()
    mock_choice = MagicMock()
    mock_message = MagicMock()
    mock_message.content = "Mocked content output."
    mock_choice.message = mock_message
    mock_response.choices = [mock_choice]
    
    async def mock_coro(*args, **kwargs):
        return mock_response
    mock_create.side_effect = mock_coro

    # 1. Test Quiz
    response = client.post("/api/v1/learning/quiz", json={"video_id": "mock_vid_123"})
    assert response.status_code == 200
    assert response.json()["success"] is True
    assert response.json()["data"] == "Mocked content output."

    # 2. Test Flashcards
    response = client.post("/api/v1/learning/flashcards", json={"video_id": "mock_vid_123"})
    assert response.status_code == 200
    assert response.json()["success"] is True
    assert response.json()["data"] == "Mocked content output."

    # 3. Test Interview Questions
    response = client.post("/api/v1/learning/interview-questions", json={"video_id": "mock_vid_123"})
    assert response.status_code == 200
    assert response.json()["success"] is True
    assert response.json()["data"] == "Mocked content output."
