import time
from typing import Dict, Any, Optional


class TranscriptCache:
    def __init__(self, ttl_seconds: int = 1800):
        self.ttl: int = ttl_seconds
        self.cache: Dict[str, Dict[str, Any]] = {}

    def get(self, video_id: str, language: str = "auto") -> Optional[Dict[str, Any]]:
        """Retrieve entry from cache if it exists and has not expired."""
        key = f"{video_id}:{language}"
        if key not in self.cache:
            # Fallback check for legacy non-templated key
            if video_id in self.cache:
                key = video_id
            else:
                return None
        
        entry = self.cache[key]
        if time.time() > entry["expires_at"]:
            # Clean up expired entry
            del self.cache[key]
            return None
            
        return entry["data"]

    def set(self, video_id: str, data: Dict[str, Any], language: str = "auto") -> None:
        """Store transcript details in cache with expiration timestamp."""
        key = f"{video_id}:{language}"
        self.cache[key] = {
            "expires_at": time.time() + self.ttl,
            "data": data
        }

    def clear(self) -> None:
        """Clear all entries from the cache (primarily for test cleanup)."""
        self.cache.clear()


# Global singleton instance for application injection
transcript_cache = TranscriptCache()
