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

export function registerHeaderProxy(targetSession: Session): void {
  targetSession.webRequest.onBeforeSendHeaders(
    { urls: ["http://*/*", "https://*/*"] },
    (details, callback) => {
      const context = activeContext;
      if (!context) return callback({ requestHeaders: details.requestHeaders });

      let requestOrigin = "";
      try { requestOrigin = new URL(details.url).origin.toLowerCase(); } catch {
        return callback({ requestHeaders: details.requestHeaders });
      }
      if (!context.origins.has(requestOrigin)) {
        return callback({ requestHeaders: details.requestHeaders });
      }

      const requestHeaders = { ...details.requestHeaders };
      for (const [name, value] of Object.entries(context.headers)) {
        const existing = Object.keys(requestHeaders).find(key => key.toLowerCase() === name.toLowerCase());
        if (existing) delete requestHeaders[existing];
        requestHeaders[name] = value;
      }
      callback({ requestHeaders });
    }
  );
}
