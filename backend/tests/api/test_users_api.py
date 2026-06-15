from tests.api.conftest import OWNER
from tests.conftest import requires_db

AUTH = {"Authorization": "Bearer valid-token"}


@requires_db
def test_get_me_creates_user(client):
    resp = client.get("/api/v1/users/me", headers=AUTH)
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == str(OWNER)
    assert body["email"] == "test@example.com"
    assert body["role"] == "owner"
    assert body["plan"] == "free"


@requires_db
def test_patch_me_display_name(client):
    client.get("/api/v1/users/me", headers=AUTH)
    resp = client.patch(
        "/api/v1/users/me",
        headers=AUTH,
        json={"display_name": "Mi Restaurante"},
    )
    assert resp.status_code == 200
    assert resp.json()["display_name"] == "Mi Restaurante"
