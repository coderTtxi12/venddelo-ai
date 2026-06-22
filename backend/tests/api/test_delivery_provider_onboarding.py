import uuid

import pytest
from sqlalchemy import select, text
from sqlalchemy.orm import sessionmaker

from app.db.models.delivery import (
    DeliveryProvider,
    DeliveryProviderMember,
    DeliveryProviderZone,
)
from app.db.uow import SqlAlchemyUnitOfWork
from tests.api.test_api_v1 import AUTH, OWNER
from tests.conftest import requires_db

SAMPLE_POLYGON = {
    "type": "Polygon",
    "coordinates": [
        [
            [-99.1332, 19.4326],
            [-99.1200, 19.4326],
            [-99.1200, 19.4400],
            [-99.1332, 19.4326],
        ]
    ],
}

ONBOARDING_PAYLOAD = {
    "company_name": "Mexy Reparto",
    "responsible_name": "Ana López",
    "responsible_phone": "+525512345678",
    "whatsapp_phone": "+525587654321",
    "service_zone_name": "Cobertura principal",
    "service_zone_polygon": SAMPLE_POLYGON,
}


@pytest.fixture(autouse=True)
def _clean_delivery_onboarding_tables(engine):
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                TRUNCATE delivery_provider_zones, delivery_provider_members,
                         delivery_providers, users
                RESTART IDENTITY CASCADE
                """
            )
        )
    yield


@requires_db
def test_delivery_provider_onboarding_persists_provider_member_and_zone(client, engine):
    resp = client.post(
        "/api/v1/delivery-providers/onboarding",
        json=ONBOARDING_PAYLOAD,
        headers=AUTH,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["name"] == "Mexy Reparto"
    assert body["status"] == "pending_review"
    assert body["responsible_name"] == "Ana López"
    assert body["responsible_phone"] == "+525512345678"
    assert body["whatsapp_phone"] == "+525587654321"
    assert body["submitted_at"] is not None

    provider_id = uuid.UUID(body["id"])
    factory = sessionmaker(bind=engine, expire_on_commit=False)

    with factory() as session:
        provider = session.get(DeliveryProvider, provider_id)
        assert provider is not None
        assert provider.slug.startswith("mexy-reparto")

        member = session.scalar(
            select(DeliveryProviderMember).where(
                DeliveryProviderMember.delivery_provider_id == provider_id,
                DeliveryProviderMember.user_id == OWNER,
            )
        )
        assert member is not None
        assert member.member_role == "owner"
        assert member.is_active is True

        zone = session.scalar(
            select(DeliveryProviderZone).where(
                DeliveryProviderZone.delivery_provider_id == provider_id
            )
        )
        assert zone is not None
        assert zone.name == "Cobertura principal"
        assert zone.zone_kind == "polygon"
        assert zone.is_active is True

        boundary = session.execute(
            text(
                """
                SELECT ST_NPoints(boundary::geometry) AS points,
                       ST_IsValid(boundary::geometry) AS valid
                FROM delivery_provider_zones
                WHERE id = :zone_id
                """
            ),
            {"zone_id": str(zone.id)},
        ).one()
        assert boundary.points >= 4
        assert boundary.valid is True


@requires_db
def test_delivery_provider_onboarding_conflict_on_second_submit(client):
    first = client.post(
        "/api/v1/delivery-providers/onboarding",
        json=ONBOARDING_PAYLOAD,
        headers=AUTH,
    )
    assert first.status_code == 201

    second = client.post(
        "/api/v1/delivery-providers/onboarding",
        json={
            **ONBOARDING_PAYLOAD,
            "company_name": "Otra Empresa",
        },
        headers=AUTH,
    )
    assert second.status_code == 409


@requires_db
def test_delivery_provider_me_after_onboarding(client, engine):
    create = client.post(
        "/api/v1/delivery-providers/onboarding",
        json=ONBOARDING_PAYLOAD,
        headers=AUTH,
    )
    assert create.status_code == 201

    me = client.get("/api/v1/delivery-providers/me", headers=AUTH)
    assert me.status_code == 200
    payload = me.json()
    assert payload["member_role"] == "owner"
    assert payload["provider"]["status"] == "pending_review"
    assert payload["provider"]["name"] == "Mexy Reparto"
