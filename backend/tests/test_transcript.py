import time
from unittest.mock import MagicMock, patch
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.transcript.service import TranscriptService
from app.transcript.exceptions import (
    VideoUnavailableError,
    TranscriptDisabledError,
    NoCaptionsError,
    InvalidVideoIdError,
)
from app.transcript.cache import TranscriptCache
from youtube_transcript_api._errors import (
    TranscriptsDisabled,
    NoTranscriptFound,
    VideoUnavailable,
    InvalidVideoId,
)

client = TestClient(app)


class MockSegment:
    def __init__(self, text, start, duration):
        self.text = text
        self.start = start
        self.duration = duration


# Mock classes for youtube-transcript-api responses
class MockTranscript:
    def __init__(self, language_code="en", generated=False):
        self.language_code = language_code
        self.generated = generated

    def fetch(self):
        return [
            MockSegment("Hello world", 0.0, 2.0),
            MockSegment("   Welcome to TubeMind AI.  ", 2.0, 3.0),
            MockSegment("Welcome to TubeMind AI.  ", 5.0, 1.0), # duplicate text consecutive
            MockSegment("", 6.0, 1.0), # empty text
        ]


class MockTranscriptList:
    def __init__(self, has_manual=True, has_generated=True):
        self.has_manual = has_manual
        self.has_generated = has_generated

    def find_manually_created_transcript(self, languages):
        if self.has_manual:
            return MockTranscript(language_code="en", generated=False)
        raise NoTranscriptFound("No manual transcript", None, None)

    def find_generated_transcript(self, languages):
        if self.has_generated:
            return MockTranscript(language_code="en", generated=True)
        raise NoTranscriptFound("No generated transcript", None, None)


@pytest.fixture(autouse=True)
def clean_cache():
    from app.transcript.cache import transcript_cache
    transcript_cache.clear()


# --- Service Tests ---

@patch("app.transcript.service.YouTubeTranscriptApi.list")
def test_service_successful_manual_transcript(mock_list):
    mock_list.return_value = MockTranscriptList(has_manual=True)
    service = TranscriptService()
    
    res = service.get_transcript("abc123xyz89")
    
    assert res["success"] is True
    assert res["video_id"] == "abc123xyz89"
    assert res["generated"] is False
    # Check parsing/normalizing: whitespace trimmed, empty ignored, duplicates merged
    assert len(res["segments"]) == 2
    assert res["segments"][0]["text"] == "Hello world"
    assert res["segments"][1]["text"] == "Welcome to TubeMind AI."
    # check that duration merged (3.0 + 1.0 = 4.0)
    assert res["segments"][1]["duration"] == 4.0


@patch("app.transcript.service.YouTubeTranscriptApi.list")
def test_service_successful_generated_transcript(mock_list):
    mock_list.return_value = MockTranscriptList(has_manual=False, has_generated=True)
    service = TranscriptService()
    
    res = service.get_transcript("abc123xyz89")
    
    assert res["success"] is True
    assert res["generated"] is True


def test_service_invalid_id():
    service = TranscriptService()
    with pytest.raises(InvalidVideoIdError):
        service.get_transcript("short")


@patch("app.transcript.service.YouTubeTranscriptApi.list")
def test_service_disabled_captions(mock_list):
    mock_list.side_effect = TranscriptsDisabled("disabled")
    service = TranscriptService()
    
    with pytest.raises(TranscriptDisabledError):
        service.get_transcript("abc123xyz89")


@patch("app.transcript.service.YouTubeTranscriptApi.list")
def test_service_video_unavailable(mock_list):
    mock_list.side_effect = VideoUnavailable("unavailable")
    service = TranscriptService()
    
    with pytest.raises(VideoUnavailableError):
        service.get_transcript("abc123xyz89")


# --- Cache Tests ---

