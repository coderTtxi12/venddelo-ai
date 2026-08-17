from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models.delivery import (
    DeliveryProviderAssignmentSettings,
    DeliverySearchLeadTime,
)

DEFAULT_LEAD_TIMES: tuple[tuple[int, int], ...] = (
    (5, 0),
    (10, 5),
    (15, 6),
    (20, 7),
    (30, 9),
)


def seed_dispatch_defaults(session: Session, provider_id: uuid.UUID) -> None:
    existing_settings = session.scalar(
        select(DeliveryProviderAssignmentSettings.delivery_provider_id).where(
            DeliveryProviderAssignmentSettings.delivery_provider_id == provider_id
        )
    )
    if existing_settings is None:
        session.add(DeliveryProviderAssignmentSettings(delivery_provider_id=provider_id))

    existing_prep = session.scalars(
        select(DeliverySearchLeadTime.prep_minutes).where(
            DeliverySearchLeadTime.delivery_provider_id == provider_id
        )
    ).all()
    existing_set = set(existing_prep)
    for prep_minutes, search_ahead_minutes in DEFAULT_LEAD_TIMES:
        if prep_minutes in existing_set:
            continue
        session.add(
            DeliverySearchLeadTime(
                delivery_provider_id=provider_id,
                prep_minutes=prep_minutes,
                search_ahead_minutes=search_ahead_minutes,
            )
        )
    session.flush()
