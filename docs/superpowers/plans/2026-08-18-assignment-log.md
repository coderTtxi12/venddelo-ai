# Assignment log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist human-readable assignment-engine events per dispatch request and show them in the `/monitor` request detail drawer (scheduler strip + log), without putting them on the monitor poll.

**Architecture:** Pure copy helpers in `assignment_log.py` plus a new `delivery_dispatch_assignment_events` table. Engine ticks (`search`/`retry` miss, persist offer, expire, reject, timeout, manual) insert one row in the same DB transaction. `GET /delivery-providers/me/dispatch-requests/{id}/assignment-log` loads the last 50. The dashboard drawer fetches that GET on open and when the monitor socket ticks.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, pytest, Next.js `delivery-dashboard`, CSS modules.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-18-assignment-log-design.es.md`
- Copy is Spanish, generated on the server with fixed templates. The frontend does not compose “por qué”.
- Do not show raw `case A` alone; put the meaning in `detail`.
- Do not query Cloud Tasks or Cloud Logging.
- Do not add events to `GET /dispatch-monitor`.
- Do not change `HistoryDetailDrawer`.
- Do not add a new font or palette; reuse `RequestDetailDrawer` tokens (`#2563eb`, `#a16207`, `#16a34a`).
- No emoji icons.
- Auth 404 for missing provider or request not in that company — same as `create_manual_offer` (`NotFoundError`).
- Do not commit unless the user asks.
- TDD: failing test first; watch it fail; then implement.
- Pytest: `cd backend && .venv/bin/python -m pytest <path> -v --tb=short`

---

## File map

| File | Responsibility |
|------|----------------|
| `backend/app/modules/delivery_dispatch/assignment_log.py` | Templates, insert, list-for-API |
| `backend/app/db/models/delivery.py` | `DeliveryDispatchAssignmentEvent` |
| `backend/app/db/models/__init__.py` | Import the model so metadata includes the table |
| `backend/migrations/versions/0059_assignment_events.py` | Table + index + checks |
| `backend/app/modules/delivery_dispatch/tasks.py` | Write events on search miss, expire, timeout |
| `backend/app/modules/delivery_dispatch/service.py` | Write on reject + manual; GET service method |
| `backend/app/modules/delivery_dispatch/schemas.py` | Log DTOs |
| `backend/app/modules/delivery_dispatch/api.py` | GET route |
| `backend/tests/modules/test_assignment_log_copy.py` | Template unit tests |
| `backend/tests/api/test_assignment_log.py` | Persist + GET API tests |
| `delivery-dashboard/src/lib/api/types.ts` | TS types |
| `delivery-dashboard/src/lib/api/deliveryProviders.ts` | `getAssignmentLog` |
| `delivery-dashboard/src/lib/dispatch/monitorCopy.ts` | Scheduler strip copy |
| `delivery-dashboard/src/components/monitor/RequestDetailDrawer.tsx` | UI |
| `delivery-dashboard/src/components/monitor/RequestDetailDrawer.module.css` | Strip + reuse timeline |
| `delivery-dashboard/src/components/pages/MonitorPage.tsx` | Pass token + refresh nonce |

---

### Task 1: Spanish copy helpers

**Files:**
- Create: `backend/tests/modules/test_assignment_log_copy.py`
- Create: `backend/app/modules/delivery_dispatch/assignment_log.py`

**Interfaces:**
- Produces:
  - `BLOCKER_LABELS: dict[str, str]`
  - `CASE_DETAILS: dict[str, str]`
  - `driver_display_name(first_name: str | None) -> str`
  - `searched_detail(*, driver_count: int, eligible_count: int, blocker_counts: dict[str, int], high_demand: bool) -> str`
  - `offered_detail(case_applied: str) -> str`
  - `offered_title(first_name: str | None) -> str`
  - `expired_title(first_name: str | None) -> str`
  - `rejected_title(first_name: str | None) -> str`
  - `manual_title(first_name: str | None) -> str`
  - `timed_out_title() -> str`

- [ ] **Step 1: Write the failing test**

