import re
from typing import Optional, Dict
from pydantic import BaseModel, Field


def sanitize_filename(name: str) -> str:
    """Sanitizes file name by removing illegal filename characters."""
    if not name:
        return "TubeMind_Export"
    clean = re.sub(r'[\\/*?:"<>|]', "", name)
    clean = clean.replace(" ", "_").strip("_")
    return clean[:80] if clean else "TubeMind_Export"


class ExportRequest(BaseModel):
    video_title: Optional[str] = "YouTube Video"
    youtube_url: Optional[str] = ""
    feature: str  # "summary", "study_notes", "takeaways", "interview_questions"
    language: Optional[str] = "English"
    content: str
    summary_type: Optional[str] = None

    def get_filename(self, extension: str) -> str:
        clean_title = sanitize_filename(self.video_title or "TubeMind")
        feature_name = self.feature.replace("-", "_").replace(" ", "_").title()
        ext = extension.lstrip(".")
        return f"{clean_title}_{feature_name}.{ext}"


class ExportAllRequest(BaseModel):
    video_title: Optional[str] = "YouTube Video"
    youtube_url: Optional[str] = ""
    language: Optional[str] = "English"
    contents: Dict[str, str] = Field(default_factory=dict)
    # e.g. {"summary": "...", "study_notes": "...", "takeaways": "...", "interview_questions": "..."}

    def get_filename(self) -> str:
        clean_title = sanitize_filename(self.video_title or "TubeMind")
        return f"{clean_title}_All_Content.zip"
