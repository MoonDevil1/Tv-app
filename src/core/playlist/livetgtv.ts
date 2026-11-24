import type { ChannelSource, DrmConfiguration, StreamHeaders, TvChannel } from "../../app/models";
import { fetchPlaylistText } from "./parser";

const API = "https://livetgtv.lovable.app/api/public/channels";
type ApiDetails = { sources?: unknown; headers?: unknown; drm?: { type?: string; keyId?: string; key?: string; clearKeys?: Record<string,string>; licenseServer?: string; licenseUrl?: string; headers?: unknown; multiDrm?: boolean; contentId?: string; certificateUrl?: string; base64Certificate?: boolean } | null };
const isRecord = (v: unknown): v is Record<string,unknown> => !!v && typeof v === "object" && !Array.isArray(v);
function headersFrom(...values: unknown[]): StreamHeaders {
  const out: StreamHeaders = {};
  for (const value of values) if (isRecord(value)) for (const [key, raw] of Object.entries(value)) {
    const v = String(raw ?? "").trim();
    if (key && v && !/[\r\n]/.test(key + v)) {
      const existing = Object.keys(out).find(k => k.toLowerCase() === key.toLowerCase());
      out[existing ?? key] = v;
    }
  }
  return out;
}
function drmFrom(value: ApiDetails["drm"]): DrmConfiguration | undefined {
  if (!value || typeof value !== "object") return;
  const type = String(value.type ?? "").toLowerCase();
  if (type === "clearkey") {
    const clearKeys: Record<string,string> = {};
    if (isRecord(value.clearKeys)) for (const [kid,key] of Object.entries(value.clearKeys)) if (/^[a-f0-9]{32}$/i.test(kid) && /^[a-f0-9]{32}$/i.test(String(key))) clearKeys[kid.toLowerCase()] = String(key).toLowerCase();
    if (!Object.keys(clearKeys).length && value.keyId && value.key) if (/^[a-f0-9]{32}$/i.test(value.keyId) && /^[a-f0-9]{32}$/i.test(value.key)) clearKeys[value.keyId.toLowerCase()] = value.key.toLowerCase();
    return Object.keys(clearKeys).length ? { scheme: "clearkey", clearKeys } : undefined;
  }
  if (["widevine","playready","fairplay"].includes(type)) {
    const licenseUrl = String(value.licenseServer ?? value.licenseUrl ?? "");
    if (!licenseUrl) return;
    return { scheme: type as DrmConfiguration["scheme"], licenseUrl, licenseHeaders: headersFrom(value.headers), multiDrm: !!value.multiDrm, contentId: value.contentId, certificateUrl: value.certificateUrl, base64Certificate: !!value.base64Certificate };
  }
}
function manifest(url: string, fallback: ChannelSource["type"] = "unknown"): ChannelSource["type"] {
  const value = url.toLowerCase();
  if (/\.mpd(?:$|[?#])/.test(value)) return "dash";
  if (/\.m3u8(?:$|[?#])/.test(value)) return "hls";
  if (/\.(?:mp4|m4v)(?:$|[?#])/.test(value)) return "progressive";
  try { const nested = new URL(url).searchParams.get("url"); if (nested) return manifest(nested, fallback); } catch {}
  return fallback;
}
export async function resolveLiveTgTvChannel(channel: TvChannel): Promise<TvChannel> {
  const id = (channel.rawAttributes["live-id"] || channel.tvgId || channel.id.match(/^(?:liveid|tvg):(.+)$/)?.[1] || "").trim();
  if (!id || channel.id.startsWith("name:")) return channel;
  try {
    const { text } = await fetchPlaylistText(API + "/" + encodeURIComponent(id), { Accept: "application/json", "Cache-Control": "no-cache", "User-Agent": "Vega-LiveTGTV/1.0" });
    const details = JSON.parse(text) as ApiDetails;
    const urls = Array.isArray(details.sources) ? details.sources.map(v => typeof v === "string" ? v.trim() : "").filter(v => /^https?:\/\//i.test(v)) : [];
    const drm = drmFrom(details.drm) ?? channel.sources.find(source => source.drm)?.drm;
    const mediaHeaders = headersFrom(channel.sources[0]?.headers, details.headers);
    const sources = urls.map((url,index) => ({ url, type: manifest(url, channel.sources[0]?.type ?? "unknown"), headers: mediaHeaders, ...(drm ? { drm } : {}), label: urls.length > 1 ? "LiveTGTV " + (index + 1) : "LiveTGTV" }));
    const fallbacks = channel.sources.filter(source => source.label === "LiveTGTV backup");
    const playlistSources = channel.sources.filter(source => !urls.includes(source.url)).map(source => ({ ...source, label: source.label ?? "LiveTGTV playlist backup" }));
    if (sources.length) return { ...channel, sources: [...sources, ...playlistSources, ...fallbacks] };
    return { ...channel, sources: [...playlistSources, ...fallbacks] };
  } catch {
    return { ...channel, sources: channel.sources };
  }
}
