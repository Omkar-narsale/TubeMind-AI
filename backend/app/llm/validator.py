import logging
from typing import List, Dict, Optional, Tuple
from app.core.config import settings
from app.llm.token_manager import TokenBudgetManager

logger = logging.getLogger("app.llm.validator")

class PipelineValidator:
    """
    Validates LLM execution parameters and prompt budgets before calling Groq.
    """
    @staticmethod
    def validate(
        video_id: str,
        feature: str,
        language: str,
        messages: List[Dict[str, str]],
        max_tokens: int,
        model: str,
        cache_key: Optional[Tuple[str, str, str, str]] = None
    ) -> Optional[str]:
        """
        Validates pipeline parameters. Returns error message if invalid, else None.
        """
        if not language or language == "auto":
            language = getattr(settings, "DEFAULT_OUTPUT_LANGUAGE", "en") or "en"
        
        if not video_id:
            return "Video ID is missing."
            
        if not messages:
            return "Prompt messages list is empty."
            
        prompt_content = "".join(m.get("content", "") for m in messages).strip()
        if not prompt_content:
            return "Prompt content is empty."
            
        # Verify that context/transcript content exists if we are summarizing or doing retrieval
        if feature in ["summary", "study_notes", "takeaways"]:
            # Check if there is any actual transcript or context data inside the prompt
            has_context = False
            for m in messages:
                content = m.get("content", "").lower()
                if "transcript" in content or "context" in content or len(content) > 100:
                    has_context = True
                    break
            if not has_context:
                return "Transcript context is missing for learning feature."

        # Fit within configured token budget check
        prompt_tokens = TokenBudgetManager.estimate_messages_tokens(messages)
        est_total = prompt_tokens + max_tokens
        if est_total > settings.TOTAL_BUDGET_LIMIT:
            return f"Prompt size ({est_total} tokens) exceeds configured budget limit of {settings.TOTAL_BUDGET_LIMIT}."

        if not model:
            return "Model is not configured."
            
        if cache_key:
            # key structure: (video_id, feature, model, language)
            if len(cache_key) != 4 or not all(isinstance(x, str) for x in cache_key):
                return "Cache key format is invalid."

        return None
