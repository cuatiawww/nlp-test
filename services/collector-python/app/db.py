import psycopg
from psycopg.rows import dict_row
from . import config

_conn = None


def get_conn():
    global _conn
    if _conn is None or _conn.closed:
        # Avoid blocking collector startup indefinitely when Postgres is
        # restarting or temporarily unreachable. The CSV watcher can still
        # operate without the source registry connection.
        separator = "&" if "?" in config.DATABASE_URL else "?"
        conninfo = f"{config.DATABASE_URL}{separator}connect_timeout=5"
        _conn = psycopg.connect(conninfo, row_factory=dict_row)
    return _conn


def fetch_sources(source_type=None):
    conn = get_conn()
    if source_type:
        cur = conn.execute(
            "SELECT * FROM collector_sources WHERE enabled = TRUE AND source_type = %s ORDER BY name",
            (source_type,),
        )
    else:
        cur = conn.execute("SELECT * FROM collector_sources WHERE enabled = TRUE ORDER BY name")
    return cur.fetchall()


def fetch_source(source_id: str):
    conn = get_conn()
    cur = conn.execute("SELECT * FROM collector_sources WHERE id = %s", (source_id,))
    return cur.fetchone()


def create_run(source_id: str) -> str:
    conn = get_conn()
    cur = conn.execute(
        "INSERT INTO collector_runs (source_id) VALUES (%s) RETURNING id", (source_id,)
    )
    row = cur.fetchone()
    conn.commit()
    return str(row["id"])


def finish_run(run_id: str, status: str, records_found=0, records_ingested=0, error_message=None):
    conn = get_conn()
    conn.execute(
        "UPDATE collector_runs SET status = %s, records_found = %s, records_ingested = %s, "
        "error_message = %s, finished_at = NOW() WHERE id = %s",
        (status, records_found, records_ingested, error_message, run_id),
    )
    conn.commit()
