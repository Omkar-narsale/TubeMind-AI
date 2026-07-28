import time
import logging
from typing import List, Optional
from app.transcript.service import TranscriptService
from app.learning.models import SummaryType
from app.llm.cache import LLMCache
from app.llm.token_manager import TokenBudgetManager
from app.learning.prompts import QUIZ_PROMPT, FLASHCARDS_PROMPT, INTERVIEW_PROMPT
from app.llm.prompts import STUDY_NOTES_PROMPT, KEY_TAKEAWAYS_PROMPT
from app.llm.executor import unified_executor
from app.core.config import settings

logger = logging.getLogger("app.learning.service")

class LearningService:
    def __init__(
        self,
        transcript_service: TranscriptService = None,
    ):
        self.transcript_service = transcript_service or TranscriptService()

    def _get_combined_transcript(self, video_id: str, language: str) -> str:
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

    async def generate_summary(self, video_id: str, summary_type: SummaryType, language: Optional[str] = "auto") -> str:
        # Resolve output language preferences and maintain session
        if language and language != "auto":
            LLMCache.set_video_language_preference(video_id, language)
        else:
            language = LLMCache.get_video_language_preference(video_id) or "auto"
            
        target_lang = language
        
        # 1. Fetch transcript metadata
        transcript_data = self.transcript_service.get_transcript(video_id, target_language=target_lang)
        actual_lang = transcript_data.get("language", "en")

        # 2. Check Cache
        cached_result = LLMCache.get_summary(video_id, summary_type.value, actual_lang, target_lang)
        if cached_result:
            return cached_result
            
        # 3. Canonical pipeline summary generation: generate short, bullet, and detailed in one LLM call
        async def run_generation():
            raw_text = self._get_combined_transcript(video_id, actual_lang)
            optimized_context = await self._get_optimized_summary_context(video_id, raw_text, actual_lang)
            
            lang_mapping = {
                "en": "English", "hi": "Hindi", "mr": "Marathi", "es": "Spanish",
                "fr": "French", "de": "German", "ja": "Japanese", "ko": "Korean",
                "zh": "Chinese", "ta": "Tamil", "te": "Telugu", "kn": "Kannada",
                "gu": "Gujarati", "pa": "Punjabi"
            }
            lang_name = lang_mapping.get(target_lang.lower(), target_lang)
            
            prompt = (
                f"Please generate a comprehensive, structured summary of the following transcript in {lang_name}.\n"
                f"The response must contain exactly three sections clearly labeled as follows:\n\n"
                f"---SHORT---\n"
                f"[Provide a brief 2-3 sentence overview of the video]\n\n"
                f"---BULLET---\n"
                f"[Provide a bulleted list of the main takeaways and key points]\n\n"
                f"---DETAILED---\n"
                f"[Provide a detailed concept-by-concept analysis and explanation]\n\n"
                f"Transcript:\n{optimized_context}"
            )
            
            messages = [
                {"role": "system", "content": f"You are a precise technical summarizer. You MUST write your entire response, including all section headers and bullet points, directly in {lang_name}."},
                {"role": "user", "content": prompt}
            ]
            
            # Execute exactly one LLM call
            res = await unified_executor.execute(
                video_id=video_id,
                feature="summary",
                transcript_language=actual_lang,
                output_language=target_lang,
                messages=messages,
                max_tokens=1000
            )
            
            # Parse sections
            short_summary = ""
            bullet_summary = ""
            detailed_summary = ""
            
            if "---SHORT---" in res and "---BULLET---" in res and "---DETAILED---" in res:
                parts = res.split("---")
                for p in parts:
                    p_clean = p.strip()
                    if p_clean.startswith("SHORT"):
                        short_summary = p_clean.replace("SHORT", "", 1).strip()
                    elif p_clean.startswith("BULLET"):
                        bullet_summary = p_clean.replace("BULLET", "", 1).strip()
                    elif p_clean.startswith("DETAILED"):
                        detailed_summary = p_clean.replace("DETAILED", "", 1).strip()
            else:
                # Fallback if parser fails
                short_summary = res[:250]
                bullet_summary = res
                detailed_summary = res
                
            # Set cache for all three formats
            LLMCache.set_summary(video_id, "short", short_summary, actual_lang, target_lang)
            LLMCache.set_summary(video_id, "bullet", bullet_summary, actual_lang, target_lang)
            LLMCache.set_summary(video_id, "detailed", detailed_summary, actual_lang, target_lang)
            
            # Return the requested type
            if summary_type == SummaryType.SHORT:
                return short_summary
            elif summary_type == SummaryType.BULLET:
                return bullet_summary
            else:
                return detailed_summary

        return await run_generation()

    async def generate_study_notes(self, video_id: str, language: Optional[str] = "auto") -> str:
        if language and language != "auto":
            LLMCache.set_video_language_preference(video_id, language)
        else:
            language = LLMCache.get_video_language_preference(video_id) or "auto"
            
        target_lang = language
        transcript_data = self.transcript_service.get_transcript(video_id, target_language=target_lang)
        actual_lang = transcript_data.get("language", "en")

        cached_result = LLMCache.get_notes(video_id, actual_lang, target_lang)
        if cached_result:
            return cached_result

        # Prefer canonical summary, fallback to compressed transcript if richer detail required
        summary = LLMCache.get_summary(video_id, "detailed", actual_lang, target_lang)
        if not summary:
            summary = await self.generate_summary(video_id, SummaryType.DETAILED, language=target_lang)
            
        lang_mapping = {
            "en": "English", "hi": "Hindi", "mr": "Marathi", "es": "Spanish",
            "fr": "French", "de": "German", "ja": "Japanese", "ko": "Korean",
            "zh": "Chinese", "ta": "Tamil", "te": "Telugu", "kn": "Kannada",
            "gu": "Gujarati", "pa": "Punjabi"
        }
        lang_name = lang_mapping.get(target_lang.lower(), target_lang)
        
        prompt = STUDY_NOTES_PROMPT.format(transcript=summary)
        messages = [
            {"role": "system", "content": f"You are an educational assistant. You MUST write your entire response, including all explanations and titles, directly in {lang_name}."},
            {"role": "user", "content": prompt}
        ]
        
        res = await unified_executor.execute(
            video_id=video_id,
            feature="study_notes",
            transcript_language=actual_lang,
            output_language=target_lang,
            messages=messages,
            max_tokens=450
        )
        return res

    async def generate_takeaways(self, video_id: str, language: Optional[str] = "auto") -> str:
        if language and language != "auto":
            LLMCache.set_video_language_preference(video_id, language)
        else:
            language = LLMCache.get_video_language_preference(video_id) or "auto"
            
        target_lang = language
        transcript_data = self.transcript_service.get_transcript(video_id, target_language=target_lang)
        actual_lang = transcript_data.get("language", "en")

        cached_result = LLMCache.get_takeaways(video_id, actual_lang, target_lang)
        if cached_result:
            return cached_result

        # Prefer canonical notes/summary, fallback to transcript
        notes = LLMCache.get_notes(video_id, actual_lang, target_lang)
        if not notes:
            notes = LLMCache.get_summary(video_id, "detailed", actual_lang, target_lang)
        if not notes:
            notes = await self.generate_summary(video_id, SummaryType.DETAILED, language=target_lang)

        lang_mapping = {
            "en": "English", "hi": "Hindi", "mr": "Marathi", "es": "Spanish",
            "fr": "French", "de": "German", "ja": "Japanese", "ko": "Korean",
            "zh": "Chinese", "ta": "Tamil", "te": "Telugu", "kn": "Kannada",
            "gu": "Gujarati", "pa": "Punjabi"
        }
        lang_name = lang_mapping.get(target_lang.lower(), target_lang)
        
        prompt = KEY_TAKEAWAYS_PROMPT.format(transcript=notes)
        messages = [
            {"role": "system", "content": f"You are an educational assistant. You MUST write your entire response directly in {lang_name}."},
            {"role": "user", "content": prompt}
        ]
        
        res = await unified_executor.execute(
            video_id=video_id,
            feature="takeaways",
            transcript_language=actual_lang,
            output_language=target_lang,
            messages=messages,
            max_tokens=250
        )
        return res

    async def generate_quiz(self, video_id: str, language: Optional[str] = "auto") -> str:
        if language and language != "auto":
            LLMCache.set_video_language_preference(video_id, language)
        else:
            language = LLMCache.get_video_language_preference(video_id) or "auto"
            
        target_lang = language
        transcript_data = self.transcript_service.get_transcript(video_id, target_language=target_lang)
        actual_lang = transcript_data.get("language", "en")

        cached_result = LLMCache.get_quiz(video_id, actual_lang, target_lang)
        if cached_result:
            return cached_result

        # Prefer summary/takeaways
        takeaways = LLMCache.get_takeaways(video_id, actual_lang, target_lang)
        if not takeaways:
            takeaways = await self.generate_takeaways(video_id, language=target_lang)

        lang_mapping = {
            "en": "English", "hi": "Hindi", "mr": "Marathi", "es": "Spanish",
            "fr": "French", "de": "German", "ja": "Japanese", "ko": "Korean",
            "zh": "Chinese", "ta": "Tamil", "te": "Telugu", "kn": "Kannada",
            "gu": "Gujarati", "pa": "Punjabi"
        }
        lang_name = lang_mapping.get(target_lang.lower(), target_lang)
        
        prompt = QUIZ_PROMPT.format(context=takeaways)
        messages = [
            {"role": "system", "content": f"You are an educational quiz assistant. You MUST write your entire response, including all questions, options, headings, and explanations, directly in {lang_name}."},
            {"role": "user", "content": prompt}
        ]
        
        res = await unified_executor.execute(
            video_id=video_id,
            feature="quiz",
            transcript_language=actual_lang,
            output_language=target_lang,
            messages=messages,
            max_tokens=400
        )
        return res

    async def generate_flashcards(self, video_id: str, language: Optional[str] = "auto") -> str:
        if language and language != "auto":
            LLMCache.set_video_language_preference(video_id, language)
        else:
            language = LLMCache.get_video_language_preference(video_id) or "auto"
            
        target_lang = language
        transcript_data = self.transcript_service.get_transcript(video_id, target_language=target_lang)
        actual_lang = transcript_data.get("language", "en")

        cached_result = LLMCache.get_flashcards(video_id, actual_lang, target_lang)
        if cached_result:
            return cached_result

        # Prefer quiz/summary
        quiz = LLMCache.get_quiz(video_id, actual_lang, target_lang)
        if not quiz:
            quiz = await self.generate_quiz(video_id, language=target_lang)

        lang_mapping = {
            "en": "English", "hi": "Hindi", "mr": "Marathi", "es": "Spanish",
            "fr": "French", "de": "German", "ja": "Japanese", "ko": "Korean",
            "zh": "Chinese", "ta": "Tamil", "te": "Telugu", "kn": "Kannada",
            "gu": "Gujarati", "pa": "Punjabi"
        }
        lang_name = lang_mapping.get(target_lang.lower(), target_lang)
        
        prompt = FLASHCARDS_PROMPT.format(context=quiz)
        messages = [
            {"role": "system", "content": f"You are an educational assistant generating flashcards. You MUST write your entire response, including all terms, questions, answers, and explanations, directly in {lang_name}."},
            {"role": "user", "content": prompt}
        ]
        
        res = await unified_executor.execute(
            video_id=video_id,
            feature="flashcard",
            transcript_language=actual_lang,
            output_language=target_lang,
            messages=messages,
            max_tokens=400
        )
        return res

    async def generate_interview_questions(self, video_id: str, language: Optional[str] = "auto") -> str:
        if language and language != "auto":
            LLMCache.set_video_language_preference(video_id, language)
        else:
            language = LLMCache.get_video_language_preference(video_id) or "auto"
            
        target_lang = language
        transcript_data = self.transcript_service.get_transcript(video_id, target_language=target_lang)
        actual_lang = transcript_data.get("language", "en")

        cached_result = LLMCache.get_interview(video_id, actual_lang, target_lang)
        if cached_result:
            return cached_result

        # Prefer takeaways/notes/summary
        takeaways = LLMCache.get_takeaways(video_id, actual_lang, target_lang)
        if not takeaways:
            takeaways = await self.generate_takeaways(video_id, language=target_lang)

        lang_mapping = {
            "en": "English", "hi": "Hindi", "mr": "Marathi", "es": "Spanish",
            "fr": "French", "de": "German", "ja": "Japanese", "ko": "Korean",
            "zh": "Chinese", "ta": "Tamil", "te": "Telugu", "kn": "Kannada",
            "gu": "Gujarati", "pa": "Punjabi"
        }
        lang_name = lang_mapping.get(target_lang.lower(), target_lang)
        
        prompt = INTERVIEW_PROMPT.format(context=takeaways)
        messages = [
            {"role": "system", "content": f"You are a technical interview preparation assistant. You MUST write your entire response, including all questions, sample answers, and guidelines, directly in {lang_name}."},
            {"role": "user", "content": prompt}
        ]
        
        res = await unified_executor.execute(
            video_id=video_id,
            feature="interview",
            transcript_language=actual_lang,
            output_language=target_lang,
            messages=messages,
            max_tokens=400
        )
        return res
