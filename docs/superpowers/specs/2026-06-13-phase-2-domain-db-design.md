# Phase 2 — Domain Modeling & DB Design (PostgreSQL) — Design Spec

> Status: **Approved design** (pending user spec review).
> Source planning: `docs/PROJECT_PLANNING.en.md` (Phase 2). Architecture: `docs/TECH_ARCHITECTURE.en.md`. Product context: `docs/PROJECT_CONTEXT.en.md`. Legacy model: `frontend-legacy/src/services/db/supplierCatalogTypes.ts`, `frontend-legacy/FIRESTORE_SCHEMA_SUPPLIERS_CATALOG.md`.

## Goal

Translate the legacy Firebase/Firestore catalog into a normalized PostgreSQL schema and add the new Vendelo domains (restaurant/tenant, schedules, payment methods, promotions, orders, AI artifacts, menu translations, idempotency, audit). Deliver SQLAlchemy 2.0 models, a local Postgres (Docker) for development, an Alembic baseline migration, and a seed script for a demo restaurant — all DB-agnostic-friendly (ORM lives in the infrastructure layer, not in domain logic).

## Decisions (locked)

| Topic | Decision |
|-------|----------|
| Dev database | **Local Postgres 16 via Docker** (`infra/docker-compose.yml`); Supabase wired in Phase 3 |
| Primary keys | **UUID v4** (`uuid` column, `server_default gen_random_uuid()`) |
| Enums | **VARCHAR + CHECK constraint** (evolvable; mapped to Python `Enum` in app) |
| Scope | **All tables in one baseline migration** |
| Schedules | **Multiple time ranges per day** (one row per range; closed day = no rows) |
| Promotions targeting | **Join tables** (`promotion_products`, `promotion_categories`) + relational condition columns (no JSONB targets) |
| Money | Integer **cents** + `currency varchar(3)` default `USD` |
| Soft delete | `is_active boolean default true` + `deleted_at timestamptz null` |
| Model placement | **Central persistence package `app/db/`** (one `Base.metadata`, models split by domain file) |
| DB driver | **psycopg v3** (sync), SQLAlchemy 2.0 typed `Mapped[]` |

## Out of scope (Phase 2)

- Repository ports/adapters and Supabase connection (Phase 3).
- Business services and API endpoints (Phase 4).
- Denormalized public-menu read model (future; public menu reads per-restaurant directly).
- Redis, auth, AI runtime, realtime.

## Architecture & conventions

- ORM models are **infrastructure** (adapters), never imported by domain services. They live in `app/db/`.
- One `DeclarativeBase` with reusable mixins:
  - `UUIDPrimaryKeyMixin`: `id: Mapped[UUID]` default `gen_random_uuid()`.
  - `TimestampMixin`: `created_at`, `updated_at` (`timestamptz`, server default `now()`, `updated_at` via `onupdate`).
  - `SoftDeleteMixin`: `is_active` (default `True`), `deleted_at` (nullable).
- All tenant-owned tables carry `restaurant_id` FK (`ON DELETE CASCADE` where children must not outlive parent; otherwise `RESTRICT`).
- Enum-like fields stored as `varchar` with a named `CHECK` constraint; Python-side `enum.StrEnum` mirrors allowed values.
- Money fields are integer cents; never floats.

## File structure (after Phase 2)

```
backend/
  app/
    core/config.py            # + database_url
    db/
      __init__.py
      base.py                 # DeclarativeBase + mixins
      session.py              # engine + sessionmaker (sync, pooled)
      models/
        __init__.py           # imports all models -> single metadata
        restaurant.py         # Restaurant, RestaurantSchedule, RestaurantPaymentMethod
        menu.py               # Category, Product, product_categories, OptionGroup, OptionItem
        promotions.py         # Promotion, promotion_products, promotion_categories
        orders.py             # Order, OrderItem
        ai.py                 # AIArtifact, MenuTranslation
        system.py             # IdempotencyKey, AuditLog
  alembic.ini
  migrations/
    env.py                    # target_metadata = Base.metadata; url from settings
    script.py.mako
    versions/0001_baseline.py # baseline migration (all tables)
  scripts/
    seed.py                   # demo restaurant
  tests/
    conftest.py               # test DB engine/session fixtures (Docker Postgres)
    test_models.py            # create/insert/query integration tests
infra/
  docker-compose.yml          # postgres:16
  .env.example                # POSTGRES_* for compose
```

