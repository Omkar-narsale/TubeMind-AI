import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from app.main import app
from app.transcript.service import TranscriptService
from app.learning.service import LearningService
from app.llm.cache import LLMCache

client = TestClient(app)

# Helper mock structures for tests
class MockSegment:
    def __init__(self, text, start, duration):
        self.text = text
        self.start = start
        self.duration = duration

class MockTranscript:
    def __init__(self, language_code="en", generated=False):
        self.language_code = language_code
        self.generated = generated

    def fetch(self):
        return [
            MockSegment("Hello world this is a test.", 0.0, 2.0),
            MockSegment("This transcript covers artificial intelligence concepts.", 2.0, 3.0),
        ]

    def translate(self, target_lang):
        # Return a translated mock transcript
        translated = MockTranscript(language_code=target_lang, generated=self.generated)
        # Mock translated text
        def custom_fetch():
            if target_lang == "hi":
                return [
                    MockSegment("नमस्ते दुनिया यह एक परीक्षण है।", 0.0, 2.0),
                    MockSegment("यह ट्रांसक्रिप्ट कृत्रिम बुद्धिमत्ता अवधारणाओं को शामिल करता है।", 2.0, 3.0),
                ]
            elif target_lang == "mr":
                return [
                    MockSegment("नमस्कार जग हे एक चाचणी आहे.", 0.0, 2.0),
                    MockSegment("या ट्रान्सक्रिप्टमध्ये कृत्रिम बुद्धिमत्ता संकल्पना समाविष्ट आहेत.", 2.0, 3.0),
                ]
            return [
                MockSegment(f"Translated to {target_lang}: Hello world", 0.0, 2.0),
            ]
        translated.fetch = custom_fetch
        return translated

class MockTranscriptList:
    def __init__(self, available_langs=None):
        self.available_langs = available_langs or ["en"]

    def __iter__(self):
        for lang in self.available_langs:
            yield MockTranscript(language_code=lang, generated=False)

    def find_manually_created_transcript(self, languages):
        for lang in languages:
            if lang in self.available_langs:
                return MockTranscript(language_code=lang, generated=False)
        raise Exception("No manual transcript found")

    def find_generated_transcript(self, languages):
        for lang in languages:
            if lang in self.available_langs:
                return MockTranscript(language_code=lang, generated=True)
        raise Exception("No generated transcript found")


@pytest.fixture(autouse=True)
def clean_cache():
    LLMCache.clear()
    from app.transcript.cache import transcript_cache
    transcript_cache.clear()


@patch("app.transcript.service.YouTubeTranscriptApi.list")
@patch("groq.resources.chat.completions.AsyncCompletions.create")
def test_english_transcript_to_english_summary(mock_create, mock_list):
    mock_list.return_value = MockTranscriptList(["en"])
    
    mock_response = MagicMock()
    mock_choice = MagicMock()
    mock_message = MagicMock()
    mock_message.content = "This is a mock English summary."
    mock_choice.message = mock_message
    mock_response.choices = [mock_choice]
    
    async def mock_coro(*args, **kwargs):
        return mock_response
    mock_create.side_effect = mock_coro

    payload = {
        "video_id": "engvid12345",
        "summary_type": "short",
        "language": "en"
    }
    
    response = client.post("/api/v1/learning/summary", json=payload)
    assert response.status_code == 200
    json_data = response.json()
    assert json_data["success"] is True
    assert json_data["data"] == "This is a mock English summary."
    
    # Check system prompt includes instruction to respond in English
    args, kwargs = mock_create.call_args
    messages = kwargs["messages"]
    system_msg = messages[0]["content"]
    assert "English" in system_msg


@patch("app.transcript.service.YouTubeTranscriptApi.list")
@patch("groq.resources.chat.completions.AsyncCompletions.create")
def test_hindi_transcript_to_hindi_summary(mock_create, mock_list):
    mock_list.return_value = MockTranscriptList(["hi"])
    
    mock_response = MagicMock()
    mock_choice = MagicMock()
    mock_message = MagicMock()
    mock_message.content = "यह एक हिंदी सारांश है।"
    mock_choice.message = mock_message
    mock_response.choices = [mock_choice]
    
    async def mock_coro(*args, **kwargs):
        return mock_response
    mock_create.side_effect = mock_coro

    payload = {
        "video_id": "hinvid12345",
        "summary_type": "short",
        "language": "hi"
    }
    
    response = client.post("/api/v1/learning/summary", json=payload)
    assert response.status_code == 200
    json_data = response.json()
    assert json_data["success"] is True
    assert json_data["data"] == "यह एक हिंदी सारांश है।"
    
    args, kwargs = mock_create.call_args
    messages = kwargs["messages"]
    system_msg = messages[0]["content"]
    assert "Hindi" in system_msg


@patch("app.transcript.service.YouTubeTranscriptApi.list")
@patch("groq.resources.chat.completions.AsyncCompletions.create")
def test_english_transcript_to_marathi_notes(mock_create, mock_list):
    mock_list.return_value = MockTranscriptList(["en"])
    
    mock_response = MagicMock()
    mock_choice = MagicMock()
    mock_message = MagicMock()
    mock_message.content = "या मराठी नोट्स आहेत."
    mock_choice.message = mock_message
    mock_response.choices = [mock_choice]
    
    async def mock_coro(*args, **kwargs):
        return mock_response
    mock_create.side_effect = mock_coro

    payload = {
        "video_id": "marvid12345",
        "language": "mr"
    }
    
    # Study notes generation
    response = client.post("/api/v1/learning/study-notes", json=payload)
    assert response.status_code == 200
    json_data = response.json()
    assert json_data["success"] is True
    assert json_data["data"] == "या मराठी नोट्स आहेत."
    
    args, kwargs = mock_create.call_args
    messages = kwargs["messages"]
    system_msg = messages[0]["content"]
    assert "Marathi" in system_msg


@patch("app.transcript.service.YouTubeTranscriptApi.list")
@patch("groq.resources.chat.completions.AsyncCompletions.create")
def test_caching_separated_by_language(mock_create, mock_list):
    mock_list.return_value = MockTranscriptList(["en", "hi"])
    
    # 1. Summary in English
    mock_response_en = MagicMock()
    mock_choice_en = MagicMock()
    mock_message_en = MagicMock()
    mock_message_en.content = "English summary content."
    mock_choice_en.message = mock_message_en
    mock_response_en.choices = [mock_choice_en]
    
    # 2. Summary in Hindi
    mock_response_hi = MagicMock()
    mock_choice_hi = MagicMock()
    mock_message_hi = MagicMock()
    mock_message_hi.content = "हिंदी सारांश।"
    mock_choice_hi.message = mock_message_hi
    mock_response_hi.choices = [mock_choice_hi]
    
    call_count = 0
    async def mock_coro(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return mock_response_en
        return mock_response_hi
        
    mock_create.side_effect = mock_coro

    payload_en = {
        "video_id": "samevid1234",
        "summary_type": "short",
        "language": "en"
    }
    response_en = client.post("/api/v1/learning/summary", json=payload_en)
    assert response_en.json()["data"] == "English summary content."

    payload_hi = {
        "video_id": "samevid1234",
        "summary_type": "short",
        "language": "hi"
    }
    response_hi = client.post("/api/v1/learning/summary", json=payload_hi)
    assert response_hi.json()["data"] == "हिंदी सारांश।"
    
    # Ensure they are distinct in cache (both were executed, no English cache hit for Hindi request)
    assert call_count == 2
