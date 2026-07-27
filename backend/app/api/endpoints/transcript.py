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


def get_transcript_service() -> TranscriptService:
    return TranscriptService()


@router.get("/{video_id}")
def get_transcript(video_id: str, service: TranscriptService = Depends(get_transcript_service)):
    """
    Retrieves the English transcript (manual or auto-generated) for a YouTube video.
    """
    try:
        data = service.get_transcript(video_id)
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