## Enumerations

- `restaurant_status`: `draft | published | suspended`
- `service_type`: `takeout | delivery`
- `payment_method`: `cash | transfer | card_terminal`
- `approval_status`: `draft | pending_review | approved | rejected`
- `selection_type`: `single | multi`
- `promotion_type`: `percent | amount | combo | two_for_one`
- `promotion_scope`: `product | category | order`
- `order_type`: `takeout | delivery`
- `order_status`: `pending | confirmed | preparing | ready | delivered | cancelled`
- `ai_entity_type`: `product | category | restaurant`
- `ai_artifact_status`: `applied | reverted`

## Tables (17)

### 1. restaurants
- `id` uuid PK
- `name` text not null
- `address` text null; `latitude` double precision null; `longitude` double precision null; `place_id` text null
- `logo_path` text null
- `subdomain` varchar(63) not null — **unique** (lowercase enforced in app)
- `color_palette` varchar(50) null
- `original_language` varchar(10) not null default `'es'`
- `status` varchar not null default `'draft'` CHECK in restaurant_status
- `is_active`, `deleted_at`, `created_at`, `updated_at`
- Index: unique(`subdomain`)

### 2. restaurant_schedules
- `id` uuid PK
- `restaurant_id` uuid FK→restaurants ON DELETE CASCADE
- `service_type` varchar CHECK in service_type
- `day_of_week` smallint CHECK between 0 and 6
- `opens_at` time not null; `closes_at` time not null
- `created_at`, `updated_at`
- Index: (`restaurant_id`, `service_type`, `day_of_week`)

### 3. restaurant_payment_methods
- `id` uuid PK
- `restaurant_id` uuid FK→restaurants ON DELETE CASCADE
- `method` varchar CHECK in payment_method
- `service_type` varchar CHECK in service_type
- `enabled` boolean not null default true
- `created_at`, `updated_at`
- Unique: (`restaurant_id`, `method`, `service_type`)

### 4. categories
- `id` uuid PK
- `restaurant_id` uuid FK→restaurants ON DELETE CASCADE
- `name` text not null; `description` text null; `image_path` text null
- `sort_index` integer not null default 0
- `is_active`, `deleted_at`, `created_at`, `updated_at`
- Index: (`restaurant_id`, `is_active`, `sort_index`)

### 5. products
- `id` uuid PK
- `restaurant_id` uuid FK→restaurants ON DELETE CASCADE
- `name` text not null; `description` text null (optimized text shown; original kept in ai_artifacts)
- `price_cents` integer not null; `currency` varchar(3) not null default `'USD'`
- `image_path` text null
- `approval_status` varchar not null default `'draft'` CHECK in approval_status
- `is_published` boolean not null default false
- `is_active`, `deleted_at`, `created_at`, `updated_at`
- Indexes: (`restaurant_id`, `is_active`, `is_published`), (`restaurant_id`, `approval_status`)

### 6. product_categories (M:N)
- `product_id` uuid FK→products ON DELETE CASCADE
- `category_id` uuid FK→categories ON DELETE CASCADE
- PK (`product_id`, `category_id`)
- Index: (`category_id`)
- Business rule (Phase 4 service): each product must belong to ≥1 category.

