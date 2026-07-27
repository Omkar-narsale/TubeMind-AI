from typing import List
from app.transcript.service import TranscriptService
from app.llm.client import GroqClient
from app.learning.models import SummaryType
from app.learning.prompts import (
    SUMMARY_SHORT_PROMPT,
    SUMMARY_DETAILED_PROMPT,
    SUMMARY_BULLET_PROMPT,
    STUDY_NOTES_PROMPT,
    KEY_TAKEAWAYS_PROMPT,
)


class LearningService:
    def __init__(
        self,
        transcript_service: TranscriptService = None,
        groq_client: GroqClient = None,
    ):
        self.transcript_service = transcript_service or TranscriptService()
        self.groq_client = groq_client or GroqClient()

    def _get_combined_transcript(self, video_id: str) -> str:
        transcript_data = self.transcript_service.get_transcript(video_id)
        segments = transcript_data.get("segments", [])
        if not segments:
            raise ValueError("No transcript segments found for this video.")
        return " ".join([s["text"] for s in segments])

    async def generate_summary(self, video_id: str, summary_type: SummaryType) -> str:
        transcript = self._get_combined_transcript(video_id)
        
        if summary_type == SummaryType.SHORT:
            prompt = SUMMARY_SHORT_PROMPT.format(transcript=transcript)
        elif summary_type == SummaryType.DETAILED:
            prompt = SUMMARY_DETAILED_PROMPT.format(transcript=transcript)
        else:
            prompt = SUMMARY_BULLET_PROMPT.format(transcript=transcript)

        messages = [{"role": "user", "content": prompt}]
        return await self.groq_client.complete(messages=messages, temperature=0.5, max_tokens=1500)

    async def generate_study_notes(self, video_id: str) -> str:
        transcript = self._get_combined_transcript(video_id)
        prompt = STUDY_NOTES_PROMPT.format(transcript=transcript)
        messages = [{"role": "user", "content": prompt}]
        return await self.groq_client.complete(messages=messages, temperature=0.5, max_tokens=3000)

    async def generate_takeaways(self, video_id: str) -> str:
        transcript = self._get_combined_transcript(video_id)
        prompt = KEY_TAKEAWAYS_PROMPT.format(transcript=transcript)
        messages = [{"role": "user", "content": prompt}]
        return await self.groq_client.complete(messages=messages, temperature=0.5, max_tokens=1500)
