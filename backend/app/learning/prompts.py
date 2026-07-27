SUMMARY_SHORT_PROMPT = (
    "You are an expert learning assistant. Summarize the following video transcript in about 150 words.\n"
    "Focus on the main idea, keep it extremely easy to read, and highlight the core message.\n\n"
    "Transcript:\n{transcript}\n\n"
    "Summary:"
)

SUMMARY_DETAILED_PROMPT = (
    "You are an expert learning assistant. Provide a structured, detailed summary of the following video transcript.\n"
    "Structure it with clear headings, important concepts, technical details, and examples where available. "
    "Ensure technical accuracy is preserved.\n\n"
    "Transcript:\n{transcript}\n\n"
    "Detailed Summary:"
)

SUMMARY_BULLET_PROMPT = (
    "You are an expert learning assistant. Summarize the following video transcript as a concise list of bullet points.\n"
    "Use bullet points like:\n"
    "• Main topic details\n"
    "• Key concepts\n"
    "• Practical applications\n\n"
    "Transcript:\n{transcript}\n\n"
    "Bullet Summary:"
)

STUDY_NOTES_PROMPT = (
    "You are a stellar academic student. Create a set of structured, complete study notes from the following video transcript.\n"
    "Use Markdown format precisely with headings:\n"
    "# [Main Topic Title]\n"
    "## Definition\n"
    "## Explanation\n"
    "## Important Concepts\n"
    "## Examples\n"
    "## Applications\n"
    "## Advantages\n"
    "## Limitations\n"
    "## Final Revision Notes\n\n"
    "Ensure all technical details, code blocks (if any), and math concepts are preserved.\n\n"
    "Transcript:\n{transcript}\n\n"
    "Study Notes:"
)

KEY_TAKEAWAYS_PROMPT = (
    "You are a learning assistant. Extract the most important, actionable key takeaways from the following video transcript.\n"
    "Return between 5 and 15 takeaways. Format them as a flat bulleted list using the checkmark symbol (✓) for each point.\n"
    "Each takeaway must be short, actionable, and easy to revise.\n"
    "Example:\n"
    "✓ Backpropagation minimizes prediction error.\n"
    "✓ Hidden layers extract useful features.\n\n"
    "Transcript:\n{transcript}\n\n"
    "Key Takeaways:"
)
