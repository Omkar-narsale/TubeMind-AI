from fastapi import APIRouter, Depends, HTTPException
from app.learning.models import (
    SummaryRequest,
    NotesRequest,
    TakeawaysRequest,
    LearningResponse,
)
from app.learning.service import LearningService

router = APIRouter(prefix="/learning", tags=["learning"])


def get_learning_service() -> LearningService:
    return LearningService()


@router.post("/summary", response_model=LearningResponse)
async def generate_summary(
    payload: SummaryRequest,
    service: LearningService = Depends(get_learning_service),
):
    try:
        data = await service.generate_summary(payload.video_id, payload.summary_type)
        return LearningResponse(success=True, data=data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/study-notes", response_model=LearningResponse)
async def generate_study_notes(
    payload: NotesRequest,
    service: LearningService = Depends(get_learning_service),
):
    try:
        data = await service.generate_study_notes(payload.video_id)
        return LearningResponse(success=True, data=data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/key-takeaways", response_model=LearningResponse)
async def generate_key_takeaways(
    payload: TakeawaysRequest,
    service: LearningService = Depends(get_learning_service),
):
    try:
        data = await service.generate_takeaways(payload.video_id)
        return LearningResponse(success=True, data=data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
