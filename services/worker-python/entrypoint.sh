#!/bin/sh
GATEWAY=$(ip route show default 2>/dev/null | awk '{print $3}' | head -1)

if [ -n "$GATEWAY" ] && echo "$DATABASE_URL" | grep -q "host.docker.internal"; then
    DATABASE_URL=$(echo "$DATABASE_URL" | sed "s/host\.docker\.internal/$GATEWAY/")
    export DATABASE_URL
    echo "entrypoint: using gateway $GATEWAY for database"
fi

exec python -m app.worker