import type { Channel, StreamHeaders } from "../types";
import { createClearKeyDrm } from "./clearKeyUtils";

const ATTR = /([\w-]+)\s*=\s*(?:"((?:\\.|[^"])*)"|'((?:\\.|[^'])*)'|([^\s,]+))/g;
const unescapeValue = (value: string) => value.replace(/\\_/g, "_").replace(/\\(["'\\])/g, "$1");

function attributes(source: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const match of source.matchAll(ATTR)) result[match[1].toLowerCase()] = unescapeValue(match[2] ?? match[3] ?? match[4] ?? "");
  return result;
}
function safeHeaders(value: unknown): StreamHeaders {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const headers: StreamHeaders = {};
  for (const [name, raw] of Object.entries(value as Record<string, unknown>)) {
    const v = String(raw);
    if (name && !/[\r\n:]/.test(name) && !/[\r\n]/.test(v)) headers[name] = v;
  }
  return headers;
}
function splitStream(raw: string): { url: string; headers: StreamHeaders; drmScheme?: string; drmLicense?: string } {
  const [urlPart, query = ""] = raw.split("|", 2);
  const params = new URLSearchParams(query.replace(/&amp;/g, "&"));
  const headers: StreamHeaders = {};
  let drmScheme: string | undefined, drmLicense: string | undefined;
  for (const [key, value] of params) {
    if (/^drmscheme$/i.test(key)) drmScheme = value;
    else if (/^drmlicense$/i.test(key)) drmLicense = value;
    else headers[key] = value;
  }
  return { url: unescapeValue(urlPart.trim()), headers, drmScheme, drmLicense };
}
function inferType(url: string, manifest?: string): Channel["manifestType"] {
  if (/mpd/i.test(manifest ?? "") || /\.mpd(?:$|[?#])/i.test(url)) return "dash";
  if (/\.m3u8?(?:$|[?#])/i.test(url)) return "hls";
  return "unknown";
}

export function parseM3U(source: string): Channel[] {
  const lines = source.replace(/^\uFEFF/, "").replace(/\r/g, "").split("\n");
  const channels: Channel[] = [];
  let pending: Partial<Channel> | null = null;
  let pendingHeaders: StreamHeaders = {};
  let licenseType: string | undefined, licenseKey: string | undefined, manifestType: string | undefined;
  const reset = () => { pending = null; pendingHeaders = {}; licenseType = undefined; licenseKey = undefined; manifestType = undefined; };
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("#EXTINF:")) {
      reset();
      const comma = line.indexOf(",");
      const meta = comma >= 0 ? line.slice(8, comma) : line.slice(8);
      const name = comma >= 0 ? line.slice(comma + 1).trim() : (attributes(meta)["tvg-name"] ?? "Unnamed channel");
      const attrs = attributes(meta);
      const duration = Number.parseFloat(meta.split(/\s/, 1)[0]);
      pending = {
        id: attrs["tvg-id"] || attrs["tvg-name"] || name,
        name: attrs["tvg-name"] || name, tvgName: attrs["tvg-name"], tvgId: attrs["tvg-id"],
        logo: attrs["tvg-logo"] || attrs["logo"], group: attrs["group-title"] || "Uncategorized",
        channelNumber: Number(attrs["tvg-chno"]) || undefined,
        duration: Number.isFinite(duration) ? duration : -1,
        catchup: attrs.catchup, catchupDays: Number(attrs["catchup-days"]) || undefined,
        catchupSource: attrs["catchup-source"], rawAttributes: attrs, headers: {}
      };
    } else if (line.startsWith("#EXTVLCOPT:")) {
      const option = line.slice(11), index = option.indexOf("=");
      if (index > 0) { const key = option.slice(0, index).replace(/^http-/i, "").toLowerCase(); pendingHeaders[key === "user-agent" ? "User-Agent" : key === "referrer" ? "Referer" : key] = option.slice(index + 1).trim(); }
    } else if (line.startsWith("#EXTHTTP:")) {
      const value = unescapeValue(line.slice(9).trim());
      try { pendingHeaders = { ...pendingHeaders, ...safeHeaders(JSON.parse(value)) }; }
      catch { const index = value.indexOf("="); if (index > 0) pendingHeaders[value.slice(0,index)] = value.slice(index+1); }
    } else if (line.startsWith("#KODIPROP:")) {
      const prop = line.slice(10), index = prop.indexOf("=");
      if (index > 0) {
        const key = prop.slice(0,index).trim().toLowerCase(), value = unescapeValue(prop.slice(index+1).trim());
        if (key.endsWith("license_type")) licenseType = value;
        else if (key.endsWith("license_key")) licenseKey = value;
        else if (key.endsWith("manifest_type")) manifestType = value;
        else if (key.endsWith("stream_headers")) Object.assign(pendingHeaders, safeHeaders(Object.fromEntries(new URLSearchParams(value))));
      }
    } else if (!line.startsWith("#") && pending) {
      const stream = splitStream(line);
      const url = stream.url;
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") { reset(); continue; }
      } catch { reset(); continue; }
      const drm = createClearKeyDrm(stream.drmScheme ?? licenseType, stream.drmLicense ?? licenseKey);
      if (drm?.clearKeys) drm.clearKeys = { ...drm.clearKeys };
      channels.push({ ...(pending as Channel), url, headers: { ...pendingHeaders, ...stream.headers }, drm, manifestType: inferType(url, manifestType) });
      reset();
    }
  }
  return channels;
}

export function parseJsonPlaylist(input: unknown): Channel[] {
  const root = (Array.isArray(input) ? { channels: input } : input) as Record<string, unknown> | null;
  if (!root || typeof root !== "object") throw new TypeError("JSON playlist must be an object or array.");
  const list = [root.channels, root.streams, root.items].find(Array.isArray) as unknown[] | undefined;
  if (!list) throw new TypeError("JSON playlist must contain channels, streams, or items.");
  return list.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const url = String(row.url ?? row.streamUrl ?? row.stream_url ?? row.link ?? "");
    try { const parsed = new URL(url); if (!["http:","https:"].includes(parsed.protocol)) return []; } catch { return []; }
    const name = String(row.name ?? row.title ?? row.tvgName ?? `Channel ${index + 1}`);
    const drmRaw = row.drmLicense ?? row.drm_license ?? row.licenseKey;
    let drm = row.drm && typeof row.drm === "object" ? row.drm as Channel["drm"] : undefined;
    if (!drm && typeof drmRaw === "string") drm = createClearKeyDrm(String(row.drmScheme ?? "clearkey"), drmRaw);
    return [{
      id: String(row.id ?? row.tvgId ?? row.tvg_id ?? name), name, url,
      logo: String(row.logo ?? row.tvgLogo ?? row.tvg_logo ?? "") || undefined,
      group: String(row.group ?? row.groupTitle ?? row.group_title ?? "Uncategorized"),
      tvgId: String(row.tvgId ?? row.tvg_id ?? "") || undefined,
      tvgName: String(row.tvgName ?? row.tvg_name ?? "") || undefined,
      headers: safeHeaders(row.headers ?? row.requestHeaders), drm,
      manifestType: inferType(url, String(row.manifestType ?? "")),
      catchup: String(row.catchup ?? "") || undefined,
      catchupDays: Number(row.catchupDays ?? row.catchup_days) || undefined,
      rawAttributes: (row.attributes && typeof row.attributes === "object" ? row.attributes : {}) as Record<string,string>
    } satisfies Channel];
  });
}

export function parsePlaylist(source: string): Channel[] {
  const trimmed = source.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return parseJsonPlaylist(JSON.parse(trimmed));
  if (!/^#EXTM3U\b/i.test(trimmed)) throw new TypeError("Unsupported playlist: expected #EXTM3U or JSON.");
  return parseM3U(trimmed);
}
