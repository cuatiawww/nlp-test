"""KPI snapshot invalidation and Mapped Locations metric helpers.

Headline dashboard cards read ``kpi_snapshots``. Crawl/URL workers insert
``disease_events`` directly, so they must mark those rows stale (a DB trigger
does the same). Mapped Locations is distinct mappable place names in the
ASEAN-11 KPI set — not the gazetteer master count and not a crawl counter.
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

ASEAN11_MEMBERS = frozenset(
    {
        "Brunei",
        "Cambodia",
        "Indonesia",
        "Laos",
        "Malaysia",
        "Myanmar",
        "Philippines",
        "Singapore",
        "Thailand",
        "Timor-Leste",
        "Vietnam",
    }
)

MARK_KPI_STALE_SQL = "UPDATE kpi_snapshots SET is_stale = TRUE WHERE is_stale = FALSE"


def mark_kpi_snapshots_stale(conn) -> bool:
    """Mark stored KPI totals stale without aborting the ingest transaction."""
    try:
        conn.execute("SAVEPOINT abvc_kpi_stale")
        conn.execute(MARK_KPI_STALE_SQL)
        conn.execute("RELEASE SAVEPOINT abvc_kpi_stale")
        return True
    except Exception as exc:
        try:
            conn.execute("ROLLBACK TO SAVEPOINT abvc_kpi_stale")
        except Exception:
            pass
        logger.warning("KPI snapshot invalidation skipped: %s", exc)
        return False


def nlp_needs_review(nlp: dict | None) -> bool:
    """True when extraction or geocode is incomplete — never invent a pin."""
    payload = nlp or {}
    if payload.get("needs_review") or payload.get("geocode_needs_review"):
        return True
    lat, lon = payload.get("latitude"), payload.get("longitude")
    if payload.get("location_name") and (lat is None or lon is None):
        return True
    return False


def is_mappable_kpi_location(
    location_name,
    mapped_latitude,
    mapped_longitude,
    resolved_country,
) -> bool:
    """Whether a dashboard-valid event contributes to Mapped Locations."""
    name = (location_name or "").strip()
    if not name:
        return False
    if mapped_latitude is None or mapped_longitude is None:
        return False
    return (resolved_country or "").strip() in ASEAN11_MEMBERS


def mapped_location_count(events) -> int:
    """Distinct mappable ASEAN-11 location_name values (KPI card semantics)."""
    names = set()
    for event in events:
        if is_mappable_kpi_location(
            event.get("location_name"),
            event.get("mapped_latitude"),
            event.get("mapped_longitude"),
            event.get("resolved_country"),
        ):
            names.add(event["location_name"].strip())
    return len(names)
