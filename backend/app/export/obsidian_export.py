import datetime
import re
import urllib.parse
from typing import Optional, List, Tuple


def _timestamp_to_seconds(ts_str: str) -> int:
    """Converts MM:SS or HH:MM:SS to total seconds."""
    parts = ts_str.split(":")
    if len(parts) == 2:
        return int(parts[0]) * 60 + int(parts[1])
    elif len(parts) == 3:
        return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
    return 0


def _linkify_timestamps(text: str, youtube_url: str) -> str:
    """Detects timestamp patterns like [02:30] or (02:30) and makes them clickable YouTube links."""
    if not youtube_url:
        return text

    clean_url = youtube_url.split("&t=")[0]
    sep = "&" if "?" in clean_url else "?"

    def replace_ts(match):
        ts = match.group(1)
        seconds = _timestamp_to_seconds(ts)
        link = f"{clean_url}{sep}t={seconds}s"
        return f"[{ts}]({link})"

    pattern = r"(?:\[|\()(\d{1,2}:\d{2}(?::\d{2})?)(?:\]|\))"
    text = re.sub(pattern, replace_ts, text)
    return text


def _get_obsidian_callout_type(feature: str) -> str:
    f = feature.lower()
    if "summary" in f:
        return "summary"
    elif "takeaway" in f:
        return "tip"
    elif "note" in f:
        return "note"
    elif "interview" in f or "quiz" in f:
        return "faq"
    elif "flashcard" in f:
        return "example"
    return "info"


def generate_obsidian_markdown(
    video_title: str,
    youtube_url: str,
    feature: str,
    language: str,
    content: str,
    vault_name: Optional[str] = None,
    tags: Optional[List[str]] = None,
) -> Tuple[bytes, str]:
    """
    Generates Obsidian-optimized Markdown with YAML frontmatter,
    native Obsidian callouts, clickable timestamp anchors, and an obsidian:// deep link.
    Returns:
        (markdown_bytes, obsidian_uri)
    """
    now_iso = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    feature_title = feature.replace("-", " ").replace("_", " ").title()

    tag_list = tags or ["tubemind", "youtube-notes", "second-brain"]
    yaml_tags = "\n".join(f"  - {t.strip().lstrip('#')}" for t in tag_list)

    frontmatter = (
        f"---\n"
        f"title: \"{video_title.replace('\"', '')}\"\n"
        f"source: \"{youtube_url}\"\n"
        f"type: youtube-note\n"
        f"feature: \"{feature_title}\"\n"
        f"language: \"{language or 'English'}\"\n"
        f"created: \"{now_iso}\"\n"
        f"tags:\n{yaml_tags}\n"
        f"---\n\n"
    )

    callout_type = _get_obsidian_callout_type(feature)
    callout_header = f"> [!{callout_type}] TubeMind AI — {feature_title}\n"
    callout_header += f"> **Video:** [{video_title or 'YouTube Video'}]({youtube_url or '#'})\n"
    callout_header += f"> **Generated:** {now_iso}\n\n"

    # Convert timestamps to clickable links
    processed_content = _linkify_timestamps(content.strip(), youtube_url)

    full_markdown = f"{frontmatter}{callout_header}{processed_content}\n"

    # Build obsidian:// URI
    note_name = f"{feature_title} - {video_title[:50].replace('/', '_')}"
    uri_params = {
        "name": note_name,
        "content": full_markdown,
    }
    if vault_name and vault_name.strip():
        uri_params["vault"] = vault_name.strip()

    obsidian_uri = f"obsidian://new?{urllib.parse.urlencode(uri_params, quote_via=urllib.parse.quote)}"

    return full_markdown.encode("utf-8"), obsidian_uri
