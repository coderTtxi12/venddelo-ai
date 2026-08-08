# Marketing Facebook Session Spike — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Async Postman-testable API that publishes a message to a Facebook profile feed using Fernet-encrypted credentials and Playwright `storage_state` from Postgres.

**Architecture:** `POST` creates a `marketing_tasks` row (`queued`), assigns the first `active` `marketing_agent_accounts` row, schedules an in-process FastAPI `BackgroundTasks` job that opens its own DB session, runs Playwright (reuse/save encrypted `storage_state`), and updates the task. `GET` returns status for the same restaurant.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, Fernet (`cryptography`), Playwright (async API), pytest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-07-marketing-facebook-session-spike-design.es.md`
- Credenciales / `storage_state`: solo DB cifrada; nunca en request/response/logs
- Auth: `require_owned_restaurant` on both endpoints
- Agent selection: first `marketing_agent_accounts` with `status == "active"` (assigned at enqueue)
- Tasks persisted in Postgres (`marketing_tasks`), not Redis/memory
- Worker: FastAPI `BackgroundTasks` + new `SqlAlchemyUnitOfWork()` inside the job (request UoW is closed after response)
- Headless Playwright by default; `MARKETING_PLAYWRIGHT_HEADED=true` for local debug
- Commits: prepare clean diffs; skip `git commit` unless the human explicitly asks
- No frontend in this plan

## File map

| File | Responsibility |
|------|----------------|
| `backend/app/core/config.py` | `marketing_agent_fernet_key`, `marketing_playwright_headed` |
| `backend/.env.example` | Document new env vars |
| `backend/requirements.txt` | Add `playwright` |
| `backend/app/modules/marketing/crypto.py` | Fernet encrypt/decrypt str + JSON |
| `backend/app/db/models/marketing.py` | ORM `MarketingAgentAccount`, `MarketingTask` |
| `backend/app/db/models/__init__.py` | Export new models |
| `backend/migrations/versions/0050_marketing_facebook_session_spike.py` | Create tables |
| `backend/app/modules/marketing/schemas.py` | Pydantic request/response + internal DTOs |
| `backend/app/modules/marketing/repository.py` | Abstract repo |
| `backend/app/modules/marketing/adapters.py` | SQLAlchemy repo |
| `backend/app/db/uow.py` | Wire `uow.marketing` |
| `backend/app/modules/marketing/service.py` | Enqueue + get task |
| `backend/app/modules/marketing/worker.py` | Background job orchestration |
| `backend/app/modules/marketing/browser/session.py` | Decrypt/encrypt storage_state helpers |
| `backend/app/modules/marketing/browser/publisher.py` | Playwright login + feed publish |
| `backend/app/modules/marketing/api.py` | Routes |
| `backend/app/api/v1/router.py` | Include marketing router |
| `backend/scripts/seed_marketing_agent.py` | CLI seed encrypted agent |
| `backend/tests/modules/test_marketing_crypto.py` | Fernet unit tests |
| `backend/tests/modules/test_marketing_service.py` | Enqueue/get with fake publisher |
| `backend/tests/modules/test_marketing_api.py` | HTTP 202/GET with overrides |

---

### Task 1: Fernet crypto + Settings

**Files:**
- Create: `backend/app/modules/marketing/crypto.py`
- Create: `backend/app/modules/marketing/__init__.py` (empty)
- Create: `backend/tests/modules/test_marketing_crypto.py`
- Modify: `backend/app/core/config.py`
- Modify: `backend/.env.example`

**Interfaces:**
- Consumes: `cryptography.fernet.Fernet`, `get_settings().marketing_agent_fernet_key`
- Produces:
  - `MarketingCrypto(key: str)` with:
    - `encrypt_str(value: str) -> str`
    - `decrypt_str(token: str) -> str`
    - `encrypt_json(value: dict) -> str`
    - `decrypt_json(token: str) -> dict`
  - `build_marketing_crypto(key: str | None = None) -> MarketingCrypto` (reads settings if key is None; raises `ValueError` if missing)
  - Settings fields: `marketing_agent_fernet_key: str | None = None`, `marketing_playwright_headed: bool = False`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/modules/test_marketing_crypto.py`:

