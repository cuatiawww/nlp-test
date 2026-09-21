"""Hard stage timeout using a terminable child process or in-process execution."""
import multiprocessing
import os
import queue as queue_module
import threading
import time

DEFAULT_ISOLATION = "process"


def remaining_inference_budget(elapsed_seconds, request_timeout, overhead=15):
    """Seconds left for inference after fetch/translation and HTTP overhead."""
    try:
        remaining = float(request_timeout) - float(elapsed_seconds) - float(overhead)
    except (TypeError, ValueError):
        remaining = 1
    return max(1, int(remaining))


def stage_isolation():
    return os.getenv("NLP_STAGE_ISOLATION", DEFAULT_ISOLATION).strip().lower()


def _run_stage(function, args, result_queue):
    try:
        result_queue.put(("ok", function(*args)))
    except BaseException as exc:
        result_queue.put(("error", f"{type(exc).__name__}: {exc}"))


class StageJobTracker:
    """Thread-safe active job tracker for killability and stale recovery."""

    def __init__(self):
        self._lock = threading.Lock()
        self.active_process = None
        self.active_start = 0.0
        self.active_id = None

    def set_active(self, job_id, process=None):
        with self._lock:
            self.active_id = job_id
            self.active_start = time.monotonic()
            self.active_process = process

    def clear_active(self):
        with self._lock:
            self.active_id = None
            self.active_start = 0.0
            self.active_process = None

    def recover_if_stale(self, max_seconds):
        with self._lock:
            if self.active_id and (time.monotonic() - self.active_start > max_seconds):
                if self.active_process and self.active_process.is_alive():
                    try:
                        self.active_process.terminate()
                        self.active_process.join(0.5)
                        if self.active_process.is_alive():
                            self.active_process.kill()
                            self.active_process.join(0.5)
                    except Exception:
                        pass
                self.active_id = None
                self.active_start = 0.0
                self.active_process = None
                return True
            return False


GLOBAL_STAGE_TRACKER = StageJobTracker()


def bounded_call(function, args, seconds, isolation=None, job_id=None):
    mode = (isolation or stage_isolation()).strip().lower()
    if mode in {"inprocess", "in-process", "thread"}:
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(function, *args)
            try:
                return future.result(timeout=seconds)
            except concurrent.futures.TimeoutError as exc:
                raise TimeoutError(f"Stage exceeded time budget ({seconds}s)") from exc

    context_name = "fork" if "fork" in multiprocessing.get_all_start_methods() else None
    context = multiprocessing.get_context(context_name) if context_name else multiprocessing.get_context()
    result_queue = context.Queue(maxsize=1)
    process = context.Process(target=_run_stage, args=(function, args, result_queue), daemon=True)
    if job_id:
        GLOBAL_STAGE_TRACKER.set_active(job_id, process)
    process.start()
    process.join(seconds)
    try:
        if process.is_alive():
            process.terminate()
            process.join(0.5)
            if process.is_alive():
                process.kill()
                process.join(0.5)
            raise TimeoutError(f"Stage exceeded time budget ({seconds}s)")

        try:
            status, value = result_queue.get(timeout=0.5)
        except queue_module.Empty:
            raise RuntimeError(f"Stage exited without a result (exit code {process.exitcode})")
        if status == "error":
            raise RuntimeError(value)
        return value
    finally:
        if job_id:
            GLOBAL_STAGE_TRACKER.clear_active()
        result_queue.close()
        result_queue.join_thread()