```python
from app.modules.delivery_dispatch.assignment_log import (
    driver_display_name,
    expired_title,
    manual_title,
    offered_detail,
    offered_title,
    rejected_title,
    searched_detail,
    timed_out_title,
)


def test_driver_display_name_falls_back() -> None:
    assert driver_display_name("Luis") == "Luis"
    assert driver_display_name("  ") == "repartidor"
    assert driver_display_name(None) == "repartidor"


def test_searched_detail_no_drivers() -> None:
    assert searched_detail(
        driver_count=0, eligible_count=0, blocker_counts={}, high_demand=False
    ) == "No hay repartidores dados de alta."


def test_searched_detail_blockers_and_high_demand() -> None:
    text = searched_detail(
        driver_count=3,
        eligible_count=0,
        blocker_counts={"offline": 2, "gps": 1},
        high_demand=True,
    )
    assert text == "Nadie elegible: 2 offline, 1 GPS viejo · alta demanda"


def test_searched_detail_eligible_but_no_offer() -> None:
    assert searched_detail(
        driver_count=4,
        eligible_count=2,
        blocker_counts={"offline": 2},
        high_demand=False,
    ) == "Había riders, pero el motor no soltó oferta (reserva de libres)."


def test_offer_copy() -> None:
    assert offered_title("Luis") == "Ofertó a Luis"
    assert offered_detail("A") == "El más cercano al restaurante"
    assert offered_detail("B") == "Varios pedidos listos · riders en paralelo"
    assert offered_detail("C") == "Alta demanda · entregas cercanas, un rider"
    assert offered_detail("D") == "Alta demanda · rider que ya iba de camino"
    assert offered_detail("M") == "Asignación manual desde el monitor"
    assert expired_title("Luis") == "Luis no respondió"
    assert rejected_title("Luis") == "Luis rechazó"
    assert manual_title("Luis") == "Oferta enviada a mano a Luis"
    assert timed_out_title() == "Se agotó la búsqueda"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/modules/test_assignment_log_copy.py -v --tb=short`

Expected: FAIL import error `assignment_log` not found.

- [ ] **Step 3: Write minimal implementation**

Create `backend/app/modules/delivery_dispatch/assignment_log.py`:

```python
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models.delivery import (
    DeliveryDispatchAssignmentEvent,
    DeliveryDispatchRequest,
    DeliveryDriver,
)
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


def searched_detail_from_context(context: EngineContext) -> str:
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
        high_demand=False,
    )
```

Leave `record_assignment_event` / list helpers for Task 3. `searched_detail_from_context` uses `high_demand=False`; Task 4 will pass `high_demand` from `EngineResult` via a new kwarg — add it now:

Change `searched_detail_from_context` to:

```python
def searched_detail_from_context(context: EngineContext, *, high_demand: bool) -> str:
    ...
    return searched_detail(..., high_demand=high_demand)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest tests/modules/test_assignment_log_copy.py -v --tb=short`

Expected: PASS

- [ ] **Step 5: Commit**

Skip unless the user asked to commit.

---

### Task 2: Table, model, insert helper

**Files:**
- Create: `backend/migrations/versions/0059_assignment_events.py`
- Modify: `backend/app/db/models/delivery.py` (after `DeliveryDispatchRequest`, before `DeliveryDispatchOffer`)
- Modify: `backend/app/db/models/__init__.py` (add `DeliveryDispatchAssignmentEvent` to the delivery import)
- Modify: `backend/app/modules/delivery_dispatch/assignment_log.py`
- Test: `backend/tests/modules/test_assignment_log_copy.py` (keep) + model is exercised in Task 4 API tests. For this task add persist unit that needs DB only if `requires_db` — skip isolated DB here; migration + model compile is enough. Add a tiny import test in `test_assignment_log_copy.py`:

```python
def test_record_assignment_event_signature_imports() -> None:
    from app.modules.delivery_dispatch.assignment_log import record_assignment_event

    assert callable(record_assignment_event)
```

**Interfaces:**
- Produces: model `DeliveryDispatchAssignmentEvent`
- Produces: `record_assignment_event(session, request, *, kind, tone, title, detail, next_attempt_at=None, case_applied=None, driver_id=None) -> DeliveryDispatchAssignmentEvent`

- [ ] **Step 1: Write the failing test**

