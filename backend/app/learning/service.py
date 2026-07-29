import time
import logging
from typing import List, Optional
from app.transcript.service import TranscriptService
from app.learning.models import SummaryType
from app.llm.cache import LLMCache
from app.llm.token_manager import TokenBudgetManager
from app.learning.prompts import INTERVIEW_PROMPT
from app.llm.prompts import STUDY_NOTES_PROMPT, KEY_TAKEAWAYS_PROMPT
from app.llm.executor import unified_executor
from app.core.config import settings

logger = logging.getLogger("app.learning.service")

LANG_NAME_MAP = {
    "auto": "English",
    "en": "English",
    "hi": "Hindi",
    "mr": "Marathi",
    "ta": "Tamil",
    "te": "Telugu",
    "kn": "Kannada",
    "gu": "Gujarati",
    "pa": "Punjabi",
    "es": "Spanish",
    "fr": "French",
    "de": "German",
    "ja": "Japanese",
    "ko": "Korean",
    "zh": "Chinese",
}


class LearningService:
    def __init__(
        self,
        transcript_service: TranscriptService = None,
    ):
        self.transcript_service = transcript_service or TranscriptService()

    def _get_combined_transcript(self, video_id: str, language: str = "auto") -> str:
        """Fetches the transcript and returns a joined text string."""
        transcript_data = self.transcript_service.get_transcript(video_id, target_language=language)
        segments = transcript_data.get("segments", [])
        return " ".join([s["text"] for s in segments])

    async def _get_optimized_summary_context(self, video_id: str, transcript_text: str, language: str) -> str:
        """
        Cleaner -> Compression -> Chunk Merge -> Important Sections Extraction -> Optimized Prompt -> Groq.
        Guarantees prompt never exceeds the configured token budget.
        """
        from app.transcript.compress import compress_transcript
        compressed = compress_transcript(transcript_text)
        
        estimated_tokens = TokenBudgetManager.estimate_tokens(compressed)
        max_context_tokens = settings.SUMMARY_CONTEXT_LIMIT
        
        if estimated_tokens <= max_context_tokens:
            return compressed
            
        logger.warning(f"Compressed transcript ({estimated_tokens} tokens) exceeds context budget of {max_context_tokens}. Chunking.")
        
        words = compressed.split()
        chunk_size = 4000
        sections = [words[i:i+chunk_size] for i in range(0, len(words), chunk_size)]
        
        extracted_sections = []
        for idx, sec_words in enumerate(sections):
            sec_text = " ".join(sec_words)
            prompt = (
                "Extract the most important, informative educational content, concepts, definitions, and technical details from this transcript section. "
                "Omit any fluff, repetition, greetings, or conversational filler. Keep it structured and concise.\n\n"
                f"Transcript Section:\n{sec_text}\n\n"
                "Key Educational Content:"
            )
            messages = [
                {"role": "system", "content": "You are a precise technical summarizer."},
                {"role": "user", "content": prompt}
            ]
            try:
                extracted = await unified_executor.execute(
                    video_id=video_id,
                    feature="summary_extraction",
                    transcript_language=language,
                    output_language=language,
                    messages=messages,
                    max_tokens=1000
                )
                extracted_sections.append(extracted.strip())
            except Exception as e:
                logger.error(f"Failed to extract sections: {str(e)}")
                extracted_sections.append(sec_text[:2000])
                
        merged = "\n\n".join(extracted_sections)
        return TokenBudgetManager.compress_prompt_context(merged, max_context_tokens)

    async def _translate_if_needed(self, video_id: str, text: str, target_language: Optional[str]) -> str:
        """
        Translates text to the target language as a final post-generation step.
        Falls back safely to original text on any failure without crashing with HTTP 500.
        """
        if not text or not target_language:
            return text
        target = target_language.lower().strip()
        if target in ["auto", "en", "english"]:
            return text

        lang_name = LANG_NAME_MAP.get(target, target.capitalize())

        # Check Cache
        cache_key_hash = str(abs(hash(text[:100])))
        cached_trans = LLMCache.get(video_id, f"translation_{cache_key_hash}", settings.SUMMARY_MODEL, target)
        if cached_trans:
            return cached_trans

        prompt = (
            f"Translate the following educational content accurately into {lang_name}.\n"
            f"Maintain all Markdown structure, headers, lists, bullet points, and checkmarks intact.\n\n"
            f"Content:\n{text}\n\n"
            f"Translation in {lang_name}:"
        )
        messages = [
            {"role": "system", "content": f"You are a professional translator into {lang_name}."},
            {"role": "user", "content": prompt}
        ]

        try:
            translated = await unified_executor.execute(
                video_id=video_id,
                feature="translation",
                transcript_language="en",
                output_language=target,
                messages=messages,
                max_tokens=1500
            )
            if translated and translated.strip():
                result = translated.strip()
                LLMCache.set(video_id, f"translation_{cache_key_hash}", settings.SUMMARY_MODEL, target, result)
                return result
        except Exception as e:
            logger.error(f"Translation layer error for target language '{target_language}': {e}. Returning original content safely.")

        return text

    async def _get_or_create_detailed_summary(self, video_id: str) -> str:
        """
        Single Source of Truth: Generates the Detailed Summary exactly ONCE per video from transcript,
        parses short/bullet/detailed sections, and caches them in LLMCache.
        """
        cached_detailed = LLMCache.get_summary(video_id, "detailed", "en", "en")
        if cached_detailed:
            return cached_detailed

        # 1. Fetch transcript in native/English
        transcript_data = self.transcript_service.get_transcript(video_id, target_language="auto")
        actual_lang = transcript_data.get("language", "en")
        raw_text = self._get_combined_transcript(video_id, "auto")

        # 2. Compress context
        optimized_context = await self._get_optimized_summary_context(video_id, raw_text, actual_lang)

        prompt = (
            "Please generate a comprehensive, structured summary of the following transcript in English.\n"
            "The response must contain exactly three sections clearly labeled as follows:\n\n"
            "---SHORT---\n"
            "[Provide a brief 2-3 sentence overview of the video]\n\n"
            "---BULLET---\n"
            "[Provide a bulleted list of the main takeaways and key points]\n\n"
            "---DETAILED---\n"
            "[Provide a detailed concept-by-concept analysis and explanation]\n\n"
            f"Transcript:\n{optimized_context}"
        )

        messages = [
            {"role": "system", "content": "You are a precise technical summarizer. You MUST write your entire response in English using the exact section headers specified."},
            {"role": "user", "content": prompt}
        ]

        res = await unified_executor.execute(
            video_id=video_id,
            feature="summary",
            transcript_language=actual_lang,
            output_language="en",
            messages=messages,
            max_tokens=1000
        )

        # Parse sections robustly
        short_summary = ""
        bullet_summary = ""
        detailed_summary = ""

        if "---SHORT---" in res or "---BULLET---" in res or "---DETAILED---" in res:
            parts = res.split("---")
            for p in parts:
                p_clean = p.strip()
                if p_clean.upper().startswith("SHORT"):
                    short_summary = p_clean[5:].strip().lstrip(":").strip()
                elif p_clean.upper().startswith("BULLET"):
                    bullet_summary = p_clean[6:].strip().lstrip(":").strip()
                elif p_clean.upper().startswith("DETAILED"):
                    detailed_summary = p_clean[8:].strip().lstrip(":").strip()

        if not detailed_summary:
            detailed_summary = res.strip()
        if not short_summary:
            short_summary = res[:300].strip()
        if not bullet_summary:
            bullet_summary = res.strip()

        LLMCache.set_summary(video_id, "short", short_summary, actual_lang, "en")
        LLMCache.set_summary(video_id, "bullet", bullet_summary, actual_lang, "en")
        LLMCache.set_summary(video_id, "detailed", detailed_summary, actual_lang, "en")

        return detailed_summary

    async def generate_summary(self, video_id: str, summary_type: SummaryType, language: Optional[str] = "auto") -> str:
        summary_type_str = summary_type.value if hasattr(summary_type, "value") else str(summary_type)
        target_lang = language or "auto"

        if target_lang and target_lang != "auto":
            LLMCache.set_video_language_preference(video_id, target_lang)

        detailed_summary = await self._get_or_create_detailed_summary(video_id)
        base_text = LLMCache.get_summary(video_id, summary_type_str, "en", "en") or detailed_summary

        return await self._translate_if_needed(video_id, base_text, target_lang)

    async def generate_study_notes(self, video_id: str, language: Optional[str] = "auto") -> str:
        target_lang = language or "auto"
        if target_lang and target_lang != "auto":
            LLMCache.set_video_language_preference(video_id, target_lang)

        cached_notes = LLMCache.get_notes(video_id, "en", target_lang)
        if cached_notes:
            return cached_notes

        detailed_summary = await self._get_or_create_detailed_summary(video_id)

        prompt = STUDY_NOTES_PROMPT.format(transcript=detailed_summary)
        messages = [
            {"role": "system", "content": "You are an educational assistant. Create study notes strictly based on the provided video summary."},
            {"role": "user", "content": prompt}
        ]

        res = await unified_executor.execute(
            video_id=video_id,
            feature="study_notes",
            transcript_language="en",
            output_language="en",
            messages=messages,
            max_tokens=600
        )

        final_notes = await self._translate_if_needed(video_id, res, target_lang)
        LLMCache.set_notes(video_id, "en", target_lang, final_notes)
        return final_notes

    async def generate_takeaways(self, video_id: str, language: Optional[str] = "auto") -> str:
        target_lang = language or "auto"
        if target_lang and target_lang != "auto":
            LLMCache.set_video_language_preference(video_id, target_lang)

        cached_takeaways = LLMCache.get_takeaways(video_id, "en", target_lang)
        if cached_takeaways:
            return cached_takeaways

        detailed_summary = await self._get_or_create_detailed_summary(video_id)

        prompt = KEY_TAKEAWAYS_PROMPT.format(transcript=detailed_summary)
        messages = [
            {"role": "system", "content": "You are an educational assistant. Extract key takeaways strictly based on the provided video summary."},
            {"role": "user", "content": prompt}
        ]

        res = await unified_executor.execute(
            video_id=video_id,
            feature="takeaways",
            transcript_language="en",
            output_language="en",
            messages=messages,
            max_tokens=400
        )

        final_takeaways = await self._translate_if_needed(video_id, res, target_lang)
        LLMCache.set_takeaways(video_id, "en", target_lang, final_takeaways)
        return final_takeaways

    async def generate_interview_questions(self, video_id: str, language: Optional[str] = "auto") -> str:
        target_lang = language or "auto"
        if target_lang and target_lang != "auto":
            LLMCache.set_video_language_preference(video_id, target_lang)

        cached_interview = LLMCache.get_interview(video_id, "en", target_lang)
        if cached_interview:
            return cached_interview

        detailed_summary = await self._get_or_create_detailed_summary(video_id)

        prompt = INTERVIEW_PROMPT.format(context=detailed_summary)
        messages = [
            {"role": "system", "content": "You are a technical interview preparation assistant. Generate questions strictly based on the provided video summary."},
            {"role": "user", "content": prompt}
        ]

        res = await unified_executor.execute(
            video_id=video_id,
            feature="interview",
            transcript_language="en",
            output_language="en",
            messages=messages,
            max_tokens=500
        )

        final_interview = await self._translate_if_needed(video_id, res, target_lang)
        LLMCache.set_interview(video_id, "en", target_lang, final_interview)
        return final_interview
