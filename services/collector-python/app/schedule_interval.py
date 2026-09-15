def source_interval_minutes(schedule: str | None, default_interval_minutes: int = 60) -> int:
    """Parse collector_sources.schedule into a due-window in minutes.

    Empty schedules use the dispatcher default. ``interval:120`` stays 120 so
    ACTIVE sources with an explicit frequency are still worked, not skipped.
    """
    default = max(15, int(default_interval_minutes))
    raw = str(schedule or "").strip()
    if not raw:
        return default
    if raw.startswith("interval:"):
        try:
            return max(15, int(raw.split(":", 1)[1]))
        except ValueError:
            return default
    if raw.startswith("daily:"):
        return 24 * 60
    return default
