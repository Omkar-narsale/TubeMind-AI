from fastapi import APIRouter

router = APIRouter()


@router.get("")
def health_check():
    """
    Check API status
    """
    return {
        "success": True,
        "status": "healthy",
        "service": "TubeMind AI API"
    }
