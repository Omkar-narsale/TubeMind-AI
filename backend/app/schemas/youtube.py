from typing import List, Optional
from pydantic import BaseModel, HttpUrl


class VideoMetadataRequest(BaseModel):
    video_url: str


class VideoChannelInfo(BaseModel):
    id: str
    title: str
    thumbnail_url: Optional[str] = None


class VideoMetadata(BaseModel):
    video_id: str
    title: str
    description: str
    published_at: str
    channel: VideoChannelInfo
    duration: str
    view_count: Optional[int] = None
    like_count: Optional[int] = None


class TranscriptSegment(BaseModel):
    text: str
    start: float
    duration: float


class VideoTranscript(BaseModel):
    video_id: str
    language_code: str
    segments: List[TranscriptSegment]
