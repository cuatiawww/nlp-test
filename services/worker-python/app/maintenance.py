"""Persistent maintenance gate and durable message hold/release commands."""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
import uuid

import pika
import psycopg
from psycopg.rows import dict_row

from .queue_reliability import declare_queue_topology

DATABASE_URL = os.getenv("DATABASE_URL", "postgres://postgres:root@host.docker.internal:9898/disease_ai")
RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/%2f")
logger = logging.getLogger("pipeline-maintenance")


def connect():
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)


def get_state(conn):
    return conn.execute("SELECT * FROM pipeline_control WHERE id=1").fetchone()


def mode(conn) -> str:
    row = get_state(conn)
    return str(row["mode"] if row else "RUNNING").upper()


def current_mode() -> str:
    try:
        with connect() as conn:
            return mode(conn)
    except Exception:
        # A DB outage must not turn a worker callback into an infinite
        # requeue loop. The normal worker DB path will fail safely and retry.
        return "RUNNING"


def processing_held() -> bool:
    return current_mode() in {"REANALYZING", "RESUMING"}


def set_mode(value: str, *, reason: str = "", operation_id: str | None = None) -> None:
    target = value.upper()
    if target not in {"RUNNING", "DRAINING", "REANALYZING", "RESUMING"}:
        raise ValueError(f"Invalid pipeline mode: {value}")
    with connect() as conn:
        current = get_state(conn)
        current_mode = str(current["mode"] if current else "RUNNING").upper()
        allowed = {
            "RUNNING": {"DRAINING", "RUNNING"},
            "DRAINING": {"REANALYZING", "RUNNING", "DRAINING"},
            "REANALYZING": {"RESUMING", "REANALYZING"},
            "RESUMING": {"RUNNING", "RESUMING"},
        }
        if target not in allowed[current_mode]:
            raise RuntimeError(f"Invalid maintenance transition {current_mode} -> {target}")
        conn.execute(
            """
            UPDATE pipeline_control
               SET mode=%s, operation_id=COALESCE(%s::uuid, operation_id),
                   reason=%s, updated_by=%s, updated_at=NOW()
             WHERE id=1
            """,
            (target, operation_id, reason[:500], os.getenv("HOSTNAME", "maintenance")),
        )
        conn.commit()
    logger.info("Pipeline mode: %s -> %s", current_mode, target)


def hold_message(queue_name: str, payload: dict) -> bool:
    """Store a new message while maintenance is active; return whether held."""
    with connect() as conn:
        state = get_state(conn)
        current_mode = str(state["mode"] if state else "RUNNING").upper()
        if current_mode == "RUNNING":
            return False
        conn.execute(
            """
            INSERT INTO pipeline_maintenance_messages(queue_name, payload)
            VALUES (%s, %s::jsonb)
            """,
            (queue_name, json.dumps(payload, default=str, ensure_ascii=False)),
        )
        conn.commit()
        logger.info("Held message queue=%s mode=%s", queue_name, current_mode)
        return True


def _publish_held_messages(batch_size: int = 100) -> int:
    published = 0
    connection = pika.BlockingConnection(pika.URLParameters(RABBITMQ_URL))
    channel = connection.channel()
    channel.confirm_delivery()
    try:
        with connect() as conn:
            while True:
                rows = conn.execute(
                    """
                    SELECT id, queue_name, payload
                      FROM pipeline_maintenance_messages
                     WHERE status='pending'
                     ORDER BY created_at, id
                     LIMIT %s
                     FOR UPDATE SKIP LOCKED
                    """,
                    (batch_size,),
                ).fetchall()
                if not rows:
                    break
                queues = tuple(dict.fromkeys(str(row["queue_name"]) for row in rows))
                declare_queue_topology(channel, queues)
                for row in rows:
                    try:
                        ok = channel.basic_publish(
                            "", row["queue_name"],
                            json.dumps(row["payload"], default=str, ensure_ascii=False),
                            properties=pika.BasicProperties(
                                delivery_mode=2,
                                content_type="application/json",
                            ),
                            mandatory=True,
                        )
                        if ok is False:
                            raise RuntimeError("RabbitMQ publish was not confirmed")
                        conn.execute(
                            """
                            UPDATE pipeline_maintenance_messages
                               SET status='published', published_at=NOW(), updated_at=NOW()
                             WHERE id=%s
                            """,
                            (row["id"],),
                        )
                        published += 1
                    except Exception as exc:
                        conn.execute(
                            """
                            UPDATE pipeline_maintenance_messages
                               SET attempts=attempts+1, last_error=%s, updated_at=NOW()
                             WHERE id=%s
                            """,
                            (str(exc)[:500], row["id"]),
                        )
                        conn.commit()
                        raise
                conn.commit()
    finally:
        connection.close()
    return published


