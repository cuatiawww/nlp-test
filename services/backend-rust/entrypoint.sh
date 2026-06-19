#!/bin/sh
# Auto-detect Windows host IP in WSL2 / Docker Desktop
# Falls back to original host.docker.internal if detection fails

GATEWAY=$(ip route show default 2>/dev/null | awk '{print $3}' | head -1)

if [ -n "$GATEWAY" ] && echo "$DATABASE_URL" | grep -q "host.docker.internal"; then
    DATABASE_URL=$(echo "$DATABASE_URL" | sed "s/host\.docker\.internal/$GATEWAY/")
    export DATABASE_URL
    echo "entrypoint: using gateway $GATEWAY for database"
fi

exec /app/backend-rust
