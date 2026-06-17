#!/bin/sh
set -e

PORT="${PORT:-8080}"
RUN_MIGRATIONS="${RUN_MIGRATIONS:-true}"

if [ "$RUN_MIGRATIONS" = "true" ]; then
  echo "Running Alembic migrations..."
  alembic upgrade head
fi

exec uvicorn app.main:app --host 0.0.0.0 --port "$PORT"
