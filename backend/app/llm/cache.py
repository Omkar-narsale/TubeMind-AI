import asyncio
import time
import logging
from typing import Dict, Any, List, Optional, Tuple
from app.core.config import settings

logger = logging.getLogger("app.llm.cache")

class RequestLockManager:
    """
    Manages concurrent request locking to prevent duplicate processing for the same resource.
    If a query/summary request is in-flight, concurrent calls will await it.
    """
    def __init__(self):
        self.events: Dict[str, asyncio.Event] = {}
        self.results: Dict[str, Any] = {}

    async def get_or_execute(self, key: str, func, *args, **kwargs):
        if key in self.events:
            logger.info(f"Duplicate request detected for key: {key}. Waiting for in-flight request...")
            event = self.events[key]
            await event.wait()
            res = self.results.get(key)
            if isinstance(res, Exception):
                raise res
            return res

        event = asyncio.Event()
        self.events[key] = event
        try:
            res = await func(*args, **kwargs)
            self.results[key] = res
            return res
        except Exception as e:
            self.results[key] = e
            raise e
        finally:
            event.set()
            self.events.pop(key, None)
            self.results.pop(key, None)


class LLMCache:
    """
    Multi-level caching system to prevent redundant processing, network fetches,
    and LLM generations.
    Cache key structure: (video_id, feature, model, language)
    """
    _cache: Dict[Tuple[str, str, str, str], Dict[str, Any]] = {}
    _video_language_preferences: Dict[str, str] = {}

    @classmethod
    def get_video_language_preference(cls, video_id: str) -> Optional[str]:
        return cls._video_language_preferences.get(video_id)

    @classmethod
    def set_video_language_preference(cls, video_id: str, language: str) -> None:
        cls._video_language_preferences[video_id] = language

    @classmethod
    def get(cls, video_id: str, feature: str, model: str, language: str) -> Optional[Any]:
        key = (video_id, feature, model, language)
        if key not in cls._cache:
            logger.info(f"Cache MISS for key: {key}")
            return None
        
        entry = cls._cache[key]
        if time.time() > entry["expires_at"]:
            logger.info(f"Cache EXPIRED (TTL) for key: {key}")
            del cls._cache[key]
            return None
            
        logger.info(f"Cache HIT for key: {key}")
        return entry["value"]

    @classmethod
    def set(
        cls, 
        video_id: str, 
        feature: str, 
        model: str, 
        language: str, 
        value: Any, 
        ttl: Optional[int] = None
    ) -> None:
        key = (video_id, feature, model, language)
        ttl = ttl if ttl is not None else settings.CACHE_TTL_SECONDS
        cls._cache[key] = {
            "value": value,
            "expires_at": time.time() + ttl
        }
        logger.info(f"Cache SET for key: {key} (TTL: {ttl}s)")

    @classmethod
    def invalidate(cls, video_id: str, feature: Optional[str] = None) -> None:
        """Invalidates cache entries for a given video_id and optionally a specific feature."""
        keys_to_del = []
        for key in cls._cache.keys():
            if key[0] == video_id:
                if feature is None or key[1] == feature:
                    keys_to_del.append(key)
        for key in keys_to_del:
            del cls._cache[key]
            logger.info(f"Cache INVALIDATED for key: {key}")

    @classmethod
    def clear(cls) -> None:
        cls._cache.clear()
        cls._video_language_preferences.clear()
        logger.info("Cache CLEARED")

    # --- Backward Compatibility Helpers ---
    @classmethod
    def get_transcript(cls, video_id: str) -> Optional[Dict[str, Any]]:
        return cls.get(video_id, "transcript", "N/A", "en")

    @classmethod
    def set_transcript(cls, video_id: str, data: Dict[str, Any]) -> None:
        language = data.get("language", "en")
        cls.set(video_id, "transcript", "N/A", language, data)

    @classmethod
    def get_cleaned_transcript(cls, video_id: str) -> Optional[str]:
        return cls.get(video_id, "cleaned_transcript", "N/A", "en")

    @classmethod
    def set_cleaned_transcript(cls, video_id: str, text: str) -> None:
        cls.set(video_id, "cleaned_transcript", "N/A", "en", text)

    @classmethod
    def get_chunks(cls, video_id: str) -> Optional[List[Any]]:
        return cls.get(video_id, "chunks", "N/A", "en")

    @classmethod
    def set_chunks(cls, video_id: str, chunks: List[Any]) -> None:
        cls.set(video_id, "chunks", "N/A", "en", chunks)

    @classmethod
    def get_summary(cls, video_id: str, summary_type: str, transcript_language: str = "en", output_language: str = "en") -> Optional[str]:
        return cls.get(video_id, f"summary_{summary_type}", settings.SUMMARY_MODEL, f"{transcript_language}:{output_language}")

    @classmethod
    def set_summary(cls, video_id: str, summary_type: str, text: str, transcript_language: str = "en", output_language: str = "en") -> None:
        cls.set(video_id, f"summary_{summary_type}", settings.SUMMARY_MODEL, f"{transcript_language}:{output_language}", text)

    @classmethod
    def get_notes(cls, video_id: str, transcript_language: str = "en", output_language: str = "en") -> Optional[str]:
        return cls.get(video_id, "study_notes", settings.NOTES_MODEL, f"{transcript_language}:{output_language}")

    @classmethod
    def set_notes(cls, video_id: str, text: str, transcript_language: str = "en", output_language: str = "en") -> None:
        cls.set(video_id, "study_notes", settings.NOTES_MODEL, f"{transcript_language}:{output_language}", text)

    @classmethod
    def get_takeaways(cls, video_id: str, transcript_language: str = "en", output_language: str = "en") -> Optional[str]:
        return cls.get(video_id, "takeaways", settings.TAKEAWAYS_MODEL, f"{transcript_language}:{output_language}")

    @classmethod
    def set_takeaways(cls, video_id: str, text: str, transcript_language: str = "en", output_language: str = "en") -> None:
        cls.set(video_id, "takeaways", settings.TAKEAWAYS_MODEL, f"{transcript_language}:{output_language}", text)

    @classmethod
    def get_quiz(cls, video_id: str, transcript_language: str = "en", output_language: str = "en") -> Optional[str]:
        return cls.get(video_id, "quiz", settings.QUIZ_MODEL, f"{transcript_language}:{output_language}")

    @classmethod
    def set_quiz(cls, video_id: str, text: str, transcript_language: str = "en", output_language: str = "en") -> None:
        cls.set(video_id, "quiz", settings.QUIZ_MODEL, f"{transcript_language}:{output_language}", text)

    @classmethod
    def get_flashcards(cls, video_id: str, transcript_language: str = "en", output_language: str = "en") -> Optional[str]:
        return cls.get(video_id, "flashcards", settings.FLASHCARD_MODEL, f"{transcript_language}:{output_language}")

    @classmethod
    def set_flashcards(cls, video_id: str, text: str, transcript_language: str = "en", output_language: str = "en") -> None:
        cls.set(video_id, "flashcards", settings.FLASHCARD_MODEL, f"{transcript_language}:{output_language}", text)

    @classmethod
    def get_interview(cls, video_id: str, transcript_language: str = "en", output_language: str = "en") -> Optional[str]:
        return cls.get(video_id, "interview", settings.INTERVIEW_MODEL, f"{transcript_language}:{output_language}")

    @classmethod
    def set_interview(cls, video_id: str, text: str, transcript_language: str = "en", output_language: str = "en") -> None:
        cls.set(video_id, "interview", settings.INTERVIEW_MODEL, f"{transcript_language}:{output_language}", text)



# Global request lock manager instance
lock_manager = RequestLockManager()
