# Phase 3 — Persistence Layer (Repositories) & Supabase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) or
> superpowers:subagent-driven-development to implement task-by-task. Steps use checkbox syntax.

**Goal:** DB-agnostic persistence: 7 repository ports + SQLAlchemy adapters returning Pydantic
DTOs, a Unit of Work owning the transaction boundary, a pooler-aware psycopg-v3 engine connected
to Supabase, and a working Supabase Storage adapter behind `StoragePort`.

**Architecture:** Per-module ports (`abc.ABC`) + adapters under `app/modules/<agg>/`; cross-cutting
infra under `app/infra/`; `UnitOfWork` constructs adapters over one `Session`; services (Phase 4)
depend only on ports + DTOs.

**Tech Stack:** Python 3.12, SQLAlchemy 2.0, psycopg v3, Pydantic v2, Alembic, `supabase` client,
PostgreSQL 16 (local Docker for tests; Supabase pooler for dev/prod), pytest.

---

## Conventions

- Run from `backend/` with venv active (`source .venv/bin/activate`).
- TDD: failing test → run (fail) → implement → run (pass).
- Repo integration tests run against `DATABASE_URL_TEST` (local Docker, 5434).
- Adapters never commit; the UoW owns commit/rollback. Adapters may `flush()`.
- DTOs use `ConfigDict(from_attributes=True)`; money in integer cents; ids `uuid.UUID`.
- No commits executed by the implementer; commit list is at the end.

---

## Task 1: Engine URL normalization + pooler-aware session

**Files:**
- Modify: `backend/app/core/config.py`
- Modify: `backend/app/db/session.py`
- Modify: `backend/requirements.txt`
- Test: `backend/tests/test_db_url.py`

- [ ] **Step 1: Add Supabase settings to `config.py`**

Add fields to `Settings` (keep existing):
```python
    supabase_url: str | None = None
    supabase_service_role_key: str | None = None
    supabase_storage_bucket: str = "assets"
```

- [ ] **Step 2: Add `supabase` dependency to `requirements.txt`**

Append:
```
supabase==2.10.0
```
Then: `pip install -r requirements-dev.txt`

- [ ] **Step 3: Write failing test** `backend/tests/test_db_url.py`

```python
from app.db.session import is_pooled, normalize_db_url


def test_normalize_plain_postgresql_scheme():
    assert normalize_db_url("postgresql://u:p@h:6543/db") == (
        "postgresql+psycopg://u:p@h:6543/db"
    )


def test_normalize_keeps_psycopg_scheme():
    url = "postgresql+psycopg://u:p@h:5432/db"
    assert normalize_db_url(url) == url


def test_is_pooled_detects_supabase_pooler():
    assert is_pooled("postgresql+psycopg://u:p@aws-1.pooler.supabase.com:6543/postgres")


def test_is_pooled_detects_port_6543():
    assert is_pooled("postgresql+psycopg://u:p@localhost:6543/db")


def test_is_pooled_false_for_local():
    assert not is_pooled("postgresql+psycopg://u:p@localhost:5434/vendelo")
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pytest tests/test_db_url.py -v`  → FAIL (ImportError)

- [ ] **Step 5: Rewrite `backend/app/db/session.py`**

```python
from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import get_settings


def normalize_db_url(url: str) -> str:
    if url.startswith("postgresql+"):
        return url
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url[len("postgresql://") :]
    return url


def is_pooled(url: str) -> bool:
    return "pooler.supabase.com" in url or ":6543/" in url or url.endswith(":6543")


def _build_engine(raw_url: str) -> Engine:
    url = normalize_db_url(raw_url)
    if is_pooled(url):
        return create_engine(
            url,
            poolclass=NullPool,
            connect_args={"prepare_threshold": None},
        )
    return create_engine(url, pool_pre_ping=True, pool_size=5, max_overflow=10)


engine = _build_engine(get_settings().database_url)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_session() -> Iterator[Session]:
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
```

- [ ] **Step 6: Run tests to verify pass**

Run: `pytest tests/test_db_url.py -v`  → PASS

---

## Task 2: Restaurants module (DTOs, port, adapter)

**Files:**
- Create: `backend/app/modules/restaurants/__init__.py`
- Create: `backend/app/modules/restaurants/schemas.py`
- Create: `backend/app/modules/restaurants/repository.py`
- Create: `backend/app/modules/restaurants/adapters.py`
- Test: `backend/tests/modules/test_restaurants_repo.py`

- [ ] **Step 1: `schemas.py`**

