#!/usr/bin/env bash
# Idempotent dependency + schema bootstrap for the Disease Surveillance AI stack.
# Runs after the repository is checked out. Creates durable state (system
# packages, compiled backend, Python venvs, node modules, DB schema) so that a
# fresh boot only needs to (re)start services via .cursor/start.sh.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO"
# shellcheck disable=SC1091
source "$REPO/.cursor/dev.env"

echo "==> [1/7] System packages (postgres, postgis, rabbitmq, build deps)"
export DEBIAN_FRONTEND=noninteractive
sudo apt-get update -y
sudo apt-get install -y \
  postgresql postgresql-contrib postgresql-16-postgis-3 \
  rabbitmq-server pkg-config libssl-dev python3-venv curl

echo "==> [2/7] Rust toolchain (edition 2024 needs >= 1.85)"
rustup update stable
rustup default stable

echo "==> [3/7] Start Postgres (needed to create DB + schema during install)"
sudo pg_ctlcluster 16 main start || true
for _ in $(seq 1 30); do pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1 && break; sleep 1; done

echo "==> [4/7] Database, role, PostGIS, and schema (idempotent)"
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "ALTER USER postgres WITH PASSWORD 'root';"
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='disease_ai'" | grep -q 1; then
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE DATABASE disease_ai;"
fi
sudo -u postgres psql -d disease_ai -v ON_ERROR_STOP=1 -c "CREATE EXTENSION IF NOT EXISTS postgis;"

# The Rust backend runs an idempotent migration preamble at startup that assumes
# the base tables already exist (in Docker these SQL files are applied by the
# postgres init container). Mirror that by applying database/init/*.sql once on
# a fresh DB, then seeding schema_migrations so the backend skips re-applying.
if ! PGPASSWORD=root psql -h 127.0.0.1 -U postgres -d disease_ai -tAc \
      "SELECT to_regclass('public.disease_events')" | grep -q disease_events; then
  echo "    applying database/init/*.sql to fresh database"
  PGPASSWORD=root psql -h 127.0.0.1 -U postgres -d disease_ai -v ON_ERROR_STOP=1 -c \
    "CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW());"
  for f in $(ls "$REPO"/database/init/*.sql | sort); do
    PGPASSWORD=root psql -h 127.0.0.1 -U postgres -d disease_ai -q -v ON_ERROR_STOP=1 -f "$f"
    PGPASSWORD=root psql -h 127.0.0.1 -U postgres -d disease_ai -q -c \
      "INSERT INTO schema_migrations(filename) VALUES ('$(basename "$f")') ON CONFLICT DO NOTHING;"
  done
else
  echo "    schema already present; skipping"
fi

echo "==> [4b/7] Seed a dev webmaster/admin login (idempotent)"
# The upstream project seeds users via a separate "init" service that is not in
# this repository. Seed a local admin so the authenticated web UI is usable.
WEBMASTER_HASH="$(python3 -c "import hashlib,os;print(hashlib.sha256(os.environ.get('WEBMASTER_PASSWORD','webmaster').encode()).hexdigest())")"
PGPASSWORD=root psql -h 127.0.0.1 -U postgres -d disease_ai -v ON_ERROR_STOP=1 -c \
  "INSERT INTO users (username, password_hash, display_name, role, permissions)
   VALUES ('webmaster', '$WEBMASTER_HASH', 'Webmaster', 'admin', '[\"*\"]'::jsonb)
   ON CONFLICT (username) DO UPDATE SET
     password_hash = EXCLUDED.password_hash, is_active = TRUE,
     role = 'admin', permissions = '[\"*\"]'::jsonb;"

echo "==> [5/7] Build Rust backend"
( cd "$REPO/services/backend-rust" && cargo build --release )

echo "==> [6/7] Python virtual environments"
setup_venv() {
  local svc="$1"; shift
  local dir="$REPO/services/$svc"
  [ -d "$dir/.venv" ] || python3 -m venv "$dir/.venv"
  "$dir/.venv/bin/pip" install --upgrade pip -q
  "$@"
  "$dir/.venv/bin/pip" install -q -r "$dir/requirements.txt"
}
setup_venv nlp-python \
  "$REPO/services/nlp-python/.venv/bin/pip" install -q torch==2.5.1 --index-url https://download.pytorch.org/whl/cpu
setup_venv worker-python true

echo "==> [7/7] Frontend node modules"
( cd "$REPO/services/frontend-next" && npm install )

echo "==> install.sh complete"
