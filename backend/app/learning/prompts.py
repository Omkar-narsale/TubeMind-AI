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

FLASHCARDS_PROMPT = (
    "Generate 5 to 7 high-yield educational study flashcards strictly and ONLY based on the provided video summary context below.\n"
    "CRITICAL RULES:\n"
    "1. Focus on core concepts, definitions, architecture, and important facts explained in the video.\n"
    "2. Each card must have 'front' (question/term), 'back' (concise, clear explanation of 1-3 sentences), 'category' (1-2 word tag), and 'timestamp' (e.g. '02:30' if referenced, else '').\n"
    "3. Respond ONLY with a valid JSON array of objects. No markdown formatting, preamble, or conversational text outside the JSON array.\n\n"
    "Format:\n"
    "[\n"
    '  {{"front": "What is ...?", "back": "It is ...", "category": "Concept", "timestamp": "02:30"}}\n'
    "]\n\n"
    "Video Summary Context:\n{context}\n\n"
    "Flashcards JSON:"
)

QUIZ_PROMPT = (
    "Generate 4 to 6 multiple-choice quiz questions strictly and ONLY based on the provided video summary context below.\n"
    "CRITICAL RULES:\n"
    "1. Each question must test understanding of key concepts from the video.\n"
    "2. Provide exactly 4 distinct options per question.\n"
    "3. 'correct_index' must be the 0-based integer (0, 1, 2, or 3) of the correct option.\n"
    "4. 'explanation' must explain why that option is correct.\n"
    "5. 'timestamp' should be the approximate timestamp string (e.g. '03:45') if referenced, else ''.\n"
    "6. Respond ONLY with a valid JSON array of objects.\n\n"
    "Format:\n"
    "[\n"
    "  {{\n"
    '    "question": "What is ...?",\n'
    '    "options": ["Option A", "Option B", "Option C", "Option D"],\n'
    '    "correct_index": 0,\n'
    '    "explanation": "Because...",\n'
    '    "timestamp": "03:15"\n'
    "  }}\n"
    "]\n\n"
    "Video Summary Context:\n{context}\n\n"
    "Quiz JSON:"
)