```python
import uuid
from datetime import datetime, time

from pydantic import BaseModel, ConfigDict


class ScheduleCreate(BaseModel):
    service_type: str
    day_of_week: int
    opens_at: time
    closes_at: time


class ScheduleDTO(ScheduleCreate):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID


class PaymentMethodCreate(BaseModel):
    method: str
    service_type: str
    enabled: bool = True


class PaymentMethodDTO(PaymentMethodCreate):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID


class RestaurantCreate(BaseModel):
    name: str
    subdomain: str
    original_language: str = "es"
    status: str = "draft"
    address: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    place_id: str | None = None
    logo_path: str | None = None
    color_palette: str | None = None


class RestaurantUpdate(BaseModel):
    name: str | None = None
    address: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    place_id: str | None = None
    logo_path: str | None = None
    color_palette: str | None = None
    original_language: str | None = None
    status: str | None = None


class RestaurantDTO(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    subdomain: str
    original_language: str
    status: str
    address: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    place_id: str | None = None
    logo_path: str | None = None
    color_palette: str | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime
```

- [ ] **Step 2: `repository.py` (port)**

```python
import uuid
from abc import ABC, abstractmethod

from app.core.pagination import CursorPage, PaginationParams
from app.modules.restaurants.schemas import (
    PaymentMethodCreate,
    RestaurantCreate,
    RestaurantDTO,
    RestaurantUpdate,
    ScheduleCreate,
)


class RestaurantRepository(ABC):
    @abstractmethod
    def add(self, data: RestaurantCreate) -> RestaurantDTO: ...

    @abstractmethod
    def get(self, id: uuid.UUID) -> RestaurantDTO | None: ...

    @abstractmethod
    def get_by_subdomain(self, subdomain: str) -> RestaurantDTO | None: ...

    @abstractmethod
    def list(self, params: PaginationParams) -> CursorPage[RestaurantDTO]: ...

    @abstractmethod
    def update(self, id: uuid.UUID, data: RestaurantUpdate) -> RestaurantDTO | None: ...

    @abstractmethod
    def soft_delete(self, id: uuid.UUID) -> bool: ...

    @abstractmethod
    def set_schedules(
        self, id: uuid.UUID, schedules: list[ScheduleCreate]
    ) -> None: ...

    @abstractmethod
    def set_payment_methods(
        self, id: uuid.UUID, methods: list[PaymentMethodCreate]
    ) -> None: ...
```

- [ ] **Step 3: `adapters.py`**

> Pattern for cursor pagination across all adapters: order by `created_at, id`; the cursor
> encodes the last `(created_at, id)`; `decode_cursor`/`encode_cursor` come from
> `app/core/pagination.py`. Fetch `limit+1` to compute `next_cursor`.

```python
import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.pagination import CursorPage, PaginationParams, decode_cursor, encode_cursor
from app.db.models.restaurant import (
    Restaurant,
    RestaurantPaymentMethod,
    RestaurantSchedule,
)
from app.modules.restaurants.repository import RestaurantRepository
from app.modules.restaurants.schemas import (
    PaymentMethodCreate,
    RestaurantCreate,
    RestaurantDTO,
    RestaurantUpdate,
    ScheduleCreate,
)


class SqlAlchemyRestaurantRepository(RestaurantRepository):
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, data: RestaurantCreate) -> RestaurantDTO:
        obj = Restaurant(**data.model_dump())
        self._session.add(obj)
        self._session.flush()
        self._session.refresh(obj)
        return RestaurantDTO.model_validate(obj)

    def get(self, id: uuid.UUID) -> RestaurantDTO | None:
        obj = self._session.get(Restaurant, id)
        if obj is None or not obj.is_active:
            return None
        return RestaurantDTO.model_validate(obj)

    def get_by_subdomain(self, subdomain: str) -> RestaurantDTO | None:
        obj = self._session.scalar(
            select(Restaurant).where(
                Restaurant.subdomain == subdomain, Restaurant.is_active.is_(True)
            )
        )
        return RestaurantDTO.model_validate(obj) if obj else None

    def list(self, params: PaginationParams) -> CursorPage[RestaurantDTO]:
        stmt = (
            select(Restaurant)
            .where(Restaurant.is_active.is_(True))
            .order_by(Restaurant.created_at, Restaurant.id)
            .limit(params.limit + 1)
        )
        if params.cursor:
            created_at, last_id = decode_cursor(params.cursor)
            stmt = stmt.where(
                (Restaurant.created_at, Restaurant.id) > (created_at, last_id)
            )
        rows = list(self._session.scalars(stmt))
        has_more = len(rows) > params.limit
        rows = rows[: params.limit]
        next_cursor = (
            encode_cursor(rows[-1].created_at, rows[-1].id) if has_more else None
        )
        return CursorPage(
            items=[RestaurantDTO.model_validate(r) for r in rows],
            next_cursor=next_cursor,
        )

    def update(
        self, id: uuid.UUID, data: RestaurantUpdate
    ) -> RestaurantDTO | None:
        obj = self._session.get(Restaurant, id)
        if obj is None or not obj.is_active:
            return None
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(obj, field, value)
        self._session.flush()
        return RestaurantDTO.model_validate(obj)

    def soft_delete(self, id: uuid.UUID) -> bool:
        obj = self._session.get(Restaurant, id)
        if obj is None or not obj.is_active:
            return False
        obj.is_active = False
        obj.deleted_at = datetime.now(UTC)
        self._session.flush()
        return True

    def set_schedules(
        self, id: uuid.UUID, schedules: list[ScheduleCreate]
    ) -> None:
        self._session.query(RestaurantSchedule).filter_by(restaurant_id=id).delete()
        for s in schedules:
            self._session.add(
                RestaurantSchedule(restaurant_id=id, **s.model_dump())
            )
        self._session.flush()

    def set_payment_methods(
        self, id: uuid.UUID, methods: list[PaymentMethodCreate]
    ) -> None:
        self._session.query(RestaurantPaymentMethod).filter_by(
            restaurant_id=id
        ).delete()
        for m in methods:
            self._session.add(
                RestaurantPaymentMethod(restaurant_id=id, **m.model_dump())
            )
        self._session.flush()
```

