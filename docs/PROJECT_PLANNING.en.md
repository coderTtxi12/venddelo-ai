# Project Planning — Vendelo AI (Start to Deployment)

> End-to-end execution plan to build Vendelo AI from zero to production. It operationalizes `PROJECT_CONTEXT.en.md` (what/why) and `TECH_ARCHITECTURE.en.md` (how) into **phases, milestones, tasks, and deliverables**.
>
> Golden rules for every task: follow **SOLID**, follow the **`superpowers`** skill, keep the **modular monolith** boundaries, every schema change via **Alembic**, and keep the design **DB-agnostic** so the database can be swapped in the future.

## 0. Guiding principles (apply to all phases)

- **DB-agnostic via SOLID (Dependency Inversion).** Domain/services never import SQLAlchemy or Supabase directly. They depend on **repository interfaces** (ports). Concrete adapters (PostgreSQL/Supabase) implement them. Swapping DB = writing a new adapter, not touching domain logic.
- **Hexagonal-ish layering** per module: `api` (thin) → `service` (domain logic) → `repository (port)` → `adapter (impl)`. Cross-module calls go through service interfaces, never cross-table reads.
- **Contracts first.** Pydantic DTOs are the stable contract between layers and the API surface.
- **Everything reversible & auditable** (AI edits keep original vs optimized; soft deletes everywhere).
- **Definition of Done** for a task: code + types + tests + migration (if schema) + structured logging + docs note + passes lint/CI.

---

## Phase 1 — Foundations & repo setup

**Goal:** monorepo skeleton, tooling, and conventions ready.

Tasks:
1. Define monorepo layout:
   ```
   /backend        (FastAPI, Python)
   /frontend       (Next.js — NEW product, see Phase 7)
   /frontend-legacy (the cloned Vite/Firebase dashboard, kept as reference)
   /docs
   /infra          (docker, cloud run, ci)
   ```
2. Backend project bootstrap: Python, FastAPI, Pydantic v2, SQLAlchemy 2.x, Alembic, `pydantic-settings`.
3. Tooling: `ruff` + `black` + `mypy`, `pytest`, pre-commit hooks.
4. Config via env (`pydantic-settings`): no secrets in code; `.env.example` committed.
5. Structured logging setup (JSON, request-id correlation middleware).
6. Base error model + global exception handlers (uniform error shape).
7. Decide & document pagination standard (cursor-based recommended) and idempotency contract.

**Deliverables:** running `GET /api/v1/health`, lint/type/test pipeline green locally, logging emitting JSON.

---

## Phase 2 — Domain modeling & DB design (PostgreSQL)

**Goal:** translate the current Firebase/Firestore catalog into a normalized PostgreSQL schema, plus the new domains (onboarding, orders, translations, AI artifacts).

### 2.1 Pattern detection from the legacy frontend

Source of truth for the existing product model: `frontend-legacy/src/services/db/supplierCatalogTypes.ts` and `FIRESTORE_SCHEMA_SUPPLIERS_CATALOG.md`. Detected entities/patterns to port:

- **Category**: `name`, `description`, `image`, `isActive`, timestamps.
- **Product**: `name`, `description`, `price (MoneyUSD)`, `discountUsd`, `image`, `categoryIds[]` (many-to-many), `optionGroups[]`, `approvalStatus`, `isPublished`, `isActive`, timestamps.
- **OptionGroup**: `title`, `required`, `selection: single|multi`, `items[]`, `isActive`.
- **OptionItem**: `label`, `priceDeltaUsd`, `isActive`.
- Cross-cutting: **soft delete** (`isActive`/`deletedAt`), **money in cents**, **server timestamps**, **approval/publish workflow**.

> What's **missing vs target product** and must be added: **promotions/discount campaigns**, **restaurant (tenant) entity with subdomain + schedule + payment methods + original language**, **orders**, **AI artifacts (undo)**, **menu translations**.

### 2.2 Target relational schema (high level)

Normalize Firestore's embedded arrays into relational tables (keep the option to denormalize a read model later):

