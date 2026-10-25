import os
import logging
import time
import asyncio
from typing import AsyncGenerator, List, Dict, Any, Optional
from groq import AsyncGroq
from groq import (
    RateLimitError as GroqRateLimitError,
    AuthenticationError as GroqAuthenticationError,
    APIConnectionError as GroqAPIConnectionError,
    BadRequestError as GroqBadRequestError,
    APITimeoutError as GroqAPITimeoutError,
)
from app.core.config import settings
from app.llm.errors import GroqAPIException
from app.llm.router import get_routed_model
from app.llm.metrics import log_metrics
from app.llm.prompts import (
    SUMMARY_SHORT_PROMPT,
    SUMMARY_DETAILED_PROMPT,
    SUMMARY_BULLET_PROMPT,
    STUDY_NOTES_PROMPT,
    KEY_TAKEAWAYS_PROMPT,
)

logger = logging.getLogger("app.llm.client")


class LLMClient:
    _shared_client: Optional[AsyncGroq] = None

    def __init__(self, api_key: str = None):
        self.api_key = api_key or settings.GROQ_API_KEY
        if not self.api_key:
            raise ValueError("Groq API key is missing. Please configure GROQ_API_KEY in your .env file.")
        
        if LLMClient._shared_client is None:
            LLMClient._shared_client = AsyncGroq(api_key=self.api_key)
            
        self.client = LLMClient._shared_client
        self.model = settings.GROQ_MODEL

    def _handle_exception(self, e: Exception) -> GroqAPIException:
        if isinstance(e, GroqRateLimitError):
            return GroqAPIException(
                status_code=429,
                code="RATE_LIMIT",
                message="Groq API token limit reached. Please try again later."
            )
        elif isinstance(e, GroqAuthenticationError):
            return GroqAPIException(
                status_code=401,
                code="AUTHENTICATION_ERROR",
                message="Groq API authentication failed. Check key config."
            )
        elif isinstance(e, GroqAPIConnectionError):
            return GroqAPIException(
                status_code=503,
                code="CONNECTION_ERROR",
                message="Cannot connect to Groq API."
            )
        elif isinstance(e, GroqBadRequestError):
            return GroqAPIException(
                status_code=400,
                code="BAD_REQUEST",
                message=f"Groq API bad request: {str(e)}"
            )
        elif isinstance(e, (GroqAPITimeoutError, asyncio.TimeoutError)):
            return GroqAPIException(
                status_code=504,
                code="TIMEOUT",
                message="Groq API request timed out."
            )
        else:
            return GroqAPIException(
                status_code=500,
                code="LLM_ERROR",
                message=f"An unexpected error occurred in LLM service: {str(e)}"
            )

    async def _execute_with_retry(self, func, *args, **kwargs):
        retries = settings.LLM_RETRY_COUNT
        delay = settings.LLM_RETRY_DELAY_SECONDS
        backoff_factor = 2.0
        
        for attempt in range(retries + 1):
            try:
                return await func(*args, **kwargs)
            except Exception as e:
                is_retryable = False
                status_code = getattr(e, "status_code", None)
                if isinstance(e, (GroqRateLimitError, GroqAPIConnectionError, GroqAPITimeoutError, asyncio.TimeoutError)):
                    is_retryable = True
                elif status_code in (429, 502, 503, 504):
                    is_retryable = True
                
                if is_retryable and attempt < retries:
                    logger.warning(
                        f"Groq call failed (attempt {attempt + 1}/{retries + 1}). "
                        f"Retrying in {delay}s... Error: {str(e)}"
                    )
                    await asyncio.sleep(delay)
                    delay *= backoff_factor
                else:
                    logger.exception("Groq call failed permanently after all retries.")
                    raise self._handle_exception(e)

    def _get_adaptive_max_tokens(self, task_type: Optional[str], transcript_len: int) -> int:
        if not task_type:
            return 512
        t = task_type.lower()
        if "short" in t or "takeaways" in t:
            base = 250
        elif "notes" in t:
            base = 450
        elif "detailed" in t:
            base = 500
        elif "quiz" in t:
            base = 400
        elif "chat" in t:
            base = 300
        else:
            base = 512
            
        if transcript_len > 10000:
            return int(base * 1.3)
        elif transcript_len < 2000:
            return int(base * 0.8)
        return base

    async def generate(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        task_type: Optional[str] = None,
        model_override: Optional[str] = None,
        video_id: Optional[str] = None,
    ) -> str:
        from app.llm.token_manager import TokenBudgetManager
        model = model_override or get_routed_model(task_type or "chat")
        total_prompt_char_len = sum(len(m.get("content", "")) for m in messages)
        if max_tokens is None or max_tokens == 1024:
            max_tokens = self._get_adaptive_max_tokens(task_type, total_prompt_char_len)
            
        start_time = time.perf_counter()

        # Guarded Execution: Token budget verification and pruning
        budget = settings.TOTAL_BUDGET_LIMIT
        safety_budget = int(budget * 0.75)
        
        prune_step = 0
        current_messages = list(messages)
        original_prompt_tokens = TokenBudgetManager.estimate_messages_tokens(current_messages)
        
        while prune_step <= 6:
            prompt_tokens = TokenBudgetManager.estimate_messages_tokens(current_messages)
            est_total = prompt_tokens + max_tokens
            if est_total <= safety_budget:
                break
            current_messages = TokenBudgetManager.prune_messages(current_messages, safety_budget, prune_step)
            prune_step += 1
            
        final_prompt_tokens = TokenBudgetManager.estimate_messages_tokens(current_messages)
        logger.info(
            f"\n--- Guarded LLM Call ---\n"
            f"Feature: {task_type or 'chat'}\n"
            f"Original Prompt Tokens: {original_prompt_tokens}\n"
            f"Pruned: {'YES' if prune_step > 0 else 'NO'} (Step: {prune_step})\n"
            f"Final Prompt Tokens: {final_prompt_tokens}\n"
            f"Max Completion Tokens: {max_tokens}\n"
            f"Safety Budget Limit: {safety_budget}\n"
            f"-------------------------"
        )
        
        async def call_api():
            return await self.client.chat.completions.create(
                model=model,
                messages=current_messages,
                temperature=temperature,
                max_tokens=max_tokens,
                stream=False,
            )
            
        try:
            response = await self._execute_with_retry(call_api)
        except Exception as e:
            err_msg = str(e).lower()
            if "413" in err_msg or "too large" in err_msg or "context_length_exceeded" in err_msg or "rate limit" in err_msg:
                logger.warning(f"Groq rejected prompt due to limits ({str(e)}). Reducing budget by 20% and retrying...")
                reduced_budget = int(safety_budget * 0.8)
                retry_messages = list(messages)
                for step in range(7):
                    prompt_tokens_retry = TokenBudgetManager.estimate_messages_tokens(retry_messages)
                    if (prompt_tokens_retry + max_tokens) <= reduced_budget:
                        break
                    retry_messages = TokenBudgetManager.prune_messages(retry_messages, reduced_budget, step)
                
                async def call_api_retry():
                    return await self.client.chat.completions.create(
                        model=model,
                        messages=retry_messages,
                        temperature=temperature,
                        max_tokens=max_tokens,
                        stream=False,
                    )
                response = await self._execute_with_retry(call_api_retry)
            else:
                raise e

        elapsed = time.perf_counter() - start_time
        
        usage = getattr(response, "usage", None)
        prompt_tokens = usage.prompt_tokens if usage else 0
        completion_tokens = usage.completion_tokens if usage else 0
        total_tokens = usage.total_tokens if usage else 0
        
        log_metrics(
            feature=task_type or "chat",
            video_id=video_id or "N/A",
            model=model,
            cache_status="MISS",
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total_tokens,
            response_time=elapsed
        )
        return response.choices[0].message.content

    async def stream(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        task_type: Optional[str] = None,
        model_override: Optional[str] = None,
        video_id: Optional[str] = None,
    ) -> AsyncGenerator[str, None]:
        from app.llm.token_manager import TokenBudgetManager
        model = model_override or get_routed_model(task_type or "chat")
        total_prompt_char_len = sum(len(m.get("content", "")) for m in messages)
        if max_tokens is None or max_tokens == 1024:
            max_tokens = self._get_adaptive_max_tokens(task_type, total_prompt_char_len)
            
        start_time = time.perf_counter()

        # Guarded Execution: Token budget verification and pruning
        budget = settings.TOTAL_BUDGET_LIMIT
        safety_budget = int(budget * 0.75)
        
        prune_step = 0
        current_messages = list(messages)
        original_prompt_tokens = TokenBudgetManager.estimate_messages_tokens(current_messages)
        
        while prune_step <= 6:
            prompt_tokens = TokenBudgetManager.estimate_messages_tokens(current_messages)
            est_total = prompt_tokens + max_tokens
            if est_total <= safety_budget:
                break
            current_messages = TokenBudgetManager.prune_messages(current_messages, safety_budget, prune_step)
            prune_step += 1
            
        final_prompt_tokens = TokenBudgetManager.estimate_messages_tokens(current_messages)
        logger.info(
            f"\n--- Guarded LLM Stream ---\n"
            f"Feature: {task_type or 'chat'}\n"
            f"Original Prompt Tokens: {original_prompt_tokens}\n"
            f"Pruned: {'YES' if prune_step > 0 else 'NO'} (Step: {prune_step})\n"
            f"Final Prompt Tokens: {final_prompt_tokens}\n"
            f"Max Completion Tokens: {max_tokens}\n"
            f"Safety Budget Limit: {safety_budget}\n"
            f"-------------------------"
        )
        
        async def call_api():
            return await self.client.chat.completions.create(
                model=model,
                messages=current_messages,
                temperature=temperature,
                max_tokens=max_tokens,
                stream=True,
            )
            
        try:
            stream = await self._execute_with_retry(call_api)
        except Exception as e:
            err_msg = str(e).lower()
            if "413" in err_msg or "too large" in err_msg or "context_length_exceeded" in err_msg or "rate limit" in err_msg:
                logger.warning(f"Groq rejected prompt due to limits ({str(e)}). Reducing budget by 20% and retrying...")
                reduced_budget = int(safety_budget * 0.8)
                retry_messages = list(messages)
                for step in range(7):
                    prompt_tokens_retry = TokenBudgetManager.estimate_messages_tokens(retry_messages)
                    if (prompt_tokens_retry + max_tokens) <= reduced_budget:
                        break
                    retry_messages = TokenBudgetManager.prune_messages(retry_messages, reduced_budget, step)
                
                async def call_api_retry():
                    return await self.client.chat.completions.create(
                        model=model,
                        messages=retry_messages,
                        temperature=temperature,
                        max_tokens=max_tokens,
                        stream=True,
                    )
                stream = await self._execute_with_retry(call_api_retry)
            else:
                raise e
        
        prompt_tokens = 0
        completion_tokens = 0
        total_tokens = 0
        accumulated_answer = ""
        
        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                content = chunk.choices[0].delta.content
                accumulated_answer += content
                yield content
            
            usage = getattr(chunk, "usage", None)
            if usage:
                prompt_tokens = usage.prompt_tokens
                completion_tokens = usage.completion_tokens
                total_tokens = usage.total_tokens
                
        if total_tokens == 0:
            prompt_tokens = final_prompt_tokens
            completion_tokens = int(len(accumulated_answer) / 4)
            total_tokens = prompt_tokens + completion_tokens
            
        elapsed = time.perf_counter() - start_time
        
        log_metrics(
            feature=task_type or "chat",
            video_id=video_id or "N/A",
            model=model,
            cache_status="MISS",
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total_tokens,
            response_time=elapsed
        )

    # Backwards compatibility methods
    async def complete(self, *args, **kwargs) -> str:
        return await self.generate(*args, **kwargs)

    async def stream_complete(self, *args, **kwargs) -> AsyncGenerator[str, None]:
        async for chunk in self.stream(*args, **kwargs):
            yield chunk

    async def stream_generate(self, *args, **kwargs) -> AsyncGenerator[str, None]:
        async for chunk in self.stream(*args, **kwargs):
            yield chunk

    # Unified generation methods per feature
    async def generate_summary(
        self,
        video_id: str,
        transcript: str,
        summary_type: str,
        temperature: float = 0.5,
        language: str = "en",
    ) -> str:
        if summary_type == "short":
            prompt = SUMMARY_SHORT_PROMPT.format(transcript=transcript)
            max_tokens = 250
        elif summary_type == "detailed":
            prompt = SUMMARY_DETAILED_PROMPT.format(transcript=transcript)
            max_tokens = 500
        else:
            prompt = SUMMARY_BULLET_PROMPT.format(transcript=transcript)
            max_tokens = 500

        lang_mapping = {
            "en": "English", "hi": "Hindi", "mr": "Marathi", "es": "Spanish",
            "fr": "French", "de": "German", "ja": "Japanese", "ko": "Korean",
            "zh": "Chinese"
        }
        lang_name = lang_mapping.get(language.lower(), language)
        messages = [
            {"role": "system", "content": f"You MUST write your entire summary response in {lang_name}."},
            {"role": "user", "content": prompt}
        ]
        return await self.generate(
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            task_type="summary",
            video_id=video_id,
        )

    async def generate_notes(
        self,
        video_id: str,
        transcript: str,
        temperature: float = 0.5,
        language: str = "en",
    ) -> str:
        prompt = STUDY_NOTES_PROMPT.format(transcript=transcript)
        lang_mapping = {
            "en": "English", "hi": "Hindi", "mr": "Marathi", "es": "Spanish",
            "fr": "French", "de": "German", "ja": "Japanese", "ko": "Korean",
            "zh": "Chinese"
        }
        lang_name = lang_mapping.get(language.lower(), language)
        messages = [
            {"role": "system", "content": f"You MUST write your entire study notes response in {lang_name}."},
            {"role": "user", "content": prompt}
        ]
        return await self.generate(
            messages=messages,
            temperature=temperature,
            max_tokens=450,
            task_type="study_notes",
            video_id=video_id,
        )

    async def generate_takeaways(
        self,
        video_id: str,
        transcript: str,
        temperature: float = 0.5,
        language: str = "en",
    ) -> str:
        prompt = KEY_TAKEAWAYS_PROMPT.format(transcript=transcript)
        lang_mapping = {
            "en": "English", "hi": "Hindi", "mr": "Marathi", "es": "Spanish",
            "fr": "French", "de": "German", "ja": "Japanese", "ko": "Korean",
            "zh": "Chinese"
        }
        lang_name = lang_mapping.get(language.lower(), language)
        messages = [
            {"role": "system", "content": f"You MUST write your entire key takeaways response in {lang_name}."},
            {"role": "user", "content": prompt}
        ]
        return await self.generate(
            messages=messages,
            temperature=temperature,
            max_tokens=250,
            task_type="takeaways",
            video_id=video_id,
        )


# Alias for backward compatibility
GroqClient = LLMClient
