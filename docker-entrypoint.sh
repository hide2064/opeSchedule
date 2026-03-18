#!/bin/sh
set -e

echo "[entrypoint] Running Alembic migrations..."
alembic upgrade head

echo "[entrypoint] Starting uvicorn..."
exec uvicorn app.main:app \
  --host 0.0.0.0 \
  --port 8000 \
  --workers "${APP_WORKERS:-1}" \
  --log-level "${LOG_LEVEL:-info}"