- `restaurants` (tenant): id, name, address, lat, lng, place_id, logo_path, subdomain (unique), color_palette, original_language, status, timestamps, soft-delete.
- `restaurant_schedules`: restaurant_id, service_type (`takeout`|`delivery`), day_of_week, open_time, close_time, `same_as_takeout` flag handling.
- `restaurant_payment_methods`: restaurant_id, method (`cash`|`transfer`|`card_terminal`), service_type (`takeout`|`delivery`), enabled.
- `categories`: id, restaurant_id (FK), name, description, image_path, sort_index, is_active, timestamps.
- `products`: id, restaurant_id (FK), name, description, price_cents, currency, image_path, approval_status, is_published, is_active, timestamps.
- `product_categories`: product_id, category_id (M:N join, enforce ≥1 in service layer).
- `option_groups`: id, product_id (FK), title, required, selection, min/max, sort_index, is_active.
- `option_items`: id, option_group_id (FK), label, price_delta_cents, sort_index, is_active.
- `promotions` (**new**): id, restaurant_id, type (`percent`|`amount`|`combo`|`2x1`...), value, scope (product/category/order), starts_at, ends_at, conditions (JSONB), is_active.
- `orders`: id, restaurant_id, type (`takeout`|`delivery`), customer fields, delivery_address, payment_method, subtotal_cents, total_cents, status, idempotency_key, created_at.
- `order_items`: order_id, product_id snapshot, name snapshot, qty, unit_price_cents, selected options (JSONB snapshot).
- `ai_artifacts`: entity_type, entity_id, field, original_value, optimized_value, status (`applied`|`reverted`), created_at — powers **undo**.
- `menu_translations`: restaurant_id, locale, entity_type, entity_id, field, translated_text, source_hash (for cache invalidation), created_at.
- `idempotency_keys`: key, request_hash, response_snapshot, created_at, expires_at.
- `audit_logs`: actor, action, target, metadata (JSONB), occurred_at (port the existing audit concept).

### 2.3 Indexing & performance plan

- Unique index on `restaurants.subdomain`.
- Composite indexes: `products(restaurant_id, is_active, is_published)`, `products(restaurant_id, approval_status)`, `orders(restaurant_id, status, created_at)`, `menu_translations(restaurant_id, locale, entity_type, entity_id)`.
- JSONB GIN indexes where we query inside `conditions`/snapshots.
- Money always in **integer cents**; timestamps `timestamptz` with DB defaults.

**Deliverables:** ER diagram, first Alembic migration, seed script for a demo restaurant.

---

## Phase 3 — Persistence layer (repositories) & Supabase connection

**Goal:** DB-agnostic data access with SOLID.

Tasks:
1. Define **repository ports** (abstract interfaces) per aggregate: `RestaurantRepository`, `MenuRepository`, `OrderRepository`, `PromotionRepository`, `TranslationRepository`, `AIArtifactRepository`, `IdempotencyRepository`.
2. Implement **SQLAlchemy adapters** behind those ports. Domain/service code imports only the port.
3. Connect to **Supabase PostgreSQL**: connection string via settings, **connection pooling** (SQLAlchemy pool + Supabase pooler/PgBouncer in transaction mode for Cloud Run).
4. Unit-of-work / session management (per-request session, commit/rollback boundaries).
5. Map soft-delete and timestamp conventions centrally (base model mixins).
6. Migrate to Supabase Storage abstraction: `StoragePort` with a Supabase adapter (logos, menu uploads, optimized images).

**SOLID note:** because services depend on ports, switching from Supabase Postgres to another Postgres/another DB later = new adapter only.

**Deliverables:** repositories with integration tests against a disposable Postgres (docker), Supabase connection verified.

---

## Phase 4 — Core domain services & API v1 (catalog/menu)

**Goal:** the CRUD heart, ported from the legacy logic but server-side and normalized.

Tasks:
1. **Restaurants/tenancy** service + endpoints (create, get, update, subdomain assignment).
2. **Categories** service + endpoints (CRUD, soft delete, ordering).
3. **Products** service + endpoints (CRUD, M:N categories with ≥1 rule, approval/publish workflow).
4. **Option groups/items** service (single vs multi, min/max validation).
5. **Promotions** service (new) — the missing piece vs legacy.
6. Cross-cutting middleware: **auth (Supabase/Google token verification)**, **rate limiting (Redis)**, **idempotency (Redis + table)**, **pagination**, **structured logging**.
7. API versioning wired (`/api/v1`), OpenAPI docs.

**Deliverables:** full catalog CRUD over `/api/v1`, authz enforced per tenant, tests.

---

## Phase 5 — Redis (hot storage) & cross-cutting concerns

**Goal:** speed and safety.

Tasks:
1. Redis adapter behind a `CachePort` (DIP again).
2. Cache **published public menus** per `subdomain` + `locale` (read-heavy path).
3. Idempotency key store with TTL; rate-limit counters.
4. Cache invalidation on menu/product/promotion writes.
5. Define TTL strategy per data type (document it).

**Deliverables:** public menu read served from cache with measured latency win; idempotency & rate-limit live.

---

## Phase 6 — AI services (extraction, optimization, translation)

**Goal:** the AI pipeline, each capability behind an interface (swappable provider).

Tasks:
1. `AIGatewayPort` abstraction with provider adapter(s). No provider lock-in in domain code.
2. **Menu extraction (OCR/document understanding):** upload (photo/PDF/image) → structured draft (categories, products, prices, options, promos, images).
3. **Image optimization:** enhance dish photos **without altering the real dish**; store original + optimized in Storage; record in `ai_artifacts`.
4. **Description copywriting:** generate optimized descriptions; keep original for **undo**.
5. **Color-palette selection:** pick from available palettes based on logo/brand.
6. **Translation service (multi-language):** on public-menu request, if device locale ≠ `original_language`, translate and persist in `menu_translations` + cache in Redis; fallback policy when locale unsupported.
7. Orchestration: async jobs (extraction/optimization can be long-running) with status the dashboard can poll/subscribe to.

