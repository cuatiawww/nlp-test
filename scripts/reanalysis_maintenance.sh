#!/usr/bin/env bash
set -Eeuo pipefail

# Freeze ingestion, drain existing work, run a snapshot-bounded re-analysis,
# then release durable held messages. A crash invokes forced recovery; the
# maintenance-watchdog covers SIGKILL/host failure after its stale threshold.

ACTION="${1:-help}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
WORKER_SERVICE="${WORKER_SERVICE:-disease-worker-python}"
SOCIAL_WORKER_SERVICE="${SOCIAL_WORKER_SERVICE:-disease-worker-social}"
ANALYSIS_SERVICE="${ANALYSIS_SERVICE:-analysis-job-worker}"
COLLECTOR_SERVICE="${COLLECTOR_SERVICE:-disease-collector-python}"
RABBITMQ_CONTAINER="${RABBITMQ_CONTAINER:-disease-rabbitmq}"
DRAIN_TIMEOUT_SECONDS="${DRAIN_TIMEOUT_SECONDS:-600}"

COMPOSE_ARGS=(-f "$COMPOSE_FILE")
if [[ -n "${COMPOSE_OVERRIDE_FILE:-}" ]]; then
  COMPOSE_ARGS+=(-f "$COMPOSE_OVERRIDE_FILE")
fi

compose() {
  docker compose "${COMPOSE_ARGS[@]}" "$@"
}

run_worker() {
  compose run --rm --no-deps "$WORKER_SERVICE" python -m app.maintenance "$@"
}

service_exists() {
  compose config --services | grep -Fxq "$1"
}

consumer_services() {
  local service
  for service in "$WORKER_SERVICE" "$SOCIAL_WORKER_SERVICE" "$ANALYSIS_SERVICE"; do
    [[ -n "$service" ]] || continue
    service_exists "$service" && printf '%s\n' "$service"
  done
}

start_consumers() {
  mapfile -t services < <(consumer_services)
  ((${#services[@]})) && compose start "${services[@]}"
}

stop_consumers() {
  mapfile -t services < <(consumer_services)
  service_exists "$COLLECTOR_SERVICE" && services+=("$COLLECTOR_SERVICE")
  ((${#services[@]})) && compose stop "${services[@]}"
}

queue_depth() {
  docker exec "$RABBITMQ_CONTAINER" rabbitmqctl list_queues \
    name messages_ready messages_unacknowledged 2>/dev/null |
    awk '
      NR > 1 && ($1 == "disease.raw" || $1 == "disease.social" ||
                 $1 == "disease.analysis-url" || $1 == "disease.crawl-matrix" ||
                 $1 == "disease.translation") { total += $2 + $3 }
      END { print total + 0 }
    '
}

drain() {
  local deadline=$((SECONDS + DRAIN_TIMEOUT_SECONDS)) depth
  while ((SECONDS < deadline)); do
    depth="$(queue_depth || true)"
    [[ "$depth" =~ ^[0-9]+$ ]] || depth=1
    echo "queue depth=$depth"
    ((depth == 0)) && return 0
    sleep 5
  done
  echo "Queue drain timeout after ${DRAIN_TIMEOUT_SECONDS}s" >&2
  return 1
}

recover_on_failure() {
  local code=$?
  if ((code != 0)) && [[ -n "${RUN_ID:-}" ]]; then
    echo "Reanalysis failed (exit=$code); releasing held messages safely" >&2
    run_worker finish "$RUN_ID" --force || true
    start_consumers || true
    service_exists "$COLLECTOR_SERVICE" && compose start "$COLLECTOR_SERVICE" || true
  fi
  exit "$code"
}

recover_start_failure() {
  local code=$?
  if ((code != 0)); then
    echo "Reanalysis start failed (exit=$code); restoring pipeline and consumers" >&2
    run_worker set-mode RUNNING --reason "reanalysis start failed; automatic recovery" || true
    start_consumers || true
    service_exists "$COLLECTOR_SERVICE" && compose start "$COLLECTOR_SERVICE" || true
  fi
  exit "$code"
}

case "$ACTION" in
  start)
    run_worker set-mode DRAINING --reason "reanalysis drain"
    trap recover_start_failure EXIT
    drain
    run_worker set-mode REANALYZING --reason "reanalysis snapshot"
    stop_consumers
    RUN_ID="$(run_worker create-run | tail -n 1)"
    trap - EXIT
    echo "REANALYSIS_RUN_ID=$RUN_ID"
    echo "Jalankan: $0 run $RUN_ID"
    ;;
  run)
    RUN_ID="${2:?run membutuhkan RUN_ID}"
    shift 2
    trap recover_on_failure EXIT
    run_worker mark-running "$RUN_ID"
    compose run --rm --no-deps "$WORKER_SERVICE" python -m app.reanalyze_health \
      --run-id "$RUN_ID" --batch-size "${REANALYZE_BATCH_SIZE:-50}" "$@"
    trap - EXIT
    ;;
  finish)
    RUN_ID="${2:?finish membutuhkan RUN_ID}"
    run_worker finish "$RUN_ID"
    start_consumers
    service_exists "$COLLECTOR_SERVICE" && compose start "$COLLECTOR_SERVICE" || true
    ;;
  recover)
    run_worker watchdog-once
    ;;
  status)
    run_worker status
    ;;
  *)
    cat <<'USAGE'
Usage:
  scripts/reanalysis_maintenance.sh start
  scripts/reanalysis_maintenance.sh run <RUN_ID> [reanalyze options]
  scripts/reanalysis_maintenance.sh finish <RUN_ID>
  scripts/reanalysis_maintenance.sh status
  scripts/reanalysis_maintenance.sh recover

Environment:
  COMPOSE_FILE=docker-compose.yml
  COMPOSE_OVERRIDE_FILE=docker-compose-prod.override.yml
  WORKER_SERVICE=disease-worker-python
  DRAIN_TIMEOUT_SECONDS=600
USAGE
    exit 2
    ;;
esac