### 7. option_groups
- `id` uuid PK
- `product_id` uuid FK→products ON DELETE CASCADE
- `title` text not null
- `required` boolean not null default false
- `selection` varchar CHECK in selection_type
- `min_selections` integer not null default 0
- `max_selections` integer null
- `sort_index` integer not null default 0
- `is_active`, `created_at`, `updated_at`
- Index: (`product_id`)

### 8. option_items
- `id` uuid PK
- `option_group_id` uuid FK→option_groups ON DELETE CASCADE
- `label` text not null
- `price_delta_cents` integer not null default 0
- `sort_index` integer not null default 0
- `is_active`, `created_at`, `updated_at`
- Index: (`option_group_id`)

### 9. promotions
- `id` uuid PK
- `restaurant_id` uuid FK→restaurants ON DELETE CASCADE
- `name` text not null
- `type` varchar CHECK in promotion_type
- `percent` integer null (0..100, used when type=percent)
- `amount_cents` integer null (used when type=amount)
- `scope` varchar CHECK in promotion_scope
- `min_order_cents` integer null (optional condition)
- `starts_at` timestamptz null; `ends_at` timestamptz null
- `is_active`, `deleted_at`, `created_at`, `updated_at`
- Index: (`restaurant_id`, `is_active`)

### 10. promotion_products (join)
- `promotion_id` uuid FK→promotions ON DELETE CASCADE
- `product_id` uuid FK→products ON DELETE CASCADE
- PK (`promotion_id`, `product_id`)

### 11. promotion_categories (join)
- `promotion_id` uuid FK→promotions ON DELETE CASCADE
- `category_id` uuid FK→categories ON DELETE CASCADE
- PK (`promotion_id`, `category_id`)

### 12. orders
- `id` uuid PK
- `restaurant_id` uuid FK→restaurants ON DELETE RESTRICT
- `type` varchar CHECK in order_type
- `customer_name` text not null; `customer_phone` text not null
- `delivery_address` text null (required at app level when type=delivery)
- `payment_method` varchar CHECK in payment_method
- `subtotal_cents` integer not null; `total_cents` integer not null
- `status` varchar not null default `'pending'` CHECK in order_status
- `idempotency_key` varchar(255) null
- `note` text null
- `created_at`, `updated_at`
- Indexes: (`restaurant_id`, `status`, `created_at`)

### 13. order_items
- `id` uuid PK
- `order_id` uuid FK→orders ON DELETE CASCADE
- `product_id` uuid FK→products ON DELETE SET NULL (nullable snapshot ref)
- `product_name` text not null (snapshot)
- `quantity` integer not null
- `unit_price_cents` integer not null
- `selected_options` jsonb null (snapshot of chosen option groups/items)
- `line_total_cents` integer not null
- Index: (`order_id`)

### 14. ai_artifacts
- `id` uuid PK
- `restaurant_id` uuid FK→restaurants ON DELETE CASCADE
- `entity_type` varchar CHECK in ai_entity_type
- `entity_id` uuid not null
- `field` varchar(50) not null (e.g. `name`, `description`, `image`)
- `original_value` text null
- `optimized_value` text null
- `status` varchar not null default `'applied'` CHECK in ai_artifact_status
- `created_at`, `updated_at`
- Index: (`restaurant_id`, `entity_type`, `entity_id`)

### 15. menu_translations
- `id` uuid PK
- `restaurant_id` uuid FK→restaurants ON DELETE CASCADE
- `locale` varchar(10) not null
- `entity_type` varchar not null (reuses ai_entity_type values)
- `entity_id` uuid not null
- `field` varchar(50) not null
- `translated_text` text not null
- `source_hash` varchar(64) not null (invalidate cache when source changes)
- `created_at`, `updated_at`
- Unique: (`restaurant_id`, `locale`, `entity_type`, `entity_id`, `field`)
- Index: (`restaurant_id`, `locale`, `entity_type`, `entity_id`)

