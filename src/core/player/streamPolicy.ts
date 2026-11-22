import type { Channel, DrmConfig, StreamHeaders } from "../types";

const BLOCKED_HEADERS = /^(?:accept-encoding|connection|content-length|host|te|trailer|transfer-encoding|upgrade|proxy-|sec-)/i;
const KEY_SYSTEMS = {
  clearkey: "org.w3.clearkey",
  widevine: "com.widevine.alpha",
  playready: "com.microsoft.playready",
  fairplay: "com.apple.fps"
} as const;

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
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) || BLOCKED_HEADERS.test(name) || /[\r\n]/.test(String(value))) continue;
    result[name] = String(value);
  }
  return result;
}

/** User playlist headers are scoped to the stream origin, including User-Agent, Referer, Origin and Cookie. */
export function streamHeadersForRequest(channel: Channel, requestUrl: string): StreamHeaders {
  return originOf(channel.url) && originOf(channel.url) === originOf(requestUrl) ? safeHeaders(channel.headers) : {};
}

/** License credentials are sent only to the configured license-server origin. */
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

export function shakaDrmConfiguration(drm: DrmConfig | undefined): {
  drm?: {
    preferredKeySystems: string[];
    clearKeys?: Record<string, string>;
    servers?: Record<string, string>;
    advanced?: Record<string, { serverCertificateUri?: string }>;
  };
} {
  if (!drm) return {};
  const keySystem = KEY_SYSTEMS[drm.scheme];
  const configuration: NonNullable<ReturnType<typeof shakaDrmConfiguration>["drm"]> = {
    preferredKeySystems: [keySystem]
  };
  if (drm.scheme === "clearkey" && drm.clearKeys && Object.keys(drm.clearKeys).length) {
    configuration.clearKeys = drm.clearKeys;
  } else if (drm.licenseUrl) {
    configuration.servers = { [keySystem]: drm.licenseUrl };
  }
  if (drm.certificateUrl) {
    configuration.advanced = { [keySystem]: { serverCertificateUri: drm.certificateUrl } };
  }
  return { drm: configuration };
}
