from typing import List, Dict, Any

def normalize_transcript(segments: List[Any]) -> List[Dict[str, Any]]:
    """
    Normalizes transcript segment collections by:
    - Trimming leading/trailing whitespace.
    - Filtering out empty segment lines.
    - Deduping identical consecutive segment text values.
    """
    normalized: List[Dict[str, Any]] = []
    
    for segment in segments:
        text = getattr(segment, "text", "").strip()
        
        # Skip empty lines
        if not text:
            continue
            
        # Deduplicate identical consecutive segments
        if normalized and normalized[-1]["text"] == text:
            # Optionally extend the duration of the previous segment
            normalized[-1]["duration"] += getattr(segment, "duration", 0.0)
            continue
            
        normalized.append({
            "text": text,
            "start": float(getattr(segment, "start", 0.0)),
            "duration": float(getattr(segment, "duration", 0.0))
        })
        
    return normalized
