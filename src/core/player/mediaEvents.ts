export function waitForMediaEvent(
  target: EventTarget,
  successEvent: string,
  errorEvent: string,
  timeoutMs: number,
  message: string,
  signal?: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      if (timeout) clearTimeout(timeout);
      target.removeEventListener(successEvent, onSuccess);
      target.removeEventListener(errorEvent, onError);
      signal?.removeEventListener("abort", onAbort);
    };
    const onSuccess = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new Error(message)); };
    const onAbort = () => {
      cleanup();
      const error = new Error("Media operation was cancelled.");
      error.name = "AbortError";
      reject(error);
    };
    if (signal?.aborted) { onAbort(); return; }
    timeout = setTimeout(() => { cleanup(); reject(new Error(message)); }, timeoutMs);
    target.addEventListener(successEvent, onSuccess, { once: true });
    target.addEventListener(errorEvent, onError, { once: true });
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
