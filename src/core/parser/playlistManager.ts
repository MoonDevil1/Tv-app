import type { Playlist, PlaylistFetchOptions } from "../types";
import { parsePlaylist } from "./m3uParser";

export interface AddPlaylistOptions extends PlaylistFetchOptions { id?: string; name?: string; refreshIntervalMs?: number; }
type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

function extractEpgUrls(source: string, baseUrl?: string): string[] {
  const values = [...source.matchAll(/(?:url-tvg|x-tvg-url|tvg-url)\s*=\s*["']([^"']+)["']/gi)].map(match => match[1]);
  const trimmed = source.trim();
  if (trimmed.startsWith("{")) {
    const root = JSON.parse(trimmed) as { epg?: unknown };
    if (typeof root.epg === "string") values.push(root.epg);
    else if (Array.isArray(root.epg)) values.push(...root.epg.filter((value): value is string => typeof value === "string"));
  }
  return [...new Set(values.flatMap(value => {
    try {
      const url = new URL(value.trim(), baseUrl);
      return url.protocol === "http:" || url.protocol === "https:" ? [url.toString()] : [];
    } catch { return []; }
  }))];
}

export class PlaylistManager {
  private timers = new Map<string, ReturnType<typeof setInterval>>();
  private controllers = new Map<string, AbortController>();
  private fetchOptions = new Map<string, PlaylistFetchOptions>();
  private playlists = new Map<string, Playlist>();
  constructor(private readonly fetcher: Fetcher = async (input, init) => {
    const api = window.tvApp;
    if (!api?.fetchRemoteText) throw new Error("Remote playlist downloads are only available in the desktop app.");
    if (init?.signal?.aborted) {
      const cancelled = new Error("Remote request was cancelled.");
      cancelled.name = "AbortError";
      throw cancelled;
    }
    const requestId = globalThis.crypto.randomUUID();
    const cancel = () => { void api.cancelRemoteText(requestId).catch(() => undefined); };
    init?.signal?.addEventListener("abort", cancel, { once: true });
    try {
      const result = await api.fetchRemoteText(input, init?.headers as Record<string, string> | undefined, requestId);
      const body = [204, 205, 304].includes(result.status) ? null : result.text;
      const response = new Response(body, { status: result.status });
      Object.defineProperty(response, "url", { value: result.url });
      return response;
    } finally {
      init?.signal?.removeEventListener("abort", cancel);
    }
  }) {}

  async load(source: string, options: AddPlaylistOptions = {}): Promise<Playlist> {
    const isUrl = /^https?:\/\//i.test(source);
    let text = source;
    let baseUrl: string | undefined;
    if (isUrl) {
      const response = await this.fetcher(source, { headers: options.headers, signal: options.signal, cache: "no-store", redirect: "follow" });
      if (!response.ok) throw new Error(`Playlist request failed: HTTP ${response.status}`);
      text = await response.text();
      baseUrl = response.url || source;
    }
    const channels = parsePlaylist(text, baseUrl);
    const epg = extractEpgUrls(text, baseUrl);
    const id = options.id ?? (globalThis.crypto?.randomUUID?.() ?? `playlist-${Date.now()}`);
    const playlist: Playlist = {
      id, name: options.name ?? (isUrl ? new URL(source).hostname : "Local playlist"), source, channels,
      groups: [...new Set(channels.map(channel => channel.group))], epgUrls: [...new Set(epg)],
      fetchedAt: Date.now(), refreshIntervalMs: options.refreshIntervalMs
    };
    this.fetchOptions.set(id, { headers: options.headers });
    this.playlists.set(id, playlist);
    return playlist;
  }

  async loadFile(file: File, options: AddPlaylistOptions = {}): Promise<Playlist> {
    return this.load(await file.text(), { ...options, name: options.name ?? file.name });
  }

  get(id: string): Playlist | undefined { return this.playlists.get(id); }
  list(): Playlist[] { return [...this.playlists.values()]; }
  remove(id: string): boolean { this.stopAutoRefresh(id); this.fetchOptions.delete(id); return this.playlists.delete(id); }

  async refresh(playlistId: string): Promise<Playlist> {
    const current = this.playlists.get(playlistId);
    if (!current || !/^https?:\/\//i.test(current.source)) throw new Error("Only a loaded remote playlist can be refreshed.");
    return this.load(current.source, {
      ...this.fetchOptions.get(playlistId), id: current.id, name: current.name,
      refreshIntervalMs: current.refreshIntervalMs
    });
  }

  async refreshChannel(playlist: Playlist, channelId: string): Promise<Playlist["channels"][number] | null> {
    const updated = await this.refresh(playlist.id);
    return updated.channels.find(channel => channel.id === channelId || channel.url === playlist.channels.find(item => item.id === channelId)?.url) ?? null;
  }

  startAutoRefresh(playlist: Playlist, onUpdate: (next: Playlist) => void, onError?: (error: Error) => void): void {
    this.stopAutoRefresh(playlist.id);
    if (!playlist.refreshIntervalMs || !/^https?:\/\//i.test(playlist.source)) return;
    const timer = setInterval(async () => {
      this.controllers.get(playlist.id)?.abort();
      const controller = new AbortController();
      this.controllers.set(playlist.id, controller);
      try {
        const updated = await this.load(playlist.source, {
          ...this.fetchOptions.get(playlist.id), id: playlist.id, name: playlist.name,
          refreshIntervalMs: playlist.refreshIntervalMs, signal: controller.signal
        });
        if (!controller.signal.aborted) onUpdate(updated);
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
  }
  dispose(): void { for (const id of [...this.timers.keys()]) this.stopAutoRefresh(id); }
}
