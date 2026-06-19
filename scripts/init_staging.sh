#!/bin/bash
# init_staging.sh — First-time setup untuk staging deployment
# Usage: bash scripts/init_staging.sh
# Jalankan setelah `docker compose up -d`

set -e

API="${1:-http://localhost:8080}"
SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Load .env vars (if available)
if [ -f "${SCRIPT_DIR}/.env" ]; then
  set -a
  source "${SCRIPT_DIR}/.env"
  set +a
fi

echo "========================================"
echo "  Disease Surveillance AI — Staging Init"
echo "========================================"
echo ""

# ─── 1. Wait for PostgreSQL ──────────────────────
echo "⏳ Waiting for PostgreSQL..."
for i in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U postgres -d disease_ai &>/dev/null 2>&1; then
    echo "✅ PostgreSQL ready"
    break
  fi
  sleep 2
done

# ─── 2. Wait for Backend API ──────────────────────
echo "⏳ Waiting for Backend API..."
for i in $(seq 1 30); do
  if curl -s "$API/health" &>/dev/null 2>&1; then
    echo "✅ Backend API ready"
    break
  fi
  sleep 2
done

# ─── 3. Seed Initial User ─────────────────────────
echo ""
echo "📦 Seeding initial user..."
WEBMASTER_PASS="${WEBMASTER_PASSWORD:-K3mk3s#2202%ok}"
HASH=$(echo -n "$WEBMASTER_PASS" | sha256sum | cut -d' ' -f1)

docker compose exec -T postgres psql -U postgres -d disease_ai <<SQL
INSERT INTO users (username, password_hash, display_name, role, email)
VALUES ('webmaster', '${HASH}', 'Webmaster', 'admin', 'admin@disease-ai.local')
ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash;
SQL
echo "✅ User 'webmaster' created (password: ${WEBMASTER_PASS})"

# ─── 4. Seed Sample Sources (via 007 migration) ───
echo ""
echo "📦 Seeding sample sources from 007_seed_sources.sql..."
# SQL 007 sudah auto-run oleh PostgreSQL saat first init (via docker-entrypoint-initdb.d)
# Tapi kita run ulang untuk jaga-jaga
docker compose exec -T postgres psql -U postgres -d disease_ai < "${SCRIPT_DIR}/database/init/007_seed_sources.sql" 2>&1 | tail -3
echo "✅ Sample sources seeded (29 sources)"

# ─── 5. Training Data ──────────────────────────────
echo ""
echo "📦 Training data..."
if [ -f "${SCRIPT_DIR}/training/train.jsonl" ]; then
  wc -l "${SCRIPT_DIR}/training/train.jsonl" 2>/dev/null | awk '{print "✅ " $1 " samples in training/train.jsonl"}'
else
  echo "⚠️  training/train.jsonl not found — generate with: python3 scripts/generate_synthetic_data.py"
fi

# ─── 6. Verify ────────────────────────────────────
echo ""
echo "========================================"
echo "  Verification"
echo "========================================"
echo ""
echo "Sources:"
curl -s "$API/api/v1/sources" | python3 -c "import sys,json;d=json.load(sys.stdin)['data'];print(f'  {len(d)} sources')" 2>/dev/null
echo "Outbreak Rules:"
curl -s "$API/api/v1/outbreak-rules" | python3 -c "import sys,json;d=json.load(sys.stdin)['data'];print(f'  {len(d)} rules (DB-driven)')" 2>/dev/null
echo "NLP Labels:"
curl -s "$API/api/v1/nlp-labels" | python3 -c "import sys,json;d=json.load(sys.stdin)['data'];print(f'  {len(d)} labels (DB-driven, auto-refresh)')" 2>/dev/null
echo "Users:"
docker compose exec -T postgres psql -U postgres -d disease_ai -tAc "SELECT count(*) FROM users;" 2>/dev/null | xargs -I{} echo "  {} users"
echo "Training Data:"
if [ -d "${SCRIPT_DIR}/training" ]; then
  wc -l ${SCRIPT_DIR}/training/*.jsonl 2>/dev/null
fi

echo ""
echo "========================================"
echo "  ✅ Init complete!"
echo "========================================"
echo ""
echo "  Login: webmaster / $(grep POSTGRES_PASSWORD ${SCRIPT_DIR}/.env 2>/dev/null | cut -d= -f2 || echo 'see .env')"
echo "  Frontend: http://localhost:3001"
echo "  Backend:  http://localhost:8080"
echo ""
