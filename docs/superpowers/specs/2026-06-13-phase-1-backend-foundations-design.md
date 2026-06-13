# Phase 1 — Backend Foundations — Design Spec

> Status: **Approved design** (pending user spec review).
> Source planning: `docs/PROJECT_PLANNING.en.md` (Phase 1). Architecture: `docs/TECH_ARCHITECTURE.en.md`. Product context: `docs/PROJECT_CONTEXT.en.md`.

## Goal

Lay the foundations of the Vendelo AI backend: a runnable FastAPI app with environment-based configuration, structured logging, uniform error handling, a versioned API (`/api/v1`), and a SOLID modular skeleton demonstrated by an example `health` module — plus repo restructuring for the monorepo. No business logic, no database, no external services yet.

## Decisions (locked)

| Topic | Decision |
|-------|----------|
| Dependency management | **pip + `requirements.txt` + venv** (no Poetry/uv) |
| Python version | **3.12** |
| Repo restructure | Create `backend/`, **rename `frontend/` → `frontend-legacy/`** (git mv), create empty `infra/` |
| Pagination standard | **Cursor-based** (documented as a generic contract; not wired to data yet) |
| Scaffold depth | **Foundations + SOLID layer skeleton** with an example `health` module showing `api → service → port → adapter` |
| Backend structure | **Approach A: vertical slices by domain** (`app/modules/<domain>/...`) + shared `app/core/` |

## Out of scope (Phase 1)

- No database, no SQLAlchemy models, no Alembic.
- No Redis, no auth, no Supabase, no AI, no WebSockets.
- No real business endpoints (only `health`).
- No CI/CD pipeline (Phase 10). Local quality gates only.
- Idempotency and pagination exist as **code-level contracts/types**, not connected to infrastructure.

## Architecture

Modular monolith using **vertical slices by domain**. Each module owns its API, service (domain logic), ports (interfaces), and adapters (implementations). Cross-cutting concerns live in `app/core/`. This honors SOLID — especially Dependency Inversion (services depend on ports, not concretes) — so a module can later be extracted into a microservice by moving its folder.

### Layering per module
```
api  (thin HTTP layer, FastAPI router)  ->  service (domain logic)  ->  port (ABC/Protocol)  <-  adapter (impl)
```
The `api` layer wires dependencies (injecting an adapter that satisfies the port) via FastAPI dependency injection.

## Repository layout (after Phase 1)

```
backend/
  app/
    main.py                  # FastAPI app factory; mounts v1 router; registers middleware + error handlers
    core/
      config.py              # Settings(BaseSettings) + get_settings() (lru_cache)
      logging.py             # structured JSON logging setup
      request_context.py     # request-id middleware + correlation
      errors.py              # uniform error model + global exception handlers
      pagination.py          # cursor-based pagination contract (generic types/helpers)
      idempotency.py         # Idempotency-Key contract (datatypes; no Redis)
    api/
      v1/
        router.py            # aggregates /api/v1 sub-routers
    modules/
      health/
        api.py               # GET /api/v1/health
        service.py           # HealthService
        ports.py             # HealthCheckPort (interface)
        adapters.py          # InMemoryHealthCheck adapter (implements port)
        schemas.py           # HealthStatus DTO (Pydantic)
  tests/
    test_config.py
    test_logging.py
    test_health.py
    test_errors.py
  requirements.txt
  requirements-dev.txt
  .env.example
  pyproject.toml             # ruff/black/mypy/pytest config
  .pre-commit-config.yaml
  Dockerfile                 # python:3.12-slim (prepared; full use in Phase 10)
  .dockerignore
  README.md

infra/.gitkeep
frontend-legacy/             # renamed from frontend/
```

## Component details

### core/config.py
- `Settings(BaseSettings)` (pydantic-settings v2), reads env + `.env` locally.
- Fields (Phase 1): `app_env` (`dev|staging|prod`), `log_level`, `api_v1_prefix` (default `/api/v1`), `app_version`.
- Fail-fast validation; `get_settings()` cached with `lru_cache`; injected via FastAPI `Depends`.
- DB/Redis/Supabase/AI vars are documented as commented placeholders in `.env.example`, not added to `Settings` yet (YAGNI).

### core/logging.py
- JSON formatter emitting: timestamp, level, logger, message, `request_id`, and extra fields.
- Configured from `log_level`. No sensitive data logged.

### core/request_context.py
- Middleware: read/generate `X-Request-ID`, store in a contextvar, attach to response header, make available to logging.

### core/errors.py
- Uniform error body: `{ "error": { "code": str, "message": str, "request_id": str } }`.
- Global handlers: request validation error (422), `HTTPException`, unhandled exception (500). All include `request_id`.

### core/pagination.py
- Generic cursor-based contract: `CursorPage[T]` (items, `next_cursor`, `has_more`) and a `PaginationParams` (limit, cursor) model. Encoding/decoding cursor helpers (opaque, base64). No DB binding.

### core/idempotency.py
- Datatypes/protocol for Idempotency-Key handling (`IdempotencyKey`, an `IdempotencyStore` Protocol). No Redis/DB implementation yet — just the contract for later phases.

### modules/health
- `schemas.py`: `HealthStatus { status: "ok", env: str, version: str }`.
- `ports.py`: `HealthCheckPort` (ABC) with `check() -> HealthStatus`.
- `adapters.py`: `InMemoryHealthCheck` implementing the port (reads settings).
- `service.py`: `HealthService` depends on `HealthCheckPort`.
- `api.py`: `GET /api/v1/health` → returns `HealthStatus` via the service; adapter injected through `Depends`.

### main.py
- App factory `create_app()`: instantiate FastAPI, register request-id middleware, error handlers, mount `/api/v1` router.

## Testing strategy (TDD)

Tests written before implementation per file. Coverage:
- `test_config.py`: settings load from env; defaults; cached instance identity.
- `test_logging.py`: log record is valid JSON and includes `request_id` field key.
- `test_health.py`: `GET /api/v1/health` returns 200 and `{status: "ok", env, version}` (via `TestClient`).
- `test_errors.py`: unknown route / forced error returns the uniform error shape with `request_id`.

## Quality gates (Definition of Done)

- [ ] `pytest` green
- [ ] `ruff` clean, `black --check` clean, `mypy` clean
- [ ] `pre-commit` runs the above
- [ ] `GET /api/v1/health` returns 200 locally
- [ ] Logs emitted as JSON with request id
- [ ] `frontend/` renamed to `frontend-legacy/` with history preserved
- [ ] `infra/` exists
- [ ] SOLID skeleton present (`api → service → port → adapter` in `health`)

## Risks / notes

- Renaming `frontend/` → `frontend-legacy/` must use `git mv` to keep history; verify the legacy app still builds afterward (path-only change, no code edits).
- `Dockerfile` is created but not part of the Phase 1 acceptance run (full container/deploy is Phase 10).
- Keep `core/` free of any concrete infra imports to preserve DB-agnostic, swappable design.

## Open questions (deferred, not blocking Phase 1)

- AI provider(s) (Phase 6), realtime transport final choice (Supabase Realtime vs custom WS, Phase 8), managed Redis provider (Phase 5), CI/CD details (Phase 10).
