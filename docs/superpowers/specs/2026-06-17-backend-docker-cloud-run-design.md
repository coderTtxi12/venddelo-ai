# Backend Docker & Cloud Run — Design Spec

> Status: **Approved** (Approach A — self-contained `backend/docker-compose.yml`)
> Source planning: `docs/PROJECT_PLANNING.es.md` (Fase 10), `docs/TECH_ARCHITECTURE.es.md`
> Scope: **Backend only** — Dockerfile for Google Cloud Run + `docker-compose` for local `docker compose up`

## Goal

Enable the Vendelo AI backend to run as a container locally (`docker compose up` from `backend/`) and deploy to **Google Cloud Run** with a production-ready image. The stack must wire the existing FastAPI app to Postgres and Redis, apply Alembic migrations on local startup, and respect Cloud Run conventions (dynamic `PORT`, stateless instances, external managed DB).

## Current state

| Asset | Status |
|-------|--------|
| `backend/Dockerfile` | Exists — minimal single-stage; copies only `app/`; missing `migrations/`, non-root user, `PORT` env, healthcheck |
| `backend/.dockerignore` | Exists — excludes `.env`, tests, caches |
| `infra/docker-compose.yml` | Postgres 16 (`5434:5432`) + Redis 7 — **no API service** |
| Entry point | `uvicorn app.main:app --host 0.0.0.0 --port 8080` |
| Health endpoint | `GET /api/v1/health` — in-memory check (no DB/Redis probe) |
| DB pooling | `NullPool` for Supabase pooler URLs; `QueuePool` for local Postgres |
| Migrations | Alembic in `backend/migrations/`; `alembic upgrade head` reads `DATABASE_URL` from settings |

## Decisions (proposed)

| Topic | Decision |
|-------|----------|
| Compose location | **`backend/docker-compose.yml`** — self-contained (`api` + `postgres` + `redis`) so `cd backend && docker compose up` works |
| `infra/docker-compose.yml` | **Keep unchanged** — optional DB/Redis-only stack for pytest/integration tests without building the API image |
| Image strategy | **Multi-stage build** — builder installs deps; runtime is slim, non-root |
| Cloud Run port | Read **`PORT`** env var (default `8080`); Cloud Run injects this at runtime |
| Migrations (local compose) | Run **`alembic upgrade head`** in an entrypoint **before** starting uvicorn |
| Migrations (Cloud Run) | **Not** on container boot — run as a **CI/release job** (separate Cloud Run Job or pipeline step) to avoid race conditions across scaled instances |
| Hot reload | **Out of scope** — compose runs production-like uvicorn (no `--reload`); local dev without Docker keeps using `python start.py` |
| Secrets in compose | Use **`env_file: .env`** (gitignored); ship **`backend/.env.docker.example`** with Docker-safe defaults |
| CI/CD pipeline | **Out of scope** for this spec — Dockerfile must be buildable with `docker build` for manual `gcloud run deploy` |

## Out of scope

- Frontend Dockerfile / compose
- GitHub Actions workflow
- Cloud Run service YAML, Secret Manager wiring, custom domains
- Deep health checks (DB/Redis liveness in `/health`)
- WebSocket / long-lived connection tuning for Cloud Run
- Redis/Postgres managed services provisioning

## Approaches considered

### A — Self-contained `backend/docker-compose.yml` (recommended)

`backend/docker-compose.yml` defines `api`, `postgres`, and `redis`. Developer copies `.env.docker.example` → `.env`, runs `docker compose up --build`. Migrations run via entrypoint on API container start.

**Pros:** One command, matches user request, clear ownership under `backend/`.  
**Cons:** Duplicates postgres/redis services already in `infra/docker-compose.yml` (documented as two valid workflows).

### B — Extend `infra/docker-compose.yml` only

Add `api` service to existing infra compose; developer runs from repo root.

**Pros:** Single compose file, no duplication.  
**Cons:** User asked for backend-owned compose; path is `infra/` not `backend/`.

### C — Compose `include` from infra

`backend/docker-compose.yml` uses `include: ../infra/docker-compose.yml` and adds only `api`.

**Pros:** DRY for postgres/redis.  
**Cons:** Cross-directory paths, harder to reason about; `include` requires Compose v2.20+.

