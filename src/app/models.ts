export type AppSection = "Home" | "Live TV" | "Guide" | "Favorites" | "History" | "Playlists" | "Settings";
export type ThemeMode = "light" | "dark";
export type ManifestType = "hls" | "dash" | "progressive" | "unknown";
export type DrmScheme = "clearkey" | "widevine" | "playready" | "fairplay";
export type StreamHeaders = Record<string, string>;
export interface DrmConfiguration {
  scheme: DrmScheme; licenseUrl?: string; licenseHeaders?: StreamHeaders;
  clearKeys?: Record<string, string>; certificateUrl?: string; contentId?: string;
  base64Certificate?: boolean; multiDrm?: boolean;
}
export interface ChannelSource { url: string; type: ManifestType; headers: StreamHeaders; drm?: DrmConfiguration; label?: string; }
export interface TvChannel {
  id: string; name: string; logo?: string; group: string; tvgId?: string; number?: number;
  duration?: number; catchupDays?: number; sources: ChannelSource[]; rawAttributes: Record<string, string>;
}
export interface Playlist {
  id: string; name: string; source: string; channels: TvChannel[]; groups: string[];
  epgUrls: string[]; importedAt: number; refreshedAt?: number; refreshIntervalMs: number;
  requestHeaders: StreamHeaders;
}
export interface EpgProgramme { channelId: string; title: string; description?: string; start: number; stop: number; }
export interface RecentChannel { playlistId: string; channelId: string; watchedAt: number; }
export interface AppSettings {
  theme: ThemeMode; defaultRefreshIntervalMs: number; preferredQuality: "auto" | "1080p" | "720p" | "480p";
  autoplayNextChannel: boolean; showChannelNumbers: boolean; diagnosticsEnabled: boolean;
}