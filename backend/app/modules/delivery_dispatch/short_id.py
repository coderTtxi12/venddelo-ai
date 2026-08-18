from __future__ import annotations

import secrets
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

SHORT_ID_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
SHORT_ID_LENGTH = 5


def generate_dispatch_short_id() -> str:
    return "".join(secrets.choice(SHORT_ID_ALPHABET) for _ in range(SHORT_ID_LENGTH))


def allocate_dispatch_short_id(session: Session, *, attempts: int = 16) -> str:
    from sqlalchemy import select

    from app.db.models.delivery import DeliveryDispatchRequest

    for _ in range(attempts):
        candidate = generate_dispatch_short_id()
        exists = session.scalar(
            select(DeliveryDispatchRequest.id).where(
                DeliveryDispatchRequest.short_id == candidate
            )
        )
        if exists is None:
            return candidate
    raise RuntimeError("No se pudo generar un ID corto único para el envío")