> NOTE: `PaginationParams`/`CursorPage`/`encode_cursor`/`decode_cursor` may need a tuple-cursor
> signature `(datetime, UUID)`. Verify the Phase 1 implementation in
> `app/core/pagination.py` and adapt encode/decode to carry `created_at` + `id`. If the existing
> functions only carry a single opaque string, extend them (Task 1.5 below) before this step.

- [ ] **Step 3b: Verify/extend `app/core/pagination.py`**

Read `app/core/pagination.py`. Ensure `encode_cursor(created_at, id)` and
`decode_cursor(cursor) -> tuple[datetime, UUID]` exist. If not, add them (keep existing API),
with a unit test in `tests/test_pagination.py` for round-trip.

- [ ] **Step 4: Integration test** `backend/tests/modules/test_restaurants_repo.py`

```python
from app.core.pagination import PaginationParams
from app.modules.restaurants.adapters import SqlAlchemyRestaurantRepository
from app.modules.restaurants.schemas import RestaurantCreate, RestaurantUpdate

from tests.conftest import requires_db


@requires_db
def test_add_and_get(session):
    repo = SqlAlchemyRestaurantRepository(session)
    dto = repo.add(RestaurantCreate(name="R", subdomain="r1"))
    session.flush()
    assert repo.get(dto.id).subdomain == "r1"


@requires_db
def test_get_by_subdomain(session):
    repo = SqlAlchemyRestaurantRepository(session)
    repo.add(RestaurantCreate(name="R", subdomain="sub1"))
    session.flush()
    assert repo.get_by_subdomain("sub1") is not None
    assert repo.get_by_subdomain("missing") is None


@requires_db
def test_update_and_soft_delete(session):
    repo = SqlAlchemyRestaurantRepository(session)
    dto = repo.add(RestaurantCreate(name="R", subdomain="sub2"))
    session.flush()
    repo.update(dto.id, RestaurantUpdate(name="R2"))
    assert repo.get(dto.id).name == "R2"
    assert repo.soft_delete(dto.id) is True
    assert repo.get(dto.id) is None


@requires_db
def test_list_pagination(session):
    repo = SqlAlchemyRestaurantRepository(session)
    for i in range(3):
        repo.add(RestaurantCreate(name=f"R{i}", subdomain=f"p{i}"))
    session.flush()
    page = repo.list(PaginationParams(limit=2))
    assert len(page.items) == 2
    assert page.next_cursor is not None
    page2 = repo.list(PaginationParams(limit=2, cursor=page.next_cursor))
    assert len(page2.items) >= 1
```

- [ ] **Step 5: Create `tests/modules/__init__.py`** (empty) and run

Run: `pytest tests/modules/test_restaurants_repo.py -v`  → PASS

---

## Task 3: Menu module (categories, products, options, full menu)

**Files:**
- Create: `backend/app/modules/menu/__init__.py`, `schemas.py`, `repository.py`, `adapters.py`
- Test: `backend/tests/modules/test_menu_repo.py`

- [ ] **Step 1: `schemas.py`** — DTOs:

