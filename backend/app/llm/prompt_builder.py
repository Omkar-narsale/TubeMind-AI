from typing import List, Dict, Optional
from app.rag.models import RAGSearchResult
from app.llm.models import ChatMessage
from app.rag.vector_store import rag_vector_store
from app.llm.cache import LLMCache
import logging

logger = logging.getLogger("app.llm.prompt_builder")

def detect_language_from_text(text: str) -> Optional[str]:
    # Check for Devanagari (Hindi/Marathi)
    if any('\u0900' <= char <= '\u097F' for char in text):
        text_lower = text.lower()
        marathi_words = ["सांग", "महत्त्वाचे", "मुद्दे", "आहे", "आहेत", "करून", "येथे", "करा"]
        if any(w in text_lower for w in marathi_words):
            return "Marathi"
        return "Hindi"
    # Check for Japanese
    if any('\u3040' <= char <= '\u309F' or '\u30A0' <= char <= '\u30FF' or '\u4E00' <= char <= '\u9FFF' for char in text):
        if any('\u3040' <= char <= '\u309F' or '\u30A0' <= char <= '\u30FF' for char in text):
            return "Japanese"
    # Check for Korean
    if any('\uAC00' <= char <= '\uD7A3' for char in text):
        return "Korean"
    # Check for Chinese
    if any('\u4E00' <= char <= '\u9FFF' for char in text):
        return "Chinese"
    
    # Spanish, French, German stops
    words = text.lower().split()
    spanish_stops = {"el", "la", "los", "las", "un", "una", "y", "en", "para", "por", "que", "es", "este", "esta", "del"}
    french_stops = {"le", "la", "les", "un", "une", "des", "et", "en", "pour", "dans", "est", "cette", "du", "qui", "que"}
    german_stops = {"der", "die", "das", "ein", "eine", "und", "in", "für", "zu", "ist", "dieser", "diese", "von", "mit"}
    
    if any(w in spanish_stops for w in words):
        return "Spanish"
    if any(w in french_stops for w in words):
        return "French"
    if any(w in german_stops for w in words):
        return "German"
        
    return None


