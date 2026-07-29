import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_export_pdf_endpoint():
    payload = {
        "video_title": "Neural Networks & Deep Learning",
        "youtube_url": "https://www.youtube.com/watch?v=mock123",
        "feature": "study_notes",
        "language": "Hindi",
        "content": "# न्यूरल नेटवर्क\n## परिचय\nयह एक दीप लर्निंग मॉडल है।\n- **मुख्य बिंदु**: weight update"
    }
    response = client.post("/api/v1/export/pdf", json=payload)
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert "Neural_Networks" in response.headers["content-disposition"]
    assert len(response.content) > 100


def test_export_docx_endpoint():
    payload = {
        "video_title": "Neural Networks & Deep Learning",
        "youtube_url": "https://www.youtube.com/watch?v=mock123",
        "feature": "summary",
        "language": "Marathi",
        "content": "# सारांश\nहा एक कृत्रिम बुद्धिमत्ता व्हिडिओ आहे.\n- पॉइंट १\n- पॉइंट २"
    }
    response = client.post("/api/v1/export/docx", json=payload)
    assert response.status_code == 200
    assert "officedocument.wordprocessingml.document" in response.headers["content-type"]
    assert len(response.content) > 100


def test_export_markdown_endpoint():
    payload = {
        "video_title": "Python Machine Learning",
        "youtube_url": "https://www.youtube.com/watch?v=mock456",
        "feature": "key_takeaways",
        "language": "English",
        "content": "✓ Key point 1\n✓ Key point 2"
    }
    response = client.post("/api/v1/export/markdown", json=payload)
    assert response.status_code == 200
    assert "text/markdown" in response.headers["content-type"]
    assert "Python Machine Learning".encode("utf-8") in response.content
    assert "✓ Key point 1".encode("utf-8") in response.content


def test_export_all_zip_endpoint():
    payload = {
        "video_title": "Comprehensive AI Guide",
        "youtube_url": "https://www.youtube.com/watch?v=mock789",
        "language": "Hindi",
        "contents": {
            "summary": "यह सारांश है।",
            "study_notes": "# अध्ययन नोट्स\nविवरण।",
            "takeaways": "✓ मुख्य बिंदु १\n✓ मुख्य बिंदु २",
            "interview_questions": "Q: प्रश्न क्या है?\nA: उत्तर यह है।"
        }
    }
    response = client.post("/api/v1/export/all", json=payload)
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"
    assert len(response.content) > 200
