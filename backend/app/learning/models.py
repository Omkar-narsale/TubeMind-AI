from enum import Enum
from pydantic import BaseModel


class SummaryType(str, Enum):
    SHORT = "short"
    DETAILED = "detailed"
    BULLET = "bullet"


class SummaryRequest(BaseModel):
    video_id: str
    summary_type: SummaryType


class NotesRequest(BaseModel):
    video_id: str


class TakeawaysRequest(BaseModel):
    video_id: str


class LearningResponse(BaseModel):
    success: bool
    data: str
