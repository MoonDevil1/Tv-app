const MAX_REDIRECTS = 5;
const DEFAULT_MAX_BYTES = 32 * 1024 * 1024;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const BLOCKED_HEADERS = new Set([
  "host", "content-length", "connection", "transfer-encoding", "upgrade",
  "proxy-authorization", "proxy-connection", "origin", "cookie"
]);

export interface RemoteTextResult {
  text: string;
  url: string;
  status: number;
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

function validateHttpUrl(value: string): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("A valid HTTP or HTTPS URL is required."); }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only HTTP and HTTPS remote sources are supported.");
  }
  if (url.username || url.password) throw new Error("URLs containing embedded credentials are not supported.");
  return url;
}

function safeHeaders(input?: Record<string, string>): Headers {
  const headers = new Headers();
  for (const [rawName, rawValue] of Object.entries(input ?? {})) {
    const name = rawName.trim();
    const value = String(rawValue);
    if (!name || /[\\r\\n:]/.test(name) || /[\\r\\n]/.test(value)) continue;
    if (BLOCKED_HEADERS.has(name.toLowerCase())) continue;
    headers.set(name, value);
  }
  return headers;
}

async function readLimited(response: Response, maxBytes: number): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > maxBytes) throw new Error(`Remote response is too large (limit ${Math.round(maxBytes / 1024 / 1024)} MB).`);
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error(`Remote response is too large (limit ${Math.round(maxBytes / 1024 / 1024)} MB).`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder("utf-8").decode(bytes);
}

export async function fetchRemoteText(
  input: string,
  options: { headers?: Record<string, string>; timeoutMs?: number; maxBytes?: number } = {},
  fetcher: FetchLike = (url, init) => fetch(url, init)
): Promise<RemoteTextResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("Remote request timed out.")), options.timeoutMs ?? 20000);
  let current = validateHttpUrl(input);
  let headers = safeHeaders(options.headers);
  try {
    for (let redirects = 0; ; redirects++) {
      const response = await fetcher(current.toString(), {
        method: "GET", headers, redirect: "manual", cache: "no-store", signal: controller.signal
      });
      if (REDIRECT_STATUSES.has(response.status)) {
        if (redirects >= MAX_REDIRECTS) throw new Error("Remote source redirected too many times.");
        const location = response.headers.get("location");
        if (!location) throw new Error("Remote source returned an invalid redirect.");
        const next = validateHttpUrl(new URL(location, current).toString());
        if (next.origin !== current.origin) {
          headers.delete("authorization");
          headers.delete("proxy-authorization");
        }
        current = next;
        continue;
      }
      if (!response.ok) throw new Error(`Remote request failed: HTTP ${response.status}.`);
      const text = await readLimited(response, options.maxBytes ?? DEFAULT_MAX_BYTES);
      return { text, url: current.toString(), status: response.status };
    }
  } catch (error) {
    if (controller.signal.aborted) throw new Error("Remote request timed out.");
    throw error instanceof Error ? error : new Error(String(error));
  } finally {
    clearTimeout(timeout);
  }
}
