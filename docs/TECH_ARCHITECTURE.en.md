# Technical Details & Architecture — Vendelo AI

> Technical reference document. It defines the **stack**, the **design principles**, and the **mandatory practices** for building Vendelo AI. It complements `PROJECT_CONTEXT.en.md` (what we build) by describing **how** we build it.

## 1. Architecture overview

- **Initial architecture: modular monolith.** We start as a monolith, but the code must be designed so that **future migration to microservices is easy** (modules with clear boundaries, low coupling, communication via interfaces/services, not via direct access to other modules' tables).
- **Initial deployment: Google Cloud Run** (containers) in production.
- **SOLID principles** as the foundation of all object/service-oriented design.
- **Mandatory best practices**: every change must follow the **superpowers** skill to apply best practices consistently.

### Logical diagram (high level)

```
[ Web Client (Next.js) ] <-REST---> [ FastAPI API (v1) ]  ->  [ Domain services ]
        |              <-WebSocket->         |                         |
   responsive UI              rate limit, auth,          SQLAlchemy + Pydantic
   (any screen size)          idempotency, pagination           |
        |                            |                   [ PostgreSQL (Supabase) ]
   Supabase Auth (Google)     structured logging         [ Redis (hot storage + Pub/Sub) ]
        |                            |                   [ Supabase Storage ]
   Public menu / Dashboard    [ AI services ]--------->  [ AIGatewayPort -> provider ]
                              (extraction, image,         (OCR, image, copy,
                               copy, palette, translation) palette, translation)
```

## 2. Frontend

- **Framework**: Next.js + TypeScript.
- **Responsive**: optimized to work on **any screen size** (mobile-first, consistent breakpoints, fluid layouts).
- **Surfaces**:
  - **Onboarding** Typeform-style (step by step).
  - **Restaurant dashboard** (menu editing, real-time orders, statistics, earnings).
  - **Public menu** served by subdomain (diner consumption + WhatsApp checkout).
- **Best practices**: reusable components, layered separation (UI / hooks / API services), clear state management, basic accessibility, strict typing.

## 3. Backend

- **Language/Framework**: Python + **FastAPI**.
- **ORM**: **SQLAlchemy**.
- **Validation/serialization**: **Pydantic** (request/response models and settings).
- **Migrations**: **Alembic**.
- **Database**: **PostgreSQL** (via Supabase).
- **Auth**: **Supabase Authentication** with **Google** (OAuth/OIDC).
- **Storage**: **Supabase Storage** (logos, menu images, AI-optimized images).
- **Cache / hot storage**: **Redis** (hot data: sessions/published menus, counters, idempotency keys, rate limiting).

### 3.1 API design

- **API versioning**: version-prefixed routes, `/api/v1/...`, `/api/v2/...` to evolve without breaking clients.
- **Pagination**: on all list endpoints (cursor-based preferred for scale; or documented limit/offset).
- **Idempotency**: operations (especially POST/writes such as creating an order) accept an **Idempotency-Key**; if the user sends the same request twice or more, the **response must be the same** and effects are not duplicated. Keys are stored in Redis (with TTL) + DB verification where applicable.
- **Logging**: **structured** (JSON) and consistent log format, correlated by request id; clear levels (info/warn/error) and no leaking of sensitive data.

### 3.2 Security and robustness

- **Rate limiting** to prevent abuse/hacking (per IP/user/endpoint), backed by Redis.
- **Auth** centralized in Supabase (Google); token verification in the backend.
- Strict input validation with Pydantic; uniform error handling.

### 3.3 Database performance

- **Connection pooling**: connection pool to support **many concurrent requests** without degrading latency.
- **Indexing**: indexes on frequently filtered/sorted columns (foreign keys, publish states, timestamps, subdomain, etc.).
- **Redis** as a hot read layer to reduce load on PostgreSQL.

### 3.4 AI services

Every AI capability lives behind an interface (`AIGatewayPort`) following **Dependency Inversion**: the domain doesn't know the concrete provider, so providers can be swapped/combined without touching business logic.

- **Menu extraction (OCR / document understanding)**: turns the uploaded menu (photo/PDF/image) into a structured draft (categories, products, prices, options, promotions, images).
- **Image optimization**: enhances dish photos **without altering the real dish**; original + optimized are stored and recorded in `ai_artifacts` to enable **undo**.
- **Description copywriting**: generates more appealing descriptions; keeps the original for revert.
- **Color-palette selection**: picks from the list of available palettes based on logo/brand.
- **Translation (multi-language)**: when the diner's device `locale` ≠ the menu's `original_language`, an AI service translates the visible content (categories, products, descriptions, add-ons, promotions, UI labels).
  - Translations are **persisted** in `menu_translations` and **cached in Redis** (key by `subdomain` + `locale`) to avoid re-translating on every visit.
  - Invalidated via `source_hash` when the original content changes; **fallback** policy to the original language when the locale is unsupported.
- **Async orchestration**: extraction/optimization can be long-running; they run as **background jobs** with queryable status. Progress is pushed to the client via **WebSockets** (see 3.5).

### 3.5 Realtime (WebSockets)

Some surfaces require live updates. For those cases we use **WebSockets** (full-duplex), with **SSE/polling** as an alternative where a single direction is enough.

- **Real-time orders** in the restaurant dashboard: when a new order arrives or its status changes, it's pushed over WebSocket to the tenant's subscribed dashboards.
- **AI processing status**: progress of menu extraction/optimization during onboarding.
- **Live metrics** (optional): today's sales/order counters.
- **Design**:
  - Channels/rooms per `restaurant_id` to isolate each tenant; socket authentication via the Supabase token.
  - **Redis Pub/Sub** backplane so it works across **multiple instances** on Cloud Run (a message published by any instance reaches sockets connected on others).
  - Transport behind an interface (`RealtimePort`) so we can switch between custom WebSockets and **Supabase Realtime** without touching the domain.
  - Cloud Run note: it supports WebSockets, but connections are long-lived with a max request timeout; handle reconnection on the client.

## 4. Design principles

### 4.1 SOLID (mandatory)

- **S — Single Responsibility**: each module/class has a single reason to change.
- **O — Open/Closed**: extensible without modifying existing code (strategies/injection).
- **L — Liskov**: implementations respect their interfaces' contracts.
- **I — Interface Segregation**: small, specific interfaces.
- **D — Dependency Inversion**: depend on abstractions, not concrete implementations (repositories, AI gateways, storage, etc. behind interfaces).

### 4.2 Modular monolith ready for microservices

- Organize the backend by **domain modules** (e.g. `restaurants`, `menu`, `orders`, `ai`, `realtime`, `auth`, `billing`) with **explicit boundaries**.
- Communication between modules via **interfaces/services**, not via cross-table access.
- A **repository** layer isolates persistence; a **service** layer holds domain logic; a thin **API** layer.
- Avoid circular dependencies; keep contracts (Pydantic DTOs) stable.
- This allows, in the future, **extracting a module** (e.g. `ai` or `orders`) as a microservice with minimal changes.

## 5. Infrastructure and deployment

- **Docker**: containers for frontend and backend (reproducible images).
- **Initial production**: **Google Cloud Run** (per-container scaling, stateless).
- **Managed services**: Supabase (PostgreSQL, Auth, Storage), managed Redis.
- **Per-environment configuration**: settings via Pydantic; secrets out of the code.

## 6. Mandatory practices (workflow)

- **`superpowers` skill**: **every change** must follow this skill to apply best practices (quality, security, consistency).
- **Migrations**: every schema change goes through **Alembic** (no manual DB changes).
- **API versioning**: breaking changes → new version (`v2`), never break a `v1` in use.
- **Structured, traceable logging** on every request.
- **Tests** and validation before deploying (per repo policy).

## 7. Requirement → solution mapping

| Requirement | How it is met |
|-------------|---------------|
| Responsive frontend | Next.js + TS, mobile-first, fluid layouts |
| Robust API | FastAPI + Pydantic, `v1/v2` versioning |
| Persistence | SQLAlchemy + PostgreSQL (Supabase) |
| Google auth | Supabase Authentication |
| File storage | Supabase Storage |
| Anti-abuse | Rate limiting (Redis) |
| Migrations | Alembic |
| Read scalability | Redis (hot storage) |
| DB concurrency | Connection pooling |
| Query speed | Indexing |
| Consistent results | Idempotency keys |
| Large lists | Pagination |
| Observability | Structured logging |
| AI services | `AIGatewayPort` + adapters (extraction, image, copy, palette, translation) |
| Multi-language menu | AI translation service + `menu_translations` + Redis cache |
| Live updates | WebSockets (+ Redis Pub/Sub backplane); SSE/polling as alternative |
| Packaging | Docker |
| Production | Google Cloud Run |
| Maintainability | SOLID + modular monolith |
| Evolution | Microservices-ready design |
| Quality | `superpowers` skill on every change |

## 8. Open questions (TBD)

- Managed Redis (provider) and TTL strategy per data type?
- Standard pagination strategy (cursor vs offset) across the whole API?
- CI/CD (GitHub Actions → Cloud Run) and environments (dev/staging/prod)?
- Realtime: we will use **WebSockets** (with Redis Pub/Sub) for orders and AI status. Open: custom WebSockets vs **Supabase Realtime** as the final implementation behind `RealtimePort`?
- AI provider(s) for OCR/image/text/translation behind `AIGatewayPort`?
- API versioning/deprecation policy (support window for `v1`)?
