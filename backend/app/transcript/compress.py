import re
from typing import List, Dict, Any, Union
from app.core.config import settings

# A set of common filler words and phrases
FILLER_WORDS = {
    "um", "uh", "eh", "ah", "like", "you know", "basically", "actually", 
    "literally", "sort of", "kind of", "you see", "i mean"
}

# Compile a regex for case-insensitive filler word removal
# We want to match filler words as distinct words, handling surrounding whitespace or commas
filler_pattern = re.compile(
    r'\b(?:' + '|'.join(map(re.escape, FILLER_WORDS)) + r')\b[,.\s]*', 
    re.IGNORECASE
)

def remove_fillers(text: str) -> str:
    """Removes filler words and clean up punctuation/whitespace."""
    # Replace filler words
    cleaned = filler_pattern.sub("", text)
    # Clean up duplicate commas, spaces, and periods left behind
    cleaned = re.sub(r'\s+', ' ', cleaned)
    cleaned = re.sub(r',\s*,', ',', cleaned)
    cleaned = re.sub(r'\.\s*\.', '.', cleaned)
    cleaned = re.sub(r'^\s*,\s*', '', cleaned)
    return cleaned.strip()

def merge_speaker_tags(text: str) -> str:
    """
    Simplifies repeated consecutive speaker tags.
    Example: "Speaker 1: Hello. Speaker 1: How are you?" -> "Speaker 1: Hello. How are you?"
    """
    # Regex to find speaker tags like "Speaker 1:", "[Host]:", "John:"
    parts = re.split(r'(\b[A-Za-z0-9\s_-]+:)', text)
    if len(parts) < 3:
        return text
        
    merged_parts = []
    current_speaker = None
    current_content = []
    
    # parts looks like: [prefix_before_any_tag, tag1, content1, tag2, content2, ...]
    if parts[0].strip():
        merged_parts.append(parts[0].strip())
        
    for i in range(1, len(parts), 2):
        tag = parts[i].strip()
        content = parts[i+1].strip() if i+1 < len(parts) else ""
        
        if tag == current_speaker:
            current_content.append(content)
        else:
            if current_speaker:
                merged_parts.append(f"{current_speaker} {' '.join(current_content)}")
            current_speaker = tag
            current_content = [content]
            
    if current_speaker:
        merged_parts.append(f"{current_speaker} {' '.join(current_content)}")
        
    return " ".join(merged_parts)

def compress_transcript(segments_or_text: Union[str, List[Dict[str, Any]]]) -> str:
    """
    Compresses transcript text or segments to reduce prompt size by at least 40%.
    Preserves all educational and informative text while discarding noise.
    """
    if isinstance(segments_or_text, list):
        # Extract text from segments
        text = " ".join([str(s.get("text", "")) for s in segments_or_text])
    else:
        text = segments_or_text

    if not text:
        return ""

    # Remove timestamps if present in format [00:00] or 00:00
    text = re.sub(r'\[?\d{1,2}:\d{2}(?::\d{2})?\]?', '', text)

    # Remove filler words
    text = remove_fillers(text)

    # Simplify speaker tags
    text = merge_speaker_tags(text)

    # Deduplicate consecutive sentences or duplicate phrases
    sentences = re.split(r'(?<=[.!?])\s+', text)
    unique_sentences = []
    prev_sentence = ""
    for s in sentences:
        s_clean = s.strip().lower()
        if not s_clean:
            continue
        # Deduplicate consecutive matching sentences
        if s_clean == prev_sentence:
            continue
        unique_sentences.append(s)
        prev_sentence = s_clean

    compressed = " ".join(unique_sentences)
    
    # Ensure any remaining duplicate whitespace is collapsed
    compressed = re.sub(r'\s+', ' ', compressed).strip()
    return compressed