Add `test_record_assignment_event_signature_imports` as above. It will fail until `record_assignment_event` exists.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/modules/test_assignment_log_copy.py::test_record_assignment_event_signature_imports -v --tb=short`

Expected: FAIL `record_assignment_event` not found.

- [ ] **Step 3: Write migration, model, insert**

Create `backend/migrations/versions/0059_assignment_events.py`:

```python
"""assignment engine event log

Revision ID: 0059_assignment_events
Revises: 0058_dispatch_status_times
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0059_assignment_events"
down_revision: str | None = "0058_dispatch_status_times"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "delivery_dispatch_assignment_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("request_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("tone", sa.String(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("detail", sa.Text(), nullable=True),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("case_applied", sa.String(), nullable=True),
        sa.Column("driver_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.ForeignKeyConstraint(["request_id"], ["delivery_dispatch_requests.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["driver_id"], ["delivery_drivers.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            "kind IN ('searched','offered','expired','rejected','timed_out','manual')",
            name="assignment_event_kind_allowed",
        ),
        sa.CheckConstraint(
            "tone IN ('ok','wait','warn')",
            name="assignment_event_tone_allowed",
        ),
        sa.CheckConstraint(
            "case_applied IS NULL OR case_applied IN ('A','B','C','D','M')",
            name="assignment_event_case_allowed",
        ),
    )
    op.create_index(
        "ix_delivery_dispatch_assignment_events_request_created",
        "delivery_dispatch_assignment_events",
        ["request_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_delivery_dispatch_assignment_events_request_created",
        table_name="delivery_dispatch_assignment_events",
    )
    op.drop_table("delivery_dispatch_assignment_events")
```

In `DeliveryDispatchRequest` add:

```python
assignment_events: Mapped[list["DeliveryDispatchAssignmentEvent"]] = relationship(
    back_populates="request",
)
```

Insert class after `DeliveryDispatchRequest` (before `DeliveryDispatchOffer`):

```python
class DeliveryDispatchAssignmentEvent(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "delivery_dispatch_assignment_events"

    request_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("delivery_dispatch_requests.id", ondelete="CASCADE"),
        nullable=False,
    )
    kind: Mapped[str] = mapped_column(String, nullable=False)
    tone: Mapped[str] = mapped_column(String, nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    next_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    case_applied: Mapped[str | None] = mapped_column(String, nullable=True)
    driver_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("delivery_drivers.id", ondelete="SET NULL"),
        nullable=True,
    )

    request: Mapped["DeliveryDispatchRequest"] = relationship(back_populates="assignment_events")
    driver: Mapped["DeliveryDriver | None"] = relationship()

    __table_args__ = (
        CheckConstraint(
            "kind IN ('searched','offered','expired','rejected','timed_out','manual')",
            name="assignment_event_kind_allowed",
        ),
        CheckConstraint(
            "tone IN ('ok','wait','warn')",
            name="assignment_event_tone_allowed",
        ),
        CheckConstraint(
            "case_applied IS NULL OR case_applied IN ('A','B','C','D','M')",
            name="assignment_event_case_allowed",
        ),
        Index(
            "ix_delivery_dispatch_assignment_events_request_created",
            "request_id",
            "created_at",
        ),
    )
```

Append to `record_assignment_event` in `assignment_log.py`:

```python
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
    )
    session.add(row)
    return row
```

Import `DeliveryDispatchAssignmentEvent` in `backend/app/db/models/__init__.py`.

- [ ] **Step 4: Run copy tests**

Run: `cd backend && .venv/bin/python -m pytest tests/modules/test_assignment_log_copy.py -v --tb=short`

Expected: PASS

- [ ] **Step 5: Commit**

Skip unless the user asked to commit.

---

### Task 3: Write events from the engine tick

**Files:**
- Modify: `backend/app/modules/delivery_dispatch/tasks.py` (`run_search` timeout, `_enqueue_retry`, `_persist_dispatch_offer`, `handle_expire_offer`, `reject_offer_and_search`)
- Test: `backend/tests/api/test_assignment_log.py`

**Interfaces:**
- Consumes: `record_assignment_event`, copy helpers, `searched_detail_from_context`
- Produces: a row after each search miss / offer / expire / timeout

One event per request per tick: if `_persist_dispatch_offer` succeeds, `kind` is `offered` (or `manual` when `case=="M"`). `_enqueue_retry` writes `searched`. Do not also write `searched` when an offer was persisted for that request.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/api/test_assignment_log.py` using the same `_setup_ready_fleet` / `_create_dispatch_request` / AUTH helpers as `tests/api/test_delivery_rider_offers.py` and `tests/api/test_delivery_manual_offer.py`.

```python
from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select, text
from sqlalchemy.orm import sessionmaker

from app.api.deps import get_auth
from app.core.security import AuthenticatedUser, AuthPort
from app.db.models.delivery import DeliveryDispatchAssignmentEvent, DeliveryDispatchOffer
from app.main import app
from tests.api.test_api_v1 import AUTH, OWNER
from tests.api.test_delivery_partnerships import MEXY_USER
from tests.api.test_delivery_rider_offers import (
    _as_mexy,
    _as_owner,
    _create_dispatch_request,
    _setup_ready_fleet,
)
from tests.conftest import requires_db

OTHER = uuid.UUID("99999999-9999-9999-9999-999999999999")


class _Auth(AuthPort):
    def __init__(self, user_id: uuid.UUID, email: str) -> None:
        self._user_id = user_id
        self._email = email

    def verify_token(self, token: str) -> AuthenticatedUser:
        return AuthenticatedUser(id=self._user_id, email=self._email)


@pytest.fixture(autouse=True)
def _clean(engine):
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                TRUNCATE delivery_credit_holds, delivery_dispatch_offers,
                         delivery_dispatch_assignment_events,
                         delivery_dispatch_requests, delivery_drivers,
                         restaurant_delivery_providers,
                         delivery_search_lead_times,
                         delivery_provider_assignment_settings,
                         delivery_provider_pricing_configs,
                         delivery_provider_payment_methods,
                         delivery_provider_schedules, delivery_provider_zones,
                         delivery_provider_members, delivery_providers,
                         restaurant_members, restaurants, users
                RESTART IDENTITY CASCADE
                """
            )
        )
    yield


