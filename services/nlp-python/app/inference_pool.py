"""Bounded async inference workers so analyze-url does not block on a full slot."""
from __future__ import annotations

import os
import queue
import threading
import time
import uuid
from concurrent.futures import Future
from typing import Any, Callable


def _worker_count() -> int:
    return max(1, min(int(os.getenv("NLP_INFERENCE_CONCURRENCY", "2")), 4))


def _queue_limit() -> int:
    return max(1, min(int(os.getenv("NLP_INFERENCE_QUEUE", "16")), 64))


class InferencePool:
    def __init__(self, workers: int | None = None, queue_limit: int | None = None):
        self.worker_names = [chr(ord("A") + index) for index in range(workers or _worker_count())]
        self.queue_limit = queue_limit or _queue_limit()
        self._queue: queue.Queue[tuple[str, Callable[[], Any], Future]] = queue.Queue(maxsize=self.queue_limit)
        self._busy: dict[str, str | None] = {name: None for name in self.worker_names}
        self._jobs: dict[str, dict[str, Any]] = {}
        self._lock = threading.Lock()
        for name in self.worker_names:
            thread = threading.Thread(target=self._run, args=(name,), name=f"nlp-worker-{name}", daemon=True)
            thread.start()

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            workers = [
                {
                    "id": name,
                    "label": f"NLP {name}",
                    "status": "busy" if self._busy[name] else "idle",
                    "job_id": self._busy[name],
                }
                for name in self.worker_names
            ]
        return {
            "workers": workers,
            "queue_depth": self._queue.qsize(),
            "queue_limit": self.queue_limit,
            "busy_count": sum(1 for item in workers if item["status"] == "busy"),
        }

    def submit(self, fn: Callable[[], Any]) -> str | None:
        job_id = str(uuid.uuid4())
        future: Future = Future()
        with self._lock:
            self._jobs[job_id] = {
                "status": "queued",
                "worker": None,
                "created_at": time.time(),
                "future": future,
            }
        try:
            self._queue.put_nowait((job_id, fn, future))
        except queue.Full:
            with self._lock:
                self._jobs.pop(job_id, None)
            return None
        return job_id

    def get(self, job_id: str) -> dict[str, Any] | None:
        with self._lock:
            row = self._jobs.get(job_id)
            return dict(row) if row else None

    def result(self, job_id: str, timeout: float) -> Any:
        row = self.get(job_id)
        if not row:
            raise KeyError(job_id)
        future: Future = row["future"]
        return future.result(timeout=timeout)

    def submit_and_wait(self, fn: Callable[[], Any], timeout: float) -> Any:
        job_id = self.submit(fn)
        if job_id is None:
            raise queue.Full
        row = self.get(job_id)
        if not row:
            raise KeyError(job_id)
        return row["future"].result(timeout=timeout)

    def _run(self, name: str) -> None:
        while True:
            job_id, fn, future = self._queue.get()
            with self._lock:
                self._busy[name] = job_id
                job = self._jobs.get(job_id)
                if job is not None:
                    job["status"] = "running"
                    job["worker"] = name
                    job["future"] = future
            try:
                value = fn()
            except Exception as exc:
                with self._lock:
                    job = self._jobs.get(job_id)
                    if job is not None:
                        job["status"] = "error"
                        job["error"] = f"{type(exc).__name__}: {exc}"
                future.set_exception(exc)
            else:
                with self._lock:
                    job = self._jobs.get(job_id)
                    if job is not None:
                        job["status"] = "done"
                        job["result"] = value
                future.set_result(value)
            finally:
                with self._lock:
                    self._busy[name] = None
                self._queue.task_done()


POOL = InferencePool()
