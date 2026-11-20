export type StreamHeaders = Record<string, string>;
export type DrmConfig = {
  scheme: "clearkey" | "widevine";
  licenseUrl?: string;
  clearKeys?: Record<string, string>;
  licenseHeaders?: StreamHeaders;
  rawLicenseKey?: string;
};
export interface Channel {
  id: string; name: string; url: string; logo?: string; group: string; tvgId?: string;
  tvgName?: string; channelNumber?: number; duration?: number; headers: StreamHeaders;
  drm?: DrmConfig; manifestType?: "hls" | "dash" | "unknown" | "progressive";
  catchup?: string; catchupDays?: number; catchupSource?: string; rawAttributes: Record<string, string>;
}
export interface Playlist {
  id: string; name: string; source: string; channels: Channel[]; groups: string[];
  epgUrls: string[]; fetchedAt: number; refreshIntervalMs?: number;
}
export interface PlaylistFetchOptions { headers?: StreamHeaders; signal?: AbortSignal; }
export type JsonPlaylist = { channels?: unknown[]; streams?: unknown[]; items?: unknown[]; data?: unknown[]; epg?: string | string[]; name?: string };

export type DesktopUpdateState = {
  status: "idle" | "checking" | "available" | "not-available" | "downloading" | "downloaded" | "error" | "unsupported";
  version?: string;
  percent?: number;
  message?: string;
};

declare global {
  interface Window {
    tvApp?: {
      platform(): Promise<string>;
      fetchRemoteText(url: string, headers: StreamHeaders | undefined, requestId: string): Promise<{ text: string; url: string; status: number }>;
      cancelRemoteText(requestId: string): Promise<{ cancelled: boolean }>;
      setStreamRequestContext(context: { originUrl: string; headers: Record<string, string> } | null): Promise<{ active: boolean }>;
      getUpdateState(): Promise<DesktopUpdateState>;
      checkForUpdates(): Promise<{ accepted: boolean }>;
      downloadUpdate(): Promise<{ accepted: boolean }>;
      installUpdate(): Promise<{ accepted: boolean }>;
      onUpdateState(listener: (state: DesktopUpdateState) => void): () => void;
    };
  }
}
