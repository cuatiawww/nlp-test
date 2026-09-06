"""Hard timeout with thread execution."""
import concurrent.futures

def bounded_call(function, args, seconds):
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(function, *args)
        try:
            return future.result(timeout=seconds)
        except concurrent.futures.TimeoutError:
            raise TimeoutError(f"Stage exceeded time budget ({seconds}s)")
