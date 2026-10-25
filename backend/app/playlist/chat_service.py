import json
import logging
from typing import List, AsyncGenerator, Tuple, Optional

from app.llm.client import GroqClient
from app.playlist.models import (
    PlaylistSearchResult,
    PlaylistChatMessageInput,
    PlaylistChatResponse,
)
from app.playlist.service import playlist_rag_service, PlaylistRAGService
from app.core.config import settings

logger = logging.getLogger("app.playlist.chat_service")


class PlaylistChatService:
    def __init__(
        self,
        rag_service: Optional[PlaylistRAGService] = None,
        groq_client: Optional[GroqClient] = None,
    ):
        self.rag_service = rag_service or playlist_rag_service
        self.groq_client = groq_client or GroqClient()

    def _build_course_context(self, search_results: List[PlaylistSearchResult]) -> str:
        if not search_results:
            return "No matching lecture content found in this playlist."

        blocks = []
        for i, res in enumerate(search_results, 1):
            m_start, s_start = divmod(int(res.start), 60)
            m_end, s_end = divmod(int(res.end), 60)
            time_range = f"{m_start}:{s_start:02d} - {m_end}:{s_end:02d}"

            block = (
                f"[SOURCE {i}: \"{res.video_title}\" (Video ID: {res.video_id})]\n"
                f"Timestamp: {time_range}\n"
                f"Transcript Extract: \"{res.text}\""
            )
            blocks.append(block)

        return "\n\n".join(blocks)

    def _build_messages(
        self,
        query: str,
        context_str: str,
        history: Optional[List[PlaylistChatMessageInput]] = None,
        language: str = "en",
    ) -> List[dict]:
        system_instruction = (
            "You are TubeMind AI, an elite Course Tutor and Multi-Video Playlist Assistant. "
            "You help students learn across an entire multi-video YouTube course or tutorial series.\n\n"
            "INSTRUCTIONS:\n"
            "1. Answer questions accurately based on the multi-lecture transcript context provided below.\n"
            "2. Whenever mentioning a topic, explicitly cite which video or lecture it came from and the timestamp (e.g., 'In *Lecture 2: Introduction* (at 04:15)...').\n"
            "3. If different lectures in the course explain contrasting concepts or progressive topics, compare and contrast them clearly.\n"
            "4. If the course context does not contain the answer, state honestly that it was not covered in the indexed lectures, and provide a helpful concise general explanation.\n"
            "5. Format your output with clean markdown headings, bullet points, and bold terms."
        )

        user_content = (
            f"=== MULTI-VIDEO COURSE TRANSCRIPT CONTEXT ===\n"
            f"{context_str}\n\n"
            f"=== STUDENT QUESTION ===\n"
            f"{query}\n\n"
            f"Please provide a thorough, structured answer citing the relevant lectures and timestamps."
        )

        messages = [{"role": "system", "content": system_instruction}]

        if history:
            for h in history[-4:]:
                messages.append({"role": h.role, "content": h.content})

        messages.append({"role": "user", "content": user_content})
        return messages

    async def chat(
        self,
        playlist_id: str,
        query: str,
        history: Optional[List[PlaylistChatMessageInput]] = None,
        temperature: float = 0.7,
        max_tokens: int = 1024,
        language: str = "en",
    ) -> PlaylistChatResponse:
        """
        Executes cross-video search and generates course-wide AI tutor response.
        """
        results = self.rag_service.search_playlist(playlist_id, query, top_k=6)
        context_str = self._build_course_context(results)

        messages = self._build_messages(query, context_str, history, language=language)

        answer = await self.groq_client.generate(
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            task_type="chat",
        )

        return PlaylistChatResponse(
            success=True,
            answer=answer,
            context=results,
            total_sources=len(results),
        )

    async def stream_chat(
        self,
        playlist_id: str,
        query: str,
        history: Optional[List[PlaylistChatMessageInput]] = None,
        temperature: float = 0.7,
        max_tokens: int = 1024,
        language: str = "en",
    ) -> AsyncGenerator[str, None]:
        """
        Streams cross-video course answers via Server-Sent Events (SSE).
        """
        results = self.rag_service.search_playlist(playlist_id, query, top_k=6)
        context_str = self._build_course_context(results)

        # First send context event
        context_payload = [r.dict() for r in results]
        yield f"event: context\ndata: {json.dumps(context_payload)}\n\n"

        messages = self._build_messages(query, context_str, history, language=language)

        try:
            async for token in self.groq_client.stream(
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                task_type="chat",
            ):
                payload = json.dumps({"token": token})
                yield f"event: chunk\ndata: {payload}\n\n"

            yield f"event: done\ndata: {json.dumps({'status': 'finished'})}\n\n"
        except Exception as e:
            logger.error(f"Error streaming playlist chat: {e}")
            yield f"event: error\ndata: {json.dumps({'message': str(e)})}\n\n"


playlist_chat_service = PlaylistChatService()
