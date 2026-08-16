from __future__ import annotations

import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from app.modules.delivery_providers.schemas import MexyCoverageZoneDTO


@dataclass(frozen=True)
class MexyZoneMatchCandidate:
    id: uuid.UUID
    name: str
    provider_id: uuid.UUID
    provider_name: str
    priority: int
    created_at: datetime
    distance_km: float
    max_km: float


def pick_nearest_zone(rows: Sequence[dict[str, Any] | MexyZoneMatchCandidate]) -> dict[str, Any] | None:
    if not rows:
        return None

    normalized: list[dict[str, Any]] = []
    for row in rows:
        if isinstance(row, MexyZoneMatchCandidate):
            normalized.append(
                {
                    "id": row.id,
                    "name": row.name,
                    "provider_id": row.provider_id,
                    "provider_name": row.provider_name,
                    "priority": row.priority,
                    "created_at": row.created_at,
                    "distance_km": row.distance_km,
                    "max_km": row.max_km,
                }
            )
        else:
            normalized.append(row)

    return min(
        normalized,
        key=lambda item: (item["distance_km"], item["priority"], item["created_at"]),
    )


def match_mexy_zone(
    candidates: Sequence[MexyZoneMatchCandidate],
) -> tuple[MexyCoverageZoneDTO, float, uuid.UUID, uuid.UUID] | None:
    in_range = [candidate for candidate in candidates if candidate.distance_km <= candidate.max_km]
    winner = pick_nearest_zone(in_range)
    if winner is None:
        return None

    zone_id = winner["id"] if isinstance(winner["id"], uuid.UUID) else uuid.UUID(str(winner["id"]))
    provider_id = (
        winner["provider_id"]
        if isinstance(winner["provider_id"], uuid.UUID)
        else uuid.UUID(str(winner["provider_id"]))
    )
    return (
        MexyCoverageZoneDTO(
            id=zone_id,
            name=winner["name"],
            provider_name=winner["provider_name"],
        ),
        float(winner["distance_km"]),
        provider_id,
        zone_id,
    )
