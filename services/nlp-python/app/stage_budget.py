"""Hard timeout with child termination; no abandoned inference thread."""
import multiprocessing

def _invoke(send, function, args):
    try:
        send.send((True, function(*args)))
    except Exception as exc:
        send.send((False, type(exc).__name__ + ": " + str(exc)))
    finally:
        send.close()

def bounded_call(function, args, seconds):
    context = multiprocessing.get_context("spawn")
    receive, send = context.Pipe(duplex=False)
    process = context.Process(target=_invoke, args=(send, function, args), daemon=True)
    process.start()
    send.close()
    try:
        if not receive.poll(seconds):
            raise TimeoutError("Stage exceeded time budget")
        ok, result = receive.recv()
        if not ok:
            raise RuntimeError(result)
        return result
    finally:
        receive.close()
        process.join(0.1)
        if process.is_alive():
            process.terminate()
            process.join(1)
        if process.is_alive():
            process.kill()
            process.join()
