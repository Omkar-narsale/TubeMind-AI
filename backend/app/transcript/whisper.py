import os
import glob
import logging
import tempfile
from typing import Dict, Any, List, Optional
from groq import Groq
import yt_dlp

from app.core.config import settings
from app.transcript.exceptions import WhisperTranscriptionError
from app.transcript.parser import normalize_transcript

logger = logging.getLogger("app.transcript.whisper")


class WhisperService:
    """
    Fallback transcription service using yt-dlp for lightweight audio extraction
    and Groq's ultra-fast Whisper API (whisper-large-v3-turbo / whisper-large-v3)
    to transcribe videos when YouTube transcripts/captions are unavailable.
    """

    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None):
        self.api_key = api_key or settings.GROQ_API_KEY
        self.model = model or settings.WHISPER_MODEL

    def transcribe(self, video_id: str, target_language: Optional[str] = "auto") -> Dict[str, Any]:
        """
        Downloads the lowest-bitrate native audio stream for the video and transcribes
        it using Groq Whisper with timestamp segments.
        """
        if not self.api_key:
            raise WhisperTranscriptionError("Groq API key is not configured for Whisper fallback.")

        logger.info(f"[Whisper] Starting audio extraction fallback for video: {video_id}")

        with tempfile.TemporaryDirectory() as temp_dir:
            audio_path = self._download_audio(video_id, temp_dir)
            
            # Verify file exists and is within Groq's 25MB limit
            file_size_mb = os.path.getsize(audio_path) / (1024 * 1024)
            logger.info(f"[Whisper] Downloaded audio file: {audio_path} ({file_size_mb:.2f} MB)")

            if file_size_mb > settings.WHISPER_MAX_FILE_SIZE_MB:
                raise WhisperTranscriptionError(
                    f"Audio file size ({file_size_mb:.1f} MB) exceeds Groq Whisper limit of "
                    f"{settings.WHISPER_MAX_FILE_SIZE_MB} MB. Video may be too long."
                )

            # Transcribe with Groq Whisper
            segments, detected_language = self._call_groq_whisper(audio_path, target_language)

            normalized = normalize_transcript(segments)
            logger.info(f"[Whisper] Successfully transcribed {len(normalized)} segments for video {video_id}")

            return {
                "success": True,
                "video_id": video_id,
                "language": detected_language or "en",
                "generated": True,
                "source": "groq_whisper",
                "segments": normalized,
            }

    def _download_audio(self, video_id: str, output_dir: str) -> str:
        """
        Uses yt-dlp to download native audio stream directly without requiring ffmpeg.
        Prefers lightweight .m4a or .webm streams to minimize file size and transfer time.
        """
        youtube_url = f"https://www.youtube.com/watch?v={video_id}"
        outtmpl = os.path.join(output_dir, "%(id)s.%(ext)s")

        ydl_opts = {
            "format": "worstaudio[ext=m4a]/ba[ext=m4a]/worstaudio[ext=webm]/ba[ext=webm]/worstaudio/ba/best",
            "outtmpl": outtmpl,
            "quiet": True,
            "no_warnings": True,
            "noplaylist": True,
        }

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(youtube_url, download=True)
                duration = info.get("duration", 0)
                max_duration = settings.WHISPER_MAX_DURATION_MINUTES * 60

                if duration and duration > max_duration:
                    raise WhisperTranscriptionError(
                        f"Video duration ({duration // 60}m) exceeds the maximum allowed "
                        f"for Whisper transcription ({settings.WHISPER_MAX_DURATION_MINUTES}m)."
                    )

            # Locate downloaded audio file
            files = glob.glob(os.path.join(output_dir, f"{video_id}.*"))
            if not files:
                # Fallback: search for any downloaded audio file in temp_dir
                files = [
                    os.path.join(output_dir, f)
                    for f in os.listdir(output_dir)
                    if not f.endswith(".part") and not f.endswith(".ytdl")
                ]

            if not files:
                raise WhisperTranscriptionError(f"Audio download completed but file not found for video: {video_id}")

            return files[0]

        except yt_dlp.utils.DownloadError as e:
            logger.error(f"[Whisper] yt-dlp download failed for video {video_id}: {str(e)}")
            raise WhisperTranscriptionError(f"Failed to extract audio from YouTube: {str(e)}")
        except Exception as e:
            if isinstance(e, WhisperTranscriptionError):
                raise
            logger.error(f"[Whisper] Unexpected error during audio download: {str(e)}")
            raise WhisperTranscriptionError(f"Error preparing audio for transcription: {str(e)}")

    def _call_groq_whisper(self, audio_file_path: str, target_language: Optional[str]) -> tuple[List[Dict[str, Any]], str]:
        """
        Calls Groq's speech-to-text API with verbose_json response format
        to retrieve timestamped transcription segments.
        """
        client = Groq(api_key=self.api_key)

        kwargs: Dict[str, Any] = {
            "model": self.model,
            "response_format": "verbose_json",
            "temperature": 0.0,
        }

        if target_language and target_language != "auto":
            kwargs["language"] = target_language

        try:
            with open(audio_file_path, "rb") as audio_file:
                transcription = client.audio.transcriptions.create(
                    file=(os.path.basename(audio_file_path), audio_file),
                    **kwargs,
                )

            # Extract segments from verbose_json response (Pydantic v2 compatible)
            data = transcription.model_dump() if hasattr(transcription, "model_dump") else (
                transcription if isinstance(transcription, dict) else {}
            )

            raw_segments = data.get("segments") or getattr(transcription, "segments", None) or []
            detected_language = data.get("language") or getattr(transcription, "language", None) or "en"

            parsed_segments: List[Dict[str, Any]] = []
            if raw_segments:
                for seg in raw_segments:
                    if isinstance(seg, dict):
                        text = seg.get("text", "")
                        start = seg.get("start", 0.0)
                        end = seg.get("end", 0.0)
                    else:
                        text = getattr(seg, "text", "")
                        start = getattr(seg, "start", 0.0)
                        end = getattr(seg, "end", 0.0)

                    duration = max(0.0, round(float(end or 0.0) - float(start or 0.0), 2))
                    parsed_segments.append({
                        "text": str(text).strip(),
                        "start": float(start or 0.0),
                        "duration": duration,
                    })
            else:
                full_text = data.get("text") or getattr(transcription, "text", "")
                if full_text:
                    parsed_segments.append({
                        "text": str(full_text).strip(),
                        "start": 0.0,
                        "duration": 0.0,
                    })

            return parsed_segments, detected_language or "en"

        except Exception as e:
            logger.error(f"[Whisper] Groq Whisper API call failed: {str(e)}")
            raise WhisperTranscriptionError(f"Groq Whisper transcription failed: {str(e)}")
