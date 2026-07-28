from typing import List, Dict, Any
from app.rag.models import SemanticChunk


import re

SPONSOR_KEYWORDS = re.compile(
    r'\b(sponsor|sponsored|patreon|nordvpn|squarespace|expressvpn|audible|skillshare|dollar shave|athletic greens|hello fresh|ridge wallet|link in the description|my channel|subscribe to|hit the bell|thanks for watching|welcome back|hey guys|support the channel|discount code|promo code)\b',
    re.IGNORECASE
)

INTRO_OUTRO_KEYWORDS = re.compile(
    r'\b(hello everyone|welcome back|goodbye|see you next time|bye for now|in this video we|today we are going to|thanks for watching|subscribe to my|click the link|leave a comment)\b',
    re.IGNORECASE
)

def clean_chunk_text(text: str) -> str:
    """Removes filler sentences, sponsor messages, and intros/outros from chunk text."""
    sentences = re.split(r'(?<=[.!?])\s+', text)
    cleaned = []
    for sent in sentences:
        s_strip = sent.strip()
        if not s_strip:
            continue
        if SPONSOR_KEYWORDS.search(s_strip) or INTRO_OUTRO_KEYWORDS.search(s_strip):
            continue
        cleaned.append(s_strip)
    return " ".join(cleaned)

def chunk_transcript(segments: List[Dict[str, Any]], chunk_size: int = 500, overlap: int = 100) -> List[SemanticChunk]:
    """
    Groups YouTube transcript segments into larger semantic chunks.
    - Preserves start and end timestamps.
    - Target character size is approximately 500 characters.
    - Retains an overlap of approximately 100 characters.
    - Splits strictly at segment boundaries, preventing sentence fragmentation.
    """
    if not segments:
        return []

    chunks: List[SemanticChunk] = []
    current_segments: List[Dict[str, Any]] = []
    current_length = 0
    chunk_index = 0

    for seg in segments:
        current_segments.append(seg)
        current_length += len(seg.get("text", "")) + 1 # +1 space delimiter

        if current_length >= chunk_size:
            # Create a completed chunk
            text = " ".join([s.get("text", "") for s in current_segments])
            cleaned_text = clean_chunk_text(text)
            
            if cleaned_text.strip():
                start_time = float(current_segments[0].get("start", 0.0))
                last_seg = current_segments[-1]
                end_time = float(last_seg.get("start", 0.0)) + float(last_seg.get("duration", 0.0))

                chunks.append(SemanticChunk(
                    text=cleaned_text,
                    start_time=start_time,
                    end_time=end_time,
                    chunk_index=chunk_index
                ))
                chunk_index += 1

            # Accumulate overlap segments from the end
            overlap_segments: List[Dict[str, Any]] = []
            overlap_len = 0
            for s in reversed(current_segments):
                overlap_segments.insert(0, s)
                overlap_len += len(s.get("text", "")) + 1
                if overlap_len >= overlap:
                    break

            # Handle edge case where overlap size spans the entire chunk
            if len(overlap_segments) == len(current_segments):
                current_segments = current_segments[1:]
            else:
                current_segments = overlap_segments

            current_length = sum([len(s.get("text", "")) + 1 for s in current_segments])

    # Add trailing segment residue
    if current_segments:
        text = " ".join([s.get("text", "") for s in current_segments])
        cleaned_text = clean_chunk_text(text)
        if cleaned_text.strip():
            start_time = float(current_segments[0].get("start", 0.0))
            last_seg = current_segments[-1]
            end_time = float(last_seg.get("start", 0.0)) + float(last_seg.get("duration", 0.0))

            # Only add if it's not a duplicate of the last chunk
            if not chunks or chunks[-1].text != cleaned_text:
                chunks.append(SemanticChunk(
                    text=cleaned_text,
                    start_time=start_time,
                    end_time=end_time,
                    chunk_index=chunk_index
                ))

    return chunks

