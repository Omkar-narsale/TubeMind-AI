from app.core.config import settings

def get_routed_model(task_type: str) -> str:
    """
    Returns the mapped model string for the specified task type.
    Falls back to settings.GROQ_MODEL if key is not found.
    """
    mapping = {
        "chat": settings.CHAT_MODEL,
        "classification": settings.CHAT_MODEL,
        "verification": settings.CHAT_MODEL,
        "summary": settings.SUMMARY_MODEL,
        "study_notes": settings.NOTES_MODEL,
        "takeaways": settings.TAKEAWAYS_MODEL,
        "quiz": settings.QUIZ_MODEL,
        "flashcard": settings.FLASHCARD_MODEL,
        "flashcards": settings.FLASHCARD_MODEL,
        "interview": settings.INTERVIEW_MODEL,
    }
    return mapping.get(task_type, settings.GROQ_MODEL)
