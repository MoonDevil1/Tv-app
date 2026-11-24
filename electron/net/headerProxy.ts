import type { Session } from "electron";

export interface StreamRequestContext {
  originUrl: string;
  headers: Record<string, string>;
}

let activeContext: { origins: Set<string>; headers: Record<string, string> } | null = null;

const BLOCKED_HEADERS = new Set([
  "host", "content-length", "connection", "transfer-encoding",
  "upgrade", "proxy-authorization", "proxy-connection", "accept-encoding"
]);

export function setActiveStreamContext(context: StreamRequestContext | null): void {
  if (!context) {
    activeContext = null;
    return;
  }

  const origin = new URL(context.originUrl);
  if (origin.protocol !== "https:" && origin.protocol !== "http:") {
    throw new TypeError("Stream request context must use HTTP or HTTPS.");
  }
  if (!context.headers || typeof context.headers !== "object" || Array.isArray(context.headers)) {
    throw new TypeError("Stream request headers must be an object.");
  }
  if (Object.keys(context.headers).length > 50) throw new TypeError("Too many stream request headers.");

  const headers: Record<string, string> = {};
  for (const [rawName, rawValue] of Object.entries(context.headers)) {
    const name = rawName.trim();
    const value = String(rawValue).trim();
    if (!name || name.length > 128 || value.length > 8192 || /[\r\n:]/.test(name) || /[\r\n]/.test(value)) continue;
    if (BLOCKED_HEADERS.has(name.toLowerCase()) || /^proxy-|^sec-/i.test(name)) continue;
    headers[name] = value;
  }

  activeContext = { origins: new Set([origin.origin.toLowerCase()]), headers };
}

function isActiveStreamOrigin(url: string): boolean {
  if (!activeContext) return false;
  try { return activeContext.origins.has(new URL(url).origin.toLowerCase()); }
  catch { return false; }
}

function setResponseHeader(headers: Record<string, string[]>, name: string, value: string): void {
  const existing = Object.keys(headers).find(key => key.toLowerCase() === name.toLowerCase());
  if (existing) delete headers[existing];
  headers[name] = [value];
}

export function registerHeaderProxy(targetSession: Session): void {
  const filter = { urls: ["http://*/*", "https://*/*"] };
  targetSession.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
    if (!isActiveStreamOrigin(details.url)) return callback({ requestHeaders: details.requestHeaders });

    const requestHeaders = { ...details.requestHeaders };
    const configuredOrigin = Object.keys(activeContext?.headers ?? {}).some(name => name.toLowerCase() === "origin");
    if (!configuredOrigin) {
      const browserOrigin = Object.keys(requestHeaders).find(name => name.toLowerCase() === "origin");
      if (browserOrigin) delete requestHeaders[browserOrigin];
    }
    for (const [name, value] of Object.entries(activeContext?.headers ?? {})) {
      const existing = Object.keys(requestHeaders).find(key => key.toLowerCase() === name.toLowerCase());
      if (existing) delete requestHeaders[existing];
      requestHeaders[name] = value;
    }
    callback({ requestHeaders });
  });

  // Native players are not subject to browser CORS. Scope the equivalent response
  // permission to the one active stream origin so Shaka/HLS can read its manifests
  // and media segments without disabling Electron webSecurity globally.
  targetSession.webRequest.onHeadersReceived(filter, (details, callback) => {
    if (!isActiveStreamOrigin(details.url)) return callback({ responseHeaders: details.responseHeaders });
    const responseHeaders = { ...(details.responseHeaders ?? {}) };
    setResponseHeader(responseHeaders, "Access-Control-Allow-Origin", "*");
    setResponseHeader(responseHeaders, "Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    setResponseHeader(responseHeaders, "Access-Control-Allow-Headers", "Accept, Authorization, Content-Type, Range, X-Requested-With");
    setResponseHeader(responseHeaders, "Access-Control-Expose-Headers", "Accept-Ranges, Content-Length, Content-Range, Date, ETag");
    setResponseHeader(responseHeaders, "Access-Control-Max-Age", "600");
    callback({ responseHeaders });
  });
}