def test_cache_hit_and_expiration():
    custom_cache = TranscriptCache(ttl_seconds=1)
    service = TranscriptService(cache=custom_cache)
    
    # Pre-populate cache manually
    mock_data = {
        "success": True,
        "video_id": "cachedvid01",
        "language": "en",
        "generated": False,
        "segments": [{"text": "Cached", "start": 0.0, "duration": 1.0}]
    }
    custom_cache.set("cachedvid01", mock_data)
    
    # Fetch from cache (should succeed without patching API)
    res = service.get_transcript("cachedvid01")
    assert res["segments"][0]["text"] == "Cached"
    
    # Wait for expiration
    time.sleep(1.1)
    
    # Query should bypass expired cache and trigger api (which will fail here because not patched)
    with pytest.raises(Exception):
        service.get_transcript("cachedvid01")


# --- Endpoints Integration Tests ---

@patch("app.transcript.service.YouTubeTranscriptApi.list")
def test_endpoint_get_transcript_success(mock_list):
    mock_list.return_value = MockTranscriptList(has_manual=True)
    
    response = client.get("/api/v1/transcript/abc123xyz89")
    
    assert response.status_code == 200
    json_data = response.json()
    assert json_data["success"] is True
    assert json_data["video_id"] == "abc123xyz89"
    assert len(json_data["segments"]) == 2


@patch("app.transcript.service.YouTubeTranscriptApi.list")
def test_endpoint_get_transcript_not_found(mock_list):
    mock_list.side_effect = VideoUnavailable("unavailable")
    
    response = client.get("/api/v1/transcript/abc123xyz89")
    
    assert response.status_code == 404
    json_data = response.json()
    assert json_data["success"] is False
    assert "error" in json_data


# --- Groq Whisper Fallback Tests ---

@patch("app.transcript.service.YouTubeTranscriptApi.list")
def test_service_whisper_fallback_on_transcripts_disabled(mock_list):
    mock_list.side_effect = TranscriptsDisabled("Transcripts disabled")
    mock_whisper = MagicMock()
    mock_whisper.transcribe.return_value = {
        "success": True,
        "video_id": "abc123xyz89",
        "language": "en",
        "generated": True,
        "source": "groq_whisper",
        "segments": [{"text": "Transcribed by Groq Whisper", "start": 0.0, "duration": 3.5}]
    }

    service = TranscriptService(whisper_service=mock_whisper)
    result = service.get_transcript("abc123xyz89")

    assert result["success"] is True
    assert result["source"] == "groq_whisper"
    assert result["segments"][0]["text"] == "Transcribed by Groq Whisper"
    mock_whisper.transcribe.assert_called_once_with("abc123xyz89", target_language="auto")


@patch("app.transcript.service.YouTubeTranscriptApi.list")
def test_service_whisper_fallback_on_no_captions(mock_list):
    mock_list.return_value = MockTranscriptList(has_manual=False, has_generated=False)
    mock_whisper = MagicMock()
    mock_whisper.transcribe.return_value = {
        "success": True,
        "video_id": "abc123xyz89",
        "language": "en",
        "generated": True,
        "source": "groq_whisper",
        "segments": [{"text": "Audio extracted and transcribed", "start": 1.0, "duration": 2.0}]
    }

    service = TranscriptService(whisper_service=mock_whisper)
    result = service.get_transcript("abc123xyz89")

    assert result["success"] is True
    assert result["segments"][0]["text"] == "Audio extracted and transcribed"
    mock_whisper.transcribe.assert_called_once()


@patch("app.transcript.service.YouTubeTranscriptApi.list")
def test_service_whisper_fallback_failure_raises(mock_list):
    mock_list.side_effect = TranscriptsDisabled("Transcripts disabled")
    mock_whisper = MagicMock()
    mock_whisper.transcribe.side_effect = Exception("Audio extraction network error")

    service = TranscriptService(whisper_service=mock_whisper)
    with pytest.raises(TranscriptDisabledError):
        service.get_transcript("abc123xyz89")
