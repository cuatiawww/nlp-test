#!/bin/sh
GATEWAY=$(ip route show default 2>/dev/null | awk '{print $3}' | head -1)

if [ -n "$GATEWAY" ]; then
    if echo "$DATABASE_URL" | grep -q "host.docker.internal"; then
        DATABASE_URL=$(echo "$DATABASE_URL" | sed "s/host\.docker\.internal/$GATEWAY/")
        export DATABASE_URL
    fi
    if echo "$MINIO_ENDPOINT" | grep -q "host.docker.internal"; then
        MINIO_ENDPOINT=$(echo "$MINIO_ENDPOINT" | sed "s/host\.docker\.internal/$GATEWAY/")
        export MINIO_ENDPOINT
    fi
fi

exec python -m uvicorn app.main:app --host 0.0.0.0 --port 8002