### 16. idempotency_keys
- `key` varchar(255) PK
- `request_hash` varchar(64) not null
- `response_snapshot` jsonb null
- `created_at` timestamptz default now(); `expires_at` timestamptz not null
- Index: (`expires_at`)

### 17. audit_logs
- `id` uuid PK
- `actor` varchar(255) null
- `action` varchar(50) not null
- `target_table` varchar(63) null
- `target_id` uuid null
- `metadata` jsonb null
- `occurred_at` timestamptz not null default now()
- Indexes: (`occurred_at`), (`action`)

## Local Postgres (Docker)

`infra/docker-compose.yml` defines a `postgres:16` service: env `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, port `5432:5432`, named volume. A `vendelo_test` database is used for integration tests (created via fixture or a second compose env).

`Settings.database_url` (e.g. `postgresql+psycopg://vendelo:vendelo@localhost:5432/vendelo`) is read from env; added to `.env.example`. `gen_random_uuid()` is available in Postgres 13+ (built-in); no extension required.

## Alembic

- `alembic.ini` + `migrations/env.py` import `app.db.models` so `Base.metadata` is complete; URL comes from `Settings.database_url`.
- Baseline migration `0001_baseline` created via `alembic revision --autogenerate`, then reviewed (CHECK constraints and named constraints verified) and committed.
- `alembic upgrade head` must succeed against the Docker Postgres.

## Seed script

`backend/scripts/seed.py` (run `python -m scripts.seed`) creates one demo restaurant exercising every table:
- 1 restaurant (`subdomain="demo"`, `original_language="es"`, status `published`)
- schedules: takeout + delivery for a few days incl. one split-shift day
- payment methods: all three for both service types
- 2 categories; 3 products mapped to categories (≥1 each)
- 1 product with 2 option groups (one required single, one optional multi) and items
- 1 promotion (percent, scope=product) linked via `promotion_products`
- 1 order with 2 order_items (with `selected_options` snapshot)
- 1 ai_artifact (description original vs optimized) and 1 menu_translation (en)
- script is idempotent (safe to re-run; upsert/skip by subdomain)

## Testing strategy (TDD)

Integration tests run against the Docker Postgres test database:
- `conftest.py`: session-scoped engine from `DATABASE_URL_TEST`; create all tables via Alembic `upgrade head` (or `Base.metadata.create_all`), drop/rollback per test.
- `test_models.py`:
  - insert a restaurant; unique subdomain violation raises.
  - product↔categories M:N relationship persists and reads back.
  - option_group/items cascade on product delete.
  - CHECK constraint rejects invalid `approval_status`.
  - money stored as integer cents round-trips.
  - menu_translations unique constraint enforced.

> Tests require the Docker Postgres running. If unavailable, they are skipped with a clear message (so the suite stays runnable without DB for non-DB tests).

## Quality gates (Definition of Done)

- [ ] `docker compose up -d` brings Postgres healthy
- [ ] `alembic upgrade head` creates all 17 tables
- [ ] `alembic downgrade base` cleanly drops them (reversible)
- [ ] `python -m scripts.seed` populates the demo restaurant (idempotent)
- [ ] `pytest` green (DB integration tests pass with Docker PG)
- [ ] `ruff`, `black`, `mypy` clean
- [ ] ER notes/diagram included in spec/plan

## Risks / notes

- Keep `app/db/` out of domain services (DB-agnostic boundary).
- Named constraints (`ck_`, `uq_`, `fk_`, `ix_`) so Alembic autogenerate/downgrade is deterministic — set a SQLAlchemy naming convention on the metadata.
- psycopg v3 URL scheme is `postgresql+psycopg://`.
- `updated_at onupdate` uses DB `now()`; ensure server defaults set in migration, not only Python-side.

## Open questions (deferred, not blocking Phase 2)

- Supabase pooler/PgBouncer specifics (Phase 3).
- Whether promotions need stacking rules / priority (future).
- Whether to add `marketplace`-style denormalized read model (revisit if public-menu reads need it).