```python
from cryptography.fernet import Fernet

from app.modules.marketing.crypto import MarketingCrypto, build_marketing_crypto


def test_encrypt_decrypt_str_roundtrip():
    key = Fernet.generate_key().decode()
    crypto = MarketingCrypto(key)
    token = crypto.encrypt_str("user@example.com")
    assert token != "user@example.com"
    assert crypto.decrypt_str(token) == "user@example.com"


def test_encrypt_decrypt_json_roundtrip():
    key = Fernet.generate_key().decode()
    crypto = MarketingCrypto(key)
    payload = {"cookies": [{"name": "c", "value": "1"}], "origins": []}
    token = crypto.encrypt_json(payload)
    assert crypto.decrypt_json(token) == payload


def test_build_marketing_crypto_requires_key(monkeypatch):
    from app.core.config import get_settings

    get_settings.cache_clear()
    monkeypatch.setenv("MARKETING_AGENT_FERNET_KEY", "")
    get_settings.cache_clear()
    try:
        import pytest

        with pytest.raises(ValueError, match="MARKETING_AGENT_FERNET_KEY"):
            build_marketing_crypto("")
    finally:
        get_settings.cache_clear()
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cd backend && pytest tests/modules/test_marketing_crypto.py -v`  
Expected: import error / module missing

- [ ] **Step 3: Implement crypto + settings**

`backend/app/modules/marketing/__init__.py` — empty file.

`backend/app/modules/marketing/crypto.py`:

```python
from __future__ import annotations

import json
from typing import Any

from cryptography.fernet import Fernet


class MarketingCrypto:
    def __init__(self, key: str) -> None:
        self._fernet = Fernet(key.encode() if isinstance(key, str) else key)

    def encrypt_str(self, value: str) -> str:
        return self._fernet.encrypt(value.encode("utf-8")).decode("ascii")

    def decrypt_str(self, token: str) -> str:
        return self._fernet.decrypt(token.encode("ascii")).decode("utf-8")

    def encrypt_json(self, value: dict[str, Any]) -> str:
        return self.encrypt_str(json.dumps(value, separators=(",", ":")))

    def decrypt_json(self, token: str) -> dict[str, Any]:
        return json.loads(self.decrypt_str(token))


def build_marketing_crypto(key: str | None = None) -> MarketingCrypto:
    if key is None:
        from app.core.config import get_settings

        key = get_settings().marketing_agent_fernet_key
    if not key:
        raise ValueError("MARKETING_AGENT_FERNET_KEY is required")
    return MarketingCrypto(key)
```

Add to `Settings` in `backend/app/core/config.py` (near other secrets):

```python
marketing_agent_fernet_key: str | None = None
marketing_playwright_headed: bool = False
```

Append to `backend/.env.example`:

```
# Marketing agent Facebook credentials encryption (Fernet)
# Generate: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
MARKETING_AGENT_FERNET_KEY=
# Set true to show the browser while debugging Playwright locally
MARKETING_PLAYWRIGHT_HEADED=false
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `cd backend && pytest tests/modules/test_marketing_crypto.py -v`  
Expected: PASS

---

### Task 2: ORM models + Alembic migration

**Files:**
- Create: `backend/app/db/models/marketing.py`
- Create: `backend/migrations/versions/0050_marketing_facebook_session_spike.py`
- Modify: `backend/app/db/models/__init__.py`

**Interfaces:**
- Produces ORM:
  - `MarketingAgentAccount` → table `marketing_agent_accounts`
  - `MarketingTask` → table `marketing_tasks`
- Status enums as plain strings with CheckConstraints matching the spec

- [ ] **Step 1: Add ORM models**

Create `backend/app/db/models/marketing.py`:

```python
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class MarketingAgentAccount(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "marketing_agent_accounts"
    __table_args__ = (
        CheckConstraint(
            "status IN ('active','checkpoint','banned','needs_manual_intervention')",
            name="status_allowed",
        ),
    )

    label: Mapped[str] = mapped_column(String(120), nullable=False)
    fb_email_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    fb_password_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    storage_state_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(64), nullable=False, server_default="active")
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    session_valid_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class MarketingTask(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "marketing_tasks"
    __table_args__ = (
        CheckConstraint(
            "status IN ('queued','running','succeeded','failed')",
            name="status_allowed",
        ),
    )

    restaurant_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("restaurants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    agent_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("marketing_agent_accounts.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    message: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, server_default="queued")
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    result: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
```

- [ ] **Step 2: Export models**

In `backend/app/db/models/__init__.py`, import and add to `__all__`:

```python
from app.db.models.marketing import MarketingAgentAccount, MarketingTask
# ...
"MarketingAgentAccount",
"MarketingTask",
```

- [ ] **Step 3: Write migration `0050_marketing_facebook_session_spike.py`**

```python
"""marketing agent accounts + marketing tasks for FB session spike

Revision ID: 0050_marketing_facebook_session_spike
Revises: 0049_delivery_provider_operator_role
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0050_marketing_facebook_session_spike"
down_revision: str | None = "0049_delivery_provider_operator_role"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "marketing_agent_accounts",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("label", sa.String(length=120), nullable=False),
        sa.Column("fb_email_encrypted", sa.Text(), nullable=False),
        sa.Column("fb_password_encrypted", sa.Text(), nullable=False),
        sa.Column("storage_state_encrypted", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=64), server_default="active", nullable=False),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("session_valid_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "status IN ('active','checkpoint','banned','needs_manual_intervention')",
            name=op.f("ck_marketing_agent_accounts_status_allowed"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_marketing_agent_accounts")),
    )

    op.create_table(
        "marketing_tasks",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("restaurant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("agent_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=32), server_default="queued", nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("result", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "status IN ('queued','running','succeeded','failed')",
            name=op.f("ck_marketing_tasks_status_allowed"),
        ),
        sa.ForeignKeyConstraint(
            ["agent_id"],
            ["marketing_agent_accounts.id"],
            name=op.f("fk_marketing_tasks_agent_id_marketing_agent_accounts"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["restaurant_id"],
            ["restaurants.id"],
            name=op.f("fk_marketing_tasks_restaurant_id_restaurants"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_marketing_tasks")),
    )
    op.create_index(op.f("ix_marketing_tasks_restaurant_id"), "marketing_tasks", ["restaurant_id"])
    op.create_index(op.f("ix_marketing_tasks_agent_id"), "marketing_tasks", ["agent_id"])


def downgrade() -> None:
    op.drop_index(op.f("ix_marketing_tasks_agent_id"), table_name="marketing_tasks")
    op.drop_index(op.f("ix_marketing_tasks_restaurant_id"), table_name="marketing_tasks")
    op.drop_table("marketing_tasks")
    op.drop_table("marketing_agent_accounts")
```

- [ ] **Step 4: Verify models import**

Run: `cd backend && python -c "from app.db.models import MarketingAgentAccount, MarketingTask; print(MarketingAgentAccount.__tablename__, MarketingTask.__tablename__)"`  
Expected: `marketing_agent_accounts marketing_tasks`

---

### Task 3: Repository + UoW wiring

**Files:**
- Create: `backend/app/modules/marketing/schemas.py`
- Create: `backend/app/modules/marketing/repository.py`
- Create: `backend/app/modules/marketing/adapters.py`
- Modify: `backend/app/db/uow.py`

**Interfaces:**
- Produces:
  - `MarketingTaskDTO(id, restaurant_id, agent_id, message, status, error, result, created_at, started_at, finished_at)`
  - `MarketingAgentAccountDTO(id, label, status, fb_email_encrypted, fb_password_encrypted, storage_state_encrypted, last_login_at, session_valid_until)`
  - `MarketingRepository` / `SqlAlchemyMarketingRepository`:
    - `get_first_active_agent() -> MarketingAgentAccountDTO | None`
    - `get_agent(agent_id: uuid.UUID) -> MarketingAgentAccountDTO | None`
    - `update_agent_session(agent_id, *, storage_state_encrypted, last_login_at=None, status=None) -> None`
    - `mark_agent_status(agent_id, status: str) -> None`
    - `create_task(*, restaurant_id, agent_id, message) -> MarketingTaskDTO` (status `queued`)
    - `get_task(restaurant_id, task_id) -> MarketingTaskDTO | None`
    - `mark_task_running(task_id) -> None`
    - `mark_task_finished(task_id, *, status, error=None, result=None) -> None`
- UoW: `self.marketing = SqlAlchemyMarketingRepository(self.session)`

- [ ] **Step 1: Schemas**

```python
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

TaskStatus = Literal["queued", "running", "succeeded", "failed"]
AgentStatus = Literal["active", "checkpoint", "banned", "needs_manual_intervention"]


class FacebookPostCreate(BaseModel):
    message: str = Field(min_length=1, max_length=5000)


class MarketingTaskQueuedResponse(BaseModel):
    task_id: uuid.UUID
    status: Literal["queued"] = "queued"


class MarketingTaskStatusResponse(BaseModel):
    task_id: uuid.UUID
    status: TaskStatus
    error: str | None = None
    result: dict[str, Any] | None = None


class MarketingAgentAccountDTO(BaseModel):
    id: uuid.UUID
    label: str
    status: AgentStatus
    fb_email_encrypted: str
    fb_password_encrypted: str
    storage_state_encrypted: str | None = None
    last_login_at: datetime | None = None
    session_valid_until: datetime | None = None


class MarketingTaskDTO(BaseModel):
    id: uuid.UUID
    restaurant_id: uuid.UUID
    agent_id: uuid.UUID
    message: str
    status: TaskStatus
    error: str | None = None
    result: dict[str, Any] | None = None
    created_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None
```

- [ ] **Step 2: Abstract repository + SQLAlchemy adapter**

Implement `repository.py` ABC with the methods listed in Interfaces.

In `adapters.py`, map ORM ↔ DTO. Example queries:

```python
def get_first_active_agent(self) -> MarketingAgentAccountDTO | None:
    row = self._session.scalar(
        select(MarketingAgentAccount)
        .where(MarketingAgentAccount.status == "active")
        .order_by(MarketingAgentAccount.created_at.asc())
        .limit(1)
    )
    return self._agent_to_dto(row) if row else None

def create_task(self, *, restaurant_id, agent_id, message) -> MarketingTaskDTO:
    row = MarketingTask(
        restaurant_id=restaurant_id,
        agent_id=agent_id,
        message=message,
        status="queued",
    )
    self._session.add(row)
    self._session.flush()
    return self._task_to_dto(row)

def mark_task_running(self, task_id: uuid.UUID) -> None:
    row = self._session.get(MarketingTask, task_id)
    if row is None:
        return
    row.status = "running"
    row.started_at = datetime.now(UTC)
    self._session.flush()

def mark_task_finished(
    self,
    task_id: uuid.UUID,
    *,
    status: str,
    error: str | None = None,
    result: dict | None = None,
) -> None:
    row = self._session.get(MarketingTask, task_id)
    if row is None:
        return
    row.status = status
    row.error = error
    row.result = result
    row.finished_at = datetime.now(UTC)
    self._session.flush()
```

`get_task` must filter by both `id` and `restaurant_id`.

- [ ] **Step 3: Wire UoW**

In `SqlAlchemyUnitOfWork.__enter__`:

```python
from app.modules.marketing.adapters import SqlAlchemyMarketingRepository
# ...
self.marketing = SqlAlchemyMarketingRepository(self.session)
```

- [ ] **Step 4: Smoke import**

Run: `cd backend && python -c "from app.db.uow import SqlAlchemyUnitOfWork; print('ok')"`  
Expected: `ok`

---

### Task 4: Service enqueue/get + fake publisher tests

**Files:**
- Create: `backend/app/modules/marketing/service.py`
- Create: `backend/tests/modules/test_marketing_service.py`

**Interfaces:**
- Consumes: `uow.marketing`, domain errors
- Produces:
  - `MarketingService.enqueue_facebook_post(restaurant_id, message) -> MarketingTaskQueuedResponse`
  - `MarketingService.get_task(restaurant_id, task_id) -> MarketingTaskStatusResponse`
  - Raises `NotFoundError` if no active agent (message: `"No active marketing agent account"`) or task missing
  - Does **not** run Playwright; only creates the queued row

- [ ] **Step 1: Write failing service tests**

Use `@requires_db` + session fixture pattern from other module tests. Minimal approach with a real session:

```python
import uuid

import pytest
from cryptography.fernet import Fernet

from app.db.models.marketing import MarketingAgentAccount
from app.db.models.restaurant import Restaurant
from app.modules.marketing.adapters import SqlAlchemyMarketingRepository
from app.modules.marketing.crypto import MarketingCrypto
from app.modules.marketing.service import MarketingService
from tests.conftest import requires_db


@requires_db
def test_enqueue_assigns_first_active_agent(session):
    crypto = MarketingCrypto(Fernet.generate_key().decode())
    restaurant = Restaurant(name="R", subdomain=f"r-{uuid.uuid4().hex[:8]}", original_language="es")
    session.add(restaurant)
    session.flush()
    agent = MarketingAgentAccount(
        label="a1",
        fb_email_encrypted=crypto.encrypt_str("a@x.com"),
        fb_password_encrypted=crypto.encrypt_str("secret"),
        status="active",
    )
    session.add(agent)
    session.flush()

    service = MarketingService(SqlAlchemyMarketingRepository(session))
    queued = service.enqueue_facebook_post(restaurant.id, "Hola feed")
    assert queued.status == "queued"
    task = service.get_task(restaurant.id, queued.task_id)
    assert task.status == "queued"
    assert task.error is None


@requires_db
def test_enqueue_fails_without_active_agent(session):
    from app.core.exceptions import NotFoundError

    restaurant = Restaurant(name="R2", subdomain=f"r-{uuid.uuid4().hex[:8]}", original_language="es")
    session.add(restaurant)
    session.flush()
    service = MarketingService(SqlAlchemyMarketingRepository(session))
    with pytest.raises(NotFoundError):
        service.enqueue_facebook_post(restaurant.id, "x")
```

Adjust `Restaurant` required fields to match the ORM (inspect `Restaurant` model if the constructor above fails).

- [ ] **Step 2: Run — expect FAIL**

Run: `cd backend && pytest tests/modules/test_marketing_service.py -v`  
Expected: FAIL (service missing)

- [ ] **Step 3: Implement service**

```python
from __future__ import annotations

import uuid

from app.core.exceptions import NotFoundError
from app.modules.marketing.repository import MarketingRepository
from app.modules.marketing.schemas import (
    MarketingTaskQueuedResponse,
    MarketingTaskStatusResponse,
)


class MarketingService:
    def __init__(self, repo: MarketingRepository) -> None:
        self._repo = repo

    def enqueue_facebook_post(
        self, restaurant_id: uuid.UUID, message: str
    ) -> MarketingTaskQueuedResponse:
        agent = self._repo.get_first_active_agent()
        if agent is None:
            raise NotFoundError("No active marketing agent account")
        task = self._repo.create_task(
            restaurant_id=restaurant_id,
            agent_id=agent.id,
            message=message,
        )
        return MarketingTaskQueuedResponse(task_id=task.id, status="queued")

    def get_task(
        self, restaurant_id: uuid.UUID, task_id: uuid.UUID
    ) -> MarketingTaskStatusResponse:
        task = self._repo.get_task(restaurant_id, task_id)
        if task is None:
            raise NotFoundError("Marketing task not found")
        return MarketingTaskStatusResponse(
            task_id=task.id,
            status=task.status,
            error=task.error,
            result=task.result,
        )
```

- [ ] **Step 4: Run — expect PASS**

Run: `cd backend && pytest tests/modules/test_marketing_service.py -v`  
Expected: PASS (requires local Postgres test DB)

---

### Task 5: API routes + background scheduling hook

**Files:**
- Create: `backend/app/modules/marketing/api.py`
- Create: `backend/app/modules/marketing/worker.py` (stub that only marks running→failed with `"publisher not wired"` until Task 6; or accept injectable runner)
- Create: `backend/tests/modules/test_marketing_api.py`
- Modify: `backend/app/api/v1/router.py`

**Interfaces:**
- Routes:
  - `POST /restaurants/{restaurant_id}/marketing/facebook/posts` → 202 `MarketingTaskQueuedResponse`
  - `GET /restaurants/{restaurant_id}/marketing/tasks/{task_id}` → 200 `MarketingTaskStatusResponse`
- After enqueue, schedule `background_tasks.add_task(run_marketing_facebook_post_task, task_id)`
- `run_marketing_facebook_post_task(task_id: uuid.UUID) -> None` opens a fresh UoW, marks running, calls publisher port, finishes task, commits

Publisher port for testability:

```python
# in browser/publisher.py or worker.py
class FacebookFeedPublisher(Protocol):
    async def publish(self, *, email: str, password: str, storage_state: dict | None, message: str) -> PublishResult: ...

@dataclass
class PublishResult:
    ok: bool
    storage_state: dict | None
    error: str | None = None
    needs_manual_intervention: bool = False
    result: dict | None = None
```

- [ ] **Step 1: Implement worker skeleton**

`worker.py` must:

1. `with SqlAlchemyUnitOfWork() as uow:`
2. Load task by id (add `get_task_by_id` on repo if needed — global by id for worker)
3. `mark_task_running`
4. Load agent by `task.agent_id`
5. Decrypt credentials via `build_marketing_crypto()`
6. `await publisher.publish(...)` (default real publisher; injectable for tests)
7. On success: save encrypted storage_state, `mark_task_finished(..., succeeded, result=...)`
8. On `needs_manual_intervention`: `mark_agent_status(..., needs_manual_intervention)`, task failed
9. On other failure: task failed with error string (never include password)
10. `uow.commit()`

Because publisher is async, either:
- make worker `async def` and use Starlette BackgroundTasks with async callable, **or**
- run `asyncio.run(publisher.publish(...))` inside a sync background task.

Prefer **async background task** if FastAPI version supports it (it does for async callables).

Also add repo method:

```python
def get_task_by_id(self, task_id: uuid.UUID) -> MarketingTaskDTO | None: ...
```

- [ ] **Step 2: API**

```python
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, status

from app.api.deps import require_owned_restaurant
from app.db.uow import SqlAlchemyUnitOfWork, get_uow
from app.modules.marketing.schemas import (
    FacebookPostCreate,
    MarketingTaskQueuedResponse,
    MarketingTaskStatusResponse,
)
from app.modules.marketing.service import MarketingService
from app.modules.marketing.worker import run_marketing_facebook_post_task
from app.modules.restaurants.schemas import RestaurantDTO

router = APIRouter(tags=["marketing"])


def _service(uow: SqlAlchemyUnitOfWork = Depends(get_uow)) -> MarketingService:
    return MarketingService(uow.marketing)


@router.post(
    "/restaurants/{restaurant_id}/marketing/facebook/posts",
    response_model=MarketingTaskQueuedResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def create_facebook_post(
    data: FacebookPostCreate,
    background_tasks: BackgroundTasks,
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: MarketingService = Depends(_service),
) -> MarketingTaskQueuedResponse:
    queued = service.enqueue_facebook_post(restaurant.id, data.message)
    background_tasks.add_task(run_marketing_facebook_post_task, queued.task_id)
    return queued


@router.get(
    "/restaurants/{restaurant_id}/marketing/tasks/{task_id}",
    response_model=MarketingTaskStatusResponse,
)
def get_marketing_task(
    task_id: uuid.UUID,
    restaurant: RestaurantDTO = Depends(require_owned_restaurant),
    service: MarketingService = Depends(_service),
) -> MarketingTaskStatusResponse:
    return service.get_task(restaurant.id, task_id)
```

Include router in `backend/app/api/v1/router.py`.

- [ ] **Step 3: API test with dependency overrides**

Follow existing API test patterns in the repo (search `TestClient` / `dependency_overrides`). Override `require_owned_restaurant` and `get_uow` OR test service+worker with a fake publisher without full HTTP if API tests are heavy.

Minimum API test: enqueue returns 202 shape via service already covered; add one TestClient test if a similar helper exists. If no shared TestClient harness, keep HTTP thin and cover worker with unit test + fake publisher in Task 6.

- [ ] **Step 4: Manual route check**

Run: `cd backend && python -c "from app.api.v1.router import api_v1_router; print([getattr(r,'path',None) for r in api_v1_router.routes if 'marketing' in str(getattr(r,'path',''))])"`  
Expected: both marketing paths listed

---

### Task 6: Playwright publisher + session persistence

**Files:**
- Create: `backend/app/modules/marketing/browser/__init__.py`
- Create: `backend/app/modules/marketing/browser/session.py`
- Create: `backend/app/modules/marketing/browser/publisher.py`
- Modify: `backend/requirements.txt` (add `playwright==1.49.1` or current stable)
- Modify: `backend/app/modules/marketing/worker.py` to use real publisher by default
- Create: `backend/tests/modules/test_marketing_worker.py`

**Interfaces:**
- `session.py`:
  - `decode_storage_state(crypto, token: str | None) -> dict | None`
  - `encode_storage_state(crypto, state: dict) -> str`
- `PlaywrightFacebookFeedPublisher.publish(...)` → `PublishResult`
- Flow per spec section 7:
  1. Launch chromium (`headless=not settings.marketing_playwright_headed`)
  2. If `storage_state`: `new_context(storage_state=...)` else empty context
  3. Navigate `https://www.facebook.com/`
  4. If login form visible → fill email/password → submit → wait
  5. Detect checkpoint/captcha/2FA heuristics (URL contains `checkpoint`, or known challenge text) → `needs_manual_intervention=True`
  6. Open feed composer (fixed selectors — document them in code comments; expect fragility)
  7. Type message, click Publicar
  8. Capture `storage_state` from context
  9. Return success + new storage_state

Fixed-selector strategy for spike (update if FB DOM differs during implementation):

```python
# Examples — adjust during first real run:
COMPOSER_SELECTORS = [
    '[aria-label="Create a post"]',
    '[aria-label="¿Qué estás pensando?"]',
    'div[role="button"][aria-label*="pensando"]',
]
MESSAGE_BOX = 'div[role="textbox"][contenteditable="true"]'
POST_BUTTONS = [
    '[aria-label="Post"]',
    '[aria-label="Publicar"]',
    'div[aria-label="Post"][role="button"]',
]
LOGIN_EMAIL = 'input[name="email"]'
LOGIN_PASS = 'input[name="pass"]'
LOGIN_SUBMIT = 'button[name="login"]'
```

Use generous timeouts (`page.set_default_timeout(60_000)`).

- [ ] **Step 1: Add dependency**

Append to `backend/requirements.txt`:

```
playwright==1.49.1
```

Document in worker module docstring / plan handoff:

```bash
cd backend && pip install playwright==1.49.1 && playwright install chromium
```

- [ ] **Step 2: Implement session helpers + publisher**

Keep publisher isolated so tests inject:

```python
class FakeFacebookFeedPublisher:
    async def publish(self, **kwargs) -> PublishResult:
        return PublishResult(ok=True, storage_state={"cookies": [], "origins": []}, result={"posted": True})
```

- [ ] **Step 3: Worker unit test with Fake publisher**

```python
@requires_db
@pytest.mark.asyncio
async def test_worker_success_persists_storage_state(session, monkeypatch):
    # seed restaurant + agent + queued task
    # monkeypatch run path to use FakeFacebookFeedPublisher
    # await run_marketing_facebook_post_task(task_id, publisher=Fake...)
    # assert task status succeeded
    # assert agent.storage_state_encrypted is not None
```

Because worker opens its own UoW, either:
- inject `session_factory` into `run_marketing_facebook_post_task`, or
- patch `SqlAlchemyUnitOfWork` in the test.

Prefer optional kwarg `uow_factory` defaulting to `SqlAlchemyUnitOfWork` for testability.

- [ ] **Step 4: Run worker tests**

Run: `cd backend && pytest tests/modules/test_marketing_worker.py -v`  
Expected: PASS

---

### Task 7: Seed script + local wiring checklist

**Files:**
- Create: `backend/scripts/seed_marketing_agent.py`

**Interfaces:**
- CLI: `python -m scripts.seed_marketing_agent --email X --password Y --label test-agent-1`
- Uses `SessionLocal`, `build_marketing_crypto()`, inserts `MarketingAgentAccount(status="active")`
- Prints only `id` and `label` (never password)

- [ ] **Step 1: Implement script**

```python
"""Seed an encrypted marketing Facebook agent account.

Usage (from backend/):
  export MARKETING_AGENT_FERNET_KEY=...
  python -m scripts.seed_marketing_agent --email you@example.com --password '...' --label test-agent-1
"""

from __future__ import annotations

import argparse

from app.db.models.marketing import MarketingAgentAccount
from app.db.session import SessionLocal
from app.modules.marketing.crypto import build_marketing_crypto


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--label", default="test-agent-1")
    args = parser.parse_args()

    crypto = build_marketing_crypto()
    session = SessionLocal()
    try:
        row = MarketingAgentAccount(
            label=args.label,
            fb_email_encrypted=crypto.encrypt_str(args.email),
            fb_password_encrypted=crypto.encrypt_str(args.password),
            status="active",
        )
        session.add(row)
        session.commit()
        print(f"Seeded marketing agent id={row.id} label={row.label} status={row.status}")
    finally:
        session.close()


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Document operator steps** (in script docstring only; no new markdown unless asked)

1. Generate key → put in `backend/.env` as `MARKETING_AGENT_FERNET_KEY`
2. `alembic upgrade head`
3. `pip install -r requirements.txt && playwright install chromium`
4. `python -m scripts.seed_marketing_agent --email ... --password ... --label test-agent-1`
5. Restart API (`python start.py`)
6. Postman:
   - `POST /api/v1/restaurants/{restaurant_id}/marketing/facebook/posts` with JWT + `{"message":"..."}`
   - Poll `GET /api/v1/restaurants/{restaurant_id}/marketing/tasks/{task_id}`

**Where credentials live after seed:**

| Tabla | Filas / columnas |
|-------|------------------|
| `marketing_agent_accounts` | 1+ rows with `status='active'` |
| | `fb_email_encrypted`, `fb_password_encrypted` (Fernet ciphertext) |
| | `storage_state_encrypted` filled after first successful login/publish |
| `marketing_tasks` | One row per POST; `message`, `status`, `agent_id`, `restaurant_id` |

---

### Task 8: End-to-end verification (manual)

No new code unless selectors need fixing from the first real Facebook run.

- [ ] **Step 1: Migrate + seed** against the same DB the API uses
- [ ] **Step 2: POST from Postman** → expect `202` + `task_id` in <1s
- [ ] **Step 3: Poll GET** until `succeeded` or `failed`
- [ ] **Step 4: Confirm DB**
  - task `status`/`result`/`error`
  - agent `storage_state_encrypted` non-null after first success
- [ ] **Step 5: Second POST** should reuse session (worker should not need full login if cookies valid)
- [ ] **Step 6: Confirm logs** contain no password/email plaintext

If Facebook shows checkpoint: agent `status=needs_manual_intervention`, task `failed` with safe error message.

---

## Spec coverage check

| Spec requirement | Task |
|------------------|------|
| Fernet + `MARKETING_AGENT_FERNET_KEY` | 1 |
| `marketing_agent_accounts` + `marketing_tasks` | 2 |
| Repo / UoW | 3 |
| Enqueue first active agent | 4 |
| POST 202 + GET status + JWT restaurant | 5 |
| Background worker + status transitions | 5–6 |
| Playwright + storage_state persist | 6 |
| Seed script | 7 |
| Manual Postman path | 8 |
| No credentials in API body/response | 4–5 schemas |
| Captcha → needs_manual_intervention | 6 |

## Placeholder / consistency review

- Types aligned: `MarketingTaskDTO`, `PublishResult`, `run_marketing_facebook_post_task(task_id, ...)`
- Encrypted columns stored as Fernet ASCII strings (`Text`), not raw bytes
- Worker uses fresh UoW; request path only enqueues
- No Redis/Celery/frontend tasks included
