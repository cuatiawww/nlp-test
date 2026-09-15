#!/usr/bin/env bash
# Per-boot service reconciliation. Starts Postgres and RabbitMQ and waits until
# both accept connections, then returns. Application services run as terminals.
set -euo pipefail

echo "==> Starting Postgres"
sudo pg_ctlcluster 16 main start || true
for _ in $(seq 1 30); do
  pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1 && break
  sleep 1
done
pg_isready -h 127.0.0.1 -p 5432 && echo "    Postgres ready"

echo "==> Starting RabbitMQ"
if ! (echo > /dev/tcp/127.0.0.1/5672) >/dev/null 2>&1; then
  sudo rabbitmq-server -detached || true
fi
for _ in $(seq 1 60); do
  (echo > /dev/tcp/127.0.0.1/5672) >/dev/null 2>&1 && break
  sleep 1
done
(echo > /dev/tcp/127.0.0.1/5672) >/dev/null 2>&1 && echo "    RabbitMQ ready"

echo "==> start.sh complete"
