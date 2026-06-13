# Phase 2 — Domain Modeling & DB Design Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the normalized PostgreSQL schema for Vendelo AI: SQLAlchemy 2.0 models (17 tables), a local Postgres (Docker) for dev, an Alembic baseline migration, an idempotent seed script for a demo restaurant, and DB integration tests — keeping the ORM in the infrastructure layer (`app/db/`).

**Architecture:** Central persistence package `app/db/` with one `DeclarativeBase` + mixins; models split by domain file; Alembic wired to `Base.metadata` and `Settings.database_url`. UUID PKs, VARCHAR+CHECK enums, money in cents, soft deletes, join tables for promotions.

**Tech Stack:** Python 3.12, SQLAlchemy 2.0 (typed `Mapped[]`), Alembic, psycopg v3 (sync), PostgreSQL 16 via Docker, pytest.

---

## Conventions for every task

- Run commands from `backend/` with the venv active (`source .venv/bin/activate`) unless stated otherwise.
- TDD where it applies: write failing test → run (fail) → implement → run (pass).
- DB integration tests require the Docker Postgres (Task 1) running.
- No commits are executed by the implementer; the commit list is provided at the end for the user to run.
- Constraint naming convention is set on the metadata so Alembic autogenerate/downgrade is deterministic.

---

## Task 1: Local Postgres (Docker) + dependencies + settings

**Files:**
- Create: `infra/docker-compose.yml`
- Create: `infra/.env.example`
- Modify: `backend/requirements.txt`
- Modify: `backend/app/core/config.py`
- Modify: `backend/.env.example`
- Test: `backend/tests/test_config_db.py`

- [ ] **Step 1: Create `infra/docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16
    container_name: vendelo_postgres
    environment:
      POSTGRES_USER: vendelo
      POSTGRES_PASSWORD: vendelo
      POSTGRES_DB: vendelo
    ports:
      - "5432:5432"
    volumes:
      - vendelo_pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U vendelo -d vendelo"]
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  vendelo_pgdata:
```

- [ ] **Step 2: Create `infra/.env.example`**

```
POSTGRES_USER=vendelo
POSTGRES_PASSWORD=vendelo
POSTGRES_DB=vendelo
```

- [ ] **Step 3: Add DB deps to `backend/requirements.txt`**

Append:
```
sqlalchemy==2.0.36
alembic==1.14.0
psycopg[binary]==3.2.3
```

- [ ] **Step 4: Install deps**

Run: `pip install -r requirements-dev.txt`
Expected: sqlalchemy, alembic, psycopg installed.

- [ ] **Step 5: Add settings — write failing test** `backend/tests/test_config_db.py`

```python
from app.core.config import Settings


def test_database_url_default():
    settings = Settings()
    assert settings.database_url.startswith("postgresql+psycopg://")


def test_database_url_test_optional():
    settings = Settings()
    assert settings.database_url_test is None or settings.database_url_test.startswith(
        "postgresql+psycopg://"
    )
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pytest tests/test_config_db.py -v`
Expected: FAIL (AttributeError: database_url)

- [ ] **Step 7: Extend `backend/app/core/config.py`**

Add fields to `Settings` (keep existing fields):
```python
    database_url: str = "postgresql+psycopg://vendelo:vendelo@localhost:5432/vendelo"
    database_url_test: str | None = None
```

- [ ] **Step 8: Update `backend/.env.example`**

Replace the commented `# DATABASE_URL=` line with:
```
DATABASE_URL=postgresql+psycopg://vendelo:vendelo@localhost:5432/vendelo
DATABASE_URL_TEST=postgresql+psycopg://vendelo:vendelo@localhost:5432/vendelo_test
```

- [ ] **Step 9: Run test to verify it passes**

Run: `pytest tests/test_config_db.py -v`
Expected: PASS

- [ ] **Step 10: Start Postgres and create the test database**

Run (from repo root):
```bash
docker compose -f infra/docker-compose.yml up -d
docker exec vendelo_postgres pg_isready -U vendelo
docker exec -e PGPASSWORD=vendelo vendelo_postgres psql -U vendelo -d vendelo -c "CREATE DATABASE vendelo_test;" || true
```
Expected: container healthy; `vendelo_test` created (or already exists).

---

## Task 2: SQLAlchemy Base, mixins, session

**Files:**
- Create: `backend/app/db/__init__.py`
- Create: `backend/app/db/base.py`
- Create: `backend/app/db/session.py`
- Test: `backend/tests/test_db_base.py`

- [ ] **Step 1: Create `backend/app/db/__init__.py`** (empty)

- [ ] **Step 2: Write failing test** `backend/tests/test_db_base.py`

