"""Identity candidates shared by all database-backed crawler workers."""

from __future__ import annotations

IDENTITY_FIELDS = (
    "url",
    "normalized_url",
    "canonical_url",
    "final_url",
    "url_hash",
    "content_hash",
)


def identity_candidates(payload: dict) -> list[tuple[str, str]]:
    candidates: list[tuple[str, str]] = []
    for field in IDENTITY_FIELDS:
        value = str(payload.get(field) or "").strip()
        if value:
            candidates.append((field, value))
    if not candidates:
        raw_id = str(payload.get("raw_report_id") or "").strip()
        if raw_id:
            candidates.append(("raw_report_id", raw_id))
    return candidates


def identity_lock_keys(payload: dict) -> tuple[str, ...]:
    """Return every identity lock in deterministic order to avoid deadlocks."""
    return tuple(
        sorted(
            {
                f"crawler-document:{field}:{value}"
                if field != "raw_report_id"
                else f"crawler-raw:{value}"
                for field, value in identity_candidates(payload)
            }
        )
    )


def identity_where_clause(payload: dict, alias: str = "rr") -> tuple[str, list[str]]:
    """Build a parameterized match predicate for the raw identity columns."""
    clauses: list[str] = []
    params: list[str] = []
    for field, value in identity_candidates(payload):
        if field == "raw_report_id":
            clauses.append(f"{alias}.id = %s")
        else:
            clauses.append(f"{alias}.{field} = %s")
        params.append(value)
    return " OR ".join(clauses) or "FALSE", params
