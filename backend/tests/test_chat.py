from unittest.mock import patch, MagicMock
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.llm.prompt_builder import PromptBuilder
from app.llm.models import ChatMessage, ChatRole
from app.rag.models import RAGSearchResult

client = TestClient(app)

MOCK_CHUNKS = [
    RAGSearchResult(score=0.9, text="Neural networks process data.", start=10.0, end=15.0, chunk_index=0),
    RAGSearchResult(score=0.8, text="Deep learning contains hidden layers.", start=20.0, end=30.0, chunk_index=1),
]

def test_prompt_builder():
    builder = PromptBuilder()
    query = "Explain neural networks."
    history = [
        ChatMessage(role=ChatRole.USER, content="Hello"),
        ChatMessage(role=ChatRole.ASSISTANT, content="Hi! How can I help you?"),
    ]
    messages = builder.build_prompt_messages(query, MOCK_CHUNKS, history)
    
    assert len(messages) == 5
    assert messages[0]["role"] == "system"
    assert "TubeMind AI" in messages[0]["content"]
    assert messages[1]["role"] == "system"
    assert "[Index: 0] [00:10] Neural networks process data." in messages[1]["content"]
    assert messages[2]["role"] == "user"
    assert messages[2]["content"] == "Hello"
    assert messages[3]["role"] == "assistant"
    assert messages[3]["content"] == "Hi! How can I help you?"
    assert messages[4]["role"] == "user"
    assert messages[4]["content"] == query

@patch("app.core.config.settings.GROQ_API_KEY", "mock_key")
@patch("app.llm.service.LLMChatService.validate_groundedness")
@patch("app.llm.service.RAGService.search_transcript")
@patch("groq.resources.chat.completions.AsyncCompletions.create")
def test_chat_endpoint_non_streaming(mock_create, mock_search, mock_val):
    mock_search.return_value = MOCK_CHUNKS
    
    async def mock_val_coro(*args, **kwargs):
        return True
    mock_val.side_effect = mock_val_coro
    
    mock_response = MagicMock()
    mock_choice = MagicMock()
    mock_message = MagicMock()
    mock_message.content = "Neural networks process data as described at [00:10]."
    mock_choice.message = mock_message
    mock_response.choices = [mock_choice]
    
    # We mock it as an async function return
    async def mock_coro(*args, **kwargs):
        return mock_response
    mock_create.side_effect = mock_coro
    
    payload = {
        "video_id": "mock_vid_123",
        "query": "Explain neural networks",
        "history": [],
        "stream": False
    }
    
    response = client.post("/api/v1/chat", json=payload)
    assert response.status_code == 200
    
    json_data = response.json()
    assert json_data["success"] is True
    assert json_data["data"]["answer"] == "Neural networks process data as described at [00:10]."
    assert len(json_data["data"]["context"]) == 2
