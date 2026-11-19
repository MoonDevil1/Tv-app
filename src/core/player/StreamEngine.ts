import Hls from "hls.js";
import shaka from "shaka-player";
import type { Channel } from "../types";

export type PlaybackState = "idle" | "loading" | "playing" | "error";
export interface StreamEngineOptions {
  onState?: (state: PlaybackState, error?: Error) => void;
  onRecover?: (channel: Channel) => Promise<Channel | null>;
}
const FORBIDDEN_BROWSER_HEADERS = /^(?:accept-encoding|connection|content-length|cookie|host|origin|referer|te|trailer|transfer-encoding|upgrade|user-agent|proxy-|sec-)/i;
function isBrowserForbiddenHeader(name: string): boolean { return FORBIDDEN_BROWSER_HEADERS.test(name); }

export class StreamEngine {
  private hls: Hls | null = null;
  private shakaPlayer: shaka.Player | null = null;
  private video: HTMLVideoElement | null = null;
  private generation = 0;
  private recovered = new Set<string>();
  constructor(private readonly options: StreamEngineOptions = {}) {}

  async play(video: HTMLVideoElement, channel: Channel): Promise<void> {
    await this.stop();
    const generation = ++this.generation;
    this.video = video;
    await window.tvApp?.setStreamRequestContext({ originUrl: channel.url, headers: channel.headers });
    this.options.onState?.("loading");
    try {
      if (channel.manifestType === "dash" || /\.mpd(?:$|[?#])/i.test(channel.url)) await this.playDash(video, channel, generation);
      else await this.playHls(video, channel, generation);
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

  private originHost(channel: Channel): string {
    try { return new URL(channel.url).hostname.toLowerCase(); } catch { return ""; }
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
    if (channel.drm?.scheme === "clearkey" && channel.drm.clearKeys) {
      player.configure({ drm: { clearKeys: channel.drm.clearKeys } });
    } else if (channel.drm?.scheme === "clearkey" && channel.drm.licenseUrl) {
      player.configure({ drm: { servers: { "org.w3.clearkey": channel.drm.licenseUrl } } });
    } else if (channel.drm?.scheme === "widevine" && channel.drm.licenseUrl) {
      player.configure({ drm: { servers: { "com.widevine.alpha": channel.drm.licenseUrl } } });
    }
    const host = this.originHost(channel);
    player.getNetworkingEngine()?.registerRequestFilter((type, request) => {
      if (generation !== this.generation) return;
      for (const uri of request.uris) {
        try {
          const requestHost = new URL(uri).hostname.toLowerCase();
          if (requestHost === host) {
            for (const [name, value] of Object.entries(channel.headers)) {
              if (!isBrowserForbiddenHeader(name)) request.headers[name] = value;
            }
          }
          const licenseHost = channel.drm?.licenseUrl ? new URL(channel.drm.licenseUrl).hostname.toLowerCase() : "";
          if (type === shaka.net.NetworkingEngine.RequestType.LICENSE && requestHost === licenseHost && channel.drm?.licenseHeaders) {
            for (const [name, value] of Object.entries(channel.drm.licenseHeaders)) {
              if (!isBrowserForbiddenHeader(name)) request.headers[name] = value;
            }
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

  private async playProgressive(video: HTMLVideoElement, channel: Channel): Promise<void> {
    video.src = channel.url;
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("Stream metadata load timed out.")), 20_000);
      video.addEventListener("loadedmetadata", () => { clearTimeout(timeout); resolve(); }, { once: true });
      video.addEventListener("error", () => { clearTimeout(timeout); reject(new Error("Progressive stream could not be loaded.")); }, { once: true });
    });
  }

  private async playHls(video: HTMLVideoElement, channel: Channel, generation: number): Promise<void> {
    if (Hls.isSupported()) {
      const host = this.originHost(channel);
      const hls = new Hls({ xhrSetup: (xhr, url) => {
        try {
          if (new URL(url).hostname.toLowerCase() !== host) return;
          for (const [name, value] of Object.entries(channel.headers)) {
            if (!isBrowserForbiddenHeader(name)) xhr.setRequestHeader(name, value);
          }
        } catch { /* malformed request URL */ }
      } });
      this.hls = hls;
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal || generation !== this.generation) return;
        if ([401, 403, 410].includes(Number(data.response?.code))) {
          void this.tryRecover(channel, generation, new Error(`HTTP ${data.response?.code}`));
        } else this.options.onState?.("error", new Error(data.details));
      });
      hls.loadSource(channel.url);
      hls.attachMedia(video);
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error("HLS manifest load timed out.")), 20_000);
        hls.once(Hls.Events.MANIFEST_PARSED, () => { clearTimeout(timeout); resolve(); });
        hls.once(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) { clearTimeout(timeout); reject(new Error(data.details)); }
        });
      });
      return;
    }
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = channel.url;
      await new Promise<void>((resolve, reject) => {
        video.addEventListener("loadedmetadata", () => resolve(), { once: true });
        video.addEventListener("error", () => reject(new Error("Native HLS playback failed.")), { once: true });
      });
      return;
    }
    throw new Error("HLS playback is not supported by this runtime.");
  }

  getQualityOptions(): Array<{ id: number; label: string }> {
    if (this.hls) return this.hls.levels.map((level, id) => ({ id, label: level.height ? `${level.height}p` : `${Math.round(level.bitrate / 1000)} kbps` }));
    return (this.shakaPlayer?.getVariantTracks() ?? []).filter((track, index, all) => all.findIndex(item => item.height === track.height && item.bandwidth === track.bandwidth) === index).map((track, id) => ({ id: track.id, label: track.height ? `${track.height}p` : `${Math.round(track.bandwidth / 1000)} kbps` }));
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
      const key = track.language || track.audioId || String(track.id);
      if (!unique.has(key)) unique.set(key, { id: track.id, label: track.language || `Audio ${unique.size + 1}` });
    });
    return [...unique.values()];
  }

  selectAudio(id: number): void {
    if (this.hls) this.hls.audioTrack = id;
    else {
      const track = this.shakaPlayer?.getVariantTracks().find(item => item.id === id);
      if (track?.language) this.shakaPlayer?.selectAudioLanguage(track.language);
    }
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

  async stop(): Promise<void> {
    this.generation++;
    await window.tvApp?.setStreamRequestContext(null);
    this.hls?.destroy(); this.hls = null;
    if (this.shakaPlayer) { await this.shakaPlayer.destroy(); this.shakaPlayer = null; }
    if (this.video) { this.video.pause(); this.video.removeAttribute("src"); this.video.load(); this.video = null; }
    this.options.onState?.("idle");
  }
  async destroy(): Promise<void> { await this.stop(); this.recovered.clear(); }
}
