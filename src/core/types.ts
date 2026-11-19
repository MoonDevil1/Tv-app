export type StreamHeaders = Record<string, string>;
export type DrmConfig = { scheme: "clearkey"; licenseUrl?: string; clearKeys?: Record<string, string> };
export interface Channel {
  id: string; name: string; url: string; logo?: string; group: string; tvgId?: string;
  tvgName?: string; channelNumber?: number; duration?: number; headers: StreamHeaders;
  drm?: DrmConfig; manifestType?: "hls" | "dash" | "unknown";
  catchup?: string; catchupDays?: number; catchupSource?: string; rawAttributes: Record<string, string>;
}
export interface Playlist {
  id: string; name: string; source: string; channels: Channel[]; groups: string[];
  epgUrls: string[]; fetchedAt: number; refreshIntervalMs?: number;
}
export interface PlaylistFetchOptions { headers?: StreamHeaders; signal?: AbortSignal; }
export type JsonPlaylist = { channels?: unknown[]; streams?: unknown[]; items?: unknown[]; epg?: string | string[]; name?: string };
