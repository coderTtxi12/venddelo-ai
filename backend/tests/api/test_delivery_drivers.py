import base64
import uuid

import pytest
from sqlalchemy import select, text
from sqlalchemy.orm import sessionmaker

from app.api.deps import get_auth
from app.core.security import AuthenticatedUser, AuthPort
from app.db.models.delivery import DeliveryDriver, DeliveryProviderMember
from app.main import app
from tests.api.test_delivery_provider_onboarding import AUTH, ONBOARDING_PAYLOAD
from tests.conftest import requires_db

OWNER = uuid.UUID("11111111-1111-1111-1111-111111111111")
OPERATOR = uuid.UUID("33333333-3333-3333-3333-333333333333")
RIDER = uuid.UUID("44444444-4444-4444-4444-444444444444")

TINY_PNG = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)
TINY_PDF = "data:application/pdf;base64," + base64.b64encode(
    b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"
).decode("ascii")


class FakeAuth(AuthPort):
    def __init__(self, user_id: uuid.UUID = OWNER, email: str = "test@example.com") -> None:
        self._user_id = user_id
        self._email = email

    def verify_token(self, token: str) -> AuthenticatedUser:
        if token != "valid-token":
            from app.core.exceptions import UnauthorizedError

            raise UnauthorizedError("Invalid token")
        return AuthenticatedUser(id=self._user_id, email=self._email)