@requires_db
def test_search_miss_records_blockers(client, engine):
    from app.modules.delivery_dispatch.tasks import handle_task

    restaurant_id, _ids = _setup_ready_fleet(
        client,
        engine,
        driver_count=0,
        min_protected_drivers=0,
        high_demand_available_drivers_max=0,
        subdomain="log-miss",
    )
    request_id = _create_dispatch_request(client, restaurant_id)
    now = datetime.now(UTC)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        handle_task(session, {"kind": "search", "request_id": str(request_id)}, now=now)
        session.commit()
        row = session.scalar(
            select(DeliveryDispatchAssignmentEvent).where(
                DeliveryDispatchAssignmentEvent.request_id == request_id
            )
        )
    assert row is not None
    assert row.kind == "searched"
    assert row.title == "Buscó rider"
    assert row.detail == "No hay repartidores dados de alta."
    assert row.next_attempt_at is not None


@requires_db
def test_case_a_records_nearest_copy(client, engine):
    from app.modules.delivery_dispatch.tasks import handle_task

    restaurant_id, _ids = _setup_ready_fleet(
        client,
        engine,
        driver_count=1,
        min_protected_drivers=0,
        high_demand_available_drivers_max=0,
        subdomain="log-near",
    )
    request_id = _create_dispatch_request(client, restaurant_id)
    now = datetime.now(UTC)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        handle_task(session, {"kind": "search", "request_id": str(request_id)}, now=now)
        session.commit()
        row = session.scalar(
            select(DeliveryDispatchAssignmentEvent).where(
                DeliveryDispatchAssignmentEvent.request_id == request_id
            )
        )
        offer = session.scalar(
            select(DeliveryDispatchOffer).where(DeliveryDispatchOffer.request_id == request_id)
        )
    assert offer is not None
    assert row is not None
    assert row.kind == "offered"
    assert row.detail == "El más cercano al restaurante"
    assert row.title.startswith("Ofertó a ")


@requires_db
def test_expire_records_no_response(client, engine):
    from app.modules.delivery_dispatch.tasks import handle_task

    restaurant_id, _ids = _setup_ready_fleet(
        client,
        engine,
        driver_count=1,
        min_protected_drivers=0,
        high_demand_available_drivers_max=0,
        subdomain="log-expire",
    )
    request_id = _create_dispatch_request(client, restaurant_id)
    now = datetime.now(UTC)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        handle_task(session, {"kind": "search", "request_id": str(request_id)}, now=now)
        session.commit()
        offer = session.scalar(
            select(DeliveryDispatchOffer).where(DeliveryDispatchOffer.request_id == request_id)
        )
        assert offer is not None
        handle_task(
            session,
            {
                "kind": "expire_offer",
                "request_id": str(request_id),
                "offer_id": str(offer.id),
            },
            now=now + timedelta(seconds=120),
        )
        session.commit()
        kinds = list(
            session.scalars(
                select(DeliveryDispatchAssignmentEvent.kind)
                .where(DeliveryDispatchAssignmentEvent.request_id == request_id)
                .order_by(DeliveryDispatchAssignmentEvent.created_at)
            )
        )
    assert "expired" in kinds


from app.db.models.delivery import DeliveryDispatchRequest, DeliveryProviderAssignmentSettings


@requires_db
def test_timeout_records_timed_out(client, engine):
    from app.modules.delivery_dispatch.tasks import handle_task

    restaurant_id, _ids = _setup_ready_fleet(
        client,
        engine,
        driver_count=0,
        min_protected_drivers=0,
        high_demand_available_drivers_max=0,
        subdomain="log-timeout",
    )
    request_id = _create_dispatch_request(client, restaurant_id)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    now = datetime.now(UTC)
    with factory() as session:
        request = session.get(DeliveryDispatchRequest, request_id)
        assert request is not None
        settings = session.get(
            DeliveryProviderAssignmentSettings, request.delivery_provider_id
        )
        assert settings is not None
        settings.assignment_timeout_seconds = 1
        request.search_at = now - timedelta(seconds=5)
        session.commit()
        handle_task(session, {"kind": "search", "request_id": str(request_id)}, now=now)
        session.commit()
        row = session.scalar(
            select(DeliveryDispatchAssignmentEvent).where(
                DeliveryDispatchAssignmentEvent.request_id == request_id,
                DeliveryDispatchAssignmentEvent.kind == "timed_out",
            )
        )
    assert row is not None
    assert row.title == "Se agotó la búsqueda"
