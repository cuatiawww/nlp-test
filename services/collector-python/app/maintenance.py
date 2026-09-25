"""Small database gate used by collector publishers during re-analysis."""

import json
import logging

from . import config
from .db import get_conn

logger = logging.getLogger(__name__)


def hold_message(queue_name: str, payload: dict) -> bool:
    """Persist a message instead of dropping it while the pipeline is held."""
    try:
        conn = get_conn()
        state = conn.execute(
            "SELECT mode FROM pipeline_control WHERE id=1"
        ).fetchone()
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
        logger.info("Held collector message queue=%s mode=%s", queue_name, current_mode)
        return True
    except Exception:
        # A database failure must not silently drop a message. Let the caller
        # use its existing retry/error path instead.
        logger.exception("Could not persist maintenance-held message")
        raise
