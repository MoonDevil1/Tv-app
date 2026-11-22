import type { Channel, DrmConfig, StreamHeaders } from "../types";

const BLOCKED_HEADERS = /^(?:accept-encoding|connection|content-length|cookie|host|origin|referer|te|trailer|transfer-encoding|upgrade|user-agent|proxy-|sec-)/i;

function originOf(value: string | undefined): string {
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin.toLowerCase() : "";
  } catch {
    return "";
  }
}

function safeHeaders(headers?: StreamHeaders): StreamHeaders {
  const result: StreamHeaders = {};
  for (const [name, value] of Object.entries(headers ?? {})) {
    if (!name.trim() || BLOCKED_HEADERS.test(name) || /[\r\n:]/.test(name) || /[\r\n]/.test(String(value))) continue;
    result[name] = String(value);
  }
  return result;
}

/** Stream credentials are sent only to the manifest's origin, never arbitrary CDN hosts. */
export function streamHeadersForRequest(channel: Channel, requestUrl: string): StreamHeaders {
  return originOf(channel.url) && originOf(channel.url) === originOf(requestUrl) ? safeHeaders(channel.headers) : {};
}

/** License credentials are isolated to the configured license server. */
export function licenseHeadersForRequest(drm: DrmConfig | undefined, requestUrl: string): StreamHeaders {
  return drm?.licenseUrl && originOf(drm.licenseUrl) === originOf(requestUrl) ? safeHeaders(drm.licenseHeaders) : {};
}

export function headersForRequestUris(
  uris: readonly string[],
  resolve: (uri: string) => StreamHeaders
): StreamHeaders {
  if (!uris.length) return {};
  const candidates = uris.map(resolve);
  const signature = (headers: StreamHeaders) => JSON.stringify(Object.entries(headers).sort(([a], [b]) => a.localeCompare(b)));
  const first = signature(candidates[0]);
  return candidates.every(candidate => signature(candidate) === first) ? candidates[0] : {};
}

function base64UrlToHex(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  if (binary.length !== 16) throw new TypeError("ClearKey values must encode exactly 128 bits.");
  return Array.from(binary, byte => byte.charCodeAt(0).toString(16).padStart(2, "0")).join("");
}

export function shakaDrmConfiguration(drm: DrmConfig | undefined): { drm?: { clearKeys?: Record<string, string>; servers?: Record<string, string> } } {
  if (!drm) return {};
  if (drm.scheme === "clearkey" && drm.clearKeys && Object.keys(drm.clearKeys).length) {
    const clearKeys = Object.fromEntries(Object.entries(drm.clearKeys).map(([id, key]) => [base64UrlToHex(id), base64UrlToHex(key)]));
    return { drm: { clearKeys } };
  }
  if (drm.scheme === "clearkey" && drm.licenseUrl) {
    return { drm: { servers: { "org.w3.clearkey": drm.licenseUrl } } };
  }
  if (drm.scheme === "widevine" && drm.licenseUrl) {
    return { drm: { servers: { "com.widevine.alpha": drm.licenseUrl } } };
  }
  return {};
}