```python
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class CategoryCreate(BaseModel):
    restaurant_id: uuid.UUID
    name: str
    description: str | None = None
    image_path: str | None = None
    sort_index: int = 0


class CategoryUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    image_path: str | None = None
    sort_index: int | None = None


class CategoryDTO(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    restaurant_id: uuid.UUID
    name: str
    description: str | None = None
    image_path: str | None = None
    sort_index: int
    is_active: bool
    created_at: datetime
    updated_at: datetime


class OptionItemCreate(BaseModel):
    label: str
    price_delta_cents: int = 0
    sort_index: int = 0


class OptionItemDTO(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    label: str
    price_delta_cents: int
    sort_index: int
    is_active: bool


class OptionGroupCreate(BaseModel):
    title: str
    required: bool = False
    selection: str = "single"
    min_selections: int = 0
    max_selections: int | None = None
    sort_index: int = 0
    items: list[OptionItemCreate] = []


class OptionGroupDTO(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    product_id: uuid.UUID
    title: str
    required: bool
    selection: str
    min_selections: int
    max_selections: int | None
    sort_index: int
    is_active: bool
    items: list[OptionItemDTO] = []


class ProductCreate(BaseModel):
    restaurant_id: uuid.UUID
    name: str
    description: str | None = None
    price_cents: int
    currency: str = "USD"
    image_path: str | None = None
    approval_status: str = "draft"
    is_published: bool = False
    category_ids: list[uuid.UUID] = []


class ProductUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    price_cents: int | None = None
    currency: str | None = None
    image_path: str | None = None
    approval_status: str | None = None
    is_published: bool | None = None
    category_ids: list[uuid.UUID] | None = None


class ProductDTO(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    restaurant_id: uuid.UUID
    name: str
    description: str | None = None
    price_cents: int
    currency: str
    image_path: str | None = None
    approval_status: str
    is_published: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime
    category_ids: list[uuid.UUID] = []
    option_groups: list[OptionGroupDTO] = []


class FullMenuDTO(BaseModel):
    restaurant_id: uuid.UUID
    categories: list[CategoryDTO]
    products: list[ProductDTO]
```

- [ ] **Step 2: `repository.py` (MenuRepository ABC)** with methods listed in the spec
  (categories CRUD, products CRUD, options add/update/delete, `get_full_menu`). Signatures use
  the DTOs above + `PaginationParams`/`CursorPage[ProductDTO]`/`CursorPage[CategoryDTO]`.

- [ ] **Step 3: `adapters.py` (SqlAlchemyMenuRepository)**. Key details:
  - `add_product`: create `Product`, assign M:N by loading `Category` rows for `category_ids`
    and appending to `product.categories`; map back `category_ids` in the returned DTO.
  - `update_product` with `category_ids is not None`: replace `product.categories`.
  - `get_product`/DTO mapping: set `category_ids=[c.id for c in obj.categories]`,
    `option_groups=[OptionGroupDTO.model_validate(g) for g in obj.option_groups]`.
  - `list_products(..., published_only)`: filter `is_active` (+ `is_published` and
    `approval_status='approved'` when `published_only`); cursor pagination like Task 2.
  - `add_option_group(product_id, data)`: create `OptionGroup` + nested `OptionItem`s.
  - `get_full_menu(restaurant_id)`: active categories (sorted by sort_index) + active+published
    approved products with their option groups.

- [ ] **Step 4: Integration tests** `tests/modules/test_menu_repo.py`:
  category CRUD+soft delete; product create with 2 categories → `category_ids` length 2;
  update product replaces categories; option group with items round-trip;
  `get_full_menu` returns only published+approved+active products.

Run: `pytest tests/modules/test_menu_repo.py -v`  → PASS

---

## Task 4: Orders module

**Files:**
- Create: `backend/app/modules/orders/__init__.py`, `schemas.py`, `repository.py`, `adapters.py`
- Test: `backend/tests/modules/test_orders_repo.py`

- [ ] **Step 1: `schemas.py`** — `OrderItemCreate`, `OrderItemDTO`, `OrderCreate`
  (with `items: list[OrderItemCreate]`, optional `idempotency_key`), `OrderDTO`
  (with `items: list[OrderItemDTO]`). `selected_options: dict[str, Any] | None`.

- [ ] **Step 2: `repository.py` (OrderRepository ABC)** — `add`, `get`, `list_by_restaurant`
  (status filter + cursor pagination), `update_status`, `get_by_idempotency_key`.

- [ ] **Step 3: `adapters.py`** — `add` creates `Order` + nested `OrderItem`s in one flush;
  DTO maps `items`. `get_by_idempotency_key` filters `restaurant_id` + `idempotency_key`.
  `update_status` sets `status` and flushes.

- [ ] **Step 4: Integration tests** `tests/modules/test_orders_repo.py`:
  create order with 2 items → totals + items length; `update_status`;
  `list_by_restaurant` with status filter + pagination; `get_by_idempotency_key` returns the
  same order.

Run: `pytest tests/modules/test_orders_repo.py -v`  → PASS

---

## Task 5: Promotions module

**Files:**
- Create: `backend/app/modules/promotions/__init__.py`, `schemas.py`, `repository.py`,
  `adapters.py`
