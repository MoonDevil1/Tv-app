import type { Channel, ChannelSource, DrmConfig, StreamHeaders } from "../types";
import { parseClearKeys } from "./clearKeyUtils";

type LiveTgTvDetails = {
  sources?: unknown;
  headers?: unknown;
  drm?: {
    type?: string;
    keyId?: string;
    key?: string;
    clearKeys?: Record<string, string>;
    licenseServer?: string;
    licenseUrl?: string;
    headers?: Record<string, string>;
    multiDrm?: boolean;
    contentId?: string;
    certificateUrl?: string;
    base64Certificate?: boolean;
  } | null;
};

function safeHeaders(value: unknown): StreamHeaders {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([name, raw]) => {
    const text = String(raw);
    return name && !/[\r\n:]/.test(name) && !/[\r\n]/.test(text) ? [[name, text]] : [];
  }));
}

function normalizeDrm(value: LiveTgTvDetails["drm"]): DrmConfig | undefined {
  if (!value) return undefined;
  const type = String(value.type ?? "").toLowerCase();
  const licenseUrl = value.licenseServer || value.licenseUrl;
  const licenseHeaders = safeHeaders(value.headers);
  if (type === "clearkey") {
    const rawKeys = value.clearKeys && Object.keys(value.clearKeys).length
      ? value.clearKeys
      : value.keyId && value.key ? { [value.keyId]: value.key } : undefined;
    if (rawKeys) {
      try {
        const clearKeys = parseClearKeys(rawKeys);
        if (Object.keys(clearKeys).length) return { scheme: "clearkey", clearKeys };
      } catch {
        // Invalid or placeholder API keys must not discard otherwise valid stream sources.
      }
    }
    return licenseUrl ? { scheme: "clearkey", licenseUrl, licenseHeaders } : undefined;
  }
  if ((type === "widevine" || type === "playready") && licenseUrl) {
    return { scheme: type, licenseUrl, licenseHeaders };
  }
  return undefined;
}

function manifestTypeFor(url: string, fallback: Channel["manifestType"]): Channel["manifestType"] {
  if (/\.mpd(?:$|[?#])/i.test(url)) return "dash";
  if (/\.m3u8?(?:$|[?#])/i.test(url)) return "hls";
  if (/\.(?:mp4|m4v|webm|ogg|ts)(?:$|[?#])/i.test(url)) return "progressive";
  return fallback ?? "unknown";
}

export function applyLiveTgTvDetails(channel: Channel, input: unknown): Channel | null {
  const details = input && typeof input === "object" ? input as LiveTgTvDetails : null;
  if (!details || !Array.isArray(details.sources)) return null;
  const headers = { ...channel.headers, ...safeHeaders(details.headers) };
  const drm = normalizeDrm(details.drm) ?? channel.drm;
  const sources: ChannelSource[] = details.sources.flatMap(raw => {
    if (typeof raw !== "string") return [];
    try {
      const url = new URL(raw);
      if (url.protocol !== "http:" && url.protocol !== "https:") return [];
      const value = url.toString();
      return [{ url: value, headers, drm, manifestType: manifestTypeFor(value, channel.manifestType) }];
    } catch { return []; }
  });
  if (!sources.length) return null;
  return { ...channel, ...sources[0], alternates: sources.slice(1) };
}
