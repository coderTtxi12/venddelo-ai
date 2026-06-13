# Phase 3 — Persistence Layer (Repositories) & Supabase Connection — Design

> Status: approved (design). Implements Phase 3 of `docs/PROJECT_PLANNING.en.md`.
> Builds on Phase 2 (SQLAlchemy models + Alembic baseline in `app/db/`).

## 1. Goal

Provide DB-agnostic data access for every aggregate via **repository ports** (abstract
interfaces) with **SQLAlchemy adapters** behind them, a **Unit of Work** for
session/transaction boundaries, a real **Supabase PostgreSQL** connection (transaction
pooler, Cloud Run-ready), and a **Storage** abstraction with a working **Supabase Storage**
adapter. Domain/service code (Phase 4) depends only on ports + Pydantic DTOs, never on
SQLAlchemy or Supabase.

## 2. Key decisions

- **Repositories return Pydantic DTOs, not ORM models.** Adapters map ORM ↔ DTO. This keeps
  the Dependency Inversion Principle intact: services never import SQLAlchemy. (Approved:
  Decision A.)
- **Unit of Work** wraps a single `Session`, exposes the repositories, and owns
  `commit()`/`rollback()`. One UoW (= one session) per request via a FastAPI dependency.
  (Approved: Decision B.)
- **All 7 aggregates** get ports + full SQLAlchemy adapters: Restaurant, Menu, Order,
  Promotion, Translation, AIArtifact, Idempotency. (Approved: scope = all.)
- **Storage**: `StoragePort` + a functional **Supabase Storage** adapter using the official
  `supabase` Python client. (Approved: storage = port + Supabase.)
- **URL normalization**: settings rewrite a `postgresql://...` URL to `postgresql+psycopg://...`
  so we always use psycopg v3 (psycopg2 is not installed).
- **Pooler handling**: when the host is the Supabase transaction pooler (detected by
  `pooler.supabase.com` or port `6543`), use `NullPool` and psycopg `prepare_threshold=None`
  (transaction-mode PgBouncer cannot reuse server-side prepared statements). Local dev
  (Docker, 5434) uses a normal `QueuePool` with `pool_pre_ping`.
- **Cursor pagination** reuses the existing `app/core/pagination.py` contract from Phase 1.
- **Soft delete**: list/get methods exclude soft-deleted rows by default
  (`is_active = true`), with an explicit `include_inactive` flag where useful.

## 3. Module structure

```
backend/app/
  core/
    storage.py                 # StoragePort (ABC) + StoredObject DTO + StorageError
    idempotency.py             # (exists) keep Protocol; add IdempotencyRecord DTO + port note
    pagination.py              # (exists) reused
  db/
    session.py                 # (modify) URL normalization + pooler-aware engine
    uow.py                     # UnitOfWork (ABC) + SqlAlchemyUnitOfWork + get_uow() dependency
  modules/
    restaurants/
      __init__.py
      schemas.py               # RestaurantDTO, RestaurantCreate, RestaurantUpdate, ScheduleDTO, PaymentMethodDTO
      repository.py            # RestaurantRepository (ABC port)
      adapters.py              # SqlAlchemyRestaurantRepository
    menu/
      __init__.py
      schemas.py               # CategoryDTO/Create/Update, ProductDTO/Create/Update, OptionGroupDTO, OptionItemDTO, FullMenuDTO
      repository.py            # MenuRepository (ABC port)
      adapters.py              # SqlAlchemyMenuRepository
    orders/
      __init__.py
      schemas.py               # OrderDTO/Create, OrderItemDTO/Create, OrderStatus
      repository.py            # OrderRepository (ABC port)
      adapters.py              # SqlAlchemyOrderRepository
    promotions/
      __init__.py
      schemas.py               # PromotionDTO/Create/Update
      repository.py            # PromotionRepository (ABC port)
      adapters.py              # SqlAlchemyPromotionRepository
    translations/
      __init__.py
      schemas.py               # TranslationDTO/Upsert
      repository.py            # TranslationRepository (ABC port)
      adapters.py              # SqlAlchemyTranslationRepository
    ai/
      __init__.py
      schemas.py               # AIArtifactDTO/Create
      repository.py            # AIArtifactRepository (ABC port)
      adapters.py              # SqlAlchemyAIArtifactRepository
  infra/
    __init__.py
    storage/
      __init__.py
      supabase_storage.py      # SupabaseStorageAdapter(StoragePort)
    repositories/
      __init__.py
      idempotency.py           # SqlAlchemyIdempotencyRepository (idempotency_keys table)
  scripts/
    verify_supabase.py         # manual connectivity check (DB + Storage round-trip)
```

> Rationale: per-module ports/adapters keep modular-monolith boundaries (microservices-ready,
> per the planning's hexagonal layering). Cross-cutting infra (Supabase Storage, idempotency
> table adapter) lives under `app/infra/`.

## 4. DTOs (contract shape)