**Deliverables:** upload a real menu → auto-generated draft menu; translation on locale mismatch; all AI changes reversible.

---

## Phase 7 — Frontend (Next.js NEW product)

> The legacy frontend (cloned Vite + Firebase) already contains the **product logic a restaurant needs** (name, description, options/add-ons, categories, approval/publish) — only **promotions** is missing. We **reuse its logic/UX patterns** but rebuild on **Next.js + TypeScript** talking to **our FastAPI**, not Firebase.

Tasks:
1. Next.js app scaffold (App Router), responsive design system, shared API client (typed, talks to `/api/v1`).
2. **Auth**: Supabase Auth (Google) on the client; attach token to API calls.
3. **Onboarding (Typeform-style):** name, location (Google Places), schedule (takeout/delivery, same-by-default + "set different"), payment methods (all checked by default), upload logo, upload menu.
4. **AI processing screen:** show extraction/optimization progress; present generated menu.
5. **Dashboard:** menu editor (CRUD products/categories/options/**promotions**), **undo AI** per field/image, real-time orders, statistics, earnings.
6. **Publish flow:** assign subdomain, generate link + QR.
7. **Public menu (subdomain):** responsive ordering UI, **device-language detection + AI translation**, cart, delivery details, payment method, **WhatsApp order submission** with formatted order detail.
8. Port reusable logic from legacy (option groups single/multi, approval/publish) into Next.js components/services.

**Deliverables:** end-to-end usable product in staging.

---

## Phase 8 — Realtime, statistics & WhatsApp ordering

Tasks:
1. Real-time orders to dashboard (decide: Supabase Realtime vs WebSockets/SSE — TBD in architecture doc).
2. Statistics/earnings aggregation endpoints (read models / materialized views; cache hot metrics).
3. WhatsApp order formatting + handoff (deep link / API) with the standardized order-detail format.

**Deliverables:** live orders visible, metrics shown, WhatsApp checkout working.

---

## Phase 9 — Hardening, testing & observability

Tasks:
1. Test pyramid: unit (services), integration (repos/adapters), API contract tests, key e2e flows.
2. Security pass: authz per tenant, rate-limit tuning, input validation, secret hygiene; run the **`superpowers`** + security review.
3. Load test the public-menu read path and order-create path; verify pooling/indexes.
4. Observability: structured logs, request tracing, error tracking, basic dashboards/alerts.

**Deliverables:** green CI, passing security/perf checks.

---

## Phase 10 — Dockerization & deployment (Google Cloud Run)

Tasks:
1. Dockerfiles for backend and frontend (multi-stage, slim images, non-root).
2. `docker-compose` for local dev (api + postgres + redis).
3. **CI/CD** (GitHub Actions): lint → type → test → build → push → deploy to **Cloud Run**; run **Alembic migrations** as a release step.
4. Environments: dev / staging / prod; secrets via Secret Manager; settings via env.
5. Subdomain strategy: wildcard DNS + TLS for `*.vendelo.app` routing to the public menu app.
6. Managed Redis provisioning; Supabase prod project; backups.
7. Post-deploy smoke tests + rollback plan.

**Deliverables:** production on Cloud Run, automated deploys, migrations in pipeline.

---

## Phase 11 — Post-MVP / future-proofing

- **DB swap readiness:** because all access is behind repository ports, validate by writing a throwaway alternate adapter in tests.
- **Microservices extraction path:** first candidates to split — `ai` (heavy/async) and `orders` (independent scaling). Boundaries already enforced via service interfaces.
- Online payments, multi-branch, more languages, analytics depth, plan/billing tiers.

---

## Cross-phase checklists

**Per task Definition of Done**
- [ ] Follows SOLID; no domain dependency on concrete DB/provider
- [ ] `superpowers` skill applied
- [ ] Pydantic DTOs / typed contracts
- [ ] Alembic migration (if schema change)
- [ ] Indexes considered
- [ ] Idempotency/pagination where relevant
- [ ] Structured logging added
- [ ] Tests added/updated
- [ ] Docs updated

**Suggested milestones**
- M1: Backend skeleton + health + DB schema + migrations (Phases 1–2)
- M2: Catalog API v1 + repositories + Supabase + Redis (Phases 3–5)
- M3: AI pipeline (extraction/optimization/translation) (Phase 6)
- M4: Next.js product (onboarding → dashboard → public menu) (Phases 7–8)
- M5: Hardening + Dockerization + Cloud Run deploy (Phases 9–10)

## Open questions (carried from architecture)
- Realtime transport (Supabase Realtime vs WS/SSE)?
- Pagination standard (cursor vs offset) project-wide?
- AI provider(s) for OCR/image/text/translation?
- Supported MVP languages + fallback when device locale unsupported?
- Final root domain + wildcard subdomain/cert strategy?
