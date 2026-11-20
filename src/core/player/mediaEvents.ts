export function waitForMediaEvent(
  target: EventTarget,
  successEvent: string,
  errorEvent: string,
  timeoutMs = 20_000,
  errorMessage = "Media loading timed out."
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeout);
      target.removeEventListener(successEvent, onSuccess);
      target.removeEventListener(errorEvent, onError);
    };
    const onSuccess = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new Error(errorMessage)); };
    const timeout = setTimeout(() => { cleanup(); reject(new Error(errorMessage)); }, timeoutMs);
    target.addEventListener(successEvent, onSuccess, { once: true });
    target.addEventListener(errorEvent, onError, { once: true });
  });
}