```python
from app.db.base import Base, SoftDeleteMixin, TimestampMixin, UUIDPrimaryKeyMixin


def test_metadata_naming_convention_present():
    nc = Base.metadata.naming_convention
    assert "pk" in nc and "fk" in nc and "ix" in nc and "uq" in nc and "ck" in nc


def test_mixins_define_expected_columns():
    assert hasattr(UUIDPrimaryKeyMixin, "id")
    assert hasattr(TimestampMixin, "created_at")
    assert hasattr(TimestampMixin, "updated_at")
    assert hasattr(SoftDeleteMixin, "is_active")
    assert hasattr(SoftDeleteMixin, "deleted_at")
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pytest tests/test_db_base.py -v`
Expected: FAIL (ModuleNotFoundError)

- [ ] **Step 4: Implement `backend/app/db/base.py`**

```python
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, MetaData, func
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


class UUIDPrimaryKeyMixin:
    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class SoftDeleteMixin:
    is_active: Mapped[bool] = mapped_column(
        Boolean, server_default="true", nullable=False
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
```

- [ ] **Step 5: Implement `backend/app/db/session.py`**

```python
from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings

_settings = get_settings()

engine = create_engine(
    _settings.database_url,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
)

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

- [ ] **Step 6: Run test to verify it passes**

Run: `pytest tests/test_db_base.py -v`
Expected: PASS

---

## Task 3: Restaurant models (restaurant, schedules, payment methods)

**Files:**
- Create: `backend/app/db/models/__init__.py`
- Create: `backend/app/db/models/restaurant.py`

- [ ] **Step 1: Implement `backend/app/db/models/restaurant.py`**

```python
import uuid

