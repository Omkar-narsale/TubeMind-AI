from typing import List, Dict, Any

def normalize_transcript(segments: List[Any]) -> List[Dict[str, Any]]:
    """
    Normalizes transcript segment collections (supports both dicts and objects) by:
    - Trimming leading/trailing whitespace.
    - Filtering out empty segment lines.
    - Deduping identical consecutive segment text values.
    """
    normalized: List[Dict[str, Any]] = []
    
    for segment in segments:
        if isinstance(segment, dict):
            raw_text = segment.get("text", "")
            raw_start = segment.get("start", 0.0)
            raw_duration = segment.get("duration", 0.0)
        else:
            raw_text = getattr(segment, "text", "")
            raw_start = getattr(segment, "start", 0.0)
            raw_duration = getattr(segment, "duration", 0.0)

        text = str(raw_text).strip() if raw_text else ""
        
        # Skip empty lines
        if not text:
            continue
            
        # Deduplicate identical consecutive segments
        if normalized and normalized[-1]["text"] == text:
            normalized[-1]["duration"] += float(raw_duration or 0.0)
            continue
            
        normalized.append({
            "text": text,
            "start": float(raw_start or 0.0),
            "duration": float(raw_duration or 0.0)
        })
        
    return normalized

