"""Hard stage timeout using a terminable child process."""
import multiprocessing
import queue as queue_module


def _run_stage(function, args, result_queue):
    try:
        result_queue.put(("ok", function(*args)))
    except BaseException as exc:
        result_queue.put(("error", f"{type(exc).__name__}: {exc}"))


def bounded_call(function, args, seconds):
    context_name = "fork" if "fork" in multiprocessing.get_all_start_methods() else None
    context = multiprocessing.get_context(context_name) if context_name else multiprocessing.get_context()
    result_queue = context.Queue(maxsize=1)
    process = context.Process(target=_run_stage, args=(function, args, result_queue), daemon=True)
    process.start()
    process.join(seconds)
    try:
        if process.is_alive():
            process.terminate()
            process.join(2)
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