DTOs are Pydantic v2 models (`model_config = ConfigDict(from_attributes=True)` so adapters can
`model_validate(orm_obj)`). Money stays in integer cents. IDs are `uuid.UUID`. Timestamps are
`datetime` (tz-aware). Representative DTOs:

- `RestaurantDTO`: id, name, address?, latitude?, longitude?, place_id?, logo_path?, subdomain,
  color_palette?, original_language, status, is_active, created_at, updated_at.
  - `RestaurantCreate`: name, subdomain, original_language?, address?, lat?, lng?, place_id?,
    logo_path?, color_palette?, status?
  - `RestaurantUpdate`: all optional (partial update).
  - `ScheduleDTO`/`ScheduleCreate`, `PaymentMethodDTO`/`PaymentMethodCreate`.
- `CategoryDTO`/`Create`/`Update`; `ProductDTO` (includes `category_ids: list[UUID]`)/`Create`/
  `Update`; `OptionGroupDTO` (with `items: list[OptionItemDTO]`)/`Create`; `OptionItemDTO`/`Create`.
  - `FullMenuDTO`: restaurant + categories + published products (+ option groups) for the public menu.
- `OrderDTO` (with `items: list[OrderItemDTO]`)/`OrderCreate` (with `items: list[OrderItemCreate]`).
- `PromotionDTO`/`Create`/`Update` (+ `product_ids: list[UUID]`, `category_ids: list[UUID]`).
- `TranslationDTO`/`TranslationUpsert`.
- `AIArtifactDTO`/`AIArtifactCreate`.
- `IdempotencyRecord` (in `core/idempotency.py`): key, request_hash, response_snapshot?, created_at, expires_at.

## 5. Repository ports (method contracts)

All ports are `abc.ABC` with `@abstractmethod`s. Pagination uses
`PaginationParams`/`CursorPage[T]` from `app/core/pagination.py`.

**RestaurantRepository**
- `add(data: RestaurantCreate) -> RestaurantDTO`
- `get(id: UUID) -> RestaurantDTO | None`
- `get_by_subdomain(subdomain: str) -> RestaurantDTO | None`
- `list(params: PaginationParams) -> CursorPage[RestaurantDTO]`
- `update(id: UUID, data: RestaurantUpdate) -> RestaurantDTO | None`
- `soft_delete(id: UUID) -> bool`
- `set_schedules(id: UUID, schedules: list[ScheduleCreate]) -> None`
- `set_payment_methods(id: UUID, methods: list[PaymentMethodCreate]) -> None`

**MenuRepository**
- Categories: `add_category`, `get_category`, `list_categories(restaurant_id, params)`,
  `update_category`, `soft_delete_category`.
- Products: `add_product` (sets M:N category_ids), `get_product`,
  `list_products(restaurant_id, params, *, published_only=False)`, `update_product`
  (incl. replacing category_ids), `soft_delete_product`.
- Options: `add_option_group(product_id, data)` (with items), `update_option_group`,
  `delete_option_group`, `add_option_item`, `delete_option_item`.
- `get_full_menu(restaurant_id: UUID) -> FullMenuDTO` (published + active only).

**OrderRepository**
- `add(data: OrderCreate) -> OrderDTO` (creates order + items in one transaction)
- `get(id: UUID) -> OrderDTO | None`
- `list_by_restaurant(restaurant_id, params, *, status: str | None = None) -> CursorPage[OrderDTO]`
- `update_status(id: UUID, status: str) -> OrderDTO | None`
- `get_by_idempotency_key(restaurant_id: UUID, key: str) -> OrderDTO | None`

**PromotionRepository**
- `add`, `get`, `list_active(restaurant_id, params)`, `update`, `soft_delete`,
  `set_products(promotion_id, product_ids)`, `set_categories(promotion_id, category_ids)`.

**TranslationRepository**
- `get(restaurant_id, locale, entity_type, entity_id, field) -> TranslationDTO | None`
- `upsert(data: TranslationUpsert) -> TranslationDTO` (on conflict of the unique tuple)
- `list_for_menu(restaurant_id, locale) -> list[TranslationDTO]`
- `delete_stale(restaurant_id, entity_type, entity_id, field, current_source_hash) -> int`

**AIArtifactRepository**
- `add(data: AIArtifactCreate) -> AIArtifactDTO`
- `list_for_entity(restaurant_id, entity_type, entity_id) -> list[AIArtifactDTO]`
- `get_latest(restaurant_id, entity_type, entity_id, field) -> AIArtifactDTO | None`
- `mark_reverted(id: UUID) -> AIArtifactDTO | None`

**IdempotencyRepository** (`app/infra/repositories/idempotency.py`)
- `get(key: str) -> IdempotencyRecord | None`
- `put(key: str, request_hash: str, response: dict | None, ttl_seconds: int) -> IdempotencyRecord`
- `purge_expired(now: datetime | None = None) -> int`

## 6. Unit of Work

