import time
import json
from typing import AsyncGenerator, List, Tuple
from fastapi.encoders import jsonable_encoder
from app.rag.service import RAGService
from app.rag.models import RAGSearchResult
from app.llm.client import GroqClient
from app.llm.prompt_builder import PromptBuilder
from app.llm.models import ChatMessage, ChatMetadata


class LLMChatService:
    def __init__(
        self,
        rag_service: RAGService = None,
        groq_client: GroqClient = None,
        prompt_builder: PromptBuilder = None,
    ):
        self.rag_service = rag_service or RAGService()
        self.groq_client = groq_client or GroqClient()
        self.prompt_builder = prompt_builder or PromptBuilder()

    async def validate_groundedness(self, answer: str, context: List[RAGSearchResult]) -> bool:
        if "I couldn't find that information in this video's transcript" in answer:
            return True
            
        context_text = "\n".join([c.text for c in context])
        messages = [
            {"role": "system", "content": (
                "You are a factual verification assistant. Verify if the Answer is supported by or is a valid explanation/analogy of the concepts described in the supplied Context.\n"
                "If the core facts/concepts in the answer are supported by the context, or if the answer is a simplified explanation/analogy of the context, reply 'PASS'.\n"
                "If the answer contradicts the context or introduces entirely unrelated topics not mentioned in the context, reply 'FAIL'.\n"
                "Respond with exactly 'PASS' or 'FAIL' (no explanation)."
            )},
            {"role": "user", "content": f"Context:\n{context_text}\n\nAnswer:\n{answer}"}
        ]
        try:
            res = await self.groq_client.complete(messages, temperature=0.0, max_tokens=10)
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
    ) -> Tuple[str, List[RAGSearchResult], ChatMetadata]:
        start_time = time.perf_counter()
        
        # Contextualize search query for RAG using conversation history
        search_query = query
        if history:
            user_queries = [m.content for m in history if m.role == "user" or getattr(m.role, "value", m.role) == "user"]
            if user_queries:
                search_query = f"{' '.join(user_queries)} {query}"

        # 1. Retrieve top 5 chunks from RAG Service
        results = self.rag_service.search_transcript(video_id, search_query, top_k=5)
        
        # 2. Build prompts
        messages = self.prompt_builder.build_prompt_messages(query, results, history)
        
        # 3. Call Groq
        answer = await self.groq_client.complete(
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        
        # Groundedness Validation
        is_grounded = await self.validate_groundedness(answer, results)
        if not is_grounded:
            answer = "I couldn't find that information in this video's transcript."
            
        end_time = time.perf_counter()
        elapsed = end_time - start_time
        
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
    ) -> AsyncGenerator[Tuple[str, str], None]:
        start_time = time.perf_counter()
        
        # Contextualize search query for RAG using conversation history
        search_query = query
        if history:
            user_queries = [m.content for m in history if m.role == "user" or getattr(m.role, "value", m.role) == "user"]
            if user_queries:
                search_query = f"{' '.join(user_queries)} {query}"

        results = self.rag_service.search_transcript(video_id, search_query, top_k=5)
        
        yield "context", json.dumps(jsonable_encoder(results))
        
        messages = self.prompt_builder.build_prompt_messages(query, results, history)
        
        accumulated_answer = ""
        async for chunk in self.groq_client.stream_complete(
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        ):
            accumulated_answer += chunk
            yield "token", chunk

        is_grounded = await self.validate_groundedness(accumulated_answer, results)
        if not is_grounded:
            yield "replace", "I couldn't find that information in this video's transcript."
            
        end_time = time.perf_counter()
        elapsed = end_time - start_time
        
        meta = ChatMetadata(
            model_name=self.groq_client.model,
            retrieval_count=len(results),
            response_time=round(elapsed, 4)
        )
        yield "metadata", json.dumps(jsonable_encoder(meta))
