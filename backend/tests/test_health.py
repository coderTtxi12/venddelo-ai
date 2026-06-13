from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_endpoint_returns_ok():
    resp = client.get("/api/v1/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert "env" in body
    assert "version" in body


def test_health_sets_request_id_header():
    resp = client.get("/api/v1/health")
    assert resp.headers.get("X-Request-ID")
