from enum import Enum
from typing import Optional
from pydantic import BaseModel, model_validator


class SummaryType(str, Enum):
    SHORT = "short"
    DETAILED = "detailed"
    BULLET = "bullet"


class BaseLearningRequest(BaseModel):
    video_id: str
    language: Optional[str] = None
    output_language: Optional[str] = None

    @property
    def resolved_language(self) -> str:
        return self.output_language or self.language or "auto"


class SummaryRequest(BaseLearningRequest):
    summary_type: SummaryType


class NotesRequest(BaseLearningRequest):
    pass


class TakeawaysRequest(BaseLearningRequest):
    pass


class InterviewRequest(BaseLearningRequest):
    pass


class FlashcardRequest(BaseLearningRequest):
    pass


class QuizRequest(BaseLearningRequest):
    pass


class LearningResponse(BaseModel):
    success: bool
    data: str


