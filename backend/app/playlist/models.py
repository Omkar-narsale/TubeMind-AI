from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class PlaylistVideoItem(BaseModel):
    video_id: str
    title: str
    duration: Optional[float] = 0.0
    position: Optional[int] = 0
    url: Optional[str] = None


class PlaylistInfoRequest(BaseModel):
    playlist_id_or_url: str


class PlaylistInfoResponse(BaseModel):
    playlist_id: str
    title: str
    video_count: int
    videos: List[PlaylistVideoItem]


class PlaylistIndexRequest(BaseModel):
    playlist_id: str
    playlist_title: Optional[str] = None
    videos: Optional[List[PlaylistVideoItem]] = None
    max_videos: Optional[int] = Field(default=12, ge=1, le=50)
    language: Optional[str] = "en"


class PlaylistIndexStatus(BaseModel):
    playlist_id: str
    title: str
    total_videos: int
    indexed_videos: int
    failed_videos: int
    total_chunks: int
    is_ready: bool
    video_details: List[Dict[str, Any]] = Field(default_factory=list)


class PlaylistChunk(BaseModel):
    video_id: str
    video_title: str
    text: str
    start_time: float
    end_time: float
    chunk_index: int


class PlaylistSearchResult(BaseModel):
    video_id: str
    video_title: str
    score: float
    text: str
    start: float
    end: float
    chunk_index: int
    formatted_citation: str


class PlaylistSearchRequest(BaseModel):
    playlist_id: str
    query: str
    top_k: Optional[int] = 6
    language: Optional[str] = "en"


class PlaylistSearchResponse(BaseModel):
    success: bool
    results: List[PlaylistSearchResult]


class PlaylistChatMessageInput(BaseModel):
    role: str
    content: str


class PlaylistChatRequest(BaseModel):
    playlist_id: str
    query: str
    history: Optional[List[PlaylistChatMessageInput]] = Field(default_factory=list)
    temperature: Optional[float] = 0.7
    max_tokens: Optional[int] = 1024
    stream: Optional[bool] = False
    language: Optional[str] = "en"


class PlaylistChatResponse(BaseModel):
    success: bool
    answer: str
    context: List[PlaylistSearchResult]
    total_sources: int
