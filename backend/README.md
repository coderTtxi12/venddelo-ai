# venddelo-ai-backend

FastAPI backend for Vendelo AI (modular monolith, SOLID, microservices-ready).

## Setup

```bash
cd backend
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
```

## Run

```bash
python start.py
# health: http://localhost:8080/api/v1/health
```

## Docker (local stack)

**Recomendado — stack completo desde la raíz del repo** (Postgres, Redis, API, frontend, delivery-dashboard):

```bash
# desde venddelo-ai/
./scripts/docker-dev-setup.sh   # primera vez
docker compose up --build
```

Ver [DOCKER.md](../DOCKER.md) para URLs y variables.

**Solo API en Docker** (`backend/docker-compose.yml` + infra en el host):

```bash
cd infra && docker compose up -d
cd ../backend
cp .env.example .env   # first time only
docker compose up --build
# health: http://localhost:8080/api/v1/health
```

El contenedor API usa `host.docker.internal` para Postgres (`localhost:5434`) y Redis (`localhost:6379`).

Migrations run automatically on API startup (`RUN_MIGRATIONS=true`). Set `RUN_MIGRATIONS=false` for Cloud Run (run migrations in CI instead).

## Docker (Cloud Run)

Build the production image:

```bash
cd backend
docker build -t vendelo-api:latest .
```

Deploy manually (example):

```bash
gcloud run deploy vendelo-api \
  --image gcr.io/<PROJECT>/vendelo-api:latest \
  --region us-central1 \
  --port 8080 \
  --set-env-vars APP_ENV=prod,RUN_MIGRATIONS=false \
  --set-secrets DATABASE_URL=database-url:latest,REDIS_URL=redis-url:latest
```

Cloud Run injects `PORT` at runtime. The image listens on `0.0.0.0` and uses `NullPool` automatically when `DATABASE_URL` points to the Supabase pooler (`:6543`).

## Quality

```bash
pytest
ruff check .
black --check .
mypy app
```