```
class UnitOfWork(ABC):
    restaurants: RestaurantRepository
    menu: MenuRepository
    orders: OrderRepository
    promotions: PromotionRepository
    translations: TranslationRepository
    ai_artifacts: AIArtifactRepository
    idempotency: IdempotencyRepository
    def __enter__/__exit__   # rollback on exception, close always
    def commit() -> None
    def rollback() -> None
```

- `SqlAlchemyUnitOfWork(session_factory)`: on `__enter__` opens a session and constructs all
  adapters with it; `__exit__` rolls back if not committed and closes.
- `get_uow()` FastAPI dependency yields a UoW per request and commits on success.
- Adapters do **not** commit; the UoW owns the transaction boundary. (Adapters may `flush()` to
  obtain server-generated values like ids/timestamps.)

## 7. Connection & pooling (`db/session.py`)

- `normalize_db_url(url)`: `postgresql://` → `postgresql+psycopg://` (idempotent if already set).
- `is_pooled(url)`: true if host contains `pooler.supabase.com` or port is `6543`.
- Engine:
  - pooled → `poolclass=NullPool`, `connect_args={"prepare_threshold": None}`.
  - local → `pool_pre_ping=True, pool_size=5, max_overflow=10`.
- `SessionLocal` bound to the engine; `engine`/`SessionLocal` consumed by the UoW.
- Alembic `env.py` already reads `get_settings().database_url`; the normalization makes it work
  against Supabase too. The Phase 2 migration will be applied to Supabase during verification.

## 8. Storage (`core/storage.py` + `infra/storage/supabase_storage.py`)

- `StoragePort(ABC)`:
  - `upload(path: str, data: bytes, content_type: str, *, upsert: bool = True) -> StoredObject`
  - `delete(path: str) -> None`
  - `get_public_url(path: str) -> str`
  - `create_signed_url(path: str, expires_in: int) -> str`
- `StoredObject` DTO: `path`, `public_url`.
- `StorageError(Exception)` wraps provider errors (uniform failure type).
- `SupabaseStorageAdapter`: built from `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `SUPABASE_STORAGE_BUCKET` (default bucket `assets`). Uses `create_client(...).storage`.
- New settings fields: `supabase_url: str | None`, `supabase_service_role_key: str | None`,
  `supabase_storage_bucket: str = "assets"`.
- New dependency: `supabase` (Python client). Pin a current version in `requirements.txt`.

## 9. Testing strategy

- **Unit/integration repo tests** against the **local Docker Postgres** (`DATABASE_URL_TEST`,
  5434). Reuse the Phase 2 `conftest.py` `engine`/`session` fixtures; add a `uow` fixture.
  Cover per repo: create+get round-trip (ORM→DTO mapping), update, soft delete excluded from
  list, cursor pagination (next_cursor), M:N category assignment, order+items transaction,
  promotion join tables, translation upsert/unique-conflict, ai artifact latest/revert,
  idempotency get/put/expiry.
- **UoW tests**: commit persists; exception in `with` block rolls back; repos share one session.
- **Pooler/url tests**: `normalize_db_url` and `is_pooled` are pure functions → unit tests
  (no DB needed).
- **Supabase verification (manual, skipped in CI)**: `scripts/verify_supabase.py` connects to
  the Supabase DB (SELECT 1 + list tables) and does a Storage upload→public_url→delete round-trip.
  A pytest `test_supabase_smoke.py` marked skip-if-no-creds wraps the same checks.
- Quality gates unchanged: `pytest`, `ruff`, `black`, `mypy --strict` all green;
  `migrations/` stays lint-excluded.

## 10. Supabase provisioning done during implementation

- Apply the Phase 2 Alembic migration to Supabase: `alembic upgrade head` with
  `DATABASE_URL` = Supabase pooler (creates all 17 tables there).
- Ensure the Storage bucket `assets` exists (create via the adapter/verify script if missing).
- Run `scripts/verify_supabase.py` and the smoke test to confirm DB + Storage connectivity.

## 11. Out of scope (later phases)

- Services/use-cases and HTTP endpoints that consume these repos → **Phase 4**.
- Auth, rate limiting, Redis cache/idempotency hot path → **Phase 4/5** (DB idempotency table
  adapter is included here; the Redis layer is Phase 5).
- AI provider calls that *write* artifacts/translations → **Phase 6** (repos are ready now).
- Read-model denormalization / materialized views → later.

## 12. Definition of Done

- All 7 ports + SQLAlchemy adapters implemented, returning DTOs.
- UnitOfWork + `get_uow()` dependency.
- Pooler-aware, psycopg-v3 engine; URL normalization unit-tested.
- StoragePort + working Supabase Storage adapter.
- Integration tests green against local Docker Postgres; Supabase DB migrated; Supabase smoke
  (DB + Storage round-trip) verified manually.
- `pytest` / `ruff` / `black` / `mypy --strict` all green.
- Commit list provided for the user to run (no commits executed by the agent).
```
