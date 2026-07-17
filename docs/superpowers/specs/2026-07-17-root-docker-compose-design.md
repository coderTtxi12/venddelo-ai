# Root Docker Compose — Full Stack Design

> Status: **Implemented**
> Scope: Single `docker compose up` from repo root for infra + backend + frontend + delivery-dashboard

## Goal

Developers run the entire Venddelo AI stack with one command from the repository root, without manually starting `infra/`, `backend/`, and each Next.js app in separate terminals.

## Decisions

| Topic | Decision |
|-------|----------|
| Compose location | **`docker-compose.yml` at repo root** |
| Infra reuse | **`include: ./infra/docker-compose.yml`** — no duplication of Postgres/Redis |
| Backend networking | Internal service names `postgres:5432`, `redis:6379` (override `backend/.env` localhost URLs) |
| Frontend mode | **Dev** (`next dev`) with bind mounts + named volumes for `node_modules` and `.next` |
| Ports | Frontend `3000`, delivery-dashboard `3001`, API `8080`, Postgres `5434`, Redis `6379` |
| Env setup | `./scripts/docker-dev-setup.sh` copies `.env.example` templates on first run |
| Legacy workflow | `backend/docker-compose.yml` + `infra/` kept for API-only Docker against host DB |

## Services

```
postgres (infra) ──┐
redis (infra) ─────┼──► api (backend) ◄── frontend :3000
                   │                  └── delivery-dashboard :3001
```

## Files

- `docker-compose.yml` — root orchestration
- `frontend/Dockerfile`, `delivery-dashboard/Dockerfile` — Node 22 + pnpm dev
- `scripts/docker-dev-setup.sh` — first-time env bootstrap
- `.env.example` — shared Compose variables
- `DOCKER.md` — developer quick start

## Out of scope

- Production multi-stage Next.js images
- CI/CD pipeline
- Cloud Run deploy changes
