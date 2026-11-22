import type { Channel, StreamHeaders } from "../types";
import { createDrmConfig, normalizeDrmScheme, parseClearKeys } from "./clearKeyUtils";

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
  return {
    duration: Number.isFinite(duration) ? duration : -1,
    attrs,
    name: unescapeValue(comma < 0 ? attrs["tvg-name"] ?? "Unnamed channel" : line.slice(comma + 1).trim())
  };
}

function safeHeaders(value: unknown): StreamHeaders {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const headers: StreamHeaders = {};
  for (const [name, raw] of Object.entries(value as Record<string, unknown>)) {
    const value = String(raw);
    if (name && /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) && !/[\r\n]/.test(value)) headers[name] = value;
  }
  return headers;
}

/** Supports JSON headers and Kodi's query-string header form. */
function parseHeaderMap(value: unknown): StreamHeaders {
  if (value && typeof value === "object" && !Array.isArray(value)) return safeHeaders(value);
  if (typeof value !== "string") return {};
  const raw = unescapeValue(value.trim()).replace(/^\?/, "").replace(/&amp;/g, "&");
  if (!raw) return {};
  if (raw.startsWith("{")) {
    try { return safeHeaders(JSON.parse(raw)); } catch { return {}; }
  }
  const result: StreamHeaders = {};
  for (const [name, headerValue] of new URLSearchParams(raw)) {
    if (name && !/[\r\n:]/.test(name) && !/[\r\n]/.test(headerValue)) result[name] = headerValue;
  }
  if (!Object.keys(result).length) {
    const separator = raw.indexOf("=");
    if (separator > 0) result[raw.slice(0, separator).trim()] = raw.slice(separator + 1).trim();
  }
  return safeHeaders(result);
}

function parseExtHttp(value: string): StreamHeaders {
  return parseHeaderMap(value);
}

function splitLicenseValue(value: string): { license: string; headers: StreamHeaders } {
  const separator = value.indexOf("|");
  return separator < 0
    ? { license: unescapeValue(value.trim()), headers: {} }
    : {
        license: unescapeValue(value.slice(0, separator).trim()),
        headers: parseHeaderMap(value.slice(separator + 1))
      };
}

function headerNameForVlcOption(key: string): string {
  const normalized = key.trim().toLowerCase();
  if (normalized === "http-user-agent") return "User-Agent";
  if (normalized === "http-referrer" || normalized === "http-referer") return "Referer";
  if (normalized === "http-cookie") return "Cookie";
  if (normalized === "http-origin") return "Origin";
  return normalized.replace(/^http-/, "");
}

type StreamLine = {
  url: string;
  headers: StreamHeaders;
  drmType?: string;
  drmLicense?: string;
  licenseUrl?: string;
  licenseHeaders: StreamHeaders;
};

function streamLine(raw: string): StreamLine {
  const separator = raw.indexOf("|");
  if (separator < 0) return { url: unescapeValue(raw.trim()), headers: {}, licenseHeaders: {} };
  const url = unescapeValue(raw.slice(0, separator).trim());
  const headers: StreamHeaders = {};
  const licenseHeaders: StreamHeaders = {};
  let drmType: string | undefined, drmLicense: string | undefined, licenseUrl: string | undefined;
  for (const [rawKey, value] of new URLSearchParams(raw.slice(separator + 1).replace(/&amp;/g, "&"))) {
    const key = rawKey.trim().toLowerCase();
    if (["drmscheme", "drm_scheme", "drmtype", "drm_type", "license_type"].includes(key)) drmType = value;
    else if (["drmlicense", "drm_license", "license_key", "licensekey"].includes(key)) {
      const parsed = splitLicenseValue(value);
      drmLicense = parsed.license;
      Object.assign(licenseHeaders, parsed.headers);
    } else if (["licenseurl", "license_url"].includes(key)) licenseUrl = value;
    else if (key.startsWith("license-header-")) licenseHeaders[rawKey.slice("license-header-".length)] = value;
    else headers[rawKey] = value;
  }
  return { url, headers: safeHeaders(headers), drmType, drmLicense, licenseUrl, licenseHeaders: safeHeaders(licenseHeaders) };
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

function optionalUrl(value: unknown, baseUrl?: string): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try { return resolveUrl(value.trim(), baseUrl); } catch { return undefined; }
}