from sqlalchemy import (
    CheckConstraint,
    Float,
    ForeignKey,
    Integer,
    SmallInteger,
    String,
    Text,
    Time,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, SoftDeleteMixin, TimestampMixin, UUIDPrimaryKeyMixin


class Restaurant(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "restaurants"

    name: Mapped[str] = mapped_column(Text, nullable=False)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    place_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    logo_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    subdomain: Mapped[str] = mapped_column(String(63), nullable=False)
    color_palette: Mapped[str | None] = mapped_column(String(50), nullable=True)
    original_language: Mapped[str] = mapped_column(
        String(10), nullable=False, server_default="es"
    )
    status: Mapped[str] = mapped_column(
        String, nullable=False, server_default="draft"
    )

    schedules: Mapped[list["RestaurantSchedule"]] = relationship(
        back_populates="restaurant", cascade="all, delete-orphan"
    )
    payment_methods: Mapped[list["RestaurantPaymentMethod"]] = relationship(
        back_populates="restaurant", cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint("subdomain", name="uq_restaurants_subdomain"),
        CheckConstraint(
            "status IN ('draft','published','suspended')",
            name="status_allowed",
        ),
    )


class RestaurantSchedule(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "restaurant_schedules"

    restaurant_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("restaurants.id", ondelete="CASCADE"),
        nullable=False,
    )
    service_type: Mapped[str] = mapped_column(String, nullable=False)
    day_of_week: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    opens_at: Mapped["Time"] = mapped_column(Time, nullable=False)
    closes_at: Mapped["Time"] = mapped_column(Time, nullable=False)

    restaurant: Mapped["Restaurant"] = relationship(back_populates="schedules")

    __table_args__ = (
        CheckConstraint(
            "service_type IN ('takeout','delivery')", name="service_type_allowed"
        ),
        CheckConstraint(
            "day_of_week BETWEEN 0 AND 6", name="day_of_week_range"
        ),
    )


class RestaurantPaymentMethod(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "restaurant_payment_methods"

    restaurant_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("restaurants.id", ondelete="CASCADE"),
        nullable=False,
    )
    method: Mapped[str] = mapped_column(String, nullable=False)
    service_type: Mapped[str] = mapped_column(String, nullable=False)
    enabled: Mapped[bool] = mapped_column(
        Integer, nullable=False, server_default="1"
    )

    restaurant: Mapped["Restaurant"] = relationship(back_populates="payment_methods")

    __table_args__ = (
        UniqueConstraint(
            "restaurant_id",
            "method",
            "service_type",
            name="uq_payment_method_service",
        ),
        CheckConstraint(
            "method IN ('cash','transfer','card_terminal')", name="method_allowed"
        ),
        CheckConstraint(
            "service_type IN ('takeout','delivery')", name="pm_service_type_allowed"
        ),
    )
```

> Note: `enabled` uses `Boolean`; if mypy/sqlalchemy prefer, keep `Boolean` with `server_default="true"`. Replace the `Integer`/`"1"` above with `Boolean`/`"true"` (use Boolean to match spec). Final form:
> ```python
> from sqlalchemy import Boolean
> enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
> ```

- [ ] **Step 2: Create `backend/app/db/models/__init__.py`**

```python
from app.db.models.restaurant import (
    Restaurant,
    RestaurantPaymentMethod,
    RestaurantSchedule,
)

__all__ = [
    "Restaurant",
    "RestaurantSchedule",
    "RestaurantPaymentMethod",
]
```

- [ ] **Step 3: Smoke import**

Run: `python -c "import app.db.models; print(len(app.db.models.__all__))"`
Expected: prints `3` (no import errors).

---

## Task 4: Menu models (categories, products, M:N, option groups/items)

**Files:**
- Create: `backend/app/db/models/menu.py`
- Modify: `backend/app/db/models/__init__.py`

- [ ] **Step 1: Implement `backend/app/db/models/menu.py`**

```python
import uuid

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    ForeignKey,
    Integer,
    String,
    Table,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, SoftDeleteMixin, TimestampMixin, UUIDPrimaryKeyMixin

product_categories = Table(
    "product_categories",
    Base.metadata,
    Column(
        "product_id",
        PG_UUID(as_uuid=True),
        ForeignKey("products.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "category_id",
        PG_UUID(as_uuid=True),
        ForeignKey("categories.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)


class Category(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "categories"

    restaurant_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("restaurants.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_index: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")

    products: Mapped[list["Product"]] = relationship(
        secondary=product_categories, back_populates="categories"
    )


class Product(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "products"

    restaurant_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("restaurants.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    price_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(
        String(3), nullable=False, server_default="USD"
    )
    image_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    approval_status: Mapped[str] = mapped_column(
        String, nullable=False, server_default="draft"
    )
    is_published: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )

    categories: Mapped[list["Category"]] = relationship(
        secondary=product_categories, back_populates="products"
    )
    option_groups: Mapped[list["OptionGroup"]] = relationship(
        back_populates="product", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint(
            "approval_status IN ('draft','pending_review','approved','rejected')",
            name="approval_status_allowed",
        ),
    )


class OptionGroup(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "option_groups"

    product_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(Text, nullable=False)
    required: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    selection: Mapped[str] = mapped_column(String, nullable=False)
    min_selections: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )
    max_selections: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sort_index: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="true"
    )

    product: Mapped["Product"] = relationship(back_populates="option_groups")
    items: Mapped[list["OptionItem"]] = relationship(
        back_populates="option_group", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint(
            "selection IN ('single','multi')", name="selection_allowed"
        ),
    )


class OptionItem(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "option_items"

    option_group_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("option_groups.id", ondelete="CASCADE"),
        nullable=False,
    )
    label: Mapped[str] = mapped_column(Text, nullable=False)
    price_delta_cents: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )
    sort_index: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="true"
    )

    option_group: Mapped["OptionGroup"] = relationship(back_populates="items")
```

- [ ] **Step 2: Update `backend/app/db/models/__init__.py`** to also import the menu models and `product_categories`, adding them to `__all__`.

```python
from app.db.models.menu import (
    Category,
    OptionGroup,
    OptionItem,
    Product,
    product_categories,
)
from app.db.models.restaurant import (
    Restaurant,
    RestaurantPaymentMethod,
    RestaurantSchedule,
)

__all__ = [
    "Restaurant",
    "RestaurantSchedule",
    "RestaurantPaymentMethod",
    "Category",
    "Product",
    "product_categories",
    "OptionGroup",
    "OptionItem",
]
```

- [ ] **Step 3: Smoke import**

Run: `python -c "import app.db.models as m; print(sorted(t.name for t in m.Base.metadata.tables.values()))"`
Expected: includes `categories`, `option_groups`, `option_items`, `product_categories`, `products`, `restaurants`, `restaurant_payment_methods`, `restaurant_schedules`.

---

## Task 5: Promotions models (promotions + join tables)

**Files:**
- Create: `backend/app/db/models/promotions.py`
- Modify: `backend/app/db/models/__init__.py`

- [ ] **Step 1: Implement `backend/app/db/models/promotions.py`**

```python
import uuid

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Table,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, SoftDeleteMixin, TimestampMixin, UUIDPrimaryKeyMixin

promotion_products = Table(
    "promotion_products",
    Base.metadata,
    Column(
        "promotion_id",
        PG_UUID(as_uuid=True),
        ForeignKey("promotions.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "product_id",
        PG_UUID(as_uuid=True),
        ForeignKey("products.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)

promotion_categories = Table(
    "promotion_categories",
    Base.metadata,
    Column(
        "promotion_id",
        PG_UUID(as_uuid=True),
        ForeignKey("promotions.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "category_id",
        PG_UUID(as_uuid=True),
        ForeignKey("categories.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)


class Promotion(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "promotions"

    restaurant_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("restaurants.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[str] = mapped_column(String, nullable=False)
    percent: Mapped[int | None] = mapped_column(Integer, nullable=True)
    amount_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    scope: Mapped[str] = mapped_column(String, nullable=False)
    min_order_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    starts_at: Mapped["DateTime | None"] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    ends_at: Mapped["DateTime | None"] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    __table_args__ = (
        CheckConstraint(
            "type IN ('percent','amount','combo','two_for_one')",
            name="promotion_type_allowed",
        ),
        CheckConstraint(
            "scope IN ('product','category','order')",
            name="promotion_scope_allowed",
        ),
    )
```

> Note on `starts_at`/`ends_at` typing: use `datetime | None` from `datetime` to satisfy mypy. Final form:
> ```python
> from datetime import datetime
> starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
> ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
> ```

- [ ] **Step 2: Update `backend/app/db/models/__init__.py`** to import `Promotion`, `promotion_products`, `promotion_categories` and add to `__all__`.

- [ ] **Step 3: Smoke import**

Run: `python -c "import app.db.models as m; print('promotions' in m.Base.metadata.tables, 'promotion_products' in m.Base.metadata.tables, 'promotion_categories' in m.Base.metadata.tables)"`
Expected: `True True True`

---

## Task 6: Orders models (orders, order_items)

**Files:**
- Create: `backend/app/db/models/orders.py`
- Modify: `backend/app/db/models/__init__.py`

- [ ] **Step 1: Implement `backend/app/db/models/orders.py`**

```python
import uuid

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Order(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "orders"

    restaurant_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("restaurants.id", ondelete="RESTRICT"),
        nullable=False,
    )
    type: Mapped[str] = mapped_column(String, nullable=False)
    customer_name: Mapped[str] = mapped_column(Text, nullable=False)
    customer_phone: Mapped[str] = mapped_column(Text, nullable=False)
    delivery_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    payment_method: Mapped[str] = mapped_column(String, nullable=False)
    subtotal_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    total_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(
        String, nullable=False, server_default="pending"
    )
    idempotency_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    items: Mapped[list["OrderItem"]] = relationship(
        back_populates="order", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint("type IN ('takeout','delivery')", name="order_type_allowed"),
        CheckConstraint(
            "payment_method IN ('cash','transfer','card_terminal')",
            name="order_payment_method_allowed",
        ),
        CheckConstraint(
            "status IN ('pending','confirmed','preparing','ready','delivered','cancelled')",
            name="order_status_allowed",
        ),
    )


class OrderItem(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "order_items"

    order_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("orders.id", ondelete="CASCADE"),
        nullable=False,
    )
    product_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("products.id", ondelete="SET NULL"),
        nullable=True,
    )
    product_name: Mapped[str] = mapped_column(Text, nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    selected_options: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    line_total_cents: Mapped[int] = mapped_column(Integer, nullable=False)

    order: Mapped["Order"] = relationship(back_populates="items")
```

- [ ] **Step 2: Update `backend/app/db/models/__init__.py`** to import `Order`, `OrderItem` and add to `__all__`.

- [ ] **Step 3: Smoke import**

Run: `python -c "import app.db.models as m; print('orders' in m.Base.metadata.tables, 'order_items' in m.Base.metadata.tables)"`
Expected: `True True`

---

## Task 7: AI + system models (ai_artifacts, menu_translations, idempotency_keys, audit_logs)

**Files:**
- Create: `backend/app/db/models/ai.py`
- Create: `backend/app/db/models/system.py`
- Modify: `backend/app/db/models/__init__.py`

- [ ] **Step 1: Implement `backend/app/db/models/ai.py`**

```python
import uuid

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class AIArtifact(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "ai_artifacts"

    restaurant_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("restaurants.id", ondelete="CASCADE"),
        nullable=False,
    )
    entity_type: Mapped[str] = mapped_column(String, nullable=False)
    entity_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False)
    field: Mapped[str] = mapped_column(String(50), nullable=False)
    original_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    optimized_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String, nullable=False, server_default="applied"
    )

    __table_args__ = (
        CheckConstraint(
            "entity_type IN ('product','category','restaurant')",
            name="ai_entity_type_allowed",
        ),
        CheckConstraint(
            "status IN ('applied','reverted')", name="ai_artifact_status_allowed"
        ),
    )


class MenuTranslation(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "menu_translations"

    restaurant_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("restaurants.id", ondelete="CASCADE"),
        nullable=False,
    )
    locale: Mapped[str] = mapped_column(String(10), nullable=False)
    entity_type: Mapped[str] = mapped_column(String, nullable=False)
    entity_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False)
    field: Mapped[str] = mapped_column(String(50), nullable=False)
    translated_text: Mapped[str] = mapped_column(Text, nullable=False)
    source_hash: Mapped[str] = mapped_column(String(64), nullable=False)

    __table_args__ = (
        UniqueConstraint(
            "restaurant_id",
            "locale",
            "entity_type",
            "entity_id",
            "field",
            name="uq_menu_translation_unique",
        ),
    )
```

- [ ] **Step 2: Implement `backend/app/db/models/system.py`**

```python
import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, UUIDPrimaryKeyMixin


class IdempotencyKey(Base):
    __tablename__ = "idempotency_keys"

    key: Mapped[str] = mapped_column(String(255), primary_key=True)
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    response_snapshot: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )


class AuditLog(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "audit_logs"

    actor: Mapped[str | None] = mapped_column(String(255), nullable=True)
    action: Mapped[str] = mapped_column(String(50), nullable=False)
    target_table: Mapped[str | None] = mapped_column(String(63), nullable=True)
    target_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), nullable=True
    )
    audit_metadata: Mapped[dict | None] = mapped_column(
        "metadata", JSONB, nullable=True
    )
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
```

> Note: the Python attribute is `audit_metadata` mapped to DB column `metadata` (SQLAlchemy reserves `metadata` on declarative classes).

- [ ] **Step 3: Update `backend/app/db/models/__init__.py`** to import all four and add to `__all__`.

- [ ] **Step 4: Smoke import — verify all 17 tables**

Run:
```bash
python -c "import app.db.models as m; print(len(m.Base.metadata.tables)); print(sorted(m.Base.metadata.tables))"
```
Expected: `17` and the sorted list of all table names.

---

## Task 8: Add indexes per spec

**Files:**
- Modify: model files to add `Index` entries in `__table_args__`.

- [ ] **Step 1: Add indexes**

Add to each model's `__table_args__` (append, keep existing constraints):
- `restaurant_schedules`: `Index("ix_schedules_lookup", "restaurant_id", "service_type", "day_of_week")`
- `categories`: `Index("ix_categories_listing", "restaurant_id", "is_active", "sort_index")`
- `products`: `Index("ix_products_publish", "restaurant_id", "is_active", "is_published")`, `Index("ix_products_review", "restaurant_id", "approval_status")`
- `option_groups`: `Index("ix_option_groups_product", "product_id")`
- `option_items`: `Index("ix_option_items_group", "option_group_id")`
- `promotions`: `Index("ix_promotions_active", "restaurant_id", "is_active")`
- `orders`: `Index("ix_orders_listing", "restaurant_id", "status", "created_at")`
- `order_items`: `Index("ix_order_items_order", "order_id")`
- `ai_artifacts`: `Index("ix_ai_artifacts_entity", "restaurant_id", "entity_type", "entity_id")`
- `menu_translations`: `Index("ix_menu_translations_lookup", "restaurant_id", "locale", "entity_type", "entity_id")`
- `idempotency_keys`: `Index("ix_idempotency_expires", "expires_at")`
- `audit_logs`: `Index("ix_audit_occurred", "occurred_at")`, `Index("ix_audit_action", "action")`

Import `Index` from `sqlalchemy` in each file that uses it.

- [ ] **Step 2: Smoke import** (ensure no errors)

Run: `python -c "import app.db.models as m; print('ok', len(m.Base.metadata.tables))"`
Expected: `ok 17`

---

## Task 9: Alembic setup + baseline migration

**Files:**
- Create: `backend/alembic.ini`
- Create: `backend/migrations/env.py`
- Create: `backend/migrations/script.py.mako`
- Create: `backend/migrations/versions/` (dir)
- Generated: `backend/migrations/versions/0001_baseline.py`

- [ ] **Step 1: Create `backend/alembic.ini`** (minimal; URL comes from env.py)

```ini
[alembic]
script_location = migrations
prepend_sys_path = .

[loggers]
keys = root,sqlalchemy,alembic

[handlers]
keys = console

[formatters]
keys = generic

[logger_root]
level = WARN
handlers = console
qualname =

[logger_sqlalchemy]
level = WARN
handlers =
qualname = sqlalchemy.engine

[logger_alembic]
level = INFO
handlers =
qualname = alembic

[handler_console]
class = StreamHandler
args = (sys.stderr,)
level = NOTSET
formatter = generic

[formatter_generic]
format = %(levelname)-5.5s [%(name)s] %(message)s
datefmt = %H:%M:%S
```

- [ ] **Step 2: Create `backend/migrations/script.py.mako`**

```mako
"""${message}

Revision ID: ${up_revision}
Revises: ${down_revision | comma,n}
Create Date: ${create_date}
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
${imports if imports else ""}

revision: str = ${repr(up_revision)}
down_revision: str | None = ${repr(down_revision)}
branch_labels: str | Sequence[str] | None = ${repr(branch_labels)}
depends_on: str | Sequence[str] | None = ${repr(depends_on)}


def upgrade() -> None:
    ${upgrades if upgrades else "pass"}


def downgrade() -> None:
    ${downgrades if downgrades else "pass"}
```

- [ ] **Step 3: Create `backend/migrations/env.py`**

```python
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.core.config import get_settings
from app.db.base import Base
import app.db.models  # noqa: F401  (populate metadata)

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

config.set_main_option("sqlalchemy.url", get_settings().database_url)
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=get_settings().database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

- [ ] **Step 4: Create the versions directory**

Run: `mkdir -p migrations/versions`

- [ ] **Step 5: Autogenerate the baseline migration** (Postgres from Task 1 must be running)

Run:
```bash
alembic revision --autogenerate -m "baseline schema" --rev-id 0001_baseline
```
Expected: a file `migrations/versions/0001_baseline.py` is created with `op.create_table(...)` for all 17 tables.

- [ ] **Step 6: Review the generated migration**

Open `migrations/versions/0001_baseline.py`. Verify: all 17 tables present, named CHECK constraints, unique constraints, FKs with `ondelete`, indexes from Task 8. Fix anything missing by editing models and re-generating.

- [ ] **Step 7: Apply migration**

Run: `alembic upgrade head`
Expected: completes; tables created.

- [ ] **Step 8: Verify tables exist**

Run:
```bash
docker exec -e PGPASSWORD=vendelo vendelo_postgres psql -U vendelo -d vendelo -c "\dt"
```
Expected: lists all 17 tables (+ `alembic_version`).

- [ ] **Step 9: Verify downgrade is reversible**

Run: `alembic downgrade base && alembic upgrade head`
Expected: both succeed (drops then recreates).

---

## Task 10: DB integration tests

**Files:**
- Create: `backend/tests/conftest.py`
- Create: `backend/tests/test_models.py`

- [ ] **Step 1: Implement `backend/tests/conftest.py`**

```python
import os

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.db.base import Base
import app.db.models  # noqa: F401

TEST_URL = os.getenv(
    "DATABASE_URL_TEST",
    "postgresql+psycopg://vendelo:vendelo@localhost:5432/vendelo_test",
)


def _postgres_available(url: str) -> bool:
    try:
        eng = create_engine(url)
        with eng.connect():
            return True
    except Exception:
        return False


requires_db = pytest.mark.skipif(
    not _postgres_available(TEST_URL),
    reason="Postgres test database not available",
)


@pytest.fixture(scope="session")
def engine():
    eng = create_engine(TEST_URL)
    Base.metadata.drop_all(eng)
    Base.metadata.create_all(eng)
    yield eng
    Base.metadata.drop_all(eng)


@pytest.fixture
def session(engine) -> Session:
    SessionTest = sessionmaker(bind=engine, expire_on_commit=False)
    s = SessionTest()
    try:
        yield s
    finally:
        s.rollback()
        s.close()
```

- [ ] **Step 2: Implement `backend/tests/test_models.py`**

```python
import pytest
from sqlalchemy.exc import IntegrityError

from app.db.models import (
    Category,
    OptionGroup,
    OptionItem,
    Product,
    Restaurant,
)
from tests.conftest import requires_db


@requires_db
def test_restaurant_unique_subdomain(session):
    session.add(Restaurant(name="A", subdomain="dup"))
    session.commit()
    session.add(Restaurant(name="B", subdomain="dup"))
    with pytest.raises(IntegrityError):
        session.commit()
    session.rollback()


@requires_db
def test_product_category_m2n(session):
    r = Restaurant(name="R", subdomain="m2n")
    session.add(r)
    session.flush()
    cat = Category(restaurant_id=r.id, name="Tacos")
    prod = Product(restaurant_id=r.id, name="Pastor", price_cents=1200)
    prod.categories.append(cat)
    session.add_all([cat, prod])
    session.commit()

    loaded = session.get(Product, prod.id)
    assert [c.name for c in loaded.categories] == ["Tacos"]


@requires_db
def test_option_group_cascade_on_product_delete(session):
    r = Restaurant(name="R", subdomain="casc")
    session.add(r)
    session.flush()
    prod = Product(restaurant_id=r.id, name="Combo", price_cents=999)
    grp = OptionGroup(title="Size", selection="single", product=prod)
    grp.items.append(OptionItem(label="Large", price_delta_cents=300))
    session.add_all([prod, grp])
    session.commit()

    session.delete(prod)
    session.commit()
    assert session.query(OptionGroup).count() == 0
    assert session.query(OptionItem).count() == 0


@requires_db
def test_check_constraint_rejects_bad_status(session):
    r = Restaurant(name="R", subdomain="chk")
    session.add(r)
    session.flush()
    session.add(
        Product(
            restaurant_id=r.id,
            name="X",
            price_cents=100,
            approval_status="bogus",
        )
    )
    with pytest.raises(IntegrityError):
        session.commit()
    session.rollback()


@requires_db
def test_money_is_integer_cents(session):
    r = Restaurant(name="R", subdomain="money")
    session.add(r)
    session.flush()
    p = Product(restaurant_id=r.id, name="P", price_cents=1599)
    session.add(p)
    session.commit()
    assert session.get(Product, p.id).price_cents == 1599
```

- [ ] **Step 3: Run the DB tests**

Run: `pytest tests/test_models.py -v`
Expected: PASS (skipped only if Postgres unavailable).

---

## Task 11: Seed script

**Files:**
- Create: `backend/scripts/__init__.py`
- Create: `backend/scripts/seed.py`

- [ ] **Step 1: Create `backend/scripts/__init__.py`** (empty)

- [ ] **Step 2: Implement `backend/scripts/seed.py`**

```python
from datetime import UTC, datetime, time

from sqlalchemy import select

from app.db.models import (
    AIArtifact,
    Category,
    MenuTranslation,
    OptionGroup,
    OptionItem,
    Order,
    OrderItem,
    Product,
    Promotion,
    Restaurant,
    RestaurantPaymentMethod,
    RestaurantSchedule,
)
from app.db.models.promotions import promotion_products
from app.db.session import SessionLocal

DEMO_SUBDOMAIN = "demo"


def seed() -> None:
    session = SessionLocal()
    try:
        existing = session.scalar(
            select(Restaurant).where(Restaurant.subdomain == DEMO_SUBDOMAIN)
        )
        if existing is not None:
            print("Seed skipped: demo restaurant already exists")
            return

        restaurant = Restaurant(
            name="Demo Restaurant",
            subdomain=DEMO_SUBDOMAIN,
            original_language="es",
            status="published",
            address="Demo Street 123",
        )
        session.add(restaurant)
        session.flush()

        # schedules: takeout + delivery, incl. a split shift on day 0
        session.add_all(
            [
                RestaurantSchedule(
                    restaurant_id=restaurant.id,
                    service_type="takeout",
                    day_of_week=0,
                    opens_at=time(8, 0),
                    closes_at=time(14, 0),
                ),
                RestaurantSchedule(
                    restaurant_id=restaurant.id,
                    service_type="takeout",
                    day_of_week=0,
                    opens_at=time(18, 0),
                    closes_at=time(23, 0),
                ),
                RestaurantSchedule(
                    restaurant_id=restaurant.id,
                    service_type="delivery",
                    day_of_week=0,
                    opens_at=time(18, 0),
                    closes_at=time(23, 0),
                ),
            ]
        )

        # payment methods: all three for both service types
        for method in ("cash", "transfer", "card_terminal"):
            for service in ("takeout", "delivery"):
                session.add(
                    RestaurantPaymentMethod(
                        restaurant_id=restaurant.id,
                        method=method,
                        service_type=service,
                    )
                )

        tacos = Category(restaurant_id=restaurant.id, name="Tacos", sort_index=0)
        drinks = Category(restaurant_id=restaurant.id, name="Bebidas", sort_index=1)
        session.add_all([tacos, drinks])
        session.flush()

        pastor = Product(
            restaurant_id=restaurant.id,
            name="Taco al Pastor",
            description="Marinated pork taco",
            price_cents=2500,
            approval_status="approved",
            is_published=True,
        )
        pastor.categories.append(tacos)
        suadero = Product(
            restaurant_id=restaurant.id,
            name="Taco de Suadero",
            price_cents=2500,
            approval_status="approved",
            is_published=True,
        )
        suadero.categories.append(tacos)
        agua = Product(
            restaurant_id=restaurant.id,
            name="Agua de Horchata",
            price_cents=2000,
            approval_status="approved",
            is_published=True,
        )
        agua.categories.append(drinks)
        session.add_all([pastor, suadero, agua])
        session.flush()

        size = OptionGroup(
            product_id=pastor.id,
            title="Tamaño",
            required=True,
            selection="single",
            min_selections=1,
            max_selections=1,
        )
        size.items.append(OptionItem(label="Normal", price_delta_cents=0))
        size.items.append(OptionItem(label="Grande", price_delta_cents=1000))
        extras = OptionGroup(
            product_id=pastor.id,
            title="Extras",
            required=False,
            selection="multi",
            min_selections=0,
        )
        extras.items.append(OptionItem(label="Queso", price_delta_cents=1500))
        extras.items.append(OptionItem(label="Piña", price_delta_cents=0))
        session.add_all([size, extras])

        promo = Promotion(
            restaurant_id=restaurant.id,
            name="10% en Pastor",
            type="percent",
            percent=10,
            scope="product",
        )
        session.add(promo)
        session.flush()
        session.execute(
            promotion_products.insert().values(
                promotion_id=promo.id, product_id=pastor.id
            )
        )

        order = Order(
            restaurant_id=restaurant.id,
            type="delivery",
            customer_name="Juan Perez",
            customer_phone="5550001111",
            delivery_address="Calle Falsa 123",
            payment_method="cash",
            subtotal_cents=5000,
            total_cents=5000,
            status="pending",
        )
        order.items.append(
            OrderItem(
                product_id=pastor.id,
                product_name="Taco al Pastor",
                quantity=2,
                unit_price_cents=2500,
                selected_options={"Tamaño": "Normal", "Extras": ["Piña"]},
                line_total_cents=5000,
            )
        )
        session.add(order)

        session.add(
            AIArtifact(
                restaurant_id=restaurant.id,
                entity_type="product",
                entity_id=pastor.id,
                field="description",
                original_value="taco pastor",
                optimized_value="Marinated pork taco",
                status="applied",
            )
        )
        session.add(
            MenuTranslation(
                restaurant_id=restaurant.id,
                locale="en",
                entity_type="product",
                entity_id=pastor.id,
                field="name",
                translated_text="Al Pastor Taco",
                source_hash="seedhash",
            )
        )

        session.commit()
        print(f"Seed complete: restaurant {restaurant.id} ({DEMO_SUBDOMAIN})")
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


if __name__ == "__main__":
    seed()
```

- [ ] **Step 3: Run the seed (Postgres + migration applied)**

Run: `python -m scripts.seed`
Expected: prints "Seed complete: ...". Re-running prints "Seed skipped: ...".

- [ ] **Step 4: Verify seeded rows**

Run:
```bash
docker exec -e PGPASSWORD=vendelo vendelo_postgres psql -U vendelo -d vendelo -c "SELECT count(*) FROM products;"
```
Expected: `3`.

---

## Task 12: Final verification (Definition of Done)

**Files:** none (verification only)

- [ ] **Step 1: Quality gates**

Run (from `backend/`):
```bash
pytest -q
ruff check .
black --check .
mypy app
```
Expected: tests pass (DB tests pass with Postgres up), ruff/black/mypy clean.

> If mypy complains about SQLAlchemy `Mapped[dict]`, use `Mapped[dict | None]` and ensure `from __future__ import annotations` is NOT needed; the pydantic plugin doesn't affect SQLAlchemy. If needed, add `dict[str, object]` typing for JSONB columns.

- [ ] **Step 2: Migration round-trip**

Run: `alembic downgrade base && alembic upgrade head`
Expected: both succeed.

- [ ] **Step 3: Seed idempotency**

Run: `python -m scripts.seed && python -m scripts.seed`
Expected: first seeds, second prints "Seed skipped".

---

## Self-review notes (author)

- **Spec coverage:** Docker PG + settings (T1), Base/mixins/session (T2), restaurant models (T3), menu models + M:N (T4), promotions + join tables (T5), orders (T6), ai + system (T7), indexes (T8), Alembic baseline + reversible (T9), DB integration tests (T10), idempotent seed (T11), DoD verification (T12). All 17 tables and the seed requirements covered.
- **Type/name consistency:** model class names (`Restaurant`, `RestaurantSchedule`, `RestaurantPaymentMethod`, `Category`, `Product`, `OptionGroup`, `OptionItem`, `Promotion`, `Order`, `OrderItem`, `AIArtifact`, `MenuTranslation`, `IdempotencyKey`, `AuditLog`) and join tables (`product_categories`, `promotion_products`, `promotion_categories`) used consistently. `audit_metadata` attr → `metadata` column noted (SQLAlchemy reserves `metadata`).
- **Gotchas flagged:** `Boolean` (not Integer) for `enabled`; `datetime | None` typing for nullable datetimes; `gen_random_uuid()` built-in PG13+; psycopg v3 URL scheme; reserved `metadata` attribute; CHECK constraints reviewed in autogenerated migration.

---

## Commit list (run yourself; do NOT let the agent commit)

Run these from the repo root after each task (or batched at the end). Messages follow `docs/COMMIT_FORMAT.md`.

```bash
cd /Users/oliver/startup/venddelo-ai/venddelo-ai

# Task 1
git add infra/docker-compose.yml infra/.env.example backend/requirements.txt backend/app/core/config.py backend/.env.example backend/tests/test_config_db.py
git commit -m "feat: add local postgres (docker) and database settings"

# Task 2
git add backend/app/db/__init__.py backend/app/db/base.py backend/app/db/session.py backend/tests/test_db_base.py
git commit -m "feat: add sqlalchemy declarative base, mixins and session factory"

# Task 3
git add backend/app/db/models/__init__.py backend/app/db/models/restaurant.py
git commit -m "feat: add restaurant, schedule and payment-method models"

# Task 4
git add backend/app/db/models/menu.py backend/app/db/models/__init__.py
git commit -m "feat: add category, product, option-group and option-item models"

# Task 5
git add backend/app/db/models/promotions.py backend/app/db/models/__init__.py
git commit -m "feat: add promotion model with product and category join tables"

# Task 6
git add backend/app/db/models/orders.py backend/app/db/models/__init__.py
git commit -m "feat: add order and order-item models with option snapshots"

# Task 7
git add backend/app/db/models/ai.py backend/app/db/models/system.py backend/app/db/models/__init__.py
git commit -m "feat: add ai-artifact, menu-translation, idempotency and audit-log models"

# Task 8
git add backend/app/db/models
git commit -m "perf: add indexes for tenant, publish, order and translation lookups"

# Task 9
git add backend/alembic.ini backend/migrations
git commit -m "feat: configure alembic and add baseline schema migration"

# Task 10
git add backend/tests/conftest.py backend/tests/test_models.py
git commit -m "test: add postgres integration tests for the schema"

# Task 11
git add backend/scripts/__init__.py backend/scripts/seed.py
git commit -m "feat: add idempotent seed script for a demo restaurant"
```
