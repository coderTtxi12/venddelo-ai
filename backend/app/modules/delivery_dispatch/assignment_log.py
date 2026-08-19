from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models.delivery import DeliveryDispatchAssignmentEvent, DeliveryDispatchRequest
from app.modules.delivery_dispatch.engine import EngineContext, eligibility_blockers

BLOCKER_LABELS = {
    "invited": "invitado",
    "blocked": "bloqueado",
    "offline": "offline",
    "gps": "GPS viejo",
    "offer": "con oferta",
    "rejected": "rechazó antes",
    "silent": "sin respuesta",
    "compartment": "caja chica",
    "packages": "sin capacidad",
    "credit": "sin crédito",
}

CASE_DETAILS = {
    "A": "El más cercano al restaurante",
    "B": "Varios pedidos listos · riders en paralelo",
    "C": "Alta demanda · entregas cercanas, un rider",
    "D": "Alta demanda · rider que ya iba de camino",
    "E": "Alta demanda · rider libre más cercano al restaurante",
    "M": "Asignación manual desde el monitor",
}

LOG_LIMIT = 50


def driver_display_name(first_name: str | None) -> str:
    value = (first_name or "").strip()
    return value or "repartidor"


def searched_detail(
    *,
    driver_count: int,
    eligible_count: int,
    blocker_counts: dict[str, int],
    high_demand: bool,
) -> str:
    if driver_count <= 0:
        return "No hay repartidores dados de alta."
    if eligible_count > 0:
        return "Había riders, pero el motor no soltó oferta (reserva de libres)."
    parts = []
    for code, count in sorted(blocker_counts.items(), key=lambda item: (-item[1], item[0])):
        label = BLOCKER_LABELS.get(code, code)
        parts.append(f"{count} {label}")
    text = "Nadie elegible: " + ", ".join(parts) if parts else "Nadie elegible."
    if high_demand:
        text += " · alta demanda"
    return text


def offered_detail(case_applied: str) -> str:
    return CASE_DETAILS.get(case_applied, CASE_DETAILS["A"])


def offered_title(first_name: str | None) -> str:
    return f"Ofertó a {driver_display_name(first_name)}"


def expired_title(first_name: str | None) -> str:
    return f"{driver_display_name(first_name)} no respondió"


def rejected_title(first_name: str | None) -> str:
    return f"{driver_display_name(first_name)} rechazó"


def manual_title(first_name: str | None) -> str:
    return f"Oferta enviada a mano a {driver_display_name(first_name)}"


def timed_out_title() -> str:
    return "Se agotó la búsqueda"


def searched_detail_from_context(context: EngineContext, *, high_demand: bool) -> str:
    counts: dict[str, int] = {}
    eligible = 0
    for driver in context.drivers:
        reasons = eligibility_blockers(context, context.request, driver)
        if not reasons:
            eligible += 1
            continue
        for reason in reasons:
            counts[reason] = counts.get(reason, 0) + 1
    return searched_detail(
        driver_count=len(context.drivers),
        eligible_count=eligible,
        blocker_counts=counts,
        high_demand=high_demand,
    )


def record_assignment_event(
    session: Session,
    request: DeliveryDispatchRequest,
    *,
    kind: str,
    tone: str,
    title: str,
    detail: str | None,
    next_attempt_at: datetime | None = None,
    case_applied: str | None = None,
    driver_id: uuid.UUID | None = None,
) -> DeliveryDispatchAssignmentEvent:
    row = DeliveryDispatchAssignmentEvent(
        request_id=request.id,
        kind=kind,
        tone=tone,
        title=title,
        detail=detail,
        next_attempt_at=next_attempt_at,
        case_applied=case_applied,
        driver_id=driver_id,
        created_at=datetime.now(UTC),
    )
    session.add(row)
    return row


def list_assignment_events(
    session: Session,
    request_id: uuid.UUID,
) -> list[DeliveryDispatchAssignmentEvent]:
    rows = list(
        session.scalars(
            select(DeliveryDispatchAssignmentEvent)
            .where(DeliveryDispatchAssignmentEvent.request_id == request_id)
            .order_by(
                DeliveryDispatchAssignmentEvent.created_at.desc(),
                DeliveryDispatchAssignmentEvent.id.desc(),
            )
            .limit(LOG_LIMIT)
        )
    )
    rows.reverse()
    return rows