- Test: `backend/tests/modules/test_promotions_repo.py`

- [ ] **Step 1: `schemas.py`** — `PromotionCreate` (type, percent?, amount_cents?, scope,
  min_order_cents?, starts_at?, ends_at?, product_ids?, category_ids?), `PromotionUpdate`,
  `PromotionDTO` (+ `product_ids`, `category_ids`).

- [ ] **Step 2: `repository.py` (PromotionRepository ABC)** — `add`, `get`, `list_active`,
  `update`, `soft_delete`, `set_products`, `set_categories`.

- [ ] **Step 3: `adapters.py`** — `set_products`/`set_categories` delete-then-insert into the
  `promotion_products`/`promotion_categories` join tables via `session.execute`. DTO maps
  `product_ids`/`category_ids` by selecting from join tables. `list_active` filters
  `is_active` (+ time window optional) with cursor pagination.

- [ ] **Step 4: Integration tests** `tests/modules/test_promotions_repo.py`:
  create promo + attach 2 products → `product_ids` length 2; `list_active` excludes soft-deleted;
  `set_categories` round-trip.

Run: `pytest tests/modules/test_promotions_repo.py -v`  → PASS

---

## Task 6: Translations module

**Files:**
- Create: `backend/app/modules/translations/__init__.py`, `schemas.py`, `repository.py`,
  `adapters.py`
- Test: `backend/tests/modules/test_translations_repo.py`

- [ ] **Step 1: `schemas.py`** — `TranslationUpsert` (restaurant_id, locale, entity_type,
  entity_id, field, translated_text, source_hash), `TranslationDTO`.

- [ ] **Step 2: `repository.py` (TranslationRepository ABC)** — `get`, `upsert`,
  `list_for_menu`, `delete_stale`.

- [ ] **Step 3: `adapters.py`** — `upsert` uses
  `postgresql.insert(MenuTranslation).on_conflict_do_update(index_elements=[...unique tuple...],
  set_=...)`. `delete_stale` deletes rows for the tuple whose `source_hash != current`.

- [ ] **Step 4: Integration tests** `tests/modules/test_translations_repo.py`:
  upsert then get; upsert twice (same tuple) updates not duplicates; `list_for_menu` by locale;
  `delete_stale` removes outdated hash.

Run: `pytest tests/modules/test_translations_repo.py -v`  → PASS

---

## Task 7: AI artifacts module

**Files:**
- Create: `backend/app/modules/ai/__init__.py`, `schemas.py`, `repository.py`, `adapters.py`
- Test: `backend/tests/modules/test_ai_repo.py`

- [ ] **Step 1: `schemas.py`** — `AIArtifactCreate` (restaurant_id, entity_type, entity_id,
  field, original_value?, optimized_value?, status="applied"), `AIArtifactDTO`.

- [ ] **Step 2: `repository.py` (AIArtifactRepository ABC)** — `add`, `list_for_entity`,
  `get_latest`, `mark_reverted`.

- [ ] **Step 3: `adapters.py`** — `get_latest` orders by `created_at desc` filtered by tuple;
  `mark_reverted` sets `status="reverted"`.

- [ ] **Step 4: Integration tests** `tests/modules/test_ai_repo.py`:
  add + list_for_entity; get_latest returns newest; mark_reverted flips status.

Run: `pytest tests/modules/test_ai_repo.py -v`  → PASS

---

## Task 8: Idempotency repository (DB adapter)

**Files:**
- Modify: `backend/app/core/idempotency.py` (add `IdempotencyRecord` DTO + `IdempotencyRepository` ABC)
- Create: `backend/app/infra/__init__.py`, `backend/app/infra/repositories/__init__.py`
- Create: `backend/app/infra/repositories/idempotency.py`
- Test: `backend/tests/modules/test_idempotency_repo.py`

- [ ] **Step 1: Extend `core/idempotency.py`**

Add (keep existing `IdempotencyKey`/`IdempotencyStore`):
```python
import uuid  # if needed
from abc import ABC, abstractmethod
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class IdempotencyRecord(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    key: str
    request_hash: str
    response_snapshot: dict[str, Any] | None = None
    created_at: datetime
    expires_at: datetime


class IdempotencyRepository(ABC):
    @abstractmethod
    def get(self, key: str) -> IdempotencyRecord | None: ...

    @abstractmethod
    def put(
        self, key: str, request_hash: str, response: dict[str, Any] | None, ttl_seconds: int
    ) -> IdempotencyRecord: ...

    @abstractmethod
    def purge_expired(self, now: datetime | None = None) -> int: ...
```

- [ ] **Step 2: `infra/repositories/idempotency.py`**