export function parseM3U(source: string, baseUrl?: string): Channel[] {
  const lines = source.replace(/^\uFEFF/, "").replace(/\r/g, "").split("\n");
  const channels: Channel[] = [];
  let pending: Partial<Channel> | null = null;
  let pendingHeaders: StreamHeaders = {};
  let carryHeaders: StreamHeaders = {};
  let licenseType: string | undefined, licenseKey: string | undefined, licenseUrl: string | undefined;
  let licenseHeaders: StreamHeaders = {};
  let manifestType: string | undefined;
  let currentGroup = "";

  const reset = () => {
    pending = null;
    pendingHeaders = { ...carryHeaders };
    carryHeaders = {};
    licenseType = undefined;
    licenseKey = undefined;
    licenseUrl = undefined;
    licenseHeaders = {};
    manifestType = undefined;
  };

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
        tvgName: attrs["tvg-name"],
        tvgId: attrs["tvg-id"],
        logo: attrs["tvg-logo"] || attrs.logo,
        group: attrs["group-title"] || currentGroup || "Uncategorized",
        channelNumber: Number(attrs["tvg-chno"] ?? attrs["ch-number"]) || undefined,
        duration: parsed.duration,
        catchup: attrs.catchup,
        catchupDays: Number(attrs["catchup-days"]) || undefined,
        catchupSource: attrs["catchup-source"],
        rawAttributes: attrs,
        headers: {}
      };
      licenseType = attrs["drm-scheme"] || attrs["drm_scheme"] || attrs["license-type"] || attrs["license_type"];
      licenseKey = attrs["drm-license"] || attrs["drm_license"] || attrs["license-key"] || attrs["license_key"];
      licenseUrl = attrs["licenseurl"] || attrs["license-url"] || attrs["license_url"];
      if (!licenseType && licenseUrl) licenseType = "clearkey";
      if (attrs["stream-headers"] || attrs["stream_headers"]) Object.assign(pendingHeaders, parseHeaderMap(attrs["stream-headers"] || attrs["stream_headers"]));
    } else if (line.startsWith("#EXTGRP:")) {
      currentGroup = unescapeValue(line.slice(8).trim());
    } else if (line.startsWith("#EXTVLCOPT:")) {
      const option = line.slice(11), index = option.indexOf("=");
      if (index > 0) {
        const key = option.slice(0, index).trim();
        const value = unescapeValue(option.slice(index + 1).trim());
        const target = pending ? pendingHeaders : carryHeaders;
        target[headerNameForVlcOption(key)] = value;
      }
    } else if (line.startsWith("#EXTHTTP:")) {
      Object.assign(pending ? pendingHeaders : carryHeaders, parseExtHttp(line.slice(9).trim()));
    } else if (line.startsWith("#KODIPROP:")) {
      const prop = line.slice(10), index = prop.indexOf("=");
      if (index > 0) {
        const key = unescapeValue(prop.slice(0, index).trim()).toLowerCase();
        const value = unescapeValue(prop.slice(index + 1).trim());
        const shortKey = key.split(".").pop() ?? key;
        if (shortKey === "license_type" || shortKey === "drm_scheme" || shortKey === "drm_type") licenseType = value;
        else if (shortKey === "license_key" || shortKey === "drm_license") {
          const parsed = splitLicenseValue(value);
          licenseKey = parsed.license;
          Object.assign(licenseHeaders, parsed.headers);
        } else if (shortKey === "license_url" || shortKey === "licenseurl") licenseUrl = value;
        else if (shortKey === "manifest_type") manifestType = value;
        else if (shortKey === "stream_headers") Object.assign(pending ? pendingHeaders : carryHeaders, parseHeaderMap(value));
      }
    } else if (!line.startsWith("#") && pending) {
      try {
        const stream = streamLine(line);
        const url = resolveUrl(stream.url, baseUrl);
        const mergedLicenseHeaders = { ...licenseHeaders, ...stream.licenseHeaders };
        const resolvedLicense = stream.drmLicense ?? stream.licenseUrl ?? licenseKey ?? licenseUrl;
        const resolvedType = stream.drmType ?? licenseType ?? (stream.licenseUrl || licenseUrl ? "clearkey" : undefined);
        const drm = createDrmConfig(resolvedType, resolvedLicense, mergedLicenseHeaders, {
          certificateUrl: optionalUrl(pending.rawAttributes?.["certificate-url"] || pending.rawAttributes?.["certificate_url"], baseUrl),
          contentId: pending.rawAttributes?.["content-id"] || pending.rawAttributes?.["content_id"],
          multiDrm: /^(1|true|yes)$/i.test(pending.rawAttributes?.["multi-drm"] ?? "")
        });
        const channel: Channel = {
          ...(pending as Channel),
          url,
          headers: { ...pendingHeaders, ...stream.headers },
          drm,
          manifestType: inferType(url, manifestType)
        };
        channels.push(channel);
      } catch {
        // Malformed URLs and invalid DRM metadata are ignored without breaking the whole playlist.
      }
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
    const drmInput = row.drm && typeof row.drm === "object" && !Array.isArray(row.drm) ? row.drm as Record<string, unknown> : {};
    const licenseValue = row.licenseKey ?? row.license_key ?? row.drmLicense ?? row.drm_license ??
      drmInput.clearKeys ?? drmInput.keys ?? drmInput.license ?? drmInput.key;
    const licenseUrl = optionalUrl(row.licenseUrl ?? row.license_url ?? row.LicenseURL ??
      drmInput.licenseUrl ?? drmInput.license_url ?? drmInput.licenseServer ?? drmInput.license_server, baseUrl);
    const drmType = String(row.drmScheme ?? row.drm_scheme ?? row.license_type ??
      drmInput.scheme ?? drmInput.type ?? (licenseUrl ? "clearkey" : ""));
    const licenseHeaders = safeHeaders(drmInput.licenseHeaders ?? drmInput.license_headers ?? drmInput.headers);
    const extras = {
      certificateUrl: optionalUrl(drmInput.certificateUrl ?? drmInput.certificate_url, baseUrl),
      contentId: typeof drmInput.contentId === "string" ? drmInput.contentId : undefined,
      base64Certificate: Boolean(drmInput.base64Certificate ?? drmInput.base64_certificate),
      multiDrm: Boolean(drmInput.multiDrm ?? drmInput.multi_drm)
    };

    let drm = undefined;
    if (licenseValue && typeof licenseValue === "object") {
      try {
        const keys = Array.isArray(licenseValue)
          ? parseClearKeys(JSON.stringify({ keys: licenseValue }))
          : parseClearKeys(licenseValue as Record<string, string>);
        drm = createDrmConfig(drmType || "clearkey", undefined, licenseHeaders, extras);
        if (drm) drm = { ...drm, clearKeys: keys };
      } catch { drm = undefined; }
    } else if (typeof licenseValue === "string" && licenseValue.trim()) {
      try { drm = createDrmConfig(drmType || "clearkey", licenseValue, licenseHeaders, extras); }
      catch { drm = undefined; }
    } else if (licenseUrl) {
      try { drm = createDrmConfig(drmType || "clearkey", licenseUrl, licenseHeaders, extras); }
      catch { drm = undefined; }
    } else if (drmType) {
      try { drm = createDrmConfig(drmType, undefined, licenseHeaders, extras); }
      catch { drm = undefined; }
    }

    const type = String(row.manifestType ?? row.manifest_type ?? row.type ?? row.protocol ?? "");
    const rawAttrs = row.attributes && typeof row.attributes === "object" ? row.attributes as Record<string, string> : {};
    return [{
      id: String(row.id ?? row.tvgId ?? row.tvg_id ?? row["tvg-id"] ?? name),
      name,
      url,
      logo: String(row.logo ?? row.tvgLogo ?? row.tvg_logo ?? row["tvg-logo"] ?? row.icon ?? "") || undefined,
      group: String(row.group ?? row.category ?? row.groupTitle ?? row.group_title ?? row["group-title"] ?? "Uncategorized"),
      tvgId: String(row.tvgId ?? row.tvg_id ?? row["tvg-id"] ?? "") || undefined,
      tvgName: String(row.tvgName ?? row.tvg_name ?? row["tvg-name"] ?? "") || undefined,
      channelNumber: Number(row.channelNumber ?? row.tvg_chno ?? row["tvg-chno"]) || undefined,
      duration: Number(row.duration ?? -1),
      headers: safeHeaders(row.headers ?? row.requestHeaders ?? row.request_headers ?? row.http_headers),
      drm,
      manifestType: inferType(url, type),
      catchup: String(row.catchup ?? "") || undefined,
      catchupDays: Number(row.catchupDays ?? row.catchup_days) || undefined,
      catchupSource: String(row.catchupSource ?? row.catchup_source ?? "") || undefined,
      rawAttributes: rawAttrs
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
