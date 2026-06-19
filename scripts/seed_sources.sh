#!/bin/bash
# Seed script: menambahkan sample ASEAN news sources ke database via API
# Usage: bash scripts/seed_sources.sh [api_base_url]
# Default API: http://localhost:8080

API="${1:-http://localhost:8080}"
JSON_FILE="database/sample_sources_asean.json"

if [ ! -f "$JSON_FILE" ]; then
  echo "Error: $JSON_FILE not found. Run this script from project root."
  exit 1
fi

echo "Seeding ASEAN news sources to $API ..."
echo ""

# Use jq if available, otherwise fallback to python3
if command -v jq &>/dev/null; then
  PARSER="jq -c '.country as \$c | .sources[] | {country: \$c, source: .}'"
else
  PARSER="python3 -c \"
import sys,json
data = json.load(sys.stdin)
for c in data:
    for s in c['sources']:
        print(json.dumps({'country': c['country'], 'source': s}))
\""
fi

jq -c '.[] | .country as $c | .sources[] | {country: $c, source: .}' "$JSON_FILE" | while read -r item; do
  country=$(echo "$item" | jq -r '.country')
  name=$(echo "$item" | jq -r '.source.name')
  type=$(echo "$item" | jq -r '.source.source_type')
  config=$(echo "$item" | jq -r '.source.config')
  schedule=$(echo "$item" | jq -r '.source.schedule // "interval:120"')

  echo "[$country] $name ($type)"

  RESP=$(curl -s -X POST "$API/api/v1/sources" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"$name\",\"source_type\":\"$type\",\"config\":$config,\"schedule\":\"$schedule\"}")

  SUCCESS=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('success',False))" 2>/dev/null)

  if [ "$SUCCESS" = "True" ]; then
    echo "  ✅ Added"
  else
    ERROR=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('error','unknown'))" 2>/dev/null)
    echo "  ❌ Failed: $ERROR"
  fi
done

echo ""
echo "Done! Cek di http://localhost:3001/sources"
