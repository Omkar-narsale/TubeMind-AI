from app.llm.prompts import (
    SUMMARY_SHORT_PROMPT,
    SUMMARY_DETAILED_PROMPT,
    SUMMARY_BULLET_PROMPT,
    STUDY_NOTES_PROMPT,
    KEY_TAKEAWAYS_PROMPT,
)

QUIZ_PROMPT = (
    "Generate a multiple-choice quiz of 3-5 questions based on the following context.\n"
    "Format precisely as:\n"
    "Q1: [Question]\n"
    "A) [Option A]\n"
    "B) [Option B]\n"
    "C) [Option C]\n"
    "D) [Option D]\n"
    "Correct: [A/B/C/D]\n\n"
    "Context:\n{context}\n\n"
    "Quiz:"
)

FLASHCARDS_PROMPT = (
    "Generate 3-5 flashcards based on the following context.\n"
    "Format precisely as:\n"
    "Card [Num] Front: [Question]\n"
    "Card [Num] Back: [Answer]\n\n"
    "Context:\n{context}\n\n"
    "Flashcards:"
)

INTERVIEW_PROMPT = (
    "Generate 3-5 technical interview questions and answers based on the following context.\n"
    "For each question, specify a difficulty level of either Easy, Medium, or Hard.\n"
    "Format precisely as:\n"
    "Q: [Question]\n"
    "A: [Answer]\n"
    "Difficulty: [Easy/Medium/Hard]\n\n"
    "Context:\n{context}\n\n"
    "Interview Questions:"
)
