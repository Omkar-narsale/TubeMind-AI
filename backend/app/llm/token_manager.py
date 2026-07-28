import logging
from typing import List, Dict, Any, Optional

logger = logging.getLogger("app.llm.token_manager")

class TokenBudgetManager:
    # Character heuristic: 1 token is roughly 4 characters
    CHAR_TO_TOKEN_RATIO = 4.0
    # Model limits mapping
    MODEL_LIMITS = {
        "llama-3.3-70b-versatile": 12000, # Groq limit specified in request is 12000
        "llama-3.1-8b-instant": 12000,
        "default": 12000
    }
    
    @classmethod
    def estimate_tokens(cls, text: str) -> int:
        if not text:
            return 0
        return int(len(text) / cls.CHAR_TO_TOKEN_RATIO)

    @classmethod
    def estimate_messages_tokens(cls, messages: List[Dict[str, str]]) -> int:
        total = 0
        for m in messages:
            content = m.get("content", "")
            total += cls.estimate_tokens(content)
        total += len(messages) * 4  # framing buffer
        return total

    @classmethod
    def compress_prompt_context(cls, text: str, budget: int) -> str:
        """Compresses/truncates transcript context to fit inside a specific token budget."""
        estimated = cls.estimate_tokens(text)
        if estimated <= budget:
            return text
            
        target_char_len = int(budget * cls.CHAR_TO_TOKEN_RATIO)
        logger.warning(f"Content of {estimated} tokens exceeds budget of {budget}. Compressing/Truncating.")
        
        truncated = text[:target_char_len]
        last_period = truncated.rfind(".")
        if last_period > 0:
            truncated = truncated[:last_period + 1]
        return truncated

    @classmethod
    def adjust_max_completion_tokens(cls, prompt_tokens: int, model_name: str, requested_max: int = 512) -> int:
        """
        Dynamically adjusts max_tokens for completions to prevent the total prompt + completion
        from exceeding the model's absolute limit.
        """
        limit = cls.MODEL_LIMITS.get(model_name, cls.MODEL_LIMITS["default"])
        available = limit - prompt_tokens
        
        if available <= 0:
            # We must truncate the prompt
            logger.error(f"Prompt tokens ({prompt_tokens}) exceed model limit ({limit})")
            return 10  # absolute minimal completion fallback
            
        adjusted = min(requested_max, available)
        if adjusted < requested_max:
            logger.warning(f"Dynamically adjusted max_tokens from {requested_max} to {adjusted} due to token budget constraint.")
        return adjusted

    @classmethod
    def log_token_metrics(cls, feature: str, model: str, prompt_tokens: int, completion_tokens: int) -> float:
        total = prompt_tokens + completion_tokens
        cost_per_million_prompt = 0.59  # typical Llama-3 70B cost pricing (or average estimate)
        cost_per_million_completion = 0.79
        if "8b" in model.lower():
            cost_per_million_prompt = 0.05
            cost_per_million_completion = 0.08
            
        estimated_cost = (prompt_tokens * cost_per_million_prompt + completion_tokens * cost_per_million_completion) / 1_000_000
        
        logger.info(
            f"[TOKEN METRICS] Feature: {feature} | Model: {model} | "
            f"Prompt Tokens: {prompt_tokens} | Completion Tokens: {completion_tokens} | "
            f"Total Tokens: {total} | Estimated Cost: ${estimated_cost:.6f}"
        )
        return estimated_cost

    @classmethod
    def log_prompt_preview(
        cls,
        feature: str,
        transcript_language: str,
        output_language: str,
        estimated_prompt_tokens: int,
        retrieved_chunks: int,
        history_messages: int,
        max_tokens: int,
        budget: int
    ) -> None:
        within_budget = "YES" if (estimated_prompt_tokens + max_tokens) <= budget else "NO"
        logger.info(
            f"\n=== PROMPT PREVIEW ===\n"
            f"Feature: {feature}\n"
            f"Transcript Language: {transcript_language}\n"
            f"Output Language: {output_language}\n"
            f"Estimated Prompt Tokens: {estimated_prompt_tokens}\n"
            f"Retrieved Chunks: {retrieved_chunks}\n"
            f"History Messages: {history_messages}\n"
            f"Max Tokens: {max_tokens}\n"
            f"Within Budget: {within_budget}\n"
            f"======================"
        )

    @classmethod
    def prune_messages(
        cls, 
        messages: List[Dict[str, str]], 
        budget: int, 
        step: int
    ) -> List[Dict[str, str]]:
        """
        Unified pruning of a messages payload based on step number:
        Step 0: Remove duplicate context lines.
        Step 1: Remove sponsor/outro/intro filler sentences from context/transcript blocks.
        Step 2: Rank/slice transcript context to top chunks.
        Step 3: Compress/truncate conversation history (remove older turns, keep only latest 2 turns).
        Step 4: Slice context further down.
        Step 5: Drop context completely.
        Step 6: Final fallback (clear history, retain only query).
        """
        # Make a deep copy of messages to prevent mutating original lists
        pruned_messages = [dict(m) for m in messages]
        
        # 1. Helper to find and extract transcript/context blocks
        context_idx = -1
        for idx, m in enumerate(pruned_messages):
            if "supplied transcript context" in m.get("content", "").lower():
                context_idx = idx
                break
                
        # If no explicit context message, search for user message containing large content (like in summary/notes)
        user_large_idx = -1
        if context_idx == -1:
            for idx, m in enumerate(pruned_messages):
                if m.get("role") == "user" and len(m.get("content", "")) > 1000:
                    user_large_idx = idx
                    break

        # Step 0: Remove duplicate lines in context/transcript
        if step >= 0:
            if context_idx != -1:
                content = pruned_messages[context_idx]["content"]
                lines = content.split("\n")
                seen = set()
                deduped_lines = []
                for line in lines:
                    if line.strip() not in seen:
                        seen.add(line.strip())
                        deduped_lines.append(line)
                pruned_messages[context_idx]["content"] = "\n".join(deduped_lines)
            elif user_large_idx != -1:
                content = pruned_messages[user_large_idx]["content"]
                lines = content.split("\n")
                seen = set()
                deduped_lines = []
                for line in lines:
                    if line.strip() not in seen:
                        seen.add(line.strip())
                        deduped_lines.append(line)
                pruned_messages[user_large_idx]["content"] = "\n".join(deduped_lines)

        # Step 1: Remove sponsor/intro/outro filler sentences
        if step >= 1:
            filler_keywords = ["sponsor", "subscribe", "patreon", "welcome back", "outro", "intro", "channel"]
            if context_idx != -1:
                content = pruned_messages[context_idx]["content"]
                lines = content.split("\n")
                filtered = [l for l in lines if not any(k in l.lower() for k in filler_keywords)]
                pruned_messages[context_idx]["content"] = "\n".join(filtered)
            elif user_large_idx != -1:
                content = pruned_messages[user_large_idx]["content"]
                lines = content.split("\n")
                filtered = [l for l in lines if not any(k in l.lower() for k in filler_keywords)]
                pruned_messages[user_large_idx]["content"] = "\n".join(filtered)

        # Step 2: Slice context blocks down (keep top chunks)
        if step >= 2:
            if context_idx != -1:
                content = pruned_messages[context_idx]["content"]
                header = "Supplied Transcript Context:\n\n"
                context_data = content.replace(header, "")
                blocks = context_data.split("\n\n")
                if len(blocks) > 3:
                    pruned_messages[context_idx]["content"] = header + "\n\n".join(blocks[:3])
            elif user_large_idx != -1:
                content = pruned_messages[user_large_idx]["content"]
                # For summary/notes, truncate content size by 30%
                pruned_messages[user_large_idx]["content"] = content[:int(len(content) * 0.7)]

        # Step 3: Compress/truncate conversation history (keep only last 2 history turns)
        if step >= 3:
            # History messages are user/assistant turns between system prompts and last query
            history_indices = []
            for idx, m in enumerate(pruned_messages):
                if idx > 0 and idx < len(pruned_messages) - 1:
                    if m.get("role") in ["user", "assistant"] and idx != user_large_idx:
                        history_indices.append(idx)
            if len(history_indices) > 2:
                # Remove older history messages (keep only the last 2 history turns)
                indices_to_remove = history_indices[:-2]
                pruned_messages = [m for idx, m in enumerate(pruned_messages) if idx not in indices_to_remove]
                # Re-calculate recursively
                return cls.prune_messages(pruned_messages, budget, step)

        # Step 4: Slice context further down
        if step >= 4:
            if context_idx != -1:
                content = pruned_messages[context_idx]["content"]
                header = "Supplied Transcript Context:\n\n"
                context_data = content.replace(header, "")
                blocks = context_data.split("\n\n")
                if len(blocks) > 1:
                    pruned_messages[context_idx]["content"] = header + "\n\n".join(blocks[:1])
            elif user_large_idx != -1:
                content = pruned_messages[user_large_idx]["content"]
                pruned_messages[user_large_idx]["content"] = content[:int(len(content) * 0.4)]

        # Step 5: Drop context completely
        if step >= 5:
            if context_idx != -1:
                pruned_messages[context_idx]["content"] = "Supplied Transcript Context:\n\n[Dropped due to token limits]"
            elif user_large_idx != -1:
                content = pruned_messages[user_large_idx]["content"]
                pruned_messages[user_large_idx]["content"] = content[:500]

        # Step 6: Final fallback - drop all history, drop all summaries
        if step >= 6:
            # Only keep system prompt and final query
            final_messages = []
            if len(pruned_messages) > 0:
                final_messages.append(pruned_messages[0])
            if len(pruned_messages) > 1:
                final_messages.append(pruned_messages[-1])
            pruned_messages = final_messages

        return pruned_messages
