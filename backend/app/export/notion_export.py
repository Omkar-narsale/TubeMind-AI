import logging
import re
from typing import List, Dict, Any, Optional, Tuple
import httpx

from app.core.config import settings

logger = logging.getLogger("app.export.notion")

NOTION_API_VERSION = "2022-06-28"
NOTION_PAGES_ENDPOINT = "https://api.notion.com/v1/pages"
NOTION_BLOCKS_ENDPOINT = "https://api.notion.com/v1/blocks"


def _clean_id(raw_id: str) -> str:
    """Removes URL prefixes or query params from Notion IDs."""
    if not raw_id:
        return ""
    raw = raw_id.strip()
    # If user pasted a full Notion URL like https://notion.so/workspace/Page-Title-1234567890abcdef...
    if "notion.so" in raw or "notion.site" in raw:
        # Extract last 32 hex characters
        matches = re.findall(r"([0-9a-fA-F]{32})", raw.replace("-", ""))
        if matches:
            return matches[-1]
    return raw.replace("-", "").strip()


def _format_rich_text(text: str) -> List[Dict[str, Any]]:
    """Splits text into <= 2000 character chunks for Notion rich_text."""
    if not text:
        return []
    chunks = []
    chunk_size = 1900
    for i in range(0, len(text), chunk_size):
        chunk = text[i : i + chunk_size]
        chunks.append({
            "type": "text",
            "text": {"content": chunk}
        })
    return chunks


def markdown_to_notion_blocks(markdown_text: str) -> List[Dict[str, Any]]:
    """
    Parses Markdown lines into Notion block structures.
    Supports headings, lists, blockquotes/callouts, dividers, and paragraphs.
    """
    blocks: List[Dict[str, Any]] = []
    lines = markdown_text.splitlines()

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue

        if stripped.startswith("### "):
            blocks.append({
                "object": "block",
                "type": "heading_3",
                "heading_3": {"rich_text": _format_rich_text(stripped[4:])}
            })
        elif stripped.startswith("## "):
            blocks.append({
                "object": "block",
                "type": "heading_2",
                "heading_2": {"rich_text": _format_rich_text(stripped[3:])}
            })
        elif stripped.startswith("# "):
            blocks.append({
                "object": "block",
                "type": "heading_1",
                "heading_1": {"rich_text": _format_rich_text(stripped[2:])}
            })
        elif stripped.startswith(("- ", "* ", "+ ")):
            blocks.append({
                "object": "block",
                "type": "bulleted_list_item",
                "bulleted_list_item": {"rich_text": _format_rich_text(stripped[2:])}
            })
        elif re.match(r"^\d+\.\s+", stripped):
            item_text = re.sub(r"^\d+\.\s+", "", stripped)
            blocks.append({
                "object": "block",
                "type": "numbered_list_item",
                "numbered_list_item": {"rich_text": _format_rich_text(item_text)}
            })
        elif stripped.startswith("> "):
            blocks.append({
                "object": "block",
                "type": "callout",
                "callout": {
                    "icon": {"type": "emoji", "emoji": "💡"},
                    "rich_text": _format_rich_text(stripped[2:])
                }
            })
        elif stripped in ("---", "***", "___"):
            blocks.append({
                "object": "block",
                "type": "divider",
                "divider": {}
            })
        else:
            blocks.append({
                "object": "block",
                "type": "paragraph",
                "paragraph": {"rich_text": _format_rich_text(stripped)}
            })

    return blocks


async def sync_to_notion(
    api_key: Optional[str],
    parent_id: Optional[str],
    video_title: str,
    youtube_url: str,
    feature: str,
    content: str,
    language: Optional[str] = "English",
) -> Tuple[bool, Optional[str], Optional[str], str]:
    """
    Creates a new page in Notion with TubeMind AI notes.
    Tries database parent first, then falls back to page parent if necessary.
    Returns:
        (success, page_id, page_url, message)
    """
    token = (api_key or getattr(settings, "NOTION_API_KEY", "")).strip()
    if not token:
        return False, None, None, "Missing Notion API Key. Provide it in Settings or request."

    target_parent = (
        parent_id
        or getattr(settings, "NOTION_DATABASE_ID", "")
        or getattr(settings, "NOTION_PAGE_ID", "")
    )
    clean_parent = _clean_id(target_parent)
    if not clean_parent:
        return False, None, None, "Missing Notion Parent (Database ID or Page ID)."

    feature_title = feature.replace("-", " ").replace("_", " ").title()
    page_title = f"{video_title or 'YouTube Video'} - {feature_title}"

    headers = {
        "Authorization": f"Bearer {token}",
        "Notion-Version": NOTION_API_VERSION,
        "Content-Type": "application/json",
    }

    # Prepare intro blocks
    intro_blocks: List[Dict[str, Any]] = [
        {
            "object": "block",
            "type": "callout",
            "callout": {
                "icon": {"type": "emoji", "emoji": "🎥"},
                "rich_text": _format_rich_text(
                    f"Generated by TubeMind AI\n"
                    f"Video: {video_title}\n"
                    f"Source: {youtube_url}\n"
                    f"Feature: {feature_title} ({language or 'English'})"
                )
            }
        },
        {"object": "block", "type": "divider", "divider": {}}
    ]

    content_blocks = markdown_to_notion_blocks(content)
    all_blocks = intro_blocks + content_blocks

    # Notion permits max 100 children blocks on page creation
    initial_blocks = all_blocks[:100]
    remaining_blocks = all_blocks[100:]

    # Attempt 1: As Database Parent
    async with httpx.AsyncClient(timeout=25.0) as client:
        # Try database parent payload
        db_payload = {
            "parent": {"database_id": clean_parent},
            "icon": {"type": "emoji", "emoji": "🧠"},
            "properties": {
                "title": {
                    "title": _format_rich_text(page_title)
                }
            },
            "children": initial_blocks
        }

        logger.info(f"Attempting Notion page creation in database parent {clean_parent}...")
        resp = await client.post(NOTION_PAGES_ENDPOINT, headers=headers, json=db_payload)

        # If 400, try page parent
        if resp.status_code == 400 or resp.status_code == 404:
            logger.info("Database parent rejected, trying page parent...")
            page_payload = {
                "parent": {"page_id": clean_parent},
                "icon": {"type": "emoji", "emoji": "🧠"},
                "properties": {
                    "title": {
                        "title": _format_rich_text(page_title)
                    }
                },
                "children": initial_blocks
            }
            resp = await client.post(NOTION_PAGES_ENDPOINT, headers=headers, json=page_payload)

        if resp.status_code not in (200, 201):
            error_data = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
            err_msg = error_data.get("message", resp.text)
            logger.error(f"Notion API error: {resp.status_code} - {err_msg}")
            return False, None, None, f"Notion API error ({resp.status_code}): {err_msg}"

        data = resp.json()
        created_page_id = data.get("id")
        created_url = data.get("url") or f"https://notion.so/{created_page_id.replace('-', '')}"

        # If more blocks remain, append in batches of 100
        while remaining_blocks:
            batch = remaining_blocks[:100]
            remaining_blocks = remaining_blocks[100:]
            append_endpoint = f"{NOTION_BLOCKS_ENDPOINT}/{created_page_id}/children"
            append_resp = await client.patch(append_endpoint, headers=headers, json={"children": batch})
            if append_resp.status_code not in (200, 201):
                logger.warning(f"Failed appending secondary block batch: {append_resp.status_code}")
                break

        return True, created_page_id, created_url, "Successfully synced to Notion!"