```python
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.idempotency import IdempotencyRecord, IdempotencyRepository
from app.db.models.system import IdempotencyKey as IdempotencyKeyModel


class SqlAlchemyIdempotencyRepository(IdempotencyRepository):
    def __init__(self, session: Session) -> None:
        self._session = session

    def get(self, key: str) -> IdempotencyRecord | None:
        obj = self._session.get(IdempotencyKeyModel, key)
        if obj is None:
            return None
        return IdempotencyRecord.model_validate(obj)

    def put(
        self, key: str, request_hash: str, response: dict[str, Any] | None, ttl_seconds: int
    ) -> IdempotencyRecord:
        now = datetime.now(UTC)
        obj = IdempotencyKeyModel(
            key=key,
            request_hash=request_hash,
            response_snapshot=response,
            expires_at=now + timedelta(seconds=ttl_seconds),
        )
        self._session.add(obj)
        self._session.flush()
        return IdempotencyRecord.model_validate(obj)

    def purge_expired(self, now: datetime | None = None) -> int:
        cutoff = now or datetime.now(UTC)
        result = self._session.execute(
            delete(IdempotencyKeyModel).where(IdempotencyKeyModel.expires_at < cutoff)
        )
        self._session.flush()
        return int(result.rowcount or 0)
```

- [ ] **Step 3: Integration tests** `tests/modules/test_idempotency_repo.py`:
  put then get returns record; get(missing) is None; `purge_expired` removes past-expiry rows.

Run: `pytest tests/modules/test_idempotency_repo.py -v`  → PASS

---

## Task 9: Unit of Work

**Files:**
- Create: `backend/app/db/uow.py`
- Test: `backend/tests/test_uow.py`

- [ ] **Step 1: `uow.py`**

```python
from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Iterator
from types import TracebackType

from sqlalchemy.orm import Session, sessionmaker

from app.db.session import SessionLocal
from app.infra.repositories.idempotency import SqlAlchemyIdempotencyRepository
from app.modules.ai.adapters import SqlAlchemyAIArtifactRepository
from app.modules.menu.adapters import SqlAlchemyMenuRepository
from app.modules.orders.adapters import SqlAlchemyOrderRepository
from app.modules.promotions.adapters import SqlAlchemyPromotionRepository
from app.modules.restaurants.adapters import SqlAlchemyRestaurantRepository
from app.modules.translations.adapters import SqlAlchemyTranslationRepository


class UnitOfWork(ABC):
    @abstractmethod
    def __enter__(self) -> UnitOfWork: ...

    @abstractmethod
    def __exit__(self, exc_type, exc, tb) -> None: ...

    @abstractmethod
    def commit(self) -> None: ...

    @abstractmethod
    def rollback(self) -> None: ...


class SqlAlchemyUnitOfWork(UnitOfWork):
    def __init__(self, session_factory: sessionmaker[Session] = SessionLocal) -> None:
        self._session_factory = session_factory

    def __enter__(self) -> SqlAlchemyUnitOfWork:
        self.session = self._session_factory()
        self.restaurants = SqlAlchemyRestaurantRepository(self.session)
        self.menu = SqlAlchemyMenuRepository(self.session)
        self.orders = SqlAlchemyOrderRepository(self.session)
        self.promotions = SqlAlchemyPromotionRepository(self.session)
        self.translations = SqlAlchemyTranslationRepository(self.session)
        self.ai_artifacts = SqlAlchemyAIArtifactRepository(self.session)
        self.idempotency = SqlAlchemyIdempotencyRepository(self.session)
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        try:
            if exc_type is not None:
                self.rollback()
        finally:
            self.session.close()

    def commit(self) -> None:
        self.session.commit()

    def rollback(self) -> None:
        self.session.rollback()


def get_uow() -> Iterator[SqlAlchemyUnitOfWork]:
    with SqlAlchemyUnitOfWork() as uow:
        yield uow
        uow.commit()
```

- [ ] **Step 2: Tests** `tests/test_uow.py` (uses a session_factory bound to the test engine):

```python
from app.db.uow import SqlAlchemyUnitOfWork
from app.modules.restaurants.schemas import RestaurantCreate

from tests.conftest import requires_db


@requires_db
def test_commit_persists(engine):
    from sqlalchemy.orm import sessionmaker

    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with SqlAlchemyUnitOfWork(factory) as uow:
        uow.restaurants.add(RestaurantCreate(name="U", subdomain="uow1"))
        uow.commit()
    with SqlAlchemyUnitOfWork(factory) as uow:
        assert uow.restaurants.get_by_subdomain("uow1") is not None


@requires_db
def test_rollback_on_exception(engine):
    from sqlalchemy.orm import sessionmaker

    factory = sessionmaker(bind=engine, expire_on_commit=False)
    try:
        with SqlAlchemyUnitOfWork(factory) as uow:
            uow.restaurants.add(RestaurantCreate(name="U", subdomain="uow2"))
            raise RuntimeError("boom")
    except RuntimeError:
        pass
    with SqlAlchemyUnitOfWork(factory) as uow:
        assert uow.restaurants.get_by_subdomain("uow2") is None
```

