import type { Channel, DrmConfig, StreamHeaders } from "../types";
import { createDrmConfig, parseClearKeys } from "../parser/clearKeyUtils";

type RemoteTextResult = { text: string; url: string; status: number };
type FetchRemoteText = (url: string, headers?: StreamHeaders, requestId?: string) => Promise<RemoteTextResult>;
type CancelRemoteText = (requestId: string) => Promise<unknown>;
type LiveTgDrm = {
  type?: string; keyId?: string; key?: string; clearKeys?: Record<string, string>;
  licenseServer?: string; licenseUrl?: string; headers?: Record<string, string>;
  multiDrm?: boolean; contentId?: string; certificateUrl?: string; base64Certificate?: boolean;
};
type LiveTgChannelDetails = { sources?: unknown; headers?: Record<string, string>; drm?: LiveTgDrm | null };

function mergeHeaders(...sources: Array<Record<string, unknown> | undefined>): StreamHeaders {
  const result: StreamHeaders = {};
  for (const source of sources) {
    for (const [rawName, rawValue] of Object.entries(source ?? {})) {
      const name = rawName.trim();
      const value = String(rawValue);
      if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) || value.includes(String.fromCharCode(10)) || value.includes(String.fromCharCode(13))) continue;
      const previous = Object.keys(result).find(key => key.toLowerCase() === name.toLowerCase());
      if (previous) delete result[previous];
      result[name] = value;
    }
  }
  return result;
}

function normalizeDrm(input: LiveTgDrm | null | undefined): DrmConfig | undefined {
  if (!input || typeof input !== "object") return undefined;
  const rawType = String(input.type ?? "").trim().toLowerCase();
  const keys = input.clearKeys && typeof input.clearKeys === "object"
    ? Object.fromEntries(Object.entries(input.clearKeys).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
    : input.keyId && input.key ? { [input.keyId]: input.key } : undefined;
  const type = rawType || (keys ? "clearkey" : "");
  if (!type) return undefined;
  const extras = { multiDrm: Boolean(input.multiDrm), contentId: input.contentId, certificateUrl: input.certificateUrl, base64Certificate: Boolean(input.base64Certificate) };
  const licenseHeaders = mergeHeaders(input.headers);
  if (keys && type === "clearkey") {
    const config = createDrmConfig(type, undefined, licenseHeaders, extras);
    if (!config) return undefined;
    const normalized = parseClearKeys(keys);
    return Object.keys(normalized).length ? { ...config, clearKeys: normalized } : undefined;
  }
  const licenseUrl = input.licenseServer || input.licenseUrl;
  return licenseUrl ? createDrmConfig(type, licenseUrl, licenseHeaders, extras) : undefined;
}

function getManifestType(source: string): Channel["manifestType"] {
  try {
    const path = new URL(source).pathname.toLowerCase();
    if (path.endsWith(".mpd")) return "dash";
    if (path.endsWith(".m3u8")) return "hls";
    if ([".mp4", ".m4v", ".webm", ".ogg"].some(extension => path.endsWith(extension))) return "progressive";
  } catch {}
  return "unknown";
}

/** Resolves the fresh source and DRM metadata used by the Vega LiveTGTV provider. */
export async function resolveLiveTgTvChannel(
  channel: Channel, fetchRemoteText: FetchRemoteText, cancelRemoteText?: CancelRemoteText
): Promise<Channel | null> {
  if (!channel.tvgId || !/^[0-9]+$/.test(channel.tvgId)) return null;
  const requestId = globalThis.crypto.randomUUID();
  try {
    const response = await fetchRemoteText(
      "https://livetgtv.lovable.app/api/public/channels/" + encodeURIComponent(channel.tvgId),
      { Accept: "application/json", "Cache-Control": "no-cache" }, requestId
    );
    if (response.status < 200 || response.status >= 300) throw new Error("LiveTGTV returned HTTP " + response.status);
    const payload = JSON.parse(response.text) as LiveTgChannelDetails;
    const source = Array.isArray(payload.sources) ? payload.sources.find((item): item is string => {
      if (typeof item !== "string") return false;
      try { const parsed = new URL(item.trim()); return parsed.protocol === "http:" || parsed.protocol === "https:"; } catch { return false; }
    }) : undefined;
    if (!source) return null;
    const url = new URL(source.trim());
    if (url.username || url.password) return null;
    const drm = normalizeDrm(payload.drm);
    const resolvedType = getManifestType(url.toString());
    return {
      ...channel, url: url.toString(), headers: mergeHeaders(channel.headers, payload.headers),
      drm: drm ?? channel.drm, manifestType: resolvedType === "unknown" ? channel.manifestType : resolvedType
    };
  } catch {
    return null;
  } finally {
    void cancelRemoteText?.(requestId);
  }
}