@pytest.fixture(autouse=True)
def _clean_delivery_driver_tables(engine):
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                TRUNCATE delivery_drivers, delivery_provider_admin_invites,
                         delivery_provider_schedules, delivery_provider_zones,
                         delivery_provider_members, delivery_providers, users
                RESTART IDENTITY CASCADE
                """
            )
        )
    yield


def _create_provider(client) -> uuid.UUID:
    resp = client.post(
        "/api/v1/delivery-providers/onboarding",
        json=ONBOARDING_PAYLOAD,
        headers=AUTH,
    )
    assert resp.status_code == 201, resp.text
    return uuid.UUID(resp.json()["id"])


def _main_zone_id(client) -> str:
    resp = client.get("/api/v1/delivery-providers/me/zones", headers=AUTH)
    assert resp.status_code == 200, resp.text
    return resp.json()[0]["id"]


def _invite_and_claim_operator(client, provider_id: uuid.UUID) -> None:
    created = client.post(
        "/api/v1/delivery-providers/me/admin-invites",
        json={"email": "operador@empresa.com", "member_role": "operator"},
        headers=AUTH,
    )
    assert created.status_code == 201, created.text

    app.dependency_overrides[get_auth] = lambda: FakeAuth(
        user_id=OPERATOR,
        email="operador@empresa.com",
    )
    try:
        me = client.get("/api/v1/delivery-providers/me", headers=AUTH)
        assert me.status_code == 200, me.text
        assert me.json()["member_role"] == "operator"
        assert me.json()["provider"]["id"] == str(provider_id)
    finally:
        app.dependency_overrides.pop(get_auth, None)


def _driver_create_payload(email: str = "rider@empresa.com") -> dict:
    return {
        "first_name": "Juan",
        "last_name": "Pérez",
        "phone": "+525511112233",
        "emergency_contact_name": "María Pérez",
        "emergency_contact_phone": "+525598765432",
        "email": email,
        "compartment_size": "normal",
        "plate": "ABC123",
        "motorcycle_brand": "Italika",
        "motorcycle_color": "Rojo",
        "profile_photo_base64": TINY_PNG,
        "profile_photo_file_name": "foto.png",
        "ine_document_base64": TINY_PNG,
        "ine_document_file_name": "ine.png",
        "license_document_base64": TINY_PNG,
        "license_document_file_name": "licencia.png",
        "insurance_document_base64": TINY_PNG,
        "insurance_document_file_name": "seguro.png",
    }


@requires_db
def test_owner_can_create_driver(client):
    _create_provider(client)

    response = client.post(
        "/api/v1/delivery-providers/me/drivers",
        json=_driver_create_payload(),
        headers=AUTH,
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["status"] == "invited"
    assert body["user_id"] is None
    assert body["credit_limit_cents"] == 50000
    assert body["credit_held_cents"] == 0
    assert body["email"] == "rider@empresa.com"
    assert body["is_online"] is False
    assert body["profile_photo_path"].endswith(".webp")
    assert body["ine_document_path"].endswith(".webp")
    assert body["license_document_path"].endswith(".webp")
    assert body["insurance_document_path"].endswith(".webp")
    assert body["plate"] == "ABC123"
    assert body["emergency_contact_name"] == "María Pérez"
    assert body["emergency_contact_phone"] == "+525598765432"
    assert body["registered_zone_id"] is None
    assert body["registered_zone_name"] is None


@requires_db
def test_create_driver_stores_informational_zone_and_uppercases_plate(client):
    _create_provider(client)
    zone_id = _main_zone_id(client)

    payload = _driver_create_payload("zona-rider@empresa.com")
    payload["plate"] = "ab-12cd"
    payload["registered_zone_id"] = zone_id

    response = client.post(
        "/api/v1/delivery-providers/me/drivers",
        json=payload,
        headers=AUTH,
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["plate"] == "AB-12CD"
    assert body["registered_zone_id"] == zone_id
    assert body["registered_zone_name"] == "Cobertura principal"


@requires_db
def test_create_driver_rejects_foreign_registered_zone(client):
    _create_provider(client)
    payload = _driver_create_payload("bad-zone@empresa.com")
    payload["registered_zone_id"] = str(uuid.uuid4())

    response = client.post(
        "/api/v1/delivery-providers/me/drivers",
        json=payload,
        headers=AUTH,
    )
    assert response.status_code == 400
    assert response.json()["error"]["message"] == "La zona de empresa no es válida"


@requires_db
def test_pdf_driver_documents_keep_pdf_extension(client):
    _create_provider(client)

    payload = _driver_create_payload("pdf-rider@empresa.com")
    payload["ine_document_base64"] = TINY_PDF
    payload["ine_document_file_name"] = "ine.pdf"
    payload["license_document_base64"] = TINY_PDF
    payload["license_document_file_name"] = "licencia.pdf"

    response = client.post(
        "/api/v1/delivery-providers/me/drivers",
        json=payload,
        headers=AUTH,
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["profile_photo_path"].endswith(".webp")
    assert body["ine_document_path"].endswith(".pdf")
    assert body["license_document_path"].endswith(".pdf")
    assert body["insurance_document_path"].endswith(".webp")


@requires_db
def test_operator_cannot_create_driver(client):
    provider_id = _create_provider(client)
    _invite_and_claim_operator(client, provider_id)

    app.dependency_overrides[get_auth] = lambda: FakeAuth(
        user_id=OPERATOR,
        email="operador@empresa.com",
    )
    try:
        response = client.post(
            "/api/v1/delivery-providers/me/drivers",
            json=_driver_create_payload(),
            headers=AUTH,
        )
        assert response.status_code == 403
        assert (
            response.json()["error"]["message"]
            == "Tu rol no permite modificar esta configuración"
        )
    finally:
        app.dependency_overrides.pop(get_auth, None)


@requires_db
def test_duplicate_driver_email_returns_409(client):
    _create_provider(client)

    first = client.post(
        "/api/v1/delivery-providers/me/drivers",
        json=_driver_create_payload("Rider@Empresa.com"),
        headers=AUTH,
    )
    assert first.status_code == 201, first.text

    second = client.post(
        "/api/v1/delivery-providers/me/drivers",
        json=_driver_create_payload("rider@empresa.com"),
        headers=AUTH,
    )
    assert second.status_code == 409
    assert second.json()["error"]["message"] == "Ya existe un repartidor con ese correo"


@requires_db
def test_claim_driver_on_get_me(client, engine):
    provider_id = _create_provider(client)

    created = client.post(
        "/api/v1/delivery-providers/me/drivers",
        json=_driver_create_payload("repartidor@empresa.com"),
        headers=AUTH,
    )
    assert created.status_code == 201, created.text
    driver_id = created.json()["id"]

    app.dependency_overrides[get_auth] = lambda: FakeAuth(
        user_id=RIDER,
        email="repartidor@empresa.com",
    )
    try:
        me = client.get("/api/v1/delivery-providers/me", headers=AUTH)
        assert me.status_code == 200, me.text
        assert me.json()["member_role"] == "driver"
        assert me.json()["provider"]["id"] == str(provider_id)

        drivers = client.get("/api/v1/delivery-providers/me/drivers", headers=AUTH)
        assert drivers.status_code == 403
        assert (
            drivers.json()["error"]["message"]
            == "Tu rol no permite ver esta información"
        )
    finally:
        app.dependency_overrides[get_auth] = lambda: FakeAuth()

    drivers = client.get("/api/v1/delivery-providers/me/drivers", headers=AUTH)
    assert drivers.status_code == 200, drivers.text
    row = next(item for item in drivers.json() if item["id"] == driver_id)
    assert row["status"] == "active"
    assert row["user_id"] == str(RIDER)

    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        member = session.scalar(
            select(DeliveryProviderMember).where(
                DeliveryProviderMember.delivery_provider_id == provider_id,
                DeliveryProviderMember.user_id == RIDER,
            )
        )
        assert member is not None
        assert member.member_role == "driver"


@requires_db
def test_unregistered_user_cannot_access_rider_me(client):
    _create_provider(client)

    app.dependency_overrides[get_auth] = lambda: FakeAuth(
        user_id=RIDER,
        email="noexiste@empresa.com",
    )
    try:
        me = client.get("/api/v1/rider/me", headers=AUTH)
        assert me.status_code == 403, me.text
        assert "dado de alta" in me.json()["error"]["message"]
    finally:
        app.dependency_overrides[get_auth] = lambda: FakeAuth()


@requires_db
def test_patch_cannot_change_credit_held_cents(client, engine):
    _create_provider(client)

    created = client.post(
        "/api/v1/delivery-providers/me/drivers",
        json=_driver_create_payload(),
        headers=AUTH,
    )
    assert created.status_code == 201, created.text
    driver_id = created.json()["id"]

    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        driver = session.get(DeliveryDriver, uuid.UUID(driver_id))
        assert driver is not None
        driver.credit_held_cents = 12000
        session.commit()

    patched = client.patch(
        f"/api/v1/delivery-providers/me/drivers/{driver_id}",
        json={"first_name": "Pedro", "credit_held_cents": 1},
        headers=AUTH,
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["first_name"] == "Pedro"
    assert patched.json()["credit_held_cents"] == 12000


@requires_db
def test_patch_credit_limit_below_held_returns_400(client, engine):
    _create_provider(client)

    created = client.post(
        "/api/v1/delivery-providers/me/drivers",
        json=_driver_create_payload(),
        headers=AUTH,
    )
    assert created.status_code == 201, created.text
    driver_id = created.json()["id"]

    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        driver = session.get(DeliveryDriver, uuid.UUID(driver_id))
        assert driver is not None
        driver.credit_held_cents = 12000
        session.commit()

    patched = client.patch(
        f"/api/v1/delivery-providers/me/drivers/{driver_id}",
        json={"credit_limit_cents": 10000},
        headers=AUTH,
    )
    assert patched.status_code == 400
    assert (
        patched.json()["error"]["message"]
        == "El límite de crédito no puede ser menor que el crédito retenido"
    )


@requires_db
def test_patch_blocked_forces_offline(client, engine):
    _create_provider(client)

    created = client.post(
        "/api/v1/delivery-providers/me/drivers",
        json=_driver_create_payload(),
        headers=AUTH,
    )
    assert created.status_code == 201, created.text
    driver_id = created.json()["id"]

    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        driver = session.get(DeliveryDriver, uuid.UUID(driver_id))
        assert driver is not None
        driver.is_online = True
        session.commit()

    patched = client.patch(
        f"/api/v1/delivery-providers/me/drivers/{driver_id}",
        json={"status": "blocked"},
        headers=AUTH,
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["status"] == "blocked"
    assert patched.json()["is_online"] is False


@requires_db
def test_claim_skips_blocked_driver(client, engine):
    provider_id = _create_provider(client)

    created = client.post(
        "/api/v1/delivery-providers/me/drivers",
        json=_driver_create_payload("repartidor@empresa.com"),
        headers=AUTH,
    )
    assert created.status_code == 201, created.text
    driver_id = created.json()["id"]

    patched = client.patch(
        f"/api/v1/delivery-providers/me/drivers/{driver_id}",
        json={"status": "blocked"},
        headers=AUTH,
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["status"] == "blocked"

    app.dependency_overrides[get_auth] = lambda: FakeAuth(
        user_id=RIDER,
        email="repartidor@empresa.com",
    )
    try:
        me = client.get("/api/v1/rider/me", headers=AUTH)
        assert me.status_code == 403
        provider_me = client.get("/api/v1/delivery-providers/me", headers=AUTH)
        assert provider_me.status_code == 200, provider_me.text
        assert provider_me.json()["provider"] is None
        assert provider_me.json()["member_role"] is None
    finally:
        app.dependency_overrides[get_auth] = lambda: FakeAuth()

    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        driver = session.get(DeliveryDriver, uuid.UUID(driver_id))
        assert driver is not None
        assert driver.status == "blocked"
        assert driver.user_id is None
        member = session.scalar(
            select(DeliveryProviderMember).where(
                DeliveryProviderMember.delivery_provider_id == provider_id,
                DeliveryProviderMember.user_id == RIDER,
            )
        )
        assert member is None
