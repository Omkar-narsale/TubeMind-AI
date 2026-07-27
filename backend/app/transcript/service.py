from typing import Dict, Any, List
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import (
    TranscriptsDisabled,
    NoTranscriptFound,
    VideoUnavailable,
    YouTubeRequestFailed,
    IpBlocked,
    InvalidVideoId,
)

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


class TranscriptService:
    def __init__(self, cache=transcript_cache):
        self.cache = cache

    def get_transcript(self, video_id: str) -> Dict[str, Any]:
        """
        Retrieves the English transcript for a given video ID.
        Checks in-memory cache first before querying YouTube API.
        """
        if not video_id or len(video_id) != 11:
            raise InvalidVideoIdError("Invalid YouTube Video ID length.")

        # Check Cache
        cached_data = self.cache.get(video_id)
        if cached_data:
            return cached_data

        try:
            # Instantiate YouTubeTranscriptApi to call instance methods
            api = YouTubeTranscriptApi()
            transcript_list = api.list(video_id)
            
            transcript_obj = None
            generated = False
            language_code = "en"

            # 1. Attempt manual English transcript
            try:
                transcript_obj = transcript_list.find_manually_created_transcript(["en"])
                generated = False
                language_code = transcript_obj.language_code
            except NoTranscriptFound:
                # 2. Attempt auto-generated English transcript
                try:
                    transcript_obj = transcript_list.find_generated_transcript(["en"])
                    generated = True
                    language_code = transcript_obj.language_code
                except NoTranscriptFound:
                    raise NoCaptionsError("No English captions found for this video.")

            if not transcript_obj:
                raise NoCaptionsError("No English captions found for this video.")

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
            self.cache.set(video_id, result)
            return result

        except TranscriptsDisabled:
            raise TranscriptDisabledError("Transcripts are disabled for this video.")
        except VideoUnavailable:
            raise VideoUnavailableError("The video is unavailable, private, or blocked.")
        except (YouTubeRequestFailed, IpBlocked):
            raise RateLimitError("YouTube rate limit exceeded or access was blocked. Please try again later.")
        except InvalidVideoId:
            raise InvalidVideoIdError("YouTube API rejected the Video ID format.")
        except TranscriptError as te:
            # Re-raise custom captured exceptions
            raise te
        except Exception as e:
            raise TranscriptError(f"An unexpected error occurred during transcript retrieval: {str(e)}")