```

If `_setup_ready_fleet(..., driver_count=0)` is not supported, create the restaurant partnership the same way as other tests and skip creating drivers — read `_setup_ready_fleet` in `test_delivery_rider_offers.py` and match its signature. If `driver_count` cannot be 0, create the fleet then set every driver `is_online=False` before `handle_task`; miss copy becomes `Nadie elegible: N offline` instead of “no hay repartidores”. Prefer `is_online=False` if `driver_count=0` is awkward.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/api/test_assignment_log.py -v --tb=short`

Expected: FAIL — no rows / table missing until wiring (if migration not applied, tests that use `engine` typically `create_all` from models in conftest — adding the model is enough for tests).

- [ ] **Step 3: Wire writers**

In `_persist_dispatch_offer` after a successful create (the `session.add(offer)` path that returns `offer`), before `return offer`:

```python
from app.modules.delivery_dispatch.assignment_log import (
    manual_title,
    offered_detail,
    offered_title,
    record_assignment_event,
)

name = driver.first_name
if case == "M":
    record_assignment_event(
        session,
        request,
        kind="manual",
        tone="ok",
        title=manual_title(name),
        detail=offered_detail("M"),
        case_applied="M",
        driver_id=driver.id,
    )
else:
    record_assignment_event(
        session,
        request,
        kind="offered",
        tone="ok",
        title=offered_title(name),
        detail=offered_detail(case),
        case_applied=case,
        driver_id=driver.id,
    )
```

If `_compatible_live_offer` returns an existing offer, **do not** insert another event.

In `_enqueue_retry`, after setting `request.next_attempt_at` and `enqueue(...)`:

```python
from app.modules.delivery_dispatch.assignment_log import (
    record_assignment_event,
    searched_detail_from_context,
)

detail = "No hay repartidores dados de alta."
if context is not None:
    detail = searched_detail_from_context(context, high_demand=high_demand)
record_assignment_event(
    session,
    request,
    kind="searched",
    tone="warn",
    title="Buscó rider",
    detail=detail,
    next_attempt_at=request.next_attempt_at,
)
```

Change `_enqueue_retry` signature to:

```python
def _enqueue_retry(
    session: Session,
    request: DeliveryDispatchRequest,
    now: datetime,
    *,
    context: EngineContext | None = None,
    high_demand: bool = False,
) -> None:
```

Every existing `_enqueue_retry(session, request, now)` call in this file must still compile. Pass `context` and `high_demand` from `_assign_or_retry` when you have them (last `choose_assignments` result’s `high_demand`, and `_build_context(...)`).

In `run_search`, when setting `request.status = "unassigned"` due to timeout, before `notify_request_realtime`:

```python
record_assignment_event(
    session,
    request,
    kind="timed_out",
    tone="warn",
    title=timed_out_title(),
    detail=None,
)
```

Same insert in `_assign_or_retry` if it also sets `unassigned` (avoid double insert: if `run_search` already returned on timeout, `_assign_or_retry` is not called. If only `_assign_or_retry` sets unassigned, put the insert there only).

In `handle_expire_offer`, after `offer.status = "expired"` and the request is still searchable (status becomes `searching` or stays searching), insert:

```python
record_assignment_event(
    session,
    request,
    kind="expired",
    tone="warn",
    title=expired_title(offer.driver.first_name if offer.driver else None),
    detail="Sigue buscando.",
    next_attempt_at=request.next_attempt_at if request.status == "searching" else None,
    driver_id=offer.driver_id,
)
```

Load `offer.driver` if needed (`session.get(DeliveryDriver, offer.driver_id)`). Do **not** insert expired if the request is already `assigned`/`picked_up`/`in_transit` (existing early returns).

- [ ] **Step 4: Run tests**

Run: `cd backend && .venv/bin/python -m pytest tests/api/test_assignment_log.py -v --tb=short`

Expected: PASS for miss, case A, expire, timeout.

- [ ] **Step 5: Commit**

Skip unless the user asked to commit.

---

### Task 4: Reject + GET endpoint

**Files:**
- Modify: `backend/app/modules/delivery_dispatch/tasks.py` (`reject_offer_and_search`)
- Modify: `backend/app/modules/delivery_dispatch/schemas.py`
- Modify: `backend/app/modules/delivery_dispatch/service.py` (`get_assignment_log`)
- Modify: `backend/app/modules/delivery_dispatch/api.py`
- Modify: `backend/app/modules/delivery_dispatch/assignment_log.py` (`list_assignment_log`)
- Modify: `backend/tests/api/test_assignment_log.py`

**Interfaces:**
- Produces: `GET /api/v1/delivery-providers/me/dispatch-requests/{request_id}/assignment-log`
- Produces: `AssignmentLogEventDTO`, `AssignmentLogDTO`
- Produces: `list_assignment_log(session, request) -> list[DeliveryDispatchAssignmentEvent]` (50 most recent, then chronological)
- Produces: `DeliveryDispatchService.get_assignment_log(user_id, request_id) -> AssignmentLogDTO`

