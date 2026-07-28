from fastapi import APIRouter, Depends, HTTPException, status
from app.rag.models import RAGSearchRequest, RAGSearchResponse
from app.rag.service import RAGService
from app.transcript.exceptions import TranscriptError

router = APIRouter()


_rag_service_instance = None

def get_rag_service() -> RAGService:
    global _rag_service_instance
    if _rag_service_instance is None:
        _rag_service_instance = RAGService()
    return _rag_service_instance



@router.post("/search", response_model=RAGSearchResponse)
def semantic_search(payload: RAGSearchRequest, service: RAGService = Depends(get_rag_service)):
    """
    Performs vector similarity search against a video's transcript.
    Auto-chunks and indexes the transcript if called for the first time.
    """
    try:
        results = service.search_transcript(payload.video_id, payload.query, language=payload.language)
        return RAGSearchResponse(success=True, results=results)
    except TranscriptError as te:
        # Pass transcript-specific exceptions (disabled captions, video unavailable) as 400s
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(te)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Semantic search pipeline encountered an error: {str(e)}"
        )
