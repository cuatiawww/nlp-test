#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
COMPOSE_FILE=${COMPOSE_FILE:-docker-compose.yml}
WORKER_SERVICE=${WORKER_SERVICE:-disease-worker-python}

cd "$PROJECT_DIR"
exec docker compose -f "$COMPOSE_FILE" run --rm --no-deps \
  "$WORKER_SERVICE" python -m app.sync_who_unknowns "$@"
