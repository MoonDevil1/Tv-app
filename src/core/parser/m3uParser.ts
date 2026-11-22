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
function parseHeaderValue(value: string): StreamHeaders {
  try { return safeHeaders(JSON.parse(unescapeValue(value))); }
  catch {
    const headers: StreamHeaders = {};
    for (const [name, headerValue] of new URLSearchParams(value.replace(/&amp;/g, "&"))) {
      if (name && !/[\\r\\n:]/.test(name) && !/[\\r\\n]/.test(headerValue)) headers[name] = unescapeValue(headerValue);
    }
    if (!Object.keys(headers).length) {
      const separator = value.indexOf("=");
      if (separator > 0) headers[value.slice(0, separator).trim()] = unescapeValue(value.slice(separator + 1).trim());
    }
    return headers;
  }
}
const parseExtHttp = parseHeaderValue;
function streamLine(raw: string): { url: string; headers: StreamHeaders; drmType?: string; drmLicense?: string } {
  const separator = raw.indexOf("|");
  if (separator < 0) return { url: unescapeValue(raw.trim()), headers: {} };
  const url = unescapeValue(raw.slice(0, separator).trim());
  const headers: StreamHeaders = {};
  let drmType: string | undefined, drmLicense: string | undefined;
  for (const [key, value] of new URLSearchParams(raw.slice(separator + 1).replace(/&amp;/g, "&"))) {
    if (/^(?:drmscheme|drmtype|license_type)$/i.test(key)) drmType = value;
    else if (/^(?:drmlicense|license_url|licenseurl)$/i.test(key)) drmLicense = value;
    else headers[key] = value;
  }
  return { url, headers, drmType, drmLicense };
}
function parseKodiLicense(value: string): { license: string; headers: StreamHeaders } {
  const [license, rawHeaders = ""] = value.split("|", 2);
  const headers: StreamHeaders = {};
  for (const [name, headerValue] of new URLSearchParams(rawHeaders.replace(/&amp;/g, "&"))) {
    if (name && !/[\\r\\n:]/.test(name) && !/[\\r\\n]/.test(headerValue)) headers[name] = headerValue;
  }
  return { license: license.trim(), headers };
}

function inferType(url: string, manifest?: string): Channel["manifestType"] {
  if (/mpd/i.test(manifest ?? "") || /\.mpd(?:$|[?#])/i.test(url)) return "dash";
  if (/\.m3u8?(?:$|[?#])/i.test(url)) return "hls";
  if (/\.(mp4|mkv|webm|ts|m4v)(?:$|[?#])/i.test(url)) return "progressive";
  return "unknown";
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
  let leadingHeaders: StreamHeaders = {};
  let licenseType: string | undefined, licenseKey: string | undefined, manifestType: string | undefined;
  let currentGroup = "";
  const reset = () => { pending = null; pendingHeaders = { ...leadingHeaders }; leadingHeaders = {}; licenseType = undefined; licenseKey = undefined; manifestType = undefined; };
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
      licenseType = attrs["drm-scheme"] ?? attrs["license-type"];
      licenseKey = attrs["license-url"] ?? attrs["license_url"] ?? attrs["drm-license"];
      manifestType = attrs["manifest-type"];
    } else if (line.startsWith("#EXTGRP:")) {
      currentGroup = unescapeValue(line.slice(8).trim());
    } else if (line.startsWith("#EXTVLCOPT:")) {
      const option = line.slice(11), index = option.indexOf("=");
      if (index > 0) {
        const key = option.slice(0, index).trim().toLowerCase();
        const value = unescapeValue(option.slice(index + 1).trim());
        const header = key === "http-user-agent" ? "User-Agent" : key === "http-referrer" ? "Referer" :
          key === "http-cookie" ? "Cookie" : key === "http-origin" ? "Origin" : key.replace(/^http-/, "");
        (pending ? pendingHeaders : leadingHeaders)[header] = value;
      }
    } else if (line.startsWith("#EXTHTTP:")) {
      Object.assign(pending ? pendingHeaders : leadingHeaders, parseExtHttp(line.slice(9).trim()));
    } else if (line.startsWith("#KODIPROP:")) {
      const prop = line.slice(10), index = prop.indexOf("=");
      if (index > 0) {
        const key = unescapeValue(prop.slice(0, index).trim()).toLowerCase();
        const value = unescapeValue(prop.slice(index + 1).trim());
        if (key.endsWith("license_type")) licenseType = value;
        else if (key.endsWith("license_key")) licenseKey = value;
        else if (key.endsWith("manifest_type")) manifestType = value;
        else if (key.endsWith("stream_headers")) Object.assign(pending ? pendingHeaders : leadingHeaders, parseHeaderValue(value));
        else if (key.endsWith("license_key") && value.startsWith("{")) licenseKey = value;
      }
    } else if (!line.startsWith("#") && pending) {
      try {
        const stream = streamLine(line);
        const url = resolveUrl(stream.url, baseUrl);
        const rawLicense = stream.drmLicense ?? licenseKey;
        const parsedLicense = rawLicense ? parseKodiLicense(rawLicense) : undefined;
        const drm = createClearKeyDrm(stream.drmType ?? licenseType, parsedLicense?.license);
        if (drm && parsedLicense && Object.keys(parsedLicense.headers).length) drm.licenseHeaders = parsedLicense.headers;
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
  return channels;
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
      } else drm = undefined;
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
      drm, manifestType: inferType(url, type), catchup: String(row.catchup ?? "") || undefined,
      catchupDays: Number(row.catchupDays ?? row.catchup_days) || undefined,
      catchupSource: String(row.catchupSource ?? row.catchup_source ?? "") || undefined, rawAttributes: rawAttrs
    } satisfies Channel];
  });
  if (!channels.length) throw new TypeError("JSON playlist contains no valid HTTP(S) channel entries.");
  return channels;
}

export function parsePlaylist(source: string, baseUrl?: string): Channel[] {
  const trimmed = source.trim().replace(/^\uFEFF/, "");
  if (!trimmed) return [];
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return parseJsonPlaylist(JSON.parse(trimmed), baseUrl);
  if (!/^#EXTM3U\b/i.test(trimmed)) throw new TypeError("Unsupported playlist: expected #EXTM3U or JSON.");
  return parseM3U(trimmed, baseUrl);
}
