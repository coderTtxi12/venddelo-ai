import uuid

import pytest
from sqlalchemy import select, text
from sqlalchemy.orm import sessionmaker

from app.db.models.delivery import (
    DeliveryProvider,
    DeliveryProviderMember,
    DeliveryProviderSchedule,
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
                TRUNCATE delivery_provider_schedules, delivery_provider_zones,
                         delivery_provider_members, delivery_providers, users
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

        schedule_rows = session.scalars(
            select(DeliveryProviderSchedule).where(
                DeliveryProviderSchedule.delivery_provider_id == provider_id
            )
        ).all()
        assert len(schedule_rows) == 14
        regular = [row for row in schedule_rows if row.schedule_kind == "regular"]
        night = [row for row in schedule_rows if row.schedule_kind == "night"]
        assert len(regular) == 7
        assert len(night) == 7
        assert regular[0].opens_at.isoformat() == "09:00:00"
        assert regular[0].closes_at.isoformat() == "21:00:00"
        assert night[0].opens_at.isoformat() == "21:00:00"
        assert night[0].closes_at.isoformat() == "22:00:00"


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
    assert payload["primary_zone"] is not None
    assert payload["primary_zone"]["name"] == "Cobertura principal"
    assert payload["primary_zone"]["polygon"]["type"] == "Polygon"


@requires_db
def test_delivery_provider_profile_update(client):
    create = client.post(
        "/api/v1/delivery-providers/onboarding",
        json=ONBOARDING_PAYLOAD,
        headers=AUTH,
    )
    assert create.status_code == 201

    updated_polygon = {
        "type": "Polygon",
        "coordinates": [
            [
                [-99.1400, 19.4326],
                [-99.1250, 19.4326],
                [-99.1250, 19.4450],
                [-99.1400, 19.4326],
            ]
        ],
    }

    patch = client.patch(
        "/api/v1/delivery-providers/me",
        json={
            **ONBOARDING_PAYLOAD,
            "company_name": "Mexy Reparto Actualizado",
            "responsible_name": "Ana García",
            "service_zone_name": "Zona norte",
            "service_zone_polygon": updated_polygon,
            "center_lat": 19.438,
            "center_lng": -99.132,
        },
        headers=AUTH,
    )
    assert patch.status_code == 200, patch.text
    body = patch.json()
    assert body["name"] == "Mexy Reparto Actualizado"
    assert body["responsible_name"] == "Ana García"

    me = client.get("/api/v1/delivery-providers/me", headers=AUTH)
    assert me.status_code == 200
    payload = me.json()
    assert payload["primary_zone"]["name"] == "Zona norte"
    assert payload["primary_zone"]["center_lat"] == 19.438
    assert payload["primary_zone"]["polygon"]["coordinates"][0][0][0] == -99.14


@requires_db
def test_delivery_provider_schedules_list_and_update(client):
    create = client.post(
        "/api/v1/delivery-providers/onboarding",
        json=ONBOARDING_PAYLOAD,
        headers=AUTH,
    )
    assert create.status_code == 201

    listed = client.get("/api/v1/delivery-providers/me/schedules", headers=AUTH)
    assert listed.status_code == 200
    rows = listed.json()
    assert len(rows) == 14
    assert all(row["schedule_kind"] in {"regular", "night"} for row in rows)

    updated_payload = []
    for day in range(7):
        updated_payload.append(
            {
                "schedule_kind": "regular",
                "day_of_week": day,
                "opens_at": "10:00:00",
                "closes_at": "20:00:00",
            }
        )
        updated_payload.append(
            {
                "schedule_kind": "night",
                "day_of_week": day,
                "opens_at": "20:00:00",
                "closes_at": "23:00:00",
            }
        )

    put = client.put(
        "/api/v1/delivery-providers/me/schedules",
        json=updated_payload,
        headers=AUTH,
    )
    assert put.status_code == 204, put.text

    listed_after = client.get("/api/v1/delivery-providers/me/schedules", headers=AUTH)
    assert listed_after.status_code == 200
    after_rows = listed_after.json()
    monday_regular = next(
        row
        for row in after_rows
        if row["schedule_kind"] == "regular" and row["day_of_week"] == 0
    )
    assert monday_regular["opens_at"].startswith("10:00")
    assert monday_regular["closes_at"].startswith("20:00")


@requires_db
def test_delivery_provider_schedules_rejects_invalid_window(client):
    create = client.post(
        "/api/v1/delivery-providers/onboarding",
        json=ONBOARDING_PAYLOAD,
        headers=AUTH,
    )
    assert create.status_code == 201

    put = client.put(
        "/api/v1/delivery-providers/me/schedules",
        json=[
            {
                "schedule_kind": "regular",
                "day_of_week": 0,
                "opens_at": "18:00:00",
                "closes_at": "09:00:00",
            }
        ],
        headers=AUTH,
    )
    assert put.status_code == 422


@requires_db
def test_delivery_provider_service_status_toggle(client):
    create = client.post(
        "/api/v1/delivery-providers/onboarding",
        json=ONBOARDING_PAYLOAD,
        headers=AUTH,
    )
    assert create.status_code == 201

    status = client.get("/api/v1/delivery-providers/me/service-status", headers=AUTH)
    assert status.status_code == 200
    body = status.json()
    assert body["manually_enabled"] is True
    assert "service_active" in body
    assert "within_schedule" in body
    assert body["status_reason"] in {"active", "manual_off", "outside_schedule"}

    off = client.patch(
        "/api/v1/delivery-providers/me/service-status",
        json={"manually_enabled": False},
        headers=AUTH,
    )
    assert off.status_code == 200, off.text
    off_body = off.json()
    assert off_body["manually_enabled"] is False
    assert off_body["service_active"] is False
    assert off_body["status_reason"] == "manual_off"

    on = client.patch(
        "/api/v1/delivery-providers/me/service-status",
        json={"manually_enabled": True},
        headers=AUTH,
    )
    assert on.status_code == 200
    assert on.json()["manually_enabled"] is True
