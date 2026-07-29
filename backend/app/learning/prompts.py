from app.llm.prompts import (
    SUMMARY_SHORT_PROMPT,
    SUMMARY_DETAILED_PROMPT,
    SUMMARY_BULLET_PROMPT,
    STUDY_NOTES_PROMPT,
    KEY_TAKEAWAYS_PROMPT,
)

INTERVIEW_PROMPT = (
    "Generate 3-5 technical interview questions and answers strictly and ONLY based on the provided video summary context below.\n"
    "CRITICAL RULES:\n"
    "1. Do NOT use general AI knowledge, textbook definitions, or external information.\n"
    "2. All questions and answers must directly relate to concepts explained in the video summary.\n"
    "3. If the video summary does not provide enough technical depth for a question, explicitly state 'The video does not provide sufficient details for technical interview questions.' instead of inventing questions.\n"
    "For each question, specify a difficulty level of either Easy, Medium, or Hard.\n\n"
    "Format precisely as:\n"
    "Q: [Question]\n"
    "A: [Answer]\n"
    "Difficulty: [Easy/Medium/Hard]\n\n"
    "Video Summary Context:\n{context}\n\n"
    "Interview Questions:"
)

