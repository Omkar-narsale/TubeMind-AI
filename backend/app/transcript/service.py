import logging
from typing import Dict, Any, List, Optional
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import (
    TranscriptsDisabled,
    NoTranscriptFound,
    VideoUnavailable,
    YouTubeRequestFailed,
    IpBlocked,
    InvalidVideoId,
)

from app.core.config import settings
from app.transcript.exceptions import (
    TranscriptDisabledError,
    NoCaptionsError,
    VideoUnavailableError,
    RateLimitError,
    InvalidVideoIdError,
    TranscriptError,
)
from app.transcript.parser import normalize_transcript
from app.transcript.cache import transcript_cache
from app.transcript.whisper import WhisperService

logger = logging.getLogger("app.transcript.service")


class TranscriptService:
    def __init__(self, cache=transcript_cache, whisper_service: Optional[WhisperService] = None):
        self.cache = cache
        self.whisper_service = whisper_service or WhisperService()

    def _attempt_whisper_fallback(self, video_id: str, target_lang: str) -> Optional[Dict[str, Any]]:
        """
        Attempts to transcribe video audio using Groq Whisper when YouTube captions are unavailable.
        """
        if not settings.ENABLE_WHISPER_FALLBACK:
            return None
        try:
            logger.info(f"Attempting Groq Whisper audio fallback for video: {video_id}")
            result = self.whisper_service.transcribe(video_id, target_language=target_lang)
            if result and result.get("segments"):
                self.cache.set(video_id, result, target_lang)
                return result
        except Exception as e:
            logger.warning(f"Groq Whisper fallback failed for {video_id}: {str(e)}")
        return None

    def get_transcript(self, video_id: str, target_language: Optional[str] = "auto") -> Dict[str, Any]:
        """
        Retrieves the transcript for a given video ID, preferring the target language.
        If the target language is not available, falls back to translation or any available captions.
        Checks in-memory cache first before querying YouTube API.
        """
        if not video_id or len(video_id) != 11:
            raise InvalidVideoIdError("Invalid YouTube Video ID length.")

        target_lang = target_language or "auto"

        # Check Cache
        cached_data = self.cache.get(video_id, target_lang)
        if cached_data:
            return cached_data

        try:
            # Instantiate YouTubeTranscriptApi to call instance methods
            api = YouTubeTranscriptApi()
            transcript_list = api.list(video_id)
            
            transcript_obj = None
            generated = False
            language_code = "en"

            manual_transcripts = []
            generated_transcripts = []
            
            # Check if transcript_list is iterable (some mocks in tests may not be iterable)
            is_iterable = True
            try:
                iter(transcript_list)
            except TypeError:
                is_iterable = False
                
            if not is_iterable:
                if target_lang != "auto":
                    try:
                        transcript_obj = transcript_list.find_manually_created_transcript([target_lang])
                        generated = False
                    except NoTranscriptFound:
                        try:
                            transcript_obj = transcript_list.find_generated_transcript([target_lang])
                            generated = True
                        except NoTranscriptFound:
                            # Try translating fallback
                            try:
                                best_t = transcript_list.find_manually_created_transcript(["en"])
                            except NoTranscriptFound:
                                try:
                                    best_t = transcript_list.find_generated_transcript(["en"])
                                except NoTranscriptFound:
                                    raise NoCaptionsError("No captions found to translate.")
                            transcript_obj = best_t.translate(target_lang)
                            generated = best_t.is_generated
                else:
                    try:
                        transcript_obj = transcript_list.find_manually_created_transcript(["en"])
                        generated = False
                        language_code = transcript_obj.language_code
                    except NoTranscriptFound:
                        try:
                            transcript_obj = transcript_list.find_generated_transcript(["en"])
                            generated = True
                            language_code = transcript_obj.language_code
                        except NoTranscriptFound:
                            raise NoCaptionsError("No captions found for this video.")
                language_code = transcript_obj.language_code
            else:
                for t in transcript_list:
                    is_gen = getattr(t, "is_generated", getattr(t, "generated", False))
                    if is_gen:
                        generated_transcripts.append(t)
                    else:
                        manual_transcripts.append(t)
                
                if target_lang != "auto":
                    # 1. Manual target language
                    tgt_manual = [t for t in manual_transcripts if t.language_code.startswith(target_lang)]
                    # 2. Generated target language
                    tgt_gen = [t for t in generated_transcripts if t.language_code.startswith(target_lang)]
                    
                    if tgt_manual:
                        transcript_obj = tgt_manual[0]
                        generated = False
                    elif tgt_gen:
                        transcript_obj = tgt_gen[0]
                        generated = True
                    else:
                        # 3. Translation Fallback (prefer manual en, manual other, gen en, gen other)
                        manual_en = [t for t in manual_transcripts if t.language_code.startswith("en")]
                        gen_en = [t for t in generated_transcripts if t.language_code.startswith("en")]
                        
                        best_t = None
                        if manual_en:
                            best_t = manual_en[0]
                        elif manual_transcripts:
                            best_t = manual_transcripts[0]
                        elif gen_en:
                            best_t = gen_en[0]
                        elif generated_transcripts:
                            best_t = generated_transcripts[0]
                            
                        if best_t:
                            transcript_obj = best_t.translate(target_lang)
                            generated = getattr(best_t, "is_generated", getattr(best_t, "generated", False))
                        else:
                            raise NoCaptionsError(f"No captions found to translate to {target_lang}.")
                    language_code = target_lang
                else:
                    # Auto mode: find best available
                    manual_en = [t for t in manual_transcripts if t.language_code.startswith("en")]
                    gen_en = [t for t in generated_transcripts if t.language_code.startswith("en")]
                    
                    if manual_en:
                        transcript_obj = manual_en[0]
                        generated = False
                    elif manual_transcripts:
                        transcript_obj = manual_transcripts[0]
                        generated = False
                    elif gen_en:
                        transcript_obj = gen_en[0]
                        generated = True
                    elif generated_transcripts:
                        transcript_obj = generated_transcripts[0]
                        generated = True
                    else:
                        raise NoCaptionsError("No captions found for this video.")
                    language_code = transcript_obj.language_code

            if not transcript_obj:
                raise NoCaptionsError("No captions found for this video.")

            # Fetch the actual segments
            raw_segments = transcript_obj.fetch()
            
            # Parse and normalize segments
            normalized_segments = normalize_transcript(raw_segments)

            result = {
                "success": True,
                "video_id": video_id,
                "language": language_code,
                "generated": generated,
                "segments": normalized_segments
            }

            # Save in Cache
            self.cache.set(video_id, result, target_lang)
            return result

        except TranscriptsDisabled:
            whisper_result = self._attempt_whisper_fallback(video_id, target_lang)
            if whisper_result:
                return whisper_result
            raise TranscriptDisabledError("Transcripts are disabled for this video and Whisper fallback was unavailable.")
        except NoCaptionsError as nce:
            whisper_result = self._attempt_whisper_fallback(video_id, target_lang)
            if whisper_result:
                return whisper_result
            raise nce
        except (YouTubeRequestFailed, IpBlocked):
            whisper_result = self._attempt_whisper_fallback(video_id, target_lang)
            if whisper_result:
                return whisper_result
            raise RateLimitError("YouTube rate limit exceeded or access was blocked. Please try again later.")
        except VideoUnavailable:
            raise VideoUnavailableError("The video is unavailable, private, or blocked.")
        except InvalidVideoId:
            raise InvalidVideoIdError("YouTube API rejected the Video ID format.")
        except TranscriptError as te:
            raise te
        except Exception as e:
            whisper_result = self._attempt_whisper_fallback(video_id, target_lang)
            if whisper_result:
                return whisper_result
            raise TranscriptError(f"An unexpected error occurred during transcript retrieval: {str(e)}")
