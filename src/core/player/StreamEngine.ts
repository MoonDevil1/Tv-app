import Hls from "hls.js";
import shaka from "shaka-player";
import type { Channel } from "../types";
import { waitForMediaEvent } from "./mediaEvents";
import { licenseHeadersForRequest, shakaDrmConfiguration, streamHeadersForRequest } from "./streamPolicy";


export type PlaybackState = "idle" | "loading" | "playing" | "error";

export interface StreamEngineOptions {
  onState?: (state: PlaybackState, error?: Error) => void;
  onRecover?: (channel: Channel) => Promise<Channel | null>;
}

export class StreamEngine {
  private hls: Hls | null = null;
  private shakaPlayer: shaka.Player | null = null;
  private video: HTMLVideoElement | null = null;
  private generation = 0;
  private recovered = new Set<string>();
  private mediaAbort: AbortController | null = null;
  constructor(private readonly options: StreamEngineOptions = {}) {}

  async play(video: HTMLVideoElement, channel: Channel): Promise<void> {
    await this.stop();
    const generation = ++this.generation;
    const abortController = new AbortController();
    this.mediaAbort = abortController;
    this.video = video;
    this.options.onState?.("loading");
    try {
      await window.tvApp?.setStreamRequestContext({ originUrl: channel.url, headers: channel.headers });
      if (channel.manifestType === "dash" || /\.mpd(?:$|[?#])/i.test(channel.url)) await this.playDash(video, channel, generation);
      else if (channel.manifestType === "progressive" || /\.(?:mp4|m4v|webm|ogg)(?:$|[?#])/i.test(channel.url)) await this.playProgressive(video, channel, abortController.signal);
      else await this.playHls(video, channel, generation, abortController.signal);
      if (generation !== this.generation) return;
      await video.play();
      this.options.onState?.("playing");
    } catch (error) {
      if (generation !== this.generation) return;
      const err = error instanceof Error ? error : new Error(String(error));
      if (await this.tryRecover(channel, generation, err)) return;
      this.options.onState?.("error", err);
      throw err;
    }
  }

  private async tryRecover(channel: Channel, generation: number, error: Error): Promise<boolean> {
    if (!this.options.onRecover || this.recovered.has(channel.id) || !/401|403|410|expired|forbidden|unauthori[sz]ed/i.test(error.message)) return false;
    this.recovered.add(channel.id);
    const refreshed = await this.options.onRecover(channel);
    if (!refreshed || generation !== this.generation || !this.video) return false;
    await this.play(this.video, refreshed);
    return true;
  }
  private async playDash(video: HTMLVideoElement, channel: Channel, generation: number): Promise<void> {
    shaka.polyfill.installAll();
    const player = new shaka.Player();
    this.shakaPlayer = player;
    await player.attach(video);
    const drmConfiguration = shakaDrmConfiguration(channel.drm);
    if (drmConfiguration.drm) player.configure(drmConfiguration);
    player.getNetworkingEngine()?.registerRequestFilter((type, request) => {
      if (generation !== this.generation) return;
      for (const uri of request.uris) {
        try {
          const streamHeaders = streamHeadersForRequest(channel, uri);
          for (const [name, value] of Object.entries(streamHeaders)) request.headers[name] = value;
          if (type === shaka.net.NetworkingEngine.RequestType.LICENSE) {
            const licenseHeaders = licenseHeadersForRequest(channel.drm, uri);
            for (const [name, value] of Object.entries(licenseHeaders)) request.headers[name] = value;
          }
        } catch { /* malformed or non-HTTP request URI */ }
      }
    });
    player.addEventListener("error", event => {
      if (generation !== this.generation) return;
      const detail = (event as Event & { detail?: { code?: number; data?: unknown[] } }).detail;
      const response = detail?.data?.[1] as { status?: number } | undefined;
      if ([401, 403, 410].includes(Number(response?.status))) void this.tryRecover(channel, generation, new Error(`HTTP ${response?.status}`));
      else if (detail) this.options.onState?.("error", new Error(`Shaka playback error ${detail.code ?? "unknown"}`));
    });
    await player.load(channel.url);
  }

  private async playProgressive(video: HTMLVideoElement, channel: Channel, signal: AbortSignal): Promise<void> {
    video.src = channel.url;
    await waitForMediaEvent(video, "loadedmetadata", "error", 20_000, "Progressive stream metadata load timed out or failed.", signal);
  }

  private async playHls(video: HTMLVideoElement, channel: Channel, generation: number, signal: AbortSignal): Promise<void> {
    if (Hls.isSupported()) {
      const hls = new Hls({ xhrSetup: (xhr, url) => {
        for (const [name, value] of Object.entries(streamHeadersForRequest(channel, url))) {
          xhr.setRequestHeader(name, value);
        }
      } });
      this.hls = hls;
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal || generation !== this.generation) return;
        if ([401, 403, 410].includes(Number(data.response?.code))) {
          void this.tryRecover(channel, generation, new Error(`HTTP ${data.response?.code}`));
        } else this.options.onState?.("error", new Error(data.details));
      });
      const manifestReady = new Promise<void>((resolve, reject) => {
        let timeout: number | undefined;
        const finish = (error?: Error) => {
          if (timeout !== undefined) window.clearTimeout(timeout);
          hls.off(Hls.Events.MANIFEST_PARSED, onParsed);
          hls.off(Hls.Events.ERROR, onError);
          signal.removeEventListener("abort", onAbort);
          if (error) reject(error); else resolve();
        };
        const onParsed = () => finish();
        const onError = (_event: string, data: { fatal: boolean; details: string }) => {
          if (data.fatal) finish(new Error(data.details));
        };
        const onAbort = () => {
          hls.stopLoad();
          finish(Object.assign(new Error("HLS manifest load was cancelled."), { name: "AbortError" }));
        };
        timeout = window.setTimeout(() => finish(new Error("HLS manifest load timed out.")), 20_000);
        hls.on(Hls.Events.MANIFEST_PARSED, onParsed);
        hls.on(Hls.Events.ERROR, onError);
        signal.addEventListener("abort", onAbort, { once: true });
        if (signal.aborted) onAbort();
      });
      hls.loadSource(channel.url);
      hls.attachMedia(video);
      await manifestReady;
      return;
    }
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = channel.url;
      await waitForMediaEvent(video, "loadedmetadata", "error", 20_000, "Native HLS metadata load timed out or failed.", signal);
      return;
    }
    throw new Error("HLS playback is not supported by this runtime.");
  }

  getQualityOptions(): Array<{ id: number; label: string }> {
    if (this.hls) return this.hls.levels.map((level, id) => ({ id, label: level.height ? `${level.height}p` : `${Math.round(level.bitrate / 1000)} kbps` }));
    return (this.shakaPlayer?.getVariantTracks() ?? []).filter((track, index, all) => all.findIndex(item => item.height === track.height && item.bandwidth === track.bandwidth) === index).map(track => ({ id: track.id, label: track.height ? `${track.height}p` : `${Math.round(track.bandwidth / 1000)} kbps` }));
  }

  setQuality(id: number): void {
    if (this.hls) this.hls.currentLevel = id;
    else if (id < 0) this.shakaPlayer?.configure({ abr: { enabled: true } });
    else {
      const track = this.shakaPlayer?.getVariantTracks().find(item => item.id === id);
      if (track) { this.shakaPlayer?.configure({ abr: { enabled: false } }); this.shakaPlayer?.selectVariantTrack(track, true); }
    }
  }

  getAudioOptions(): Array<{ id: number; label: string }> {
    if (this.hls) return this.hls.audioTracks.map((track, id) => ({ id, label: track.name || track.lang || `Audio ${id + 1}` }));
    const tracks = this.shakaPlayer?.getVariantTracks() ?? [];
    const unique = new Map<string, { id: number; label: string }>();
    tracks.forEach(track => {
      const key = String(track.language || track.audioId || track.id);
      if (!unique.has(key)) unique.set(key, { id: track.id, label: String(track.language || `Audio ${unique.size + 1}`) });
    });
    return [...unique.values()];
  }

  selectAudio(id: number): void {
    if (this.hls) this.hls.audioTrack = id;
    else {
      const track = this.shakaPlayer?.getVariantTracks().find(item => item.id === id);
      if (track?.language) this.shakaPlayer?.selectAudioLanguage(String(track.language));
    }
  }

  getSelectedAudioId(): number {
    if (this.hls) return this.hls.audioTrack;
    return this.shakaPlayer?.getVariantTracks().find(track => track.active)?.id ?? -1;
  }

  getSubtitleOptions(): Array<{ id: number; label: string }> {
    if (this.hls) return this.hls.subtitleTracks.map((track, id) => ({ id, label: track.name || track.lang || `Subtitle ${id + 1}` }));
    return (this.shakaPlayer?.getTextTracks() ?? []).map(track => ({ id: track.id, label: track.language || track.kind || `Subtitle ${track.id + 1}` }));
  }

  selectSubtitle(id: number): void {
    if (this.hls) this.hls.subtitleTrack = id;
    else if (this.shakaPlayer) {
      if (id < 0) this.shakaPlayer.setTextTrackVisibility(false);
      else {
        const track = this.shakaPlayer.getTextTracks().find(item => item.id === id);
        if (track) { this.shakaPlayer.selectTextTrack(track); this.shakaPlayer.setTextTrackVisibility(true); }
      }
    }
  }

  getSelectedSubtitleId(): number {
    if (this.hls) return this.hls.subtitleTrack;
    return this.shakaPlayer?.getTextTracks().find(track => track.active)?.id ?? -1;
  }

  async stop(): Promise<void> {
    this.generation++;
    this.mediaAbort?.abort();
    this.mediaAbort = null;
    try { await window.tvApp?.setStreamRequestContext(null); } catch { /* Continue local cleanup if IPC is unavailable. */ }
    this.hls?.destroy(); this.hls = null;
    if (this.shakaPlayer) { await this.shakaPlayer.destroy(); this.shakaPlayer = null; }
    if (this.video) { this.video.pause(); this.video.removeAttribute("src"); this.video.load(); this.video = null; }
    this.options.onState?.("idle");
  }
  async destroy(): Promise<void> { await this.stop(); this.recovered.clear(); }
}
