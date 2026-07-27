import time
from typing import Dict, Any, Optional


class TranscriptCache:
    def __init__(self, ttl_seconds: int = 1800):
        self.ttl: int = ttl_seconds
        self.cache: Dict[str, Dict[str, Any]] = {}

    def get(self, video_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve entry from cache if it exists and has not expired."""
        if video_id not in self.cache:
            return None
        
        entry = self.cache[video_id]
        if time.time() > entry["expires_at"]:
            # Clean up expired entry
            del self.cache[video_id]
            return None
            
        return entry["data"]

    def set(self, video_id: str, data: Dict[str, Any]) -> None:
        """Store transcript details in cache with expiration timestamp."""
        self.cache[video_id] = {
            "expires_at": time.time() + self.ttl,
            "data": data
        }

    def clear(self) -> None:
        """Clear all entries from the cache (primarily for test cleanup)."""
        self.cache.clear()


# Global singleton instance for application injection
transcript_cache = TranscriptCache()
