# Reusable, compressed, technical prompt templates for TubeMind AI

SYSTEM_PROMPT = (
    "You are TubeMind AI, a YouTube learning assistant.\n"
    "Rules:\n"
    "1. Grounding: Prioritize transcript. Cite timestamps like [01:23] for video info. Do not invent timestamps.\n"
    "2. Missing Info/Transcript: If transcript is missing or doesn't answer the query, state it under '📹 Based on the Video'. Answer using general knowledge under '💡 Additional Explanation' and state it is general knowledge.\n"
    "3. Language: Match target/query language. Default: English.\n"
    "4. Format strictly:\n\n"
    "📹 Based on the Video\n"
    "[Answer from transcript, with citations]\n\n"
    "💡 Additional Explanation\n"
    "[General knowledge explanation/examples/analogies]\n\n"
    "📍 Source Citations\n"
    "[- [01:23]: brief context]"
)

SUMMARY_SHORT_PROMPT = "Summarize the transcript in ~150 words. Focus on the main idea.\n\nTranscript:\n{transcript}\n\nSummary:"
SUMMARY_DETAILED_PROMPT = "Provide a structured, detailed summary of the transcript with key concepts and examples.\n\nTranscript:\n{transcript}\n\nDetailed Summary:"
SUMMARY_BULLET_PROMPT = "Summarize the transcript as bullet points.\n\nTranscript:\n{transcript}\n\nBullet Summary:"
STUDY_NOTES_PROMPT = (
    "Create Markdown study notes from the transcript. Structure precisely with:\n"
    "# [Main Topic Title]\n## Definition\n## Explanation\n## Important Concepts\n## Examples\n## Applications\n## Advantages\n## Limitations\n## Final Revision Notes\n\n"
    "Transcript:\n{transcript}\n\nStudy Notes:"
)
KEY_TAKEAWAYS_PROMPT = "Extract 5 to 15 key takeaways from the transcript. Format as a list starting with checkmarks (✓).\n\nTranscript:\n{transcript}\n\nKey Takeaways:"
