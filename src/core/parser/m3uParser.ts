import type { Channel, StreamHeaders } from "../types";
import { createClearKeyDrm, parseClearKeys } from "./clearKeyUtils";

const ATTR = /([\w-]+)\s*=\s*(?:"((?:\\.|[^"])*)"|'((?:\\.|[^'])*)'|([^\s,]+))/g;
const unescapeValue = (value: string) => value.replace(/\\_/g, "_").replace(/\\(["'\\])/g, "$1");

function attributes(source: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const match of source.matchAll(ATTR)) result[match[1].toLowerCase()] = unescapeValue(match[2] ?? match[3] ?? match[4] ?? "");
  return result;
}
function splitExtInf(line: string): { duration: number; attrs: Record<string, string>; name: string } {
  let quoted = false, comma = -1;
  for (let i = 8; i < line.length; i++) {
    if (line[i] === '"' && line[i - 1] !== "\\") quoted = !quoted;
    if (line[i] === "," && !quoted) { comma = i; break; }
  }
  const meta = comma < 0 ? line.slice(8) : line.slice(8, comma);
  const attrs = attributes(meta);
  const duration = Number.parseFloat(meta.trim().split(/\s/, 1)[0]);
  return { duration: Number.isFinite(duration) ? duration : -1, attrs, name: unescapeValue(comma < 0 ? attrs["tvg-name"] ?? "Unnamed channel" : line.slice(comma + 1).trim()) };
}
function safeHeaders(value: unknown): StreamHeaders {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const headers: StreamHeaders = {};
  for (const [name, raw] of Object.entries(value as Record<string, unknown>)) {
    const value = String(raw);
    if (name && !/[\r\n:]/.test(name) && !/[\r\n]/.test(value)) headers[name] = value;
  }
  return headers;
}
function normalizeHeaderName(rawName: string): string {
  const name = rawName.trim();
  const key = name.toLowerCase().replace(/^http-/, "");
  if (key === "user-agent") return "User-Agent";
  if (key === "referer" || key === "referrer") return "Referer";
  if (key === "cookie") return "Cookie";
  if (key === "origin") return "Origin";
  if (key === "authorization") return "Authorization";
  return name;
}
function parseHeadersString(value: string): StreamHeaders {
  const source = unescapeValue(value.trim());
  if (!source) return {};
  try {
    const parsed = JSON.parse(source);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return Object.fromEntries(Object.entries(safeHeaders(parsed)).map(([name, header]) => [normalizeHeaderName(name), header]));
    }
  } catch { /* Kodi also accepts pipe- and ampersand-separated header pairs. */ }
  const headers: StreamHeaders = {};
  for (const item of source.replace(/^\{|\}$/g, "").split(/[&|]/)) {
    const separator = item.indexOf("=");
    if (separator < 1) continue;
    const name = normalizeHeaderName(item.slice(0, separator));
    const header = item.slice(separator + 1).trim();
    if (name && !/[\r\n:]/.test(name) && !/[\r\n]/.test(header)) headers[name] = header;
  }
  return headers;
}
function parseExtHttp(value: string): StreamHeaders {
  return parseHeadersString(value);
}
function streamLine(raw: string): { url: string; headers: StreamHeaders; drmType?: string; drmLicense?: string } {
  const separator = raw.indexOf("|");
  if (separator < 0) return { url: unescapeValue(raw.trim()), headers: {} };
  const url = unescapeValue(raw.slice(0, separator).trim());
  const headers: StreamHeaders = {};
  let drmType: string | undefined, drmLicense: string | undefined;
  for (const [key, value] of new URLSearchParams(raw.slice(separator + 1).replace(/&amp;/g, "&"))) {
    if (/^drmscheme$/i.test(key)) drmType = value;
    else if (/^drmlicense$/i.test(key)) drmLicense = value;
    else headers[key] = value;
  }
  return { url, headers, drmType, drmLicense };
}
function inferType(url: string, manifest?: string): Channel["manifestType"] {
  if (/mpd/i.test(manifest ?? "") || /\.mpd(?:$|[?#])/i.test(url)) return "dash";
  if (/\.m3u8?(?:$|[?#])/i.test(url)) return "hls";
  if (/\.(mp4|mkv|webm|ts|m4v)(?:$|[?#])/i.test(url)) return "progressive";
  return "unknown";
}
function uniqueChannelIds(channels: Channel[]): Channel[] {
  const seen = new Map<string, number>();
  return channels.map(channel => {
    const count = seen.get(channel.id) ?? 0;
    seen.set(channel.id, count + 1);
    return count ? { ...channel, id: `${channel.id}#${count + 1}` } : channel;
  });
}
function resolveUrl(url: string, baseUrl?: string): string {
  const resolved = baseUrl ? new URL(url, baseUrl) : new URL(url);
  if (!["http:", "https:"].includes(resolved.protocol)) throw new TypeError("Only HTTP(S) stream URLs are supported.");
  return resolved.toString();
}

export function parseM3U(source: string, baseUrl?: string): Channel[] {
  const lines = source.replace(/^\uFEFF/, "").replace(/\r/g, "").split("\n");
  const channels: Channel[] = [];
  let pending: Partial<Channel> | null = null;
  let pendingHeaders: StreamHeaders = {};
  let licenseType: string | undefined, licenseKey: string | undefined, manifestType: string | undefined;
  let licenseHeaders: StreamHeaders = {};
  let currentGroup = "";
  const reset = () => { pending = null; pendingHeaders = {}; licenseType = undefined; licenseKey = undefined; manifestType = undefined; licenseHeaders = {}; };
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("#EXTINF:")) {
      reset();
      const parsed = splitExtInf(line);
      const attrs = parsed.attrs;
      pending = {
        id: attrs["tvg-id"] || attrs["tvg-name"] || parsed.name,
        name: parsed.name || attrs["tvg-name"] || "Unnamed channel",
        tvgName: attrs["tvg-name"], tvgId: attrs["tvg-id"], logo: attrs["tvg-logo"] || attrs.logo,
        group: attrs["group-title"] || currentGroup || "Uncategorized",
        channelNumber: Number(attrs["tvg-chno"] ?? attrs["ch-number"]) || undefined,
        duration: parsed.duration, catchup: attrs.catchup,
        catchupDays: Number(attrs["catchup-days"]) || undefined, catchupSource: attrs["catchup-source"],
        rawAttributes: attrs, headers: {}
      };
    } else if (line.startsWith("#EXTGRP:")) {
      currentGroup = unescapeValue(line.slice(8).trim());
    } else if (line.startsWith("#EXTVLCOPT:") && pending) {
      const option = line.slice(11), index = option.indexOf("=");
      if (index > 0) {
        const key = option.slice(0, index).trim().toLowerCase();
        const value = unescapeValue(option.slice(index + 1).trim());
        const header = normalizeHeaderName(key);
        pendingHeaders[header] = value;
      }
    } else if (line.startsWith("#EXTHTTP:") && pending) {
      Object.assign(pendingHeaders, parseExtHttp(line.slice(9).trim()));
    } else if (line.startsWith("#KODIPROP:") && pending) {
      const prop = line.slice(10), index = prop.indexOf("=");
      if (index > 0) {
        const key = unescapeValue(prop.slice(0, index).trim()).toLowerCase();
        const value = unescapeValue(prop.slice(index + 1).trim());
        if (key.endsWith("license_type")) licenseType = value;
        else if (key.endsWith("license_key")) licenseKey = value;
        else if (key.endsWith("manifest_type")) manifestType = value;
        else if (key.endsWith("stream_headers") || key.endsWith("manifest_headers")) Object.assign(pendingHeaders, parseHeadersString(value));
        else if (key.endsWith("license_headers") || key.endsWith("license_header")) licenseHeaders = parseHeadersString(value);
      }
    } else if (!line.startsWith("#") && pending) {
      try {
        const stream = streamLine(line);
        const url = resolveUrl(stream.url, baseUrl);
        let drm: ReturnType<typeof createClearKeyDrm>;
        try { drm = createClearKeyDrm(stream.drmType ?? licenseType, stream.drmLicense ?? licenseKey); }
        catch { drm = undefined; }
        if (drm && Object.keys(licenseHeaders).length) drm.licenseHeaders = { ...licenseHeaders };
        const channel = {
          ...(pending as Channel), url, headers: { ...pendingHeaders, ...stream.headers },
          drm, manifestType: inferType(url, manifestType)
        };
        if (drm?.scheme === "clearkey" && drm.clearKeys) drm.clearKeys = { ...drm.clearKeys };
        channels.push(channel);
      } catch { /* invalid/non-HTTP stream entries are ignored */ }
      reset();
    }
  }
  return uniqueChannelIds(channels);
}

export function parseJsonPlaylist(input: unknown, baseUrl?: string): Channel[] {
  const root = (Array.isArray(input) ? { channels: input } : input) as Record<string, unknown> | null;
  if (!root || typeof root !== "object") throw new TypeError("JSON playlist must be an object or array.");
  const list = [root.channels, root.streams, root.items, root.data, root.results, root.playlist].find(Array.isArray) as unknown[] | undefined;
  if (!list) throw new TypeError("JSON playlist must contain channels, streams, items, or data.");
  const channels = list.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const rawUrl = String(row.url ?? row.streamUrl ?? row.stream_url ?? row.link ?? row.src ?? row.file ?? "");
    let url: string;
    try { url = resolveUrl(rawUrl, baseUrl); } catch { return []; }
    const name = String(row.name ?? row.title ?? row.channel ?? row.tvgName ?? row.tvg_name ?? `Channel ${index + 1}`);
    const drmInput = row.drm && typeof row.drm === "object" ? row.drm as Record<string, unknown> : {};
    const license = row.licenseKey ?? row.license_key ?? row.drmLicense ?? row.drm_license ?? drmInput.clearKeys ?? drmInput.keys;
    const licenseUrl = String(row.licenseUrl ?? row.license_url ?? drmInput.licenseUrl ?? drmInput.license_url ?? "");
    const scheme = String(row.drmScheme ?? row.drm_scheme ?? drmInput.scheme ?? drmInput.type ?? (licenseUrl ? "clearkey" : ""));
    const normalizedScheme = scheme.toLowerCase();
    let drm = typeof license === "string" ? createClearKeyDrm(scheme || "clearkey", license) : scheme ? createClearKeyDrm(scheme, undefined) : undefined;
    if (license && typeof license === "object" && (!normalizedScheme || normalizedScheme.includes("clearkey"))) {
      const keyObject = license as Record<string, unknown>;
      const normalized = Array.isArray(license) ? parseClearKeys(JSON.stringify({ keys: license })) :
        Array.isArray(keyObject.keys) ? parseClearKeys(JSON.stringify(keyObject)) :
        parseClearKeys(license as Record<string, string>);
      drm = { scheme: "clearkey", clearKeys: normalized };
    }
    if (licenseUrl) {
      if (normalizedScheme.includes("widevine")) drm = { scheme: "widevine", licenseUrl };
      else if (normalizedScheme.includes("clearkey")) {
        drm = { scheme: "clearkey", licenseUrl, clearKeys: drm?.scheme === "clearkey" ? drm.clearKeys : undefined };
      } else if (normalizedScheme.includes("playready")) drm = { scheme: "playready", licenseUrl };
      else drm = undefined;
    }
    const type = String(row.manifestType ?? row.manifest_type ?? row.type ?? row.protocol ?? "");
    const rawAttrs = row.attributes && typeof row.attributes === "object" ? row.attributes as Record<string, string> : {};
    return [{
      id: String(row.id ?? row.tvgId ?? row.tvg_id ?? row["tvg-id"] ?? name), name, url,
      logo: String(row.logo ?? row.tvgLogo ?? row.tvg_logo ?? row["tvg-logo"] ?? row.icon ?? "") || undefined,
      group: String(row.group ?? row.category ?? row.groupTitle ?? row.group_title ?? row["group-title"] ?? "Uncategorized"),
      tvgId: String(row.tvgId ?? row.tvg_id ?? row["tvg-id"] ?? "") || undefined,
      tvgName: String(row.tvgName ?? row.tvg_name ?? row["tvg-name"] ?? "") || undefined,
      channelNumber: Number(row.channelNumber ?? row.tvg_chno ?? row["tvg-chno"]) || undefined,
      duration: Number(row.duration ?? -1), headers: safeHeaders(row.headers ?? row.requestHeaders ?? row.request_headers ?? row.http_headers),
      drm: drm ? { ...drm, licenseHeaders: safeHeaders(row.licenseHeaders ?? row.license_headers ?? drmInput.licenseHeaders ?? drmInput.license_headers) } : undefined, manifestType: inferType(url, type), catchup: String(row.catchup ?? "") || undefined,
      catchupDays: Number(row.catchupDays ?? row.catchup_days) || undefined,
      catchupSource: String(row.catchupSource ?? row.catchup_source ?? "") || undefined, rawAttributes: rawAttrs
    } satisfies Channel];
  });
  if (!channels.length) throw new TypeError("JSON playlist contains no valid HTTP(S) channel entries.");
  return uniqueChannelIds(channels);
}

export function parsePlaylist(source: string, baseUrl?: string): Channel[] {
  const trimmed = source.trim().replace(/^\uFEFF/, "");
  if (!trimmed) return [];
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return parseJsonPlaylist(JSON.parse(trimmed), baseUrl);
  if (!/^#EXTM3U\b/i.test(trimmed)) throw new TypeError("Unsupported playlist: expected #EXTM3U or JSON.");
  return parseM3U(trimmed, baseUrl);
}
