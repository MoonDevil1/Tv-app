import { useCallback, useEffect, useMemo, useRef, useState, type WheelEvent } from "react";
import { AudioLines, Check, ChevronLeft, ChevronRight, Maximize, Minimize, MonitorPlay, Pause, PictureInPicture2, Play, Radio, Settings2, Volume2, VolumeX, X, Subtitles } from "lucide-react";
import type { Channel } from "../core/types";
import { currentAndNext, parseLiveTgGuide, parseXmltv } from "../core/epg/xmltv";
import { useAppStore } from "../core/store/appStore";
import { StreamEngine, type PlaybackState } from "../core/player/StreamEngine";

type Props = {
  channel: Channel;
  channels: Channel[];
  onClose: () => void;
  onChangeChannel: (channel: Channel) => void;
  onRecover: (channel: Channel) => Promise<Channel | null>;
};
type Option = { id: number; label: string };

export function Player({ channel, channels, onClose, onChangeChannel, onRecover }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const engineRef = useRef<StreamEngine | null>(null);
  const hideRef = useRef<number | undefined>(undefined);
  const [state, setState] = useState<PlaybackState>("loading");
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0.85);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [live, setLive] = useState(true);
  const [hud, setHud] = useState(true);
  const [mini, setMini] = useState(false);
  const [fit, setFit] = useState<"contain" | "cover" | "fill">("contain");
  const [menu, setMenu] = useState<"quality" | "audio" | "subtitles" | "zap" | null>(null);
  const [quality, setQuality] = useState<Option[]>([]);
  const [audio, setAudio] = useState<Option[]>([]);
  const [subtitles, setSubtitles] = useState<Option[]>([]);
  const [selectedQuality, setSelectedQuality] = useState(-1);
  const [selectedAudio, setSelectedAudio] = useState(-1);
  const [selectedSubtitle, setSelectedSubtitle] = useState(-1);
  const [epgClock, setEpgClock] = useState(Date.now());
  const epgPrograms = useAppStore(s => s.epgPrograms);
  const setEpgPrograms = useAppStore(s => s.setEpgPrograms);
  const playlists = useAppStore(s => s.playlists);
  const epgLoadRef = useRef(new Set<string>());
  const reportedErrorsRef = useRef(new Set<string>());
  const channelRef = useRef(channel);
  const lastStallReportRef = useRef(0);
  channelRef.current = channel;
  const [reporting, setReporting] = useState(false);

  const engine = useMemo(() => new StreamEngine({
    onState: (next, err) => {
      setState(next);
      if (err) {
        setError(err.message);
        const activeChannel = channelRef.current;
        const key = `${activeChannel.id}:${err.name}:${err.message}`;
        if (next === "error" && !reportedErrorsRef.current.has(key)) {
          reportedErrorsRef.current.add(key);
          void window.tvApp?.reportDiagnostic({ type: "playback-error", channelId: activeChannel.id, channelName: activeChannel.name, manifestType: activeChannel.manifestType ?? "unknown", errorName: err.name, message: err.message, appVersion: "2.0.1" }).catch(() => undefined);
        }
      }
    },
    onRecover
  }), [onRecover]);

  useEffect(() => {
    engineRef.current = engine;
    const video = videoRef.current;
    if (!video) return;
    setError(""); setState("loading"); setPlaying(false);
    setQuality([]); setAudio([]); setSubtitles([]);
    setSelectedQuality(-1); setSelectedAudio(-1); setSelectedSubtitle(-1);
    setMenu(null); setCurrentTime(0); setDuration(0);
    setLive(!(channel.manifestType === "progressive" || /\.(?:mp4|m4v|mkv|webm)(?:$|[?#])/i.test(channel.url)));
    let cancelled = false;
    void (async () => {
      await engine.play(video, channel);
      if (cancelled) return;
      setQuality(engine.getQualityOptions());
      setAudio(engine.getAudioOptions());
      setSubtitles(engine.getSubtitleOptions());
      setLive(!(channel.manifestType === "progressive" || /\.(?:mp4|m4v|mkv|webm)(?:$|[?#])/i.test(channel.url)));
    })().catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)); });
    return () => { void engine.destroy(); engineRef.current = null; };
  }, [engine, channel.id, channel.url]);

  useEffect(() => {
    const tvgId = channel.tvgId;
    if (!tvgId || epgPrograms[tvgId]?.length) return;
    const owner = playlists.find(item => item.channels.some(candidate => candidate.id === channel.id));
    if (!owner || !window.tvApp?.fetchRemoteText) return;
    const loadKey = `${owner.id}:${tvgId}`;
    if (epgLoadRef.current.has(loadKey)) return;
    epgLoadRef.current.add(loadKey);
    let cancelled = false;
    const requestId = globalThis.crypto.randomUUID();
    void (async () => {
      const isLiveTgTv = owner.source.split("?")[0] === "https://livetgtv.lovable.app/api/public/playlist.m3u";
      if (isLiveTgTv) {
        try {
          const response = await window.tvApp!.fetchRemoteText(`https://livetgtv.lovable.app/api/public/guide/${encodeURIComponent(tvgId)}`, undefined, requestId);
          if (cancelled) return;
          const liveGuide = parseLiveTgGuide(JSON.parse(response.text), tvgId);
          if (liveGuide.length) {
            setEpgPrograms({ ...useAppStore.getState().epgPrograms, [tvgId]: liveGuide });
            return;
          }
        } catch { /* Use the playlist XMLTV source as a fallback when the LiveTGTV guide is unavailable. */ }
      }
      const epgUrl = owner.epgUrls[0];
      if (!epgUrl) return;
      const fallbackId = globalThis.crypto.randomUUID();
      try {
        const fallback = await window.tvApp!.fetchRemoteText(epgUrl, undefined, fallbackId);
        if (cancelled) return;
        const parsed = parseXmltv(fallback.text);
        if (Object.keys(parsed).length) setEpgPrograms({ ...useAppStore.getState().epgPrograms, ...parsed });
      } catch { /* EPG is optional; guide failures must never interrupt video playback. */ }
      finally { void window.tvApp?.cancelRemoteText(fallbackId); }
    })().catch(() => {
      // EPG is optional; a failed guide request must never interrupt video playback.
    });
    return () => { cancelled = true; void window.tvApp?.cancelRemoteText(requestId); };
  }, [channel.id, channel.tvgId, epgPrograms, playlists, setEpgPrograms]);

  useEffect(() => {
    const timer = window.setInterval(() => setEpgClock(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let lastUiUpdate = 0;
    const update = (event?: Event) => {
      if (event?.type === "timeupdate" && Date.now() - lastUiUpdate < 500) return;
      lastUiUpdate = Date.now();
      setCurrentTime(video.currentTime || 0);
      setDuration(Number.isFinite(video.duration) ? video.duration : 0);
      setPlaying(!video.paused);
      if (Number.isFinite(video.duration) && video.duration > 0) setLive(false);
      else if (video.duration === Infinity) setLive(true);
    };
    const volumeChange = () => { setMuted(video.muted); setVolume(video.volume); };
    const reportStall = () => {
      const now = Date.now();
      if (now - lastStallReportRef.current < 15000) return;
      lastStallReportRef.current = now;
      const activeChannel = channelRef.current;
      const quality = video.getVideoPlaybackQuality?.();
      const buffered = video.buffered.length ? Math.max(0, video.buffered.end(video.buffered.length - 1) - video.currentTime) : 0;
      void window.tvApp?.reportDiagnostic({
        type: "playback-stall", channelId: activeChannel.id, channelName: activeChannel.name,
        manifestType: activeChannel.manifestType ?? "unknown", readyState: video.readyState,
        networkState: video.networkState, width: video.videoWidth, height: video.videoHeight,
        bufferedAheadSeconds: Math.round(buffered * 10) / 10,
        droppedFrames: quality?.droppedVideoFrames, totalFrames: quality?.totalVideoFrames,
        mediaErrorCode: video.error?.code
      }).catch(() => undefined);
    };
    video.volume = 0.85;
    video.addEventListener("loadedmetadata", update);
    video.addEventListener("timeupdate", update);
    video.addEventListener("durationchange", update);
    video.addEventListener("play", update);
    video.addEventListener("pause", update);
    video.addEventListener("volumechange", volumeChange);
    video.addEventListener("waiting", reportStall);
    video.addEventListener("stalled", reportStall);
    return () => {
      video.removeEventListener("loadedmetadata", update);
      video.removeEventListener("timeupdate", update);
      video.removeEventListener("durationchange", update);
      video.removeEventListener("play", update);
      video.removeEventListener("pause", update);
      video.removeEventListener("volumechange", volumeChange);
      video.removeEventListener("waiting", reportStall);
      video.removeEventListener("stalled", reportStall);
    };
  }, []);

  const refreshTracks = useCallback(() => {
    const active = engineRef.current;
    if (!active) return;
    setQuality(active.getQualityOptions());
    setAudio(active.getAudioOptions());
    setSubtitles(active.getSubtitleOptions());
    setSelectedAudio(active.getSelectedAudioId());
    setSelectedSubtitle(active.getSelectedSubtitleId());
  }, []);

  const showHud = useCallback(() => {
    setHud(true);
    if (hideRef.current) window.clearTimeout(hideRef.current);
    hideRef.current = window.setTimeout(() => setHud(false), 3800);
  }, []);

  const changeChannel = useCallback((step: number) => {
    const index = channels.findIndex(item => item.id === channel.id);
    const next = channels[index + step];
    if (next) { setMenu(null); onChangeChannel(next); }
  }, [channels, channel.id, onChangeChannel]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === "Escape") { if (menu) setMenu(null); else if (mini) setMini(false); else onClose(); return; }
      if (event.key === "ArrowRight") { event.preventDefault(); if (videoRef.current && !live) videoRef.current.currentTime += 10; else changeChannel(1); }
      if (event.key === "ArrowLeft") { event.preventDefault(); if (videoRef.current && !live) videoRef.current.currentTime -= 10; else changeChannel(-1); }
      if (event.key === "ArrowUp") { event.preventDefault(); changeChannel(-1); }
      if (event.key === "ArrowDown") { event.preventDefault(); changeChannel(1); }
      if (event.key === " " || event.key.toLowerCase() === "k") { event.preventDefault(); void togglePlay(); }
      if (event.key.toLowerCase() === "m") { if (videoRef.current) videoRef.current.muted = !videoRef.current.muted; }
      if (event.key.toLowerCase() === "f") void toggleFullscreen();
      if (event.key.toLowerCase() === "i") void togglePip();
      showHud();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [changeChannel, live, menu, mini, onClose, showHud]);

  useEffect(() => () => { if (hideRef.current) window.clearTimeout(hideRef.current); }, []);


  async function reportPlaybackProblem() {
    setReporting(true);
    const report = { type: "playback-error", channelId: channel.id, channelName: channel.name, manifestType: channel.manifestType ?? "unknown", errorName: "PlaybackError", message: error, appVersion: "2.0.1", timestamp: new Date().toISOString() };
    try {
      await window.tvApp?.reportDiagnostic(report);
      await window.tvApp?.openFeedbackReport(report);
    } catch { setError(`${error} (Could not open the feedback form. The diagnostic was saved locally if the app bridge is available.)`); }
    finally { setReporting(false); }
  }

  async function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) { try { await video.play(); } catch (e) { setError(e instanceof Error ? e.message : "Playback could not start."); } }
    else video.pause();
  }
  async function toggleFullscreen() {
    const target = document.querySelector(".player-stage") as HTMLElement | null;
    if (!target) return;
    if (document.fullscreenElement) await document.exitFullscreen();
    else await target.requestFullscreen();
  }
  async function togglePip() {
    const video = videoRef.current;
    if (!video || !("pictureInPictureEnabled" in document)) return;
    try { if (document.pictureInPictureElement) await document.exitPictureInPicture(); else await video.requestPictureInPicture(); }
    catch (e) { setError(e instanceof Error ? e.message : "Picture-in-picture is unavailable."); }
  }
  function handleWheelVolume(event: WheelEvent<HTMLDivElement>) {
    if (menu) return;
    event.preventDefault();
    const current = videoRef.current?.volume ?? volume;
    setVolumeValue(Math.min(1, Math.max(0, current + (event.deltaY < 0 ? 0.05 : -0.05))));
  }

  function setVolumeValue(value: number) {
    if (!videoRef.current) return;
    videoRef.current.volume = value;
    videoRef.current.muted = value === 0;
    setVolume(value); setMuted(value === 0);
  }
  function selectQuality(option: Option) {
    engineRef.current?.setQuality(option.id); setSelectedQuality(option.id); setMenu(null);
  }
  function selectAudio(option: Option) {
    engineRef.current?.selectAudio(option.id); setSelectedAudio(option.id); setMenu(null);
  }
  function selectSubtitle(option: Option | null) {
    engineRef.current?.selectSubtitle(option?.id ?? -1); setSelectedSubtitle(option?.id ?? -1); setMenu(null);
  }

  const guide = channel.tvgId ? currentAndNext(epgPrograms[channel.tvgId] ?? [], epgClock) : {};
  const currentIndex = channels.findIndex(item => item.id === channel.id);
  const previous = currentIndex > 0;
  const next = currentIndex >= 0 && currentIndex < channels.length - 1;
  const format = (seconds: number) => {
    if (!Number.isFinite(seconds)) return "00:00";
    return new Date(Math.max(0, seconds) * 1000).toISOString().slice(11, 19).replace(/^00:/, "");
  };

  return <div className={mini ? "player-overlay mini-mode" : "player-overlay"} onMouseMove={showHud} onMouseEnter={showHud}>
    <div className="player-stage" onWheel={handleWheelVolume}>
      <video ref={videoRef} className="player-video" style={{ objectFit: fit }} playsInline autoPlay />
      {(guide.current || guide.next) && <div style={{ position: "absolute", zIndex: 4, top: 72, left: 24, width: "min(390px, 42vw)", padding: "14px 16px", borderRadius: 12, background: "rgba(8, 13, 22, .78)", color: "#fff", pointerEvents: "none" }}>
        {guide.current && <div style={{ marginBottom: 10 }}>
          <div style={{ color: "#43e3a0", fontSize: 11, fontWeight: 800, letterSpacing: 1.1 }}>NOW · {new Date(guide.current.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} – {new Date(guide.current.stop).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
          <div style={{ fontSize: 17, fontWeight: 750, marginTop: 4 }}>{guide.current.title}</div>
          {guide.current.description && <div style={{ fontSize: 12, opacity: .78, marginTop: 4, lineHeight: 1.4 }}>{guide.current.description}</div>}
        </div>}
        {guide.next && <div>
          <div style={{ color: "#43e3a0", fontSize: 11, fontWeight: 800, letterSpacing: 1.1 }}>NEXT · {new Date(guide.next.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
          <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>{guide.next.title}</div>
          {guide.next.description && <div style={{ fontSize: 12, opacity: .78, marginTop: 4, lineHeight: 1.4 }}>{guide.next.description}</div>}
        </div>}
      </div>}
      {state === "loading" && <div className="player-center-state"><div className="player-spinner" /><span>Connecting to {channel.name}…</span></div>}
      {error && <div className="player-error"><b>Playback problem</b><span>{error}</span><div className="player-error-actions"><button onClick={() => { setError(""); void engineRef.current?.play(videoRef.current!, channel).catch(e => setError(e.message)); }}>Retry stream</button><button onClick={() => void reportPlaybackProblem()} disabled={reporting}>{reporting ? "Opening…" : "Report problem"}</button></div></div>}
      {hud && <div className="player-hud">
          <div className="player-topbar">
            <button className="hud-icon" onClick={onClose} aria-label="Close player"><X /></button>
            <div className="player-title"><b>{channel.name}</b><span>{channel.group} · {channel.manifestType?.toUpperCase() ?? "LIVE"}</span></div>
            <span className="player-live-pill"><i /> {live ? "LIVE" : "ON DEMAND"}</span>
            <button className="hud-icon" onClick={() => setMini(v => !v)} title="Mini player"><Minimize /></button>
          </div>
          <div className="player-bottom">
            {!live && <div className="player-progress"><span>{format(currentTime)}</span><input aria-label="Seek" type="range" min="0" max={duration || 0} step=".1" value={Math.min(currentTime, duration || 0)} onChange={e => { if (videoRef.current) videoRef.current.currentTime = Number(e.target.value); }} /><span>{format(duration)}</span></div>}
            <div className="player-controls">
              <button className="hud-icon" onClick={() => changeChannel(-1)} disabled={!previous} title="Previous channel"><ChevronLeft /></button>
              <button className="play-toggle" onClick={() => void togglePlay()} aria-label={playing ? "Pause" : "Play"}>{playing ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}</button>
              <button className="hud-icon" onClick={() => changeChannel(1)} disabled={!next} title="Next channel"><ChevronRight /></button>
              <div className="volume-control"><button className="hud-icon" onClick={() => { if (videoRef.current) videoRef.current.muted = !videoRef.current.muted; }} aria-label="Mute">{muted ? <VolumeX /> : <Volume2 />}</button><input aria-label="Volume" type="range" min="0" max="1" step=".01" value={muted ? 0 : volume} onChange={e => setVolumeValue(Number(e.target.value))} /></div>
              {live && <span className="live-now">● LIVE</span>}
              <div className="control-spacer" />
              <button className="hud-icon" onClick={() => setFit(v => v === "contain" ? "cover" : v === "cover" ? "fill" : "contain")} title={`Fit: ${fit}`}><MonitorPlay /></button>
              <button className="hud-icon" onClick={() => { refreshTracks(); setMenu(menu === "quality" ? null : "quality"); }} title="Quality"><Settings2 /></button>
              <button className="hud-icon" onClick={() => { refreshTracks(); setMenu(menu === "audio" ? null : "audio"); }} title="Audio"><AudioLines /></button>
              <button className="hud-icon" onClick={() => { refreshTracks(); setMenu(menu === "subtitles" ? null : "subtitles"); }} title="Subtitles"><Subtitles /></button>
              <button className="hud-icon" onClick={() => setMenu(menu === "zap" ? null : "zap")} title="Channel list"><Radio /></button>
              <button className="hud-icon" onClick={() => void togglePip()} title="Picture in picture"><PictureInPicture2 /></button>
              <button className="hud-icon" onClick={() => void toggleFullscreen()} title="Fullscreen"><Maximize /></button>
            </div>
          </div>
        </div>}
      {menu && <div className={menu === "zap" ? "player-menu zap-menu" : "player-menu"}>
          <div className="player-menu-head"><b>{menu === "quality" ? "Stream quality" : menu === "audio" ? "Audio track" : menu === "subtitles" ? "Subtitles" : "Channel guide"}</b><button onClick={() => setMenu(null)}><X size={15} /></button></div>
          {menu === "quality" && <><button className="player-option" onClick={() => { engineRef.current?.setQuality(-1); setSelectedQuality(-1); setMenu(null); }}>Auto {selectedQuality === -1 && <Check size={14} />}</button>{quality.map(option => <button className="player-option" key={option.id} onClick={() => selectQuality(option)}>{option.label}{selectedQuality === option.id && <Check size={14} />}</button>)}</>}
          {menu === "audio" && (audio.length ? audio.map(option => <button className="player-option" key={option.id} onClick={() => selectAudio(option)}>{option.label}{selectedAudio === option.id && <Check size={14} />}</button>) : <p className="player-empty-option">No alternate audio tracks detected.</p>)}
          {menu === "subtitles" && <><button className="player-option" onClick={() => selectSubtitle(null)}>Off {selectedSubtitle === -1 && <Check size={14} />}</button>{subtitles.map(option => <button className="player-option" key={option.id} onClick={() => selectSubtitle(option)}>{option.label}{selectedSubtitle === option.id && <Check size={14} />}</button>)}{!subtitles.length && <p className="player-empty-option">No embedded subtitle tracks detected.</p>}</>}
          {menu === "zap" && <div className="zap-list">{channels.map((item, index) => <button className={item.id === channel.id ? "zap-item active" : "zap-item"} key={item.id} onClick={() => { onChangeChannel(item); setMenu(null); }}><span>{String(index + 1).padStart(2, "0")}</span>{item.logo && <img src={item.logo} alt="" />}<b>{item.name}</b>{item.id === channel.id && <i />}</button>)}</div>}
        </div>}
      {!hud && <button className="player-reveal" onClick={showHud} aria-label="Show player controls">Show controls</button>}
      <div className="player-shortcut-hint">Space Play/Pause · ↑↓ Channel · ←→ Seek/Zap · M Mute · F Fullscreen · I PiP · Esc Close</div>
    </div>
  </div>;
}
