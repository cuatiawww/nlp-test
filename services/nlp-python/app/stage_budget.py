"""Hard stage timeout using a terminable child process or in-process execution."""
import multiprocessing
import os
import queue as queue_module

DEFAULT_ISOLATION = "inprocess"


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


def bounded_call(function, args, seconds, isolation=None):
    mode = (isolation or stage_isolation()).strip().lower()
    if mode in {"inprocess", "in-process", "thread"}:
        # Interactive URL analysis loads HuggingFace pipelines in the parent
        # FastAPI worker. Forking after that load copies the tokenizer thread
        # pool in a bad state and routinely deadlocks until the 90s killer
        # returns HTTP 408. Run in-process so warmed models are reused; the
        # worker HTTP timeout remains the outer deadline.
        return function(*args)

    context_name = "fork" if "fork" in multiprocessing.get_all_start_methods() else None
    context = multiprocessing.get_context(context_name) if context_name else multiprocessing.get_context()
    result_queue = context.Queue(maxsize=1)
    process = context.Process(target=_run_stage, args=(function, args, result_queue), daemon=True)
    process.start()
    process.join(seconds)
    try:
        if process.is_alive():
            process.terminate()
            process.join(1)
            if process.is_alive():
                process.kill()
                process.join(1)
            raise TimeoutError(f"Stage exceeded time budget ({seconds}s)")

        try:
            status, value = result_queue.get(timeout=1)
        except queue_module.Empty:
            raise RuntimeError(f"Stage exited without a result (exit code {process.exitcode})")
        if status == "error":
            raise RuntimeError(value)
        return value
    finally:
        result_queue.close()
        result_queue.join_thread()