- [ ] **Step 1: Write the failing tests** (append to `test_assignment_log.py`)

```python
@requires_db
def test_assignment_log_get_returns_events_and_404_cross_company(client, engine):
    from app.modules.delivery_dispatch.tasks import handle_task

    restaurant_id, _ids = _setup_ready_fleet(
        client,
        engine,
        driver_count=1,
        min_protected_drivers=0,
        high_demand_available_drivers_max=0,
        subdomain="log-get",
    )
    request_id = _create_dispatch_request(client, restaurant_id)
    now = datetime.now(UTC)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        handle_task(session, {"kind": "search", "request_id": str(request_id)}, now=now)
        session.commit()

    _as_mexy()
    ok = client.get(
        f"/api/v1/delivery-providers/me/dispatch-requests/{request_id}/assignment-log",
        headers=AUTH,
    )
    assert ok.status_code == 200, ok.text
    body = ok.json()
    assert body["request_id"] == str(request_id)
    assert len(body["events"]) >= 1
    assert body["events"][0]["title"]
    assert "detail" in body["events"][0]
    assert body["next_attempt_at"] is not None or body["events"]

    app.dependency_overrides[get_auth] = lambda: _Auth(OTHER, "otro@example.com")
    missing = client.get(
        f"/api/v1/delivery-providers/me/dispatch-requests/{request_id}/assignment-log",
        headers=AUTH,
    )
    assert missing.status_code in {401, 404}


@requires_db
def test_assignment_log_caps_at_50(client, engine):
    restaurant_id, _ids = _setup_ready_fleet(
        client,
        engine,
        driver_count=0,
        min_protected_drivers=0,
        high_demand_available_drivers_max=0,
        subdomain="log-cap",
    )
    request_id = _create_dispatch_request(client, restaurant_id)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    from app.db.models.delivery import DeliveryDispatchAssignmentEvent, DeliveryDispatchRequest
    from app.modules.delivery_dispatch.assignment_log import record_assignment_event

    with factory() as session:
        request = session.get(DeliveryDispatchRequest, request_id)
        assert request is not None
        for index in range(55):
            record_assignment_event(
                session,
                request,
                kind="searched",
                tone="warn",
                title="Buscó rider",
                detail=str(index),
            )
        session.commit()

    _as_mexy()
    ok = client.get(
        f"/api/v1/delivery-providers/me/dispatch-requests/{request_id}/assignment-log",
        headers=AUTH,
    )
    assert ok.status_code == 200
    events = ok.json()["events"]
    assert len(events) == 50
    assert events[0]["detail"] == "5"
    assert events[-1]["detail"] == "54"
```

If `_as_mexy` is not the delivery-company owner for `_setup_ready_fleet`, use the same auth helper the monitor tests use (`_as_mexy` in rider_offers is the Mexy provider). Match that.

Reject test: after an offer exists, `_as_rider()` POST reject, then assert an event `kind=="rejected"`. Copy the reject URL from `test_delivery_rider_offers.py`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/api/test_assignment_log.py::test_assignment_log_get_returns_events_and_404_cross_company tests/api/test_assignment_log.py::test_assignment_log_caps_at_50 -v --tb=short`

Expected: FAIL 404 on GET (route missing).

- [ ] **Step 3: Implement list + HTTP**

`assignment_log.py`:

```python
def list_assignment_events(
    session: Session,
    request_id: uuid.UUID,
) -> list[DeliveryDispatchAssignmentEvent]:
    rows = list(
        session.scalars(
            select(DeliveryDispatchAssignmentEvent)
            .where(DeliveryDispatchAssignmentEvent.request_id == request_id)
            .order_by(DeliveryDispatchAssignmentEvent.created_at.desc())
            .limit(LOG_LIMIT)
        )
    )
    rows.reverse()
    return rows