class PromptBuilder:
    SYSTEM_PROMPT = (
        "You are TubeMind AI, a YouTube learning assistant.\n"
        "Rules:\n"
        "1. Grounding: Prioritize transcript. Cite timestamps like [01:23] for video info. Do not invent timestamps.\n"
        "2. Missing Info/Transcript: If transcript is missing or doesn't answer the query, state it under '📹 Based on the Video'. Answer using general knowledge under '💡 Additional Explanation' and state it is general knowledge.\n"
        "3. Language: Match target/query language. Default: English.\n"
        "4. Format strictly:\n\n"
        "📹 Based on the Video\n"
        "[Answer from transcript, with citations]\n\n"
        "💡 Additional Explanation\n"
        "[General knowledge explanation/examples/analogies]\n\n"
        "📍 Source Citations\n"
        "[- [01:23]: brief context]"
    )

    @staticmethod
    def format_timestamp(seconds: float) -> str:
        h = int(seconds // 3600)
        m = int((seconds % 3600) // 60)
        s = int(seconds % 60)
        if h > 0:
            return f"{h:02d}:{m:02d}:{s:02d}"
        return f"{m:02d}:{s:02d}"

    def build_prompt_messages(
        self,
        query: str,
        retrieved_context: List[RAGSearchResult],
        history: List[ChatMessage],
        classification: Optional[str] = None,
        transcript_available: bool = True,
        video_id: Optional[str] = None,
        old_history_summary: Optional[str] = None,
        target_language: Optional[str] = "auto",
        raw_transcript: Optional[str] = None,
        timestamp_seconds: Optional[float] = None,
    ) -> List[Dict[str, str]]:
        messages = []
        
        # Language Memory & Detection Session Logic
        session_lang = None
        for msg in history:
            role_val = msg.role.value if hasattr(msg.role, "value") else msg.role
            if role_val == "user":
                detected = detect_language_from_text(msg.content)
                if detected:
                    session_lang = detected
                    
        if not session_lang:
            session_lang = detect_language_from_text(query)

        output_language = "English"
        if target_language and target_language != "auto":
            lang_mapping = {
                "en": "English", "hi": "Hindi", "mr": "Marathi", "es": "Spanish",
                "fr": "French", "de": "German", "ja": "Japanese", "ko": "Korean",
                "zh": "Chinese", "ta": "Tamil", "te": "Telugu", "kn": "Kannada",
                "gu": "Gujarati", "pa": "Punjabi"
            }
            output_language = lang_mapping.get(target_language.lower(), target_language)
        elif session_lang:
            output_language = session_lang

        # Inject target language rule to the system prompt
        custom_system_prompt = self.SYSTEM_PROMPT + (
            f"\n\nIMPORTANT: Respond in {output_language}. "
            f"Generate the response in the selected output language ({output_language}) while preserving the meaning and technical accuracy of the original content. "
            f"You MUST generate your entire response, including all headings and explanations, directly in {output_language} without separate translation."
        )

        # Proximity focus prompt injection
        if timestamp_seconds is not None:
            ts_badge = self.format_timestamp(timestamp_seconds)
            custom_system_prompt += (
                f"\n\n🎯 CURRENT SCENE FOCUS: The user is currently watching the video at timestamp [{ts_badge}]. "
                f"Prioritize explaining what is happening, taught, or shown at and around [{ts_badge}] in the video."
            )
        
        # 1. System Prompt
        messages.append({"role": "system", "content": custom_system_prompt})
        
        # 2. Retrieved context optimization
        if timestamp_seconds is not None and retrieved_context:
            context_text = self._build_semantic_context(retrieved_context, video_id)
        elif transcript_available and raw_transcript:
            from app.llm.token_manager import TokenBudgetManager
            est_tokens = TokenBudgetManager.estimate_tokens(raw_transcript)
            if est_tokens < 2500:
                # Short transcript: Send compressed transcript directly
                from app.transcript.compress import compress_transcript
                context_text = compress_transcript(raw_transcript)
                logger.info(f"Dynamic Context: Short transcript ({est_tokens} tokens). Sending compressed transcript.")
            elif est_tokens <= 8000:
                # Medium transcript: Send cached detailed summary or compressed transcript
                summary = (
                    LLMCache.get_summary(video_id, "detailed", output_language) or
                    LLMCache.get_summary(video_id, "short", output_language) or
                    LLMCache.get_summary(video_id, "bullet", output_language)
                )
                if summary:
                    context_text = f"Summary of the video:\n{summary}"
                else:
                    from app.transcript.compress import compress_transcript
                    context_text = compress_transcript(raw_transcript)
                logger.info(f"Dynamic Context: Medium transcript ({est_tokens} tokens). Sending summary/compressed chunks.")
            else:
                # Very large transcript: Use semantic chunk selection (retrieved context)
                logger.info(f"Dynamic Context: Large transcript ({est_tokens} tokens). Sending semantic chunks.")
                context_text = self._build_semantic_context(retrieved_context, video_id)
        elif transcript_available and retrieved_context:
            context_text = self._build_semantic_context(retrieved_context, video_id)
        else:
            context_text = (
                "No transcript context is available.\n"
                "Do not hallucinate video content. Answer using general knowledge under '💡 Additional Explanation'."
            )
        
        messages.append({
            "role": "system",
            "content": f"Supplied Transcript Context:\n\n{context_text}"
        })
        
        # 3. Conversation History
        if old_history_summary:
            messages.append({
                "role": "system",
                "content": f"Summary of earlier conversation: {old_history_summary}"
            })
            
        limited_history = history[-6:]
        for msg in limited_history:
            role_val = msg.role.value if hasattr(msg.role, "value") else msg.role
            messages.append({"role": role_val, "content": msg.content})
            
        # 4. User Question
        messages.append({"role": "user", "content": query})
        
        return messages

    def _build_semantic_context(self, retrieved_context: List[RAGSearchResult], video_id: Optional[str]) -> str:
        all_chunks = []
        if video_id and rag_vector_store.has_index(video_id):
            _, all_chunks = rag_vector_store.get_index(video_id)
            
        proximity_chunks = [c for c in retrieved_context if c.chunk_index < 0]
        regular_chunks = [c for c in retrieved_context if c.chunk_index >= 0]

        selected_indices = set()
        for chunk in regular_chunks:
            idx = chunk.chunk_index
            selected_indices.add(idx)
            if idx > 0:
                selected_indices.add(idx - 1)
            if all_chunks and idx < len(all_chunks) - 1:
                selected_indices.add(idx + 1)
                
        candidate_chunks = list(proximity_chunks)
        if all_chunks:
            for idx in sorted(selected_indices):
                if 0 <= idx < len(all_chunks):
                    c = all_chunks[idx]
                    candidate_chunks.append(RAGSearchResult(
                        score=1.0,
                        text=c.text,
                        start=c.start_time,
                        end=c.end_time,
                        chunk_index=c.chunk_index
                    ))
        else:
            candidate_chunks += sorted(regular_chunks, key=lambda x: x.chunk_index)
            
        merged_chunks = []
        for chunk in candidate_chunks:
            if not merged_chunks:
                merged_chunks.append(chunk)
            else:
                prev = merged_chunks[-1]
                if chunk.chunk_index == prev.chunk_index + 1:
                    prev.text = prev.text.strip() + " " + chunk.text.strip()
                    prev.end = chunk.end
                else:
                    merged_chunks.append(chunk)
                    
        for chunk in merged_chunks:
            sentences = chunk.text.split(". ")
            seen = []
            for s in sentences:
                s_clean = s.strip()
                if not s_clean:
                    continue
                if s_clean not in seen:
                    seen.append(s_clean)
            chunk.text = ". ".join(seen) + "." if seen else ""
            
        context_blocks = []
        word_count = 0
        max_words = 2200
        
        for chunk in merged_chunks:
            time_badge = self.format_timestamp(chunk.start)
            block_text = f"[Index: {chunk.chunk_index}] [{time_badge}] {chunk.text}"
            block_words = len(block_text.split())
            if word_count + block_words > max_words:
                break
            context_blocks.append(block_text)
            word_count += block_words
            
        return "\n\n".join(context_blocks)
