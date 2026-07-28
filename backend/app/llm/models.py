from enum import Enum
from typing import List, Optional
from pydantic import BaseModel
from app.rag.models import RAGSearchResult


class ChatRole(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


class ChatMessage(BaseModel):
    role: ChatRole
    content: str


class ChatRequest(BaseModel):
    video_id: str
    query: str
    history: Optional[List[ChatMessage]] = []
    temperature: Optional[float] = 0.7
    max_tokens: Optional[int] = 1024
    stream: Optional[bool] = True
    language: Optional[str] = "auto"


class ChatMetadata(BaseModel):
    model_name: str
    retrieval_count: int
    response_time: float


class ChatResponse(BaseModel):
    success: bool
    answer: str
    context: List[RAGSearchResult]
    metadata: ChatMetadata
