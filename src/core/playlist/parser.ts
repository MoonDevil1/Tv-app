import type { ChannelSource, ManifestType, Playlist, StreamHeaders, TvChannel } from "../../app/models";

const LIVE_TGTV_PLAYLIST = "https://livetgtv.lovable.app/api/public/playlist.m3u";
const LIVE_TGTV_FALLBACK = "https://hjh-545.pages.dev/";
const DEFAULT_HEADERS = { Accept: "application/vnd.apple.mpegurl, audio/x-mpegurl, text/plain, application/json, */*", "User-Agent": "TG-IPTV-Windows/2.1" };

function attr(line: string, key: string): string {
  const match = line.match(new RegExp("(?:^|\\s)" + key + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s,]+))", "i"));
  return String(match?.[1] ?? match?.[2] ?? match?.[3] ?? "").trim();
}
function safeUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  try { const url = new URL(value.trim()); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.toString() : ""; } catch { return ""; }
}
function manifestType(value: string): ManifestType {
  const lower = value.toLowerCase();
  if (/\.mpd(?:$|[?#&])/.test(lower) || /[?&](?:type|format)=mpd(?:&|$)/.test(lower)) return "dash";
  if (/\.m3u8(?:$|[?#&])/.test(lower) || /[?&](?:type|format)=m3u8(?:&|$)/.test(lower)) return "hls";
  if (/\.(?:mp4|m4v|mkv)(?:$|[?#&])/.test(lower)) return "progressive";
  try { const nested = new URL(value).searchParams.get("url"); if (nested && nested !== value) return manifestType(nested); } catch {}
  return "unknown";
}
function setHeader(headers: StreamHeaders, rawName: string, rawValue: string): void {
  const name = rawName.trim(), value = rawValue.trim();
  if (!name || !value || /[\r\n:]/.test(name) || /[\r\n]/.test(value)) return;
  const canonical = ({ "user-agent": "User-Agent", referer: "Referer", referrer: "Referer", origin: "Origin", cookie: "Cookie", authorization: "Authorization" } as Record<string, string>)[name.toLowerCase()] ?? name;
  const old = Object.keys(headers).find(k => k.toLowerCase() === canonical.toLowerCase());
  headers[old ?? canonical] = value;
}
function parseHeaderPayload(value: string, headers: StreamHeaders): void {
  const raw = value.trim();
  try {
    const parsed = JSON.parse(raw);
    const source = parsed?.headers && typeof parsed.headers === "object" ? parsed.headers : parsed;
    if (source && typeof source === "object" && !Array.isArray(source)) {
      for (const [key, item] of Object.entries(source)) if (typeof item === "string" || typeof item === "number") setHeader(headers, key, String(item));
      return;
    }
  } catch {}
  for (const pair of raw.split(/[&;]/)) {
    const i = pair.indexOf("=");
    if (i <= 0) continue;
    try { setHeader(headers, decodeURIComponent(pair.slice(0, i)), decodeURIComponent(pair.slice(i + 1))); } catch {}
  }
}
function entryHeaders(extras: string[]): StreamHeaders {
  const headers: StreamHeaders = {};
  for (const line of extras) {
    if (/^#EXTHTTP:/i.test(line)) parseHeaderPayload(line.slice(line.indexOf(":") + 1), headers);
    else if (/^#KODIPROP:inputstream\.adaptive\.stream_headers=/i.test(line)) parseHeaderPayload(line.slice(line.indexOf("=") + 1), headers);
    else if (/^#EXTVLCOPT:http-(?:user-agent|referrer|origin|cookie|authorization)=/i.test(line)) {
      const i = line.indexOf("="), field = line.slice(0, i).toLowerCase();
      const name = field.endsWith("user-agent") ? "User-Agent" : field.endsWith("referrer") ? "Referer" : field.endsWith("origin") ? "Origin" : field.endsWith("cookie") ? "Cookie" : "Authorization";
      setHeader(headers, name, line.slice(i + 1));
    }
  }
  return headers;
}
function parseM3u(text: string): { channels: TvChannel[]; epgUrls: string[] } {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const header = lines.find(line => /^#EXTM3U\b/i.test(line.trim())) ?? "";
  const epg = attr(header, "url-tvg") || attr(header, "x-tvg-url");
  const channels: TvChannel[] = [];
  let current: { info: string; extras: string[] } | null = null;
  const finish = (rawUrl?: string) => {
    if (!current || !rawUrl) { current = null; return; }
    const url = safeUrl(rawUrl), type = manifestType(rawUrl);
    const comma = current.info.indexOf(",");
    const title = comma >= 0 ? current.info.slice(comma + 1).trim() : "";
    const name = attr(current.info, "tvg-name") || title;
    if (!url || !name || type === "unknown") { current = null; return; }
    const tvgId = attr(current.info, "tvg-id");
    let liveId = ""; try { liveId = new URL(url).searchParams.get("liveid") ?? ""; } catch {}
    const id = liveId ? "liveid:" + liveId : tvgId ? "tvg:" + tvgId : "name:" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const headers = entryHeaders(current.extras);
    const props = current.extras.filter(line => /^#KODIPROP:/i.test(line));
    const drmType = props.find(line => /license_type=/i.test(line))?.split("=").slice(1).join("=").trim().toLowerCase();
    const licenseRaw = props.find(line => /license_key=/i.test(line))?.split("=").slice(1).join("=").trim() ?? "";
    const licenseParts = licenseRaw.split("|").map(part => part.trim()).filter(Boolean);
    const license = licenseParts[0] ?? "";
    const licenseHeaders: StreamHeaders = {};
    for (const part of licenseParts.slice(1)) parseHeaderPayload(part, licenseHeaders);
    let drm: ChannelSource["drm"];
    if (/^(?:clearkey|org\.w3\.clearkey)$/i.test(drmType) && license) {
      const clearKeys: Record<string,string> = {};
      try {
        const parsed = JSON.parse(license);
        for (const entry of Array.isArray(parsed?.keys) ? parsed.keys : []) {
          const kid = String(entry?.kid ?? "").replace(/-/g, "").toLowerCase();
          const key = String(entry?.k ?? "").replace(/-/g, "").toLowerCase();
          if (/^[a-f0-9]{32}$/.test(kid) && /^[a-f0-9]{32}$/.test(key)) clearKeys[kid] = key;
        }
      } catch {
        for (const pair of license.split(/[|,;]/)) {
          const [kid, key] = pair.split(":");
          if (/^[a-f0-9]{32}$/i.test(kid ?? "") && /^[a-f0-9]{32}$/i.test(key ?? "")) clearKeys[kid.toLowerCase()] = key.toLowerCase();
        }
      }
      if (Object.keys(clearKeys).length) drm = { scheme: "clearkey", clearKeys };
    } else if (drmType === "com.widevine.alpha" && license) {
      drm = { scheme: "widevine", licenseUrl: safeUrl(license) || undefined, ...(Object.keys(licenseHeaders).length ? { licenseHeaders } : {}) };
    }
    const source: ChannelSource = { url, type, headers, ...(drm ? { drm } : {}) };
    channels.push({
      id, name, logo: attr(current.info, "tvg-logo") || undefined,
      group: attr(current.info, "group-title") || "Other",
      tvgId: tvgId || undefined, number: channels.length + 1,
      sources: [source], requiresDrm: props.some(line => /license_(?:type|key)|drm/i.test(line)), requiresAuthorization: Object.keys(headers).some(key => /^(?:cookie|authorization)$/i.test(key)), rawAttributes: { "tvg-id": tvgId, "tvg-name": attr(current.info, "tvg-name"), "group-title": attr(current.info, "group-title") }
    });
    current = null;
  };
  for (const raw of lines) {
    const line = raw.trim(); if (!line) continue;
    if (/^#EXTINF:/i.test(line)) { if (current) finish(); current = { info: line, extras: [] }; }
    else if (current && line.startsWith("#")) current.extras.push(line);
    else if (current && /^https?:\/\//i.test(line)) finish(line);
  }
  if (current) current = null;
  return { channels, epgUrls: epg ? epg.split(/[;,]/).map(safeUrl).filter(Boolean) : [] };
}
function fromJson(text: string): { channels: TvChannel[]; epgUrls: string[] } {
  const data = JSON.parse(text);
  const root = Array.isArray(data) ? data : data.channels ?? data.items ?? data.data?.channels ?? data.data ?? [];
  if (!Array.isArray(root)) throw new Error("JSON playlist must contain a channels array.");
  const channels = root.flatMap((item: any, index: number) => {
    if (!item || typeof item !== "object") return [];
    const name = String(item.name ?? item.title ?? item.channel_name ?? "").trim();
    if (!name) return [];
    const baseHeaders: StreamHeaders = {};
    const inputHeaders = item.headers ?? item.requestHeaders;
    if (inputHeaders && typeof inputHeaders === "object" && !Array.isArray(inputHeaders)) {
      for (const [key, value] of Object.entries(inputHeaders)) setHeader(baseHeaders, key, String(value));
    }
    const candidates = Array.isArray(item.sources) && item.sources.length ? item.sources : [item];
    const sources: ChannelSource[] = candidates.flatMap((candidate: any) => {
      if (!candidate || typeof candidate !== "object") return [];
      const url = safeUrl(candidate.url ?? candidate.link ?? candidate.stream_url ?? candidate.streamUrl ?? candidate.uri);
      if (!url) return [];
      const explicitType = String(candidate.type ?? candidate.format ?? item.type ?? "").toLowerCase();
      const type = manifestType(url) !== "unknown" ? manifestType(url) :
        /^(?:dash|mpd|application/dash\+xml)$/.test(explicitType) ? "dash" :
        /^(?:hls|m3u8|application/vnd\.apple\.mpegurl)$/.test(explicitType) ? "hls" :
        /^(?:progressive|mp4|video/mp4)$/.test(explicitType) ? "progressive" : "unknown";
      if (type === "unknown") return [];
      const headers = { ...baseHeaders };
      const sourceHeaders = candidate.headers ?? candidate.requestHeaders;
      if (sourceHeaders && typeof sourceHeaders === "object" && !Array.isArray(sourceHeaders)) {
        for (const [key, value] of Object.entries(sourceHeaders)) setHeader(headers, key, String(value));
      }
      const drmInput = candidate.drm ?? item.drm;
      let drm: ChannelSource["drm"];
      if (drmInput && typeof drmInput === "object") {
        const scheme = String(drmInput.scheme ?? drmInput.type ?? "").toLowerCase();
        const licenseHeaders: StreamHeaders = {};
        if (drmInput.licenseHeaders && typeof drmInput.licenseHeaders === "object") {
          for (const [key, value] of Object.entries(drmInput.licenseHeaders)) setHeader(licenseHeaders, key, String(value));
        }
        if (scheme.includes("clearkey") && drmInput.clearKeys && typeof drmInput.clearKeys === "object") {
          const clearKeys: Record<string,string> = {};
          for (const [kid, key] of Object.entries(drmInput.clearKeys)) {
            const cleanKid = kid.replace(/-/g, "").toLowerCase();
            const cleanKey = String(key).replace(/-/g, "").toLowerCase();
            if (/^[a-f0-9]{32}$/.test(cleanKid) && /^[a-f0-9]{32}$/.test(cleanKey)) clearKeys[cleanKid] = cleanKey;
          }
          if (Object.keys(clearKeys).length) drm = { scheme: "clearkey", clearKeys };
        } else if (scheme.includes("widevine") && safeUrl(drmInput.licenseUrl ?? drmInput.license_url)) {
          drm = { scheme: "widevine", licenseUrl: safeUrl(drmInput.licenseUrl ?? drmInput.license_url), ...(Object.keys(licenseHeaders).length ? { licenseHeaders } : {}) };
        }
      }
      return [{ url, type, headers, ...(drm ? { drm } : {}), ...(candidate.label ? { label: String(candidate.label) } : {}) }];
    });
    if (!sources.length) return [];
    return [{
      id: String(item.id ?? item.tvg_id ?? item.tvgId ?? "json:" + index), name,
      logo: safeUrl(item.logo ?? item.tvg_logo) || undefined,
      group: String(item.group ?? item.category ?? item.group_title ?? "Other"),
      tvgId: String(item.tvg_id ?? item.tvgId ?? "") || undefined, number: index + 1,
      sources, requiresDrm: sources.some(source => !!source.drm),
      requiresAuthorization: sources.some(source => Object.keys(source.headers).some(key => /^(?:cookie|authorization)$/i.test(key))),
      rawAttributes: {}
    } satisfies TvChannel];
  });
  const epgValue = data.epg ?? data.epgUrl ?? data.epg_url ?? data.url_tvg;
  const epgUrls = Array.isArray(epgValue) ? epgValue.map(safeUrl).filter(Boolean) : [safeUrl(epgValue)].filter(Boolean);
  return { channels, epgUrls };
}
export function parsePlaylistText(text: string, source: string, name?: string): Playlist {
  const normalized = String(text ?? "").replace(/^\uFEFF/, "").trim();
  if (!normalized) throw new Error("The playlist is empty.");
  const parsed = normalized.startsWith("#EXTM3U") ? parseM3u(normalized) : fromJson(normalized);
  if (!parsed.channels.length) throw new Error("No supported HTTP(S) channels were found in this playlist.");
  const unique = new Map<string, TvChannel>();
  for (const channel of parsed.channels) unique.set(channel.id, channel);
  const channels = [...unique.values()].map((channel, index) => ({ ...channel, number: index + 1 }));
  const fallbackName = (() => { try { return new URL(source).hostname; } catch { return "Imported playlist"; } })();
  return {
    id: globalThis.crypto?.randomUUID?.() ?? "playlist-" + Date.now(),
    name: name?.trim() || fallbackName,
    source, channels,
    groups: [...new Set(channels.map(channel => channel.group))].sort((a,b) => a.localeCompare(b)),
    epgUrls: parsed.epgUrls, importedAt: Date.now(), refreshIntervalMs: 300000, requestHeaders: {}
  };
}
export async function fetchPlaylistText(url: string, headers: StreamHeaders = {}): Promise<{ text: string; finalUrl: string }> {
  const target = safeUrl(url);
  if (!target) throw new Error("Enter a valid HTTP or HTTPS playlist URL.");
  if (!window.tvApp?.fetchRemoteText) throw new Error("The desktop network service is unavailable.");
  const response = await window.tvApp.fetchRemoteText(target, { ...DEFAULT_HEADERS, ...headers });
  return { text: response.text, finalUrl: response.url };
}
export const LIVE_TGTV_SOURCE = LIVE_TGTV_PLAYLIST;

function normalizeName(value: string): string { return value.toLowerCase().replace(/\b(?:hd|fhd|uhd|4k)\b/g, "").replace(/[^a-z0-9]/g, ""); }
export async function addLiveTgTvFallbacks(playlist: Playlist): Promise<Playlist> {
  let host = "";
  try { host = new URL(playlist.source).hostname.toLowerCase(); } catch { return playlist; }
  if (host !== "livetgtv.lovable.app" || !playlist.source.includes("/api/public/playlist.m3u")) return playlist;
  try {
    const response = await fetchPlaylistText(LIVE_TGTV_FALLBACK);
    const backup = parsePlaylistText(response.text, response.finalUrl).channels;
    const channels = playlist.channels.map(channel => {
      const byId = channel.tvgId ? backup.filter(item => item.tvgId?.toLowerCase() === channel.tvgId?.toLowerCase()) : [];
      const name = normalizeName(channel.name);
      const byName = name ? backup.filter(item => normalizeName(item.name) === name) : [];
      const byLogo = channel.logo ? backup.filter(item => item.logo === channel.logo) : [];
      const match = byId.length === 1 ? byId[0] : byName.length === 1 ? byName[0] : byLogo.length === 1 ? byLogo[0] : undefined;
      if (!match || match.requiresDrm || match.requiresAuthorization || channel.sources.some(s => s.url === match.sources[0]?.url)) return channel;
      return { ...channel, sources: [...channel.sources, { ...match.sources[0], label: "LiveTGTV backup" }] };
    });
    return { ...playlist, channels };
  } catch { return playlist; }
}