**Recommendation: Approach A** — simplest mental model for `docker compose up` inside `backend/`.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  backend/docker-compose.yml (local)                         │
│                                                             │
│  ┌──────────┐    ┌──────────┐    ┌──────────────────────┐ │
│  │ postgres │    │  redis   │    │  api (FastAPI)       │ │
│  │  :5432   │◄───┤  :6379   │◄───┤  entrypoint.sh       │ │
│  │          │    │          │    │  → alembic upgrade   │ │
│  └──────────┘    └──────────┘    │  → uvicorn :8080     │ │
│       ▲               ▲           └──────────────────────┘ │
│       │               │                      │              │
│       └───────────────┴──────────────────────┘              │
│              Docker network (default)                       │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Google Cloud Run (production)                              │
│                                                             │
│  ┌──────────────────────┐     ┌─────────────────────────┐  │
│  │  api container       │────►│ Supabase Postgres       │  │
│  │  (multi-stage image) │     │ (pooler :6543, NullPool)│  │
│  │  PORT from Cloud Run │────►│ Managed Redis (URL env) │  │
│  └──────────────────────┘     └─────────────────────────┘  │
│  Migrations: CI job, NOT entrypoint                         │
└─────────────────────────────────────────────────────────────┘
```

## Files to create or modify

```
backend/
  Dockerfile                  # MODIFY — multi-stage, non-root, migrations, PORT
  .dockerignore               # MODIFY — ensure migrations included, dev artifacts excluded
  docker-compose.yml          # CREATE — api + postgres + redis
  .env.docker.example         # CREATE — compose-friendly env template
  scripts/
    entrypoint.sh             # CREATE — migrate (compose) + exec uvicorn
  README.md                   # MODIFY — add Docker / Cloud Run section (if README exists)
```

`infra/docker-compose.yml` — **no changes** (document coexistence in README).

## Dockerfile specification

### Stage 1: `builder`

- Base: `python:3.12-slim`
- Install build deps only if needed (psycopg binary wheel should not need gcc)
- `pip install --no-cache-dir -r requirements.txt` into `/opt/venv`
- Use `python -m venv /opt/venv` for clean copy to runtime

### Stage 2: `runtime`

- Base: `python:3.12-slim`
- Create non-root user `appuser` (uid 1000)
- Copy `/opt/venv` from builder
- Copy application code:
  - `app/`
  - `migrations/`
  - `alembic.ini`
  - `scripts/entrypoint.sh`
- `ENV PATH="/opt/venv/bin:$PATH"`
- `ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1`
- `WORKDIR /app`
- `USER appuser`
- `EXPOSE 8080`
- `HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:${PORT:-8080}/api/v1/health')" || exit 1`
- `ENTRYPOINT ["/app/scripts/entrypoint.sh"]`
- Default `CMD` empty (entrypoint handles uvicorn) or `CMD ["serve"]`

### Cloud Run compatibility

| Requirement | Implementation |
|-------------|----------------|
| Listen on `0.0.0.0` | uvicorn `--host 0.0.0.0` |
| Dynamic port | `PORT=${PORT:-8080}` in entrypoint |
| Stateless | No local volumes in production image |
| Fast startup | Slim image, no dev deps |
| Health probe | Cloud Run HTTP probe → `/api/v1/health` |

### Build command

```bash
cd backend
docker build -t vendelo-api:latest .
```

### Manual Cloud Run deploy (reference, not automated)

```bash
gcloud run deploy vendelo-api \
  --image gcr.io/<PROJECT>/vendelo-api:latest \
  --region us-central1 \
  --port 8080 \
  --set-env-vars APP_ENV=prod \
  --set-secrets DATABASE_URL=database-url:latest,REDIS_URL=redis-url:latest \
  --allow-unauthenticated   # adjust per auth needs
```

## Entrypoint specification (`scripts/entrypoint.sh`)

```bash
#!/bin/sh
set -e

PORT="${PORT:-8080}"
RUN_MIGRATIONS="${RUN_MIGRATIONS:-true}"

if [ "$RUN_MIGRATIONS" = "true" ]; then
  echo "Running Alembic migrations..."
  alembic upgrade head
fi

exec uvicorn app.main:app --host 0.0.0.0 --port "$PORT"
```

| Env var | Default | Purpose |
|---------|---------|---------|
| `PORT` | `8080` | HTTP listen port (Cloud Run injects) |
| `RUN_MIGRATIONS` | `true` | Set `false` in Cloud Run service env to skip boot migrations |

## docker-compose.yml specification

### Services

#### `postgres`

- Image: `postgres:16`
- Container name: `vendelo_postgres`
- Environment: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` from `.env`
- Port: `5434:5432` (matches existing local convention — avoids conflict with host Postgres)
- Volume: `vendelo_pgdata`
- Healthcheck: `pg_isready -U vendelo -d vendelo`

#### `redis`

- Image: `redis:7-alpine`
- Container name: `vendelo_redis`
- Command: `redis-server --maxmemory 500mb --maxmemory-policy allkeys-lru`
- Port: `6379:6379`
- Healthcheck: `redis-cli ping`

#### `api`

- Build: `context: .` / `dockerfile: Dockerfile`
- Container name: `vendelo_api`
- `env_file: .env`
- Environment overrides for Docker network hostnames:
  - `DATABASE_URL=postgresql+psycopg://vendelo:vendelo@postgres:5432/vendelo`
  - `REDIS_URL=redis://redis:6379/0`
  - `RUN_MIGRATIONS=true`
- Ports: `8080:8080`
- `depends_on`:
  - `postgres`: `condition: service_healthy`
  - `redis`: `condition: service_healthy`
- Restart: `unless-stopped`

