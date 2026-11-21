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

export function shakaDrmConfiguration(drm: DrmConfig | undefined): { drm?: { clearKeys?: Record<string, string>; servers?: Record<string, string> } } {
  if (!drm) return {};
  if (drm.scheme === "clearkey" && drm.clearKeys && Object.keys(drm.clearKeys).length) {
    return { drm: { clearKeys: drm.clearKeys } };
  }
  if (!drm.licenseUrl) {
    throw new TypeError(`${drm.scheme === "widevine" ? "Widevine" : "ClearKey"} DRM requires inline keys or an HTTP(S) license URL.`);
  }
  let license: URL;
  try { license = new URL(drm.licenseUrl); }
  catch { throw new TypeError("DRM license URL must be a valid HTTP(S) URL."); }
  if (license.protocol !== "http:" && license.protocol !== "https:") {
    throw new TypeError("DRM license URL must use HTTP or HTTPS.");
  }
  if (drm.scheme === "clearkey") {
    return { drm: { servers: { "org.w3.clearkey": license.toString() } } };
  }
  return { drm: { servers: { "com.widevine.alpha": license.toString() } } };
}
