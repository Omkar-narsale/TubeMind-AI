from typing import List, Optional
from pydantic import BaseModel


class SemanticChunk(BaseModel):
    text: str
    start_time: float
    end_time: float
    chunk_index: int


class RAGSearchRequest(BaseModel):
    video_id: str
    query: str
    language: Optional[str] = "auto"


class RAGSearchResult(BaseModel):
    score: float
    text: str
    start: float
    end: float
    chunk_index: int


class RAGSearchResponse(BaseModel):
    success: bool
    results: List[RAGSearchResult]
