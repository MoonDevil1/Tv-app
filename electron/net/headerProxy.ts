import type { Session } from "electron";

export interface StreamRequestContext {
  originUrl: string;
  headers: Record<string, string>;
  licenseUrl?: string;
  licenseHeaders?: Record<string, string>;
}

type ActiveStreamContext = {
  streamOrigin: string;
  streamHeaders: Record<string, string>;
  licenseEndpoint?: { origin: string; pathname: string; headers: Record<string, string> };
};

let activeContext: ActiveStreamContext | null = null;

const BLOCKED_HEADERS = new Set([
  "host", "content-length", "connection", "transfer-encoding",
  "upgrade", "proxy-authorization", "proxy-connection", "accept-encoding"
]);

function sanitizeHeaders(input: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {};
  if (Object.keys(input).length > 50) throw new TypeError("Too many stream request headers.");
  for (const [rawName, rawValue] of Object.entries(input)) {
    const name = rawName.trim();
    const value = String(rawValue).trim();
    if (!name || name.length > 128 || value.length > 8192 || !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) || /[\r\n]/.test(value)) continue;
    if (BLOCKED_HEADERS.has(name.toLowerCase()) || /^proxy-|^sec-/i.test(name)) continue;
    headers[name] = value;
  }
  return headers;
}

export function setActiveStreamContext(context: StreamRequestContext | null): void {
  if (!context) {
    activeContext = null;
    return;
  }

  const streamUrl = new URL(context.originUrl);
  if (streamUrl.protocol !== "https:" && streamUrl.protocol !== "http:") {
    throw new TypeError("Stream request context must use HTTP or HTTPS.");
  }
  if (!context.headers || typeof context.headers !== "object" || Array.isArray(context.headers)) {
    throw new TypeError("Stream request headers must be an object.");
  }

  let licenseEndpoint: ActiveStreamContext["licenseEndpoint"];
  if (context.licenseUrl) {
    const licenseUrl = new URL(context.licenseUrl);
    if (licenseUrl.protocol !== "https:" && licenseUrl.protocol !== "http:") {
      throw new TypeError("DRM license URL must use HTTP or HTTPS.");
    }
    const licenseHeaders = sanitizeHeaders(context.licenseHeaders ?? {});
    if (Object.keys(licenseHeaders).length) {
      licenseEndpoint = {
        origin: licenseUrl.origin.toLowerCase(),
        pathname: licenseUrl.pathname,
        headers: licenseHeaders
      };
    }
  }

  activeContext = {
    streamOrigin: streamUrl.origin.toLowerCase(),
    streamHeaders: sanitizeHeaders(context.headers),
    licenseEndpoint
  };
}

export function registerHeaderProxy(targetSession: Session): void {
  targetSession.webRequest.onBeforeSendHeaders(
    { urls: ["http://*/*", "https://*/*"] },
    (details, callback) => {
      const context = activeContext;
      if (!context) return callback({ requestHeaders: details.requestHeaders });

      let requestUrl: URL;
      try { requestUrl = new URL(details.url); } catch {
        return callback({ requestHeaders: details.requestHeaders });
      }
      const requestOrigin = requestUrl.origin.toLowerCase();
      const requestHeaders = { ...details.requestHeaders };
      let matched = false;
      const apply = (headers: Record<string, string>) => {
        for (const [name, value] of Object.entries(headers)) {
          const existing = Object.keys(requestHeaders).find(key => key.toLowerCase() === name.toLowerCase());
          if (existing) delete requestHeaders[existing];
          requestHeaders[name] = value;
        }
        matched = true;
      };

      if (requestOrigin === context.streamOrigin) apply(context.streamHeaders);
      const license = context.licenseEndpoint;
      if (license && requestOrigin === license.origin && requestUrl.pathname === license.pathname) {
        apply(license.headers);
      }
      callback({ requestHeaders: matched ? requestHeaders : details.requestHeaders });
    }
  );
}
