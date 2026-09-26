"""Resolve Hugging Face snapshots from the mounted /app/models cache."""
from __future__ import annotations

import os
from pathlib import Path


WEIGHT_NAMES = (
    "model.safetensors",
    "pytorch_model.bin",
    "model.safetensors.index.json",
    "pytorch_model.bin.index.json",
)


def _cache_roots() -> list[Path]:
    roots: list[Path] = []
    for value in (
        os.getenv("HF_HUB_CACHE"),
        os.getenv("HF_HOME"),
        os.getenv("TRANSFORMERS_CACHE"),
        "/app/models",
        "/app/models/hub",
    ):
        if not value:
            continue
        path = Path(value)
        if path not in roots:
            roots.append(path)
        hub = path / "hub"
        if hub not in roots:
            roots.append(hub)
    return roots


def _repo_dir_name(model_id: str) -> str:
    return "models--" + model_id.replace("/", "--")


def _snapshot_is_usable(snapshot: Path) -> bool:
    if not (snapshot / "config.json").is_file():
        return False
    return any((snapshot / name).is_file() for name in WEIGHT_NAMES)


def _newest_usable_snapshot(repo_dir: Path) -> Path | None:
    snapshot_root = repo_dir / "snapshots"
    if not snapshot_root.is_dir():
        return None
    snapshots = sorted(snapshot_root.iterdir(), key=lambda item: item.stat().st_mtime, reverse=True)
    for snapshot in snapshots:
        if snapshot.is_dir() and _snapshot_is_usable(snapshot):
            return snapshot
    return None


def resolve_local_model_path(model_id: str) -> str:
    """Return a local snapshot path, or the original id if none exists."""
    raw = (model_id or "").strip()
    if not raw:
        return raw
    candidate = Path(raw)
    if candidate.is_dir() and ((candidate / "config.json").is_file() or _snapshot_is_usable(candidate)):
        return str(candidate)
    repo_name = _repo_dir_name(raw) if "/" in raw else raw
    if not repo_name.startswith("models--") and "/" not in raw:
        repo_name = "models--" + raw
    for root in _cache_roots():
        for repo_dir in (root / repo_name, root / _repo_dir_name(raw)):
            snapshot = _newest_usable_snapshot(repo_dir)
            if snapshot is not None:
                return str(snapshot)
    return raw


def local_model_available(model_id: str) -> bool:
    resolved = resolve_local_model_path(model_id)
    return bool(resolved) and resolved != model_id and Path(resolved).is_dir()