def create_run() -> str:
    with connect() as conn:
        state = get_state(conn)
        if not state or str(state["mode"]).upper() != "REANALYZING":
            raise RuntimeError("Pipeline must be in REANALYZING mode before creating a run")
        snapshot = conn.execute("SELECT NOW() AS value").fetchone()["value"]
        row = conn.execute(
            """
            INSERT INTO reanalysis_runs(snapshot_at, status, total_items)
            SELECT %s, 'created', COUNT(*)
              FROM disease_events
             WHERE is_health_related IS TRUE
               AND created_at <= %s
            RETURNING id
            """,
            (snapshot, snapshot.replace(tzinfo=None) if snapshot.tzinfo else snapshot),
        ).fetchone()
        run_id = str(row["id"])
        conn.execute(
            "UPDATE pipeline_control SET operation_id=%s, snapshot_at=%s, updated_at=NOW() WHERE id=1",
            (run_id, snapshot),
        )
        conn.commit()
    print(run_id)
    return run_id


def status() -> None:
    with connect() as conn:
        state = get_state(conn)
        run = conn.execute(
            "SELECT * FROM reanalysis_runs ORDER BY created_at DESC LIMIT 1"
        ).fetchone()
        held = conn.execute(
            "SELECT COUNT(*) AS count FROM pipeline_maintenance_messages WHERE status='pending'"
        ).fetchone()["count"]
    print(json.dumps({"pipeline": dict(state) if state else None, "run": dict(run) if run else None, "held_messages": held}, default=str, ensure_ascii=False, indent=2))


def mark_run_running(run_id: str) -> None:
    with connect() as conn:
        result = conn.execute(
            "UPDATE reanalysis_runs SET status='running', started_at=COALESCE(started_at,NOW()), updated_at=NOW() WHERE id=%s AND status IN ('created','running')",
            (run_id,),
        )
        conn.commit()
        if result.rowcount != 1:
            raise RuntimeError(f"Reanalysis run is not runnable: {run_id}")


def finish(run_id: str, force: bool = False) -> None:
    with connect() as conn:
        run = conn.execute("SELECT status FROM reanalysis_runs WHERE id=%s", (run_id,)).fetchone()
        if not run:
            raise RuntimeError(f"Unknown reanalysis run: {run_id}")
        if run["status"] != "completed" and not force:
            raise RuntimeError(f"Run {run_id} is {run['status']}; refusing to release pending data")
        if force and run["status"] != "completed":
            conn.execute(
                "UPDATE reanalysis_runs SET status='failed', error=COALESCE(error,'forced recovery after crash'), finished_at=NOW(), updated_at=NOW() WHERE id=%s",
                (run_id,),
            )
            conn.commit()
    set_mode("RESUMING", reason=f"release reanalysis {run_id}", operation_id=run_id)
    count = _publish_held_messages()
    set_mode("RUNNING", reason=f"reanalysis {run_id} released {count} held messages", operation_id=run_id)
    logger.info("Released held messages: %d", count)


def watchdog_once(stale_seconds: int = 300) -> bool:
    """Recover a run whose reanalysis process died without running its trap."""
    with connect() as conn:
        state = get_state(conn)
        if not state or str(state["mode"]).upper() != "REANALYZING" or not state["operation_id"]:
            return False
        run = conn.execute(
            "SELECT id, status, updated_at FROM reanalysis_runs WHERE id=%s",
            (state["operation_id"],),
        ).fetchone()
        if not run or run["status"] not in {"created", "running"}:
            return False
        stale = conn.execute(
            "SELECT (%s::timestamptz < NOW() - (%s || ' seconds')::interval) AS value",
            (run["updated_at"], stale_seconds),
        ).fetchone()["value"]
    if not stale:
        return False
    logger.error("Recovering stale reanalysis run after %ss: %s", stale_seconds, run["id"])
    finish(str(run["id"]), force=True)
    return True


def watchdog() -> None:
    stale_seconds = max(60, int(os.getenv("REANALYSIS_STALE_SECONDS", "300")))
    while True:
        try:
            watchdog_once(stale_seconds)
        except Exception:
            logger.exception("Maintenance watchdog check failed")
        time.sleep(15)


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    mode_parser = sub.add_parser("set-mode")
    mode_parser.add_argument("mode", choices=["RUNNING", "DRAINING", "REANALYZING", "RESUMING"])
    mode_parser.add_argument("--reason", default="")
    mode_parser.add_argument("--operation-id", default=None)
    sub.add_parser("create-run")
    sub.add_parser("status")
    running = sub.add_parser("mark-running")
    running.add_argument("run_id")
    done = sub.add_parser("finish")
    done.add_argument("run_id")
    done.add_argument("--force", action="store_true")
    sub.add_parser("release-held")
    watchdog_once_parser = sub.add_parser("watchdog-once")
    watchdog_once_parser.add_argument(
        "--stale-seconds",
        type=int,
        default=int(os.getenv("REANALYSIS_STALE_SECONDS", "300")),
    )
    sub.add_parser("watchdog")
    return parser.parse_args()


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    args = parse_args()
    if args.command == "set-mode":
        set_mode(args.mode, reason=args.reason, operation_id=args.operation_id)
    elif args.command == "create-run":
        create_run()
    elif args.command == "status":
        status()
    elif args.command == "mark-running":
        mark_run_running(args.run_id)
    elif args.command == "finish":
        finish(args.run_id, force=args.force)
    elif args.command == "release-held":
        print(_publish_held_messages())
    elif args.command == "watchdog":
        watchdog()
    elif args.command == "watchdog-once":
        watchdog_once(stale_seconds=max(60, args.stale_seconds))
    return 0


if __name__ == "__main__":
    sys.exit(main())
