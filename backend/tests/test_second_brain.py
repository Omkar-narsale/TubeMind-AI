import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from app.main import app
from app.export.obsidian_export import generate_obsidian_markdown, _linkify_timestamps
from app.export.notion_export import markdown_to_notion_blocks, sync_to_notion

client = TestClient(app)


def test_obsidian_markdown_generation():
    title = "Machine Learning Masterclass"
    url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    content = "Key points discussed at [02:30] and (05:45) in the lesson."

    md_bytes, uri = generate_obsidian_markdown(
        video_title=title,
        youtube_url=url,
        feature="study_notes",
        language="English",
        content=content,
        vault_name="MyKnowledgeVault",
        tags=["ai", "notes"],
    )

    md_text = md_bytes.decode("utf-8")

    # Frontmatter assertions
    assert "---" in md_text
    assert f'title: "{title}"' in md_text
    assert f'source: "{url}"' in md_text
    assert "tags:" in md_text
    assert "  - ai" in md_text
    assert "  - notes" in md_text

    # Obsidian callout assertion
    assert "> [!note] TubeMind AI — Study Notes" in md_text

    # Clickable timestamp assertion
    assert "[02:30](https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=150s)" in md_text
    assert "[05:45](https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=345s)" in md_text

    # URI assertion
    assert "obsidian://new?" in uri
    assert "vault=MyKnowledgeVault" in uri


def test_markdown_to_notion_blocks():
    md = """# Main Header
## Sub Header
### Topic Header
- Bullet point 1
* Bullet point 2
1. Numbered item 1
> Key tip or insight
Regular paragraph text.
---"""

    blocks = markdown_to_notion_blocks(md)
    block_types = [b["type"] for b in blocks]

    assert "heading_1" in block_types
    assert "heading_2" in block_types
    assert "heading_3" in block_types
    assert "bulleted_list_item" in block_types
    assert "numbered_list_item" in block_types
    assert "callout" in block_types
    assert "paragraph" in block_types
    assert "divider" in block_types


@pytest.mark.asyncio
async def test_sync_to_notion_missing_token():
    success, page_id, url, msg = await sync_to_notion(
        api_key="",
        parent_id="1234567890abcdef1234567890abcdef",
        video_title="Test Video",
        youtube_url="https://youtube.com/watch?v=123",
        feature="summary",
        content="Test content",
    )
    assert success is False
    assert "Missing Notion API Key" in msg


def test_export_obsidian_endpoint():
    response = client.post(
        "/api/v1/export/obsidian",
        json={
            "video_title": "Python FastAPI Guide",
            "youtube_url": "https://www.youtube.com/watch?v=abc123xyz",
            "feature": "summary",
            "language": "English",
            "content": "A great guide at [01:00].",
            "vault_name": "DevVault",
        },
    )
    assert response.status_code == 200
    assert "text/markdown" in response.headers["content-type"]
    assert "X-Obsidian-URI" in response.headers
    assert "obsidian://" in response.headers["X-Obsidian-URI"]
    assert "Python_FastAPI_Guide" in response.headers["content-disposition"]


def test_export_notion_endpoint_validation():
    # Calling without valid key should return 400
    response = client.post(
        "/api/v1/export/notion",
        json={
            "api_key": "",
            "parent_id": "",
            "video_title": "Test Video",
            "youtube_url": "https://youtube.com",
            "feature": "summary",
            "content": "Test content",
        },
    )
    assert response.status_code == 400
