import type { Playlist, PlaylistFetchOptions } from "../types";
import { parsePlaylist } from "./m3uParser";

export interface AddPlaylistOptions extends PlaylistFetchOptions { id?: string; name?: string; refreshIntervalMs?: number; }
export class PlaylistManager {
  private timers = new Map<string, ReturnType<typeof setInterval>>();
  private controllers = new Map<string, AbortController>();
  private fetchOptions = new Map<string, PlaylistFetchOptions>();

  async load(source: string, options: AddPlaylistOptions = {}): Promise<Playlist> {
    const isUrl = /^https?:\/\//i.test(source);
    let text: string;
    if (isUrl) {
      const response = await fetch(source, { headers: options.headers, signal: options.signal, cache: "no-store" });
      if (!response.ok) throw new Error(`Playlist request failed: HTTP ${response.status}`);
      text = await response.text();
    } else text = source;
    const channels = parsePlaylist(text);
    const epg = [...text.matchAll(/(?:url-tvg|x-tvg-url|tvg-url)\s*=\s*["']([^"']+)["']/gi)].map(match => match[1]);
    const id = options.id ?? (globalThis.crypto?.randomUUID?.() ?? `playlist-${Date.now()}`);
    this.fetchOptions.set(id, { headers: options.headers });
    return { id, name: options.name ?? (isUrl ? new URL(source).hostname : "Local playlist"), source, channels,
      groups: [...new Set(channels.map(channel => channel.group))], epgUrls: [...new Set(epg)],
      fetchedAt: Date.now(), refreshIntervalMs: options.refreshIntervalMs };
  }

  async loadFile(file: File, options: AddPlaylistOptions = {}): Promise<Playlist> {
    const playlist = await this.load(await file.text(), { ...options, name: options.name ?? file.name });
    return { ...playlist, source: file.name };
  }

  async refreshChannel(playlist: Playlist, channelId: string): Promise<Playlist["channels"][number] | null> {
    if (!/^https?:\\/\\//i.test(playlist.source)) return null;
    const refreshed = await this.load(playlist.source, {
      ...this.fetchOptions.get(playlist.id), id: playlist.id, name: playlist.name,
      refreshIntervalMs: playlist.refreshIntervalMs
    });
    return refreshed.channels.find(channel => channel.id === channelId) ?? null;
  }

  startAutoRefresh(playlist: Playlist, onUpdate: (next: Playlist) => void, onError?: (error: Error) => void): void {
    const oldTimer = this.timers.get(playlist.id);
    if (oldTimer) clearInterval(oldTimer);
    this.controllers.get(playlist.id)?.abort();
    this.timers.delete(playlist.id);
    if (!playlist.refreshIntervalMs || !/^https?:\/\//i.test(playlist.source)) return;
    const timer = setInterval(async () => {
      this.controllers.get(playlist.id)?.abort();
      const controller = new AbortController();
      this.controllers.set(playlist.id, controller);
      try {
        onUpdate(await this.load(playlist.source, {
          ...this.fetchOptions.get(playlist.id), id: playlist.id, name: playlist.name,
          refreshIntervalMs: playlist.refreshIntervalMs, signal: controller.signal
        }));
      } catch (error) {
        if (!controller.signal.aborted) onError?.(error instanceof Error ? error : new Error(String(error)));
      }
    }, playlist.refreshIntervalMs);
    this.timers.set(playlist.id, timer);
  }

  stopAutoRefresh(id: string): void {
    const timer = this.timers.get(id);
    if (timer) clearInterval(timer);
    this.controllers.get(id)?.abort();
    this.timers.delete(id);
    this.controllers.delete(id);
    this.fetchOptions.delete(id);
  }
  dispose(): void { for (const id of [...this.timers.keys()]) this.stopAutoRefresh(id); }
}