Run: `pytest tests/test_uow.py -v`  → PASS

---

## Task 10: Storage port + Supabase adapter

**Files:**
- Create: `backend/app/core/storage.py`
- Create: `backend/app/infra/storage/__init__.py`
- Create: `backend/app/infra/storage/supabase_storage.py`
- Test: `backend/tests/test_storage_supabase.py`

- [ ] **Step 1: `core/storage.py`**

```python
from abc import ABC, abstractmethod

from pydantic import BaseModel


class StoredObject(BaseModel):
    path: str
    public_url: str


class StorageError(Exception):
    pass


class StoragePort(ABC):
    @abstractmethod
    def upload(
        self, path: str, data: bytes, content_type: str, *, upsert: bool = True
    ) -> StoredObject: ...

    @abstractmethod
    def delete(self, path: str) -> None: ...

    @abstractmethod
    def get_public_url(self, path: str) -> str: ...

    @abstractmethod
    def create_signed_url(self, path: str, expires_in: int) -> str: ...
```

- [ ] **Step 2: `infra/storage/supabase_storage.py`**

```python
from supabase import Client, create_client

from app.core.config import Settings
from app.core.storage import StorageError, StoragePort, StoredObject


class SupabaseStorageAdapter(StoragePort):
    def __init__(self, settings: Settings) -> None:
        if not settings.supabase_url or not settings.supabase_service_role_key:
            raise StorageError("Supabase storage is not configured")
        self._bucket = settings.supabase_storage_bucket
        self._client: Client = create_client(
            settings.supabase_url, settings.supabase_service_role_key
        )

    def upload(
        self, path: str, data: bytes, content_type: str, *, upsert: bool = True
    ) -> StoredObject:
        try:
            self._client.storage.from_(self._bucket).upload(
                path,
                data,
                {"content-type": content_type, "upsert": str(upsert).lower()},
            )
        except Exception as exc:  # provider-specific errors normalized
            raise StorageError(str(exc)) from exc
        return StoredObject(path=path, public_url=self.get_public_url(path))

    def delete(self, path: str) -> None:
        try:
            self._client.storage.from_(self._bucket).remove([path])
        except Exception as exc:
            raise StorageError(str(exc)) from exc

    def get_public_url(self, path: str) -> str:
        return self._client.storage.from_(self._bucket).get_public_url(path)

    def create_signed_url(self, path: str, expires_in: int) -> str:
        res = self._client.storage.from_(self._bucket).create_signed_url(
            path, expires_in
        )
        return res["signedURL"]
```

- [ ] **Step 3: Skip-if-no-creds smoke test** `tests/test_storage_supabase.py`

```python
import uuid

import pytest

from app.core.config import get_settings
from app.core.storage import StoredObject

settings = get_settings()
requires_supabase = pytest.mark.skipif(
    not (settings.supabase_url and settings.supabase_service_role_key),
    reason="Supabase credentials not configured",
)


@requires_supabase
def test_storage_round_trip():
    from app.infra.storage.supabase_storage import SupabaseStorageAdapter

    adapter = SupabaseStorageAdapter(settings)
    path = f"smoke/{uuid.uuid4()}.txt"
    obj = adapter.upload(path, b"hello", "text/plain")
    assert isinstance(obj, StoredObject)
    assert obj.public_url
    adapter.delete(path)
```

Run: `pytest tests/test_storage_supabase.py -v` → PASS or SKIP (PASS expected since creds present)

---

## Task 11: Supabase provisioning + verification script

**Files:**
- Create: `backend/scripts/verify_supabase.py`

- [ ] **Step 1: Apply the Phase 2 migration to Supabase**

Run (DATABASE_URL in `.env` already points to Supabase pooler):
```bash
alembic upgrade head
```
Expected: creates all 17 tables in Supabase. Verify with the script below.

- [ ] **Step 2: `scripts/verify_supabase.py`**

