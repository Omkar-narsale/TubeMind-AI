import time
import logging
from typing import List, Dict, Optional, Tuple, AsyncGenerator
from fastapi import HTTPException

from app.core.config import settings
from app.llm.client import GroqClient
from app.llm.cache import LLMCache
from app.llm.coordinator import request_coordinator
from app.llm.token_manager import TokenBudgetManager
from app.llm.validator import PipelineValidator
from app.llm.router import get_routed_model

logger = logging.getLogger("app.llm.executor")

class UnifiedLLMExecutor:
    """
    Unified entrypoint for all LLM calls. Enforces request validation,
    token budgeting, caching, rate-limit retries, and logging.
    """
    def __init__(self):
        self.groq_client = GroqClient()

    async def execute(
        self,
        video_id: str,
        feature: str,
        transcript_language: str,
        output_language: str,
        messages: List[Dict[str, str]],
        max_tokens: int,
        temperature: float = 0.5,
        model_override: Optional[str] = None
    ) -> str:
        start_time = time.perf_counter()
        
        # 1. Resolve Output Language
        if not output_language or output_language == "auto":
            output_language = LLMCache.get_video_language_preference(video_id) or settings.DEFAULT_OUTPUT_LANGUAGE
            
        # 2. Resolve Model
        model = model_override or get_routed_model(feature)
        
        # 3. Check Cache
        compound_language = f"{transcript_language}:{output_language}"
        cached_val = LLMCache.get(video_id, feature, model, compound_language)
        if cached_val:
            elapsed_ms = int((time.perf_counter() - start_time) * 1000)
            self._log_trace(
                feature=feature,
                language=output_language,
                prompt_tokens=0,
                context_tokens=0,
                model=model,
                cache_status="HIT",
                llm_calls=0,
                elapsed_ms=elapsed_ms
            )
            return cached_val
            
        # 4. Request Coordination
        async def call_llm():
            # Token Budget Check & Pruning (enforced at safety margin limit)
            budget = settings.TOTAL_BUDGET_LIMIT
            safety_budget = int(budget * settings.SAFETY_MARGIN)
            
            prune_step = 0
            current_messages = list(messages)
            
            while prune_step <= 6:
                prompt_tokens = TokenBudgetManager.estimate_messages_tokens(current_messages)
                if (prompt_tokens + max_tokens) <= safety_budget:
                    break
                current_messages = TokenBudgetManager.prune_messages(current_messages, safety_budget, prune_step)
                prune_step += 1
                
            final_prompt_tokens = TokenBudgetManager.estimate_messages_tokens(current_messages)
            
            # 5. Pipeline Validation
            cache_key = (video_id, feature, model, compound_language)
            val_error = PipelineValidator.validate(
                video_id=video_id,
                feature=feature,
                language=output_language,
                messages=current_messages,
                max_tokens=max_tokens,
                model=model,
                cache_key=cache_key
            )
            if val_error:
                logger.error(f"Pipeline Validation Failed: {val_error}")
                raise HTTPException(status_code=400, detail=f"Pipeline validation error: {val_error}")
                
            # 6. Execute Groq call with retry and 429/413 handling
            try:
                res = await self.groq_client.generate(
                    messages=current_messages,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    task_type=feature,
                    model_override=model,
                    video_id=video_id
                )
            except Exception as e:
                err_msg = str(e).lower()
                if "429" in err_msg or "rate_limit" in err_msg or "quota" in err_msg:
                    raise HTTPException(
                        status_code=429,
                        detail="Daily quota reached. Please try again tomorrow."
                    )
                elif "413" in err_msg or "too large" in err_msg or "context_length_exceeded" in err_msg:
                    raise HTTPException(
                        status_code=413,
                        detail="Prompt is too large for the model's context window."
                    )
                else:
                    raise e
                    
            # 7. Cache output
            LLMCache.set(video_id, feature, model, compound_language, res)
            
            elapsed_ms = int((time.perf_counter() - start_time) * 1000)
            self._log_trace(
                feature=feature,
                language=output_language,
                prompt_tokens=final_prompt_tokens,
                context_tokens=final_prompt_tokens,
                model=model,
                cache_status="MISS",
                llm_calls=1,
                elapsed_ms=elapsed_ms
            )
            return res

        coord_key = f"{video_id}:{feature}:{output_language}"
        return await request_coordinator.execute_coordinated(coord_key, call_llm)

    async def execute_stream(
        self,
        video_id: str,
        feature: str,
        transcript_language: str,
        output_language: str,
        messages: List[Dict[str, str]],
        max_tokens: int,
        temperature: float = 0.7,
        model_override: Optional[str] = None
    ) -> AsyncGenerator[str, None]:
        start_time = time.perf_counter()
        
        # 1. Resolve Output Language
        if not output_language or output_language == "auto":
            output_language = LLMCache.get_video_language_preference(video_id) or settings.DEFAULT_OUTPUT_LANGUAGE
            
        # 2. Resolve Model
        model = model_override or get_routed_model(feature)
        
        # Token Budget Check & Pruning (enforced at safety margin limit)
        budget = settings.TOTAL_BUDGET_LIMIT
        safety_budget = int(budget * settings.SAFETY_MARGIN)
        
        prune_step = 0
        current_messages = list(messages)
        
        while prune_step <= 6:
            prompt_tokens = TokenBudgetManager.estimate_messages_tokens(current_messages)
            if (prompt_tokens + max_tokens) <= safety_budget:
                break
            current_messages = TokenBudgetManager.prune_messages(current_messages, safety_budget, prune_step)
            prune_step += 1
            
        final_prompt_tokens = TokenBudgetManager.estimate_messages_tokens(current_messages)
        
        # 5. Pipeline Validation
        val_error = PipelineValidator.validate(
            video_id=video_id,
            feature=feature,
            language=output_language,
            messages=current_messages,
            max_tokens=max_tokens,
            model=model,
            cache_key=None
        )
        if val_error:
            logger.error(f"Pipeline Validation Failed (Stream): {val_error}")
            raise HTTPException(status_code=400, detail=f"Pipeline validation error: {val_error}")
            
        # 6. Execute Groq call with retry and 429/413 handling
        try:
            async for chunk in self.groq_client.stream(
                messages=current_messages,
                temperature=temperature,
                max_tokens=max_tokens,
                task_type=feature,
                model_override=model,
                video_id=video_id
            ):
                yield chunk
        except Exception as e:
            err_msg = str(e).lower()
            if "429" in err_msg or "rate_limit" in err_msg or "quota" in err_msg:
                raise HTTPException(
                    status_code=429,
                    detail="Daily quota reached. Please try again tomorrow."
                )
            elif "413" in err_msg or "too large" in err_msg or "context_length_exceeded" in err_msg:
                raise HTTPException(
                    status_code=413,
                    detail="Prompt is too large for the model's context window."
                )
            else:
                raise e
                
        elapsed_ms = int((time.perf_counter() - start_time) * 1000)
        self._log_trace(
            feature=feature,
            language=output_language,
            prompt_tokens=final_prompt_tokens,
            context_tokens=final_prompt_tokens,
            model=model,
            cache_status="MISS",
            llm_calls=1,
            elapsed_ms=elapsed_ms
        )

    def _log_trace(
        self,
        feature: str,
        language: str,
        prompt_tokens: int,
        context_tokens: int,
        model: str,
        cache_status: str,
        llm_calls: int,
        elapsed_ms: int
    ):
        logger.info(
            f"\n--- Feature Trace ---\n"
            f"Feature: {feature}\n"
            f"Language: {language}\n"
            f"Prompt Tokens: {prompt_tokens}\n"
            f"Context Tokens: {context_tokens}\n"
            f"Model: {model}\n"
            f"Cache: {cache_status}\n"
            f"LLM Calls Made: {llm_calls}\n"
            f"Total Time: {elapsed_ms}ms\n"
            f"----------------------"
        )

# Global singleton
unified_executor = UnifiedLLMExecutor()
