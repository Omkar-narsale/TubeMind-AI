import asyncio
import logging
from typing import Dict, Any

logger = logging.getLogger("app.llm.coordinator")

class RequestCoordinator:
    """
    Deduplicates concurrent in-flight requests.
    If the same key (video_id + feature + language) is in-flight,
    callers await and share the active response.
    """
    def __init__(self):
        self._events: Dict[str, asyncio.Event] = {}
        self._results: Dict[str, Any] = {}

    async def execute_coordinated(self, key: str, func, *args, **kwargs):
        if key in self._events:
            logger.info(f"Coordinator: concurrent duplicate request '{key}'. Waiting for in-flight task...")
            await self._events[key].wait()
            res = self._results.get(key)
            if isinstance(res, Exception):
                raise res
            return res

        event = asyncio.Event()
        self._events[key] = event
        try:
            res = await func(*args, **kwargs)
            self._results[key] = res
            return res
        except Exception as e:
            self._results[key] = e
            raise e
        finally:
            event.set()
            self._events.pop(key, None)
            self._results.pop(key, None)

# Global singleton
request_coordinator = RequestCoordinator()
