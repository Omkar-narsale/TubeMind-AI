from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_read_health():
    response = client.get("/health")
    assert response.status_code == 200
    json_data = response.json()
    assert json_data["success"] is True
    assert json_data["status"] == "healthy"
    assert json_data["service"] == "TubeMind AI API"


def test_swagger_and_openapi():
    response = client.get("/docs")
    assert response.status_code == 200
    
    response = client.get("/openapi.json")
    assert response.status_code == 200
