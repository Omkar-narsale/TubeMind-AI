import time
import json
import asyncio
import logging
import hashlib
from typing import AsyncGenerator, List, Tuple, Optional
from fastapi.encoders import jsonable_encoder
from app.rag.service import RAGService
from app.rag.models import RAGSearchResult
from app.llm.client import GroqClient
from app.llm.prompt_builder import PromptBuilder
from app.llm.models import ChatMessage, ChatMetadata
from app.llm.token_manager import TokenBudgetManager
from app.llm.cache import LLMCache
from app.core.config import settings

logger = logging.getLogger("app.llm.service")

# Global singleton service instances to avoid rebuilding objects per request
_rag_service = RAGService()
_groq_client = GroqClient()
_prompt_builder = PromptBuilder()

# Classification cache to prevent repeated LLM calls for the same query
_classification_cache = {}


class LLMChatService:
    def __init__(
        self,
        rag_service: RAGService = None,
        groq_client: GroqClient = None,
        prompt_builder: PromptBuilder = None,
    ):
        self.rag_service = rag_service or _rag_service
        self.groq_client = groq_client or _groq_client
        self.prompt_builder = prompt_builder or _prompt_builder

    def classify_query_rule_based(self, query: str) -> Optional[str]:
        q = query.lower().strip()
        if any(w in q for w in ["summarize", "summary", "summarisation", "bullet points", "overview", "outline"]):
            return "SUMMARY"
        if any(w in q for w in ["explain", "explanation", "what is", "why is", "how does", "understand"]):
            return "EXPLANATION"
        if any(w in q for w in ["example", "analogy", "comparision", "similar to"]):
            return "EXAMPLE"
        if any(w in q for w in ["interview", "preparation", "job interview", "questions for recruitment"]):
            return "INTERVIEW"
        if any(w in q for w in ["practice", "exercise", "test", "quiz", "check knowledge"]):
            return "PRACTICE"
        if any(w in q for w in ["fact", "quote", "citation", "what did the speaker say", "specific detail"]):
            return "FACTUAL"
        return None

    async def classify_query(self, query: str) -> str:
        # Rule-based routing first
        rule_class = self.classify_query_rule_based(query)
        if rule_class:
            return rule_class

        # Check Cache
        if query in _classification_cache:
            return _classification_cache[query]

        categories = ["FACTUAL", "SUMMARY", "EXPLANATION", "EXAMPLE", "ANALOGY", "APPLICATION", "INTERVIEW", "PRACTICE"]
        messages = [
            {"role": "system", "content": (
                "You are an AI assistant that classifies user questions about a video transcript into exactly one of these categories:\n"
                "- FACTUAL, SUMMARY, EXPLANATION, EXAMPLE, ANALOGY, APPLICATION, INTERVIEW, PRACTICE.\n"
                "Respond with exactly one category name in uppercase."
            )},
            {"role": "user", "content": f"Query: {query}"}
        ]
        try:
            res = await self.groq_client.generate(messages, temperature=0.0, max_tokens=10, task_type="classification")
            res_upper = res.strip().upper()
            for cat in categories:
                if cat in res_upper:
                    _classification_cache[query] = cat
                    return cat
            _classification_cache[query] = "FACTUAL"
            return "FACTUAL"
        except Exception:
            return "FACTUAL"

    async def summarize_history(self, messages_to_summarize: List[ChatMessage]) -> str:
        if not messages_to_summarize:
            return ""
        history_text = "\n".join([f"{msg.role.value if hasattr(msg.role, 'value') else msg.role}: {msg.content}" for msg in messages_to_summarize])
        prompt = (
            "Summarize the following conversation history briefly. "
            "Keep it extremely concise (1-2 sentences max).\n\n"
            f"Conversation to summarize:\n{history_text}"
        )
        try:
            summary = await self.groq_client.generate(
                messages=[{"role": "user", "content": prompt}],
                temperature=0.3,
                max_tokens=100,
                task_type="classification"
            )
            return summary.strip()
        except Exception:
            return ""

    async def validate_groundedness(self, answer: str, context: List[RAGSearchResult]) -> bool:
        if not context:
            return True
            
        if "I couldn't find that information in this video's transcript" in answer:
            return True
            
        part_to_verify = answer
        if "💡 Additional Explanation" in answer:
            parts = answer.split("💡 Additional Explanation")
            part_to_verify = parts[0]
        elif "---" in answer:
            parts = answer.split("---")
            part_to_verify = parts[0]
            
        if "📹 Based on the Video" in part_to_verify:
            part_to_verify = part_to_verify.replace("📹 Based on the Video", "")
            
        context_text = "\n".join([c.text for c in context])
        messages = [
            {"role": "system", "content": (
                "You are a factual verification assistant. Verify if the Answer is supported by Context.\n"
                "If it is supported, reply 'PASS'. Otherwise, reply 'FAIL'."
            )},
            {"role": "user", "content": f"Context:\n{context_text}\n\nAnswer:\n{part_to_verify.strip()}"}
        ]
        try:
            res = await self.groq_client.generate(messages, temperature=0.0, max_tokens=10, task_type="verification")
            return "PASS" in res.upper()
        except Exception:
            return True

    async def chat(
        self,
        video_id: str,
        query: str,
        history: List[ChatMessage],
        temperature: float = 0.7,
        max_tokens: int = 1024,
        language: Optional[str] = "auto",
        timestamp_seconds: Optional[float] = None,
        window_seconds: float = 90.0,
    ) -> Tuple[str, List[RAGSearchResult], ChatMetadata]:
        start_time = time.perf_counter()
        
        # Resolve output language preferences and maintain session
        if language and language != "auto":
            LLMCache.set_video_language_preference(video_id, language)
        else:
            language = LLMCache.get_video_language_preference(video_id) or "auto"
            
        resolved_lang = language
        if resolved_lang == "auto":
            resolved_lang = settings.DEFAULT_OUTPUT_LANGUAGE

        # 1. Classification (Rule-based first)
        classification = await self.classify_query(query)
        
        search_query = query
        if history:
            user_queries = [m.content for m in history if m.role == "user" or getattr(m.role, "value", m.role) == "user"]
            if user_queries:
                search_query = f"{' '.join(user_queries)} {query}"

        # Grab raw transcript text first (utilizes cache)
        raw_text = ""
        transcript_lang = "en"
        segments = []
        try:
            transcript_data = self.rag_service.transcript_service.get_transcript(video_id, target_language=resolved_lang)
            segments = transcript_data.get("segments", [])
            raw_text = " ".join([s["text"] for s in segments])
            transcript_lang = transcript_data.get("language", "en")
        except Exception:
            pass

        # Token-based Adaptive Retrieval:
        est_transcript_tokens = TokenBudgetManager.estimate_tokens(raw_text)
        if est_transcript_tokens < 2500:
            top_k = settings.MAX_CHUNKS
        elif est_transcript_tokens <= 8000:
            top_k = 5
        else:
            top_k = 3

        results = []
        transcript_available = True
        try:
            results = self.rag_service.search_transcript(video_id, search_query, top_k=top_k, language=resolved_lang)
        except Exception:
            transcript_available = False

        # Proximity extraction if timestamp_seconds is provided:
        if timestamp_seconds is not None and segments:
            start_window = max(0.0, float(timestamp_seconds) - float(window_seconds))
            end_window = float(timestamp_seconds) + float(window_seconds)
            prox_segs = [
                s for s in segments
                if (float(s.get("start", 0.0)) + float(s.get("duration", 0.0))) >= start_window and float(s.get("start", 0.0)) <= end_window
            ]
            if prox_segs:
                prox_text = " ".join([s.get("text", "") for s in prox_segs])
                ts_str = self.prompt_builder.format_timestamp(timestamp_seconds)
                proximity_result = RAGSearchResult(
                    score=1.0,
                    text=f"[CURRENT SCENE MOMENT around {ts_str}]: {prox_text}",
                    start=float(prox_segs[0].get("start", 0.0)),
                    end=float(prox_segs[-1].get("start", 0.0)) + float(prox_segs[-1].get("duration", 0.0)),
                    chunk_index=-1
                )
                results = [proximity_result] + [r for r in results if r.chunk_index != -1]
            
        max_tokens_map = {
            "INTERVIEW": 300,
            "PRACTICE": 400,
        }
        requested_max = max_tokens_map.get(classification, 512)

        # Build initial messages prompt
        messages = self.prompt_builder.build_prompt_messages(
            query=query, 
            retrieved_context=results, 
            history=history, 
            classification=classification, 
            transcript_available=transcript_available,
            video_id=video_id,
            old_history_summary="",
            target_language=resolved_lang,
            raw_transcript=raw_text,
            timestamp_seconds=timestamp_seconds,
        )

        from app.llm.executor import unified_executor
        answer = await unified_executor.execute(
            video_id=video_id,
            feature="chat",
            transcript_language=transcript_lang,
            output_language=resolved_lang,
            messages=messages,
            max_tokens=requested_max,
            temperature=temperature
        )
        
        # Keep groundedness check synchronous
        await self.validate_groundedness(answer, results)
            
        elapsed = time.perf_counter() - start_time
        metadata = ChatMetadata(
            model_name=self.groq_client.model,
            retrieval_count=len(results),
            response_time=round(elapsed, 4)
        )
        return answer, results, metadata

    async def stream_chat(
        self,
        video_id: str,
        query: str,
        history: List[ChatMessage],
        temperature: float = 0.7,
        max_tokens: int = 1024,
        language: Optional[str] = "auto",
        timestamp_seconds: Optional[float] = None,
        window_seconds: float = 90.0,
    ) -> AsyncGenerator[Tuple[str, str], None]:
        start_time = time.perf_counter()
        
        # Resolve output language preferences and maintain session
        if language and language != "auto":
            LLMCache.set_video_language_preference(video_id, language)
        else:
            language = LLMCache.get_video_language_preference(video_id) or "auto"
            
        resolved_lang = language
        if resolved_lang == "auto":
            resolved_lang = settings.DEFAULT_OUTPUT_LANGUAGE

        # 1. Classification (Rule-based first)
        classification = await self.classify_query(query)
        
        search_query = query
        if history:
            user_queries = [m.content for m in history if m.role == "user" or getattr(m.role, "value", m.role) == "user"]
            if user_queries:
                search_query = f"{' '.join(user_queries)} {query}"

        # Grab raw transcript text first (utilizes cache)
        raw_text = ""
        transcript_lang = "en"
        segments = []
        try:
            transcript_data = self.rag_service.transcript_service.get_transcript(video_id, target_language=resolved_lang)
            segments = transcript_data.get("segments", [])
            raw_text = " ".join([s["text"] for s in segments])
            transcript_lang = transcript_data.get("language", "en")
        except Exception:
            pass

        # Token-based Adaptive Retrieval:
        est_transcript_tokens = TokenBudgetManager.estimate_tokens(raw_text)
        if est_transcript_tokens < 2500:
            top_k = settings.MAX_CHUNKS
        elif est_transcript_tokens <= 8000:
            top_k = 5
        else:
            top_k = 3

        results = []
        transcript_available = True
        try:
            results = self.rag_service.search_transcript(video_id, search_query, top_k=top_k, language=resolved_lang)
        except Exception:
            transcript_available = False

        # Proximity extraction if timestamp_seconds is provided:
        if timestamp_seconds is not None and segments:
            start_window = max(0.0, float(timestamp_seconds) - float(window_seconds))
            end_window = float(timestamp_seconds) + float(window_seconds)
            prox_segs = [
                s for s in segments
                if (float(s.get("start", 0.0)) + float(s.get("duration", 0.0))) >= start_window and float(s.get("start", 0.0)) <= end_window
            ]
            if prox_segs:
                prox_text = " ".join([s.get("text", "") for s in prox_segs])
                ts_str = self.prompt_builder.format_timestamp(timestamp_seconds)
                proximity_result = RAGSearchResult(
                    score=1.0,
                    text=f"[CURRENT SCENE MOMENT around {ts_str}]: {prox_text}",
                    start=float(prox_segs[0].get("start", 0.0)),
                    end=float(prox_segs[-1].get("start", 0.0)) + float(prox_segs[-1].get("duration", 0.0)),
                    chunk_index=-1
                )
                results = [proximity_result] + [r for r in results if r.chunk_index != -1]
            
        yield "context", json.dumps(jsonable_encoder(results))
        
        max_tokens_map = {
            "INTERVIEW": 300,
            "PRACTICE": 400,
        }
        requested_max = max_tokens_map.get(classification, 512)

        # Build initial messages prompt
        messages = self.prompt_builder.build_prompt_messages(
            query=query, 
            retrieved_context=results, 
            history=history, 
            classification=classification, 
            transcript_available=transcript_available,
            video_id=video_id,
            old_history_summary="",
            target_language=resolved_lang,
            raw_transcript=raw_text,
            timestamp_seconds=timestamp_seconds,
        )

        from app.llm.executor import unified_executor
        accumulated_answer = ""
        async for chunk in unified_executor.execute_stream(
            video_id=video_id,
            feature="chat",
            transcript_language=transcript_lang,
            output_language=resolved_lang,
            messages=messages,
            max_tokens=requested_max,
            temperature=temperature
        ):
            accumulated_answer += chunk
            yield "token", chunk
            
        # Groundedness verification
        await self.validate_groundedness(accumulated_answer, results)
            
        elapsed = time.perf_counter() - start_time
        meta = ChatMetadata(
            model_name=self.groq_client.model,
            retrieval_count=len(results),
            response_time=round(elapsed, 4)
        )
        yield "metadata", json.dumps(jsonable_encoder(meta))