```python
from sqlalchemy import text

from app.core.config import get_settings
from app.db.session import engine
from app.infra.storage.supabase_storage import SupabaseStorageAdapter


def main() -> None:
    settings = get_settings()
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
        count = conn.execute(
            text(
                "SELECT count(*) FROM information_schema.tables "
                "WHERE table_schema='public'"
            )
        ).scalar()
    print(f"DB OK — public tables: {count}")

    adapter = SupabaseStorageAdapter(settings)
    import uuid

    path = f"smoke/{uuid.uuid4()}.txt"
    obj = adapter.upload(path, b"hello", "text/plain")
    print(f"Storage upload OK — {obj.public_url}")
    adapter.delete(path)
    print("Storage delete OK")


if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Run verification**

Run: `python -m scripts.verify_supabase`
Expected: prints DB OK with table count (17), Storage upload OK + delete OK.
If the bucket `assets` does not exist, create it in the Supabase dashboard (Storage → New bucket,
public) or note it for the user, then re-run.

---

## Task 12: Final verification (Definition of Done)

- [ ] **Step 1: Quality gates** (from `backend/`, local Docker Postgres running):

```bash
pytest -q
ruff check .
black --check .
mypy app
```
Expected: all green. Supabase smoke test passes (creds present); other DB tests use local Docker.

- [ ] **Step 2: Confirm Supabase has the schema**

Run: `python -m scripts.verify_supabase` → DB OK (17 tables) + Storage round-trip OK.

---

## Self-review notes (author)

- **Spec coverage:** ports+adapters for all 7 aggregates (Tasks 2–8), UoW (9), pooler-aware
  psycopg-v3 engine + URL normalization (1), StoragePort+Supabase adapter (10), Supabase DB
  migration + verification (11), DoD gates (12). Idempotency port in `core`, adapter in `infra`.
- **Type consistency:** DTO names and repo method signatures match the spec section 5; UoW
  attribute names (`restaurants`, `menu`, `orders`, `promotions`, `translations`,
  `ai_artifacts`, `idempotency`) match the adapters imported.
- **Gotchas flagged:** verify/extend `app/core/pagination.py` to carry `(created_at, id)` tuple
  cursor before using it in adapters (Task 2 Step 3b); psycopg v3 + transaction pooler needs
  `prepare_threshold=None` + `NullPool`; `on_conflict_do_update` for translation upsert;
  Supabase bucket must exist before storage round-trip.

---

## Commit list (run yourself; do NOT let the agent commit)

Messages follow `docs/COMMIT_FORMAT.md`. Run from repo root.

```bash
cd /Users/oliver/startup/venddelo-ai/venddelo-ai

# Task 1 — engine pooling + url normalization + supabase settings
git add backend/app/core/config.py backend/app/db/session.py backend/requirements.txt backend/tests/test_db_url.py backend/.env.example
git commit -m "feat: add pooler-aware psycopg engine and supabase settings"

# (if pagination extended) Task 2 Step 3b
git add backend/app/core/pagination.py backend/tests/test_pagination.py
git commit -m "feat: support tuple cursor (created_at,id) in pagination"

# Task 2 — restaurants repository
git add backend/app/modules/restaurants backend/tests/modules/__init__.py backend/tests/modules/test_restaurants_repo.py
git commit -m "feat: add restaurant repository port and sqlalchemy adapter"

# Task 3 — menu repository
git add backend/app/modules/menu backend/tests/modules/test_menu_repo.py
git commit -m "feat: add menu repository port and sqlalchemy adapter"

# Task 4 — orders repository
git add backend/app/modules/orders backend/tests/modules/test_orders_repo.py
git commit -m "feat: add order repository port and sqlalchemy adapter"

# Task 5 — promotions repository
git add backend/app/modules/promotions backend/tests/modules/test_promotions_repo.py
git commit -m "feat: add promotion repository port and sqlalchemy adapter"

# Task 6 — translations repository
git add backend/app/modules/translations backend/tests/modules/test_translations_repo.py
git commit -m "feat: add translation repository port and sqlalchemy adapter"

# Task 7 — ai artifacts repository
git add backend/app/modules/ai backend/tests/modules/test_ai_repo.py
git commit -m "feat: add ai-artifact repository port and sqlalchemy adapter"

# Task 8 — idempotency repository
git add backend/app/core/idempotency.py backend/app/infra/__init__.py backend/app/infra/repositories backend/tests/modules/test_idempotency_repo.py
git commit -m "feat: add idempotency repository contract and db adapter"

# Task 9 — unit of work
git add backend/app/db/uow.py backend/tests/test_uow.py
git commit -m "feat: add unit of work over repositories"

# Task 10 — storage port + supabase adapter
git add backend/app/core/storage.py backend/app/infra/storage backend/tests/test_storage_supabase.py
git commit -m "feat: add storage port and supabase storage adapter"

# Task 11 — supabase verification script
git add backend/scripts/verify_supabase.py
git commit -m "chore: add supabase connectivity verification script"

# Docs — phase 3 spec and plan
git add docs/superpowers/specs/2026-06-13-phase-3-persistence-layer-design.md docs/superpowers/plans/2026-06-13-phase-3-persistence-layer.md
git commit -m "docs: add phase 3 persistence layer spec and plan"
```
