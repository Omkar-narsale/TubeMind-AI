from fastapi import APIRouter, HTTPException, status, Depends
from app.transcript.service import TranscriptService
from app.transcript.exceptions import (
    VideoUnavailableError,
    TranscriptDisabledError,
    NoCaptionsError,
    RateLimitError,
    InvalidVideoIdError,
    TranscriptError,
)

router = APIRouter()


_transcript_service_instance = None

def get_transcript_service() -> TranscriptService:
    global _transcript_service_instance
    if _transcript_service_instance is None:
        _transcript_service_instance = TranscriptService()
    return _transcript_service_instance



@router.get("/{video_id}")
def get_transcript(
    video_id: str, 
    language: str = "auto",
    service: TranscriptService = Depends(get_transcript_service)
):
    """
    Retrieves the transcript (manual, auto-generated, or translated) for a YouTube video.
    """
    try:
        data = service.get_transcript(video_id, target_language=language)
        return data
    except InvalidVideoIdError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except VideoUnavailableError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
    except TranscriptDisabledError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except NoCaptionsError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
    except RateLimitError as e:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(e)
        )
    except TranscriptError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
