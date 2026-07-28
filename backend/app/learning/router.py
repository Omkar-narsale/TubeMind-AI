import logging
from fastapi import APIRouter, Depends, HTTPException
from app.learning.models import (
    SummaryRequest,
    NotesRequest,
    TakeawaysRequest,
    QuizRequest,
    FlashcardsRequest,
    InterviewRequest,
    LearningResponse,
)
from app.learning.service import LearningService

logger = logging.getLogger("app.learning.router")
router = APIRouter(prefix="/learning", tags=["learning"])

_learning_service_instance = None


def get_learning_service() -> LearningService:
    global _learning_service_instance
    if _learning_service_instance is None:
        _learning_service_instance = LearningService()
    return _learning_service_instance


@router.post("/summary", response_model=LearningResponse)
async def generate_summary(
    payload: SummaryRequest,
    service: LearningService = Depends(get_learning_service),
):
    try:
        data = await service.generate_summary(payload.video_id, payload.summary_type, language=payload.resolved_language)
        return LearningResponse(success=True, data=data)
    except Exception as e:
        logger.exception("Error in generate_summary endpoint")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/study-notes", response_model=LearningResponse)
async def generate_study_notes(
    payload: NotesRequest,
    service: LearningService = Depends(get_learning_service),
):
    try:
        data = await service.generate_study_notes(payload.video_id, language=payload.resolved_language)
        return LearningResponse(success=True, data=data)
    except Exception as e:
        logger.exception("Error in generate_study_notes endpoint")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/key-takeaways", response_model=LearningResponse)
async def generate_key_takeaways(
    payload: TakeawaysRequest,
    service: LearningService = Depends(get_learning_service),
):
    try:
        data = await service.generate_takeaways(payload.video_id, language=payload.resolved_language)
        return LearningResponse(success=True, data=data)
    except Exception as e:
        logger.exception("Error in generate_key_takeaways endpoint")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/quiz", response_model=LearningResponse)
async def generate_quiz(
    payload: QuizRequest,
    service: LearningService = Depends(get_learning_service),
):
    try:
        data = await service.generate_quiz(payload.video_id, language=payload.resolved_language)
        return LearningResponse(success=True, data=data)
    except Exception as e:
        logger.exception("Error in generate_quiz endpoint")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/flashcards", response_model=LearningResponse)
async def generate_flashcards(
    payload: FlashcardsRequest,
    service: LearningService = Depends(get_learning_service),
):
    try:
        data = await service.generate_flashcards(payload.video_id, language=payload.resolved_language)
        return LearningResponse(success=True, data=data)
    except Exception as e:
        logger.exception("Error in generate_flashcards endpoint")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/interview-questions", response_model=LearningResponse)
async def generate_interview_questions(
    payload: InterviewRequest,
    service: LearningService = Depends(get_learning_service),
):
    try:
        data = await service.generate_interview_questions(payload.video_id, language=payload.resolved_language)
        return LearningResponse(success=True, data=data)
    except Exception as e:
        logger.exception("Error in generate_interview_questions endpoint")
        raise HTTPException(status_code=500, detail=str(e))