### Volumes

```yaml
volumes:
  vendelo_pgdata:
```

### Usage

```bash
cd backend
cp .env.docker.example .env   # fill secrets as needed
docker compose up --build
# API: http://localhost:8080/api/v1/health
```

### Test database

On first `postgres` start, create `vendelo_test` via an init script **or** document manual step:

```bash
docker exec -e PGPASSWORD=vendelo vendelo_postgres \
  psql -U vendelo -d vendelo -c "CREATE DATABASE vendelo_test;" || true
```

Optional enhancement: add `backend/docker/postgres-init/01-create-test-db.sql` mounted to `/docker-entrypoint-initdb.d/`.

## Environment variables

### `.env.docker.example` (new file)

Docker-network defaults for compose; secrets left as placeholders:

```env
APP_ENV=dev
LOG_LEVEL=INFO
API_V1_PREFIX=/api/v1
APP_VERSION=0.1.0

DATABASE_URL=postgresql+psycopg://vendelo:vendelo@postgres:5432/vendelo
DATABASE_URL_TEST=postgresql+psycopg://vendelo:vendelo@postgres:5432/vendelo_test
REDIS_URL=redis://redis:6379/0
CORS_ORIGINS=http://localhost:3000
MENU_PUBLIC_DOMAIN=venddelo.ai

# Optional — leave empty for local compose without Supabase/AI
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_STORAGE_BUCKET=assets
SUPABASE_JWT_SECRET=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini

RUN_MIGRATIONS=true
PORT=8080
```

Production Cloud Run sets `DATABASE_URL` to Supabase pooler (`:6543`), `REDIS_URL` to managed Redis, `RUN_MIGRATIONS=false`, `APP_ENV=prod`.

## `.dockerignore` updates

Ensure included in image:

- `migrations/`
- `alembic.ini`
- `scripts/entrypoint.sh`

Continue excluding:

- `.env`, `.venv`, `tests/`, `__pycache__/`, `.pytest_cache/`, dev tooling caches
- `docker-compose.yml` (not needed in image)

## Error handling

| Scenario | Behavior |
|----------|----------|
| Postgres not ready | `depends_on: service_healthy` delays API start |
| Migration failure | Entrypoint exits non-zero; container restarts (compose shows error) |
| Redis unavailable at runtime | Existing graceful degradation in app (rate limit/cache fallbacks) |
| Missing required env in Cloud Run | App fails at startup with pydantic/settings error — fix via Secret Manager |

## Testing & acceptance criteria

### Local compose

- [ ] `docker compose up --build` starts all three services healthy
- [ ] `curl http://localhost:8080/api/v1/health` returns `200` with `status: ok`
- [ ] `docker compose logs api` shows successful `alembic upgrade head`
- [ ] API can reach Postgres (`postgres` hostname) and Redis (`redis` hostname)
- [ ] `docker compose down -v` cleans volumes (document data loss)

### Docker image (Cloud Run readiness)

- [ ] `docker build -t vendelo-api .` succeeds
- [ ] Container runs as non-root (`docker exec vendelo_api whoami` → `appuser`)
- [ ] `PORT=9000 docker run -e PORT=9000 ...` listens on 9000
- [ ] Image size reasonable (< 500 MB; slim base + venv only)
- [ ] `RUN_MIGRATIONS=false` skips Alembic (for Cloud Run simulation)

### Regression

- [ ] Existing `pytest` suite still passes outside Docker (unchanged dev workflow)
- [ ] `infra/docker-compose.yml` still works independently for DB-only dev

## Documentation additions

Add to `backend/README.md` (or create minimal section):

1. Prerequisites: Docker Desktop / Docker Engine + Compose v2
2. Quick start: `cp .env.docker.example .env && docker compose up --build`
3. Cloud Run build/push/deploy commands (reference)
4. Note: set `RUN_MIGRATIONS=false` on Cloud Run; run migrations in deploy pipeline
5. Coexistence: `infra/docker-compose.yml` for postgres/redis without API container

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Port 5434/6379 already in use (infra compose running) | Document: stop `infra` compose first, or change host ports in one file |
| Duplicate postgres data volumes (`infra` vs `backend` compose) | Different volume names; document that they are separate datasets |
| Supabase credentials in `.env` committed | `.env` gitignored; example file has placeholders only |
| Cloud Run cold start + migration time | `RUN_MIGRATIONS=false` in prod; migrations in CI job |

## Implementation plan (next step)

After spec approval, invoke **writing-plans** skill to produce:
`docs/superpowers/plans/2026-06-17-backend-docker-cloud-run.md`

Tasks (preview):

1. Upgrade `backend/Dockerfile` (multi-stage, non-root)
2. Create `scripts/entrypoint.sh`
3. Update `.dockerignore`
4. Create `backend/docker-compose.yml`
5. Create `.env.docker.example`
6. Optional: postgres init script for `vendelo_test`
7. Update `backend/README.md`
8. Verify: `docker compose up --build` + health check