```

`schemas.py`:

```python
class AssignmentLogEventDTO(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    at: datetime
    kind: str
    tone: str
    title: str
    detail: str | None = None
    next_attempt_at: datetime | None = None


class AssignmentLogDTO(BaseModel):
    request_id: uuid.UUID
    last_search_at: datetime | None
    next_attempt_at: datetime | None
    assignment_timeout_at: datetime | None
    events: list[AssignmentLogEventDTO]
```

Map `at` from `created_at` in the service (do not rename the column).

`service.py` method:

```python
def get_assignment_log(self, user_id: uuid.UUID, request_id: uuid.UUID) -> AssignmentLogDTO:
    provider_id, _role = self._require_provider_with_role(user_id)
    request = self._session.scalar(
        select(DeliveryDispatchRequest).where(
            DeliveryDispatchRequest.id == request_id,
            DeliveryDispatchRequest.delivery_provider_id == provider_id,
        )
    )
    if request is None:
        raise NotFoundError("Solicitud de delivery no encontrada")
    settings = self._session.scalar(
        select(DeliveryProviderAssignmentSettings).where(
            DeliveryProviderAssignmentSettings.delivery_provider_id == provider_id
        )
    )
    timeout_at = None
    if settings is not None:
        timeout_at = request.search_at + timedelta(seconds=settings.assignment_timeout_seconds)
    rows = list_assignment_events(self._session, request.id)
    last_search_at = next(
        (row.created_at for row in reversed(rows) if row.kind in {"searched", "offered"}),
        None,
    )
    if last_search_at is None and request.status != "scheduled":
        last_search_at = request.search_at
    return AssignmentLogDTO(
        request_id=request.id,
        last_search_at=last_search_at,
        next_attempt_at=request.next_attempt_at,
        assignment_timeout_at=timeout_at,
        events=[
            AssignmentLogEventDTO(
                id=row.id,
                at=row.created_at,
                kind=row.kind,
                tone=row.tone,
                title=row.title,
                detail=row.detail,
                next_attempt_at=row.next_attempt_at,
            )
            for row in rows
        ],
    )
```

`api.py` (next to `create_manual_offer`):

```python
@router.get(
    "/me/dispatch-requests/{request_id}/assignment-log",
    response_model=AssignmentLogDTO,
)
def get_assignment_log(
    request_id: UUID,
    user: UserDTO = Depends(get_synced_user),
    service: DeliveryDispatchService = Depends(_service),
) -> AssignmentLogDTO:
    return service.get_assignment_log(user.id, request_id)
```

Import `AssignmentLogDTO` in `api.py`.

In `reject_offer_and_search`, after updating the offer to rejected:

```python
record_assignment_event(
    session,
    request,
    kind="rejected",
    tone="warn",
    title=rejected_title(driver_name),
    detail="Sigue buscando." if request.status == "searching" else None,
    next_attempt_at=request.next_attempt_at if request.status == "searching" else None,
    driver_id=offer.driver_id,
)
```

Get `driver_name` from `session.get(DeliveryDriver, offer.driver_id)`.

- [ ] **Step 4: Run tests**

Run: `cd backend && .venv/bin/python -m pytest tests/api/test_assignment_log.py tests/modules/test_assignment_log_copy.py tests/api/test_delivery_rider_offers.py tests/api/test_delivery_manual_offer.py -v --tb=short`

Expected: PASS (manual offer should now also write `kind=manual` via Task 3 persist hook).

- [ ] **Step 5: Commit**

Skip unless the user asked to commit.

---

### Task 5: Monitor drawer UI

**Files:**
- Modify: `delivery-dashboard/src/lib/api/types.ts`
- Modify: `delivery-dashboard/src/lib/api/deliveryProviders.ts`
- Modify: `delivery-dashboard/src/lib/dispatch/monitorCopy.ts`
- Modify: `delivery-dashboard/src/components/monitor/RequestDetailDrawer.tsx`
- Modify: `delivery-dashboard/src/components/monitor/RequestDetailDrawer.module.css`
- Modify: `delivery-dashboard/src/components/pages/MonitorPage.tsx`

**Interfaces:**
- Consumes: `GET .../assignment-log`
- Produces: `getAssignmentLog(token, requestId)`
- Produces: `assignmentSchedulerLines(log, requestStatus, nowMs)` in `monitorCopy.ts`

There is no dashboard unit test runner. Verify by typing + browser on `/monitor` Detalle. Extract copy so it stays in one place.

- [ ] **Step 1: Types + client**

In `types.ts`:

```typescript
export type AssignmentLogEvent = {
  id: string;
  at: string;
  kind: string;
  tone: 'ok' | 'wait' | 'warn' | string;
  title: string;
  detail: string | null;
  next_attempt_at: string | null;
};

export type AssignmentLog = {
  request_id: string;
  last_search_at: string | null;
  next_attempt_at: string | null;
  assignment_timeout_at: string | null;
  events: AssignmentLogEvent[];
};
```

In `deliveryProviders.ts`:

```typescript
export function getAssignmentLog(token: string, requestId: string) {
  return apiRequest<AssignmentLog>(
    `/delivery-providers/me/dispatch-requests/${requestId}/assignment-log`,
    { token },
  );
}
```

- [ ] **Step 2: Scheduler copy**

In `monitorCopy.ts`:

```typescript
import type { AssignmentLog } from '@/lib/api/types';

export function assignmentSchedulerLines(
  log: AssignmentLog | null,
  status: string,
  nowMs: number,
): string[] {
  if (status === 'scheduled' && log?.next_attempt_at) {
    const wait = formatCountdown(log.next_attempt_at, nowMs);
    return wait ? [`Empieza a buscar ${wait}`] : [`Empieza a buscar ${formatTime(log.next_attempt_at)}`];
  }
  if (status === 'unassigned') {
    return ['Se agotó el tiempo de búsqueda'];
  }
  const lines: string[] = [];
  if (log?.last_search_at) {
    lines.push(`Última búsqueda ${formatTimelineTime(log.last_search_at)}`);
  }
  if (status === 'searching' && log?.next_attempt_at) {
    const retry = Date.parse(log.next_attempt_at);
    if (Number.isFinite(retry) && retry - nowMs > 2000) {
      const wait = formatCountdown(log.next_attempt_at, nowMs);
      if (wait) lines.push(`Próxima en ${wait}`);
    }
  }
  if (log?.assignment_timeout_at && (status === 'searching' || status === 'offered')) {
    const wait = formatCountdown(log.assignment_timeout_at, nowMs);
    if (wait) lines.push(`Timeout ${wait}`);
  }
  return lines;
}
```

For `scheduled`, `next_attempt_at` on the request is `search_at`. The GET already returns the request’s `next_attempt_at`. Also use `request.search_at` from the drawer’s `request` if log is still loading: pass `request.search_at` as fallback in the drawer, not in this helper.

- [ ] **Step 3: Drawer**

Extend props:

```typescript
type RequestDetailDrawerProps = {
  open: boolean;
  request: DispatchMonitorRequest | null;
  accessToken: string | null;
  refreshNonce: number;
  onClose: () => void;
};
```

Fetch:

```typescript
useEffect(() => {
  if (!open || !request || !accessToken) {
    setLog(null);
    setLogError(null);
    return;
  }
  let cancelled = false;
  setLogLoading(true);
  setLogError(null);
  void getAssignmentLog(accessToken, request.id)
    .then((data) => {
      if (!cancelled) setLog(data);
    })
    .catch(() => {
      if (!cancelled) setLogError('No se pudo cargar la asignación.');
    })
    .finally(() => {
      if (!cancelled) setLogLoading(false);
    });
  return () => {
    cancelled = true;
  };
}, [open, request?.id, accessToken, refreshNonce]);
```

Insert **Asignación** between Solicitud and Operación:

- `h3` id `request-detail-asignacion` text `Asignación`
- `div` with scheduler lines (`assignmentSchedulerLines`)
- if `logError`: `<p role="alert">`
- else if loading and no log: short “Cargando…” (not a blocking overlay)
- else if no events: `Aún no hay pasadas del motor.`
- else `ol` cloned from `.timeline` / `.step` / `.toneOk` / `.toneWarn` / `.toneNow`

`toneNow`: last event when `request.status` is `searching` or `offered`.  
`toneOk`: `event.tone === 'ok'` (and not now).  
`toneWarn`: `event.tone === 'warn'`.

`key={event.id}`. `<time dateTime={event.at}>{formatTimelineTime(event.at)}</time>`. Title in `<strong>`, detail in `<span>`.

CSS: `.scheduler` with `font-size: 0.78rem; font-weight: 600; color: var(--color-text); line-height: 1.4; display: flex; flex-wrap: wrap; gap: 0.35rem 0.75rem;` and a `::after` middot optional. `@media (max-width: 480px)` let it stack. `.alert` uses existing text color plus `color: #b91c1c`. Reuse `.timeline`. `prefers-reduced-motion` already on `.link`.

- [ ] **Step 4: MonitorPage**

```typescript
const [logNonce, setLogNonce] = useState(0);

useDispatchMonitorSocket(accessToken, {
  onEvent: () => {
    void loadSnapshot();
    setLogNonce((value) => value + 1);
  },
  ...
});

<RequestDetailDrawer
  open={detailRequest !== null}
  request={detailRequest}
  accessToken={accessToken}
  refreshNonce={logNonce}
  onClose={() => setDetailRequestId(null)}
/>
```

- [ ] **Step 5: Check lints and `/monitor` Detalle**

Open a live searching request: strip shows last/next/timeout; list shows human lines; Solicitud still visible if GET fails (disconnect network tab).

- [ ] **Step 6: Commit**

Skip unless the user asked to commit.

---

## Spec coverage

| Spec | Task |
|------|------|
| Table + kinds/tones | 2 |
| Copy templates + blockers | 1 |
| Write on search miss / offer / expire / timeout | 3 |
| Write on reject / manual | 3 (manual via persist) + 4 (reject) |
| GET last 50, 404 other company | 4 |
| Not on monitor snapshot | 4 (new route only) |
| Drawer strip + list + error | 5 |
| Socket refresh | 5 `refreshNonce` |
| No history drawer / no GCP | (out of scope, no task) |

## Placeholder scan

No TBD. `driver_count=0` in Task 3 has an explicit fallback (`is_online=False`).
