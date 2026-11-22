import { useCallback, useEffect, useMemo, useRef, useState } from "react";\nimport type { WheelEvent } from "react";
import { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, Heart, Maximize, Monitor, Pause, PictureInPicture, Play, Settings2, Volume2, VolumeX } from "lucide-react";
import type { Playlist, TvChannel, EpgProgramme } from "../app/models";
import { useAppStore, channelKey } from "../app/store";
import { resolveLiveTgTvChannel } from "../core/playlist/livetgtv";

type Props = { playlist: Playlist; channel: TvChannel; onClose: () => void; onSelect: (channel: TvChannel) => void };
type Quality = { id: string; label: string; height?: number; bandwidth?: number; active: boolean };
type PlaybackEngine = "shaka" | "hls" | "native" | null;

function currentProgrammes(guide: Record<string, EpgProgramme[]>, channel: TvChannel) {
  const items = guide[channel.tvgId ?? ""] ?? guide[channel.id] ?? [];
  const now = Date.now();
  return { now: items.find(p => p.start <= now && p.stop > now), next: items.find(p => p.start > now) };
}
function formatTime(ms?: number) {
  return ms ? new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
}

export default function LivePlayer({ playlist, channel: initialChannel, onClose, onSelect }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const shakaRef = useRef<any>(null);
  const hlsRef = useRef<any>(null);
  const engineRef = useRef<PlaybackEngine>(null);
  const sourceIndexRef = useRef(0);
  const resolvedChannelRef = useRef<TvChannel>(initialChannel);
  const generationRef = useRef(0);
  const channels = playlist.channels;
  const [channel, setChannel] = useState(initialChannel);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [menu, setMenu] = useState<"settings" | "quality" | "audio" | "captions" | null>(null);
  const [qualities, setQualities] = useState<Quality[]>([]);
  const [selectedQuality, setSelectedQuality] = useState("auto");
  const [audioTracks, setAudioTracks] = useState<Array<{ id: string; label: string }>>([]);
  const [textTracks, setTextTracks] = useState<Array<{ id: string; label: string }>>([]);
  const [aspect, setAspect] = useState("contain");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [volumeVisible, setVolumeVisible] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [search, setSearch] = useState("");
  const [nowNext, setNowNext] = useState(() => currentProgrammes(useAppStore.getState().guide, initialChannel));
  const guide = useAppStore(state => state.guide);
  const favorites = useAppStore(state => state.favorites);
  const toggleFavorite = useAppStore(state => state.toggleFavorite);
  const recordRecentChannel = useAppStore(state => state.recordRecentChannel);
  const preferredQuality = useAppStore(state => state.settings.preferredQuality);
  const filteredChannels = useMemo(() => channels.filter(item => !search || item.name.toLowerCase().includes(search.toLowerCase())), [channels, search]);
  const isFavorite = favorites.includes(channelKey(playlist.id, channel.id));
  const programme = currentProgrammes(guide, channel);

  const cleanup = useCallback(async () => {
    generationRef.current++;
    videoRef.current?.pause();\n    try { await shakaRef.current?.destroy(); } catch {}
    shakaRef.current = null;
    try { hlsRef.current?.destroy(); } catch {}
    hlsRef.current = null;
    engineRef.current = null;
    await window.tvApp?.setStreamRequestContext(null).catch(() => undefined);
  }, []);

  const updateTracks = useCallback(() => {
    const shaka = shakaRef.current;
    if (shaka) {
      const variants = shaka.getVariantTracks?.() ?? [];
      setQualities(variants.map((track: any) => ({ id: String(track.id), label: track.height ? track.height + "p" : Math.round((track.bandwidth ?? 0) / 1000) + " kbps", height: track.height, bandwidth: track.bandwidth, active: !!track.active })));
      setAudioTracks((shaka.getAudioLanguagesAndRoles?.() ?? []).map((track: any, i: number) => ({ id: String(track.language ?? i), label: [track.language, track.role].filter(Boolean).join(" · ") || "Audio " + (i + 1) })));
      setTextTracks((shaka.getTextTracks?.() ?? []).map((track: any) => ({ id: String(track.id), label: [track.language, track.kind].filter(Boolean).join(" · ") || "Subtitle" })));
      return;
    }
    const hls = hlsRef.current;
    if (hls) {
      setQualities((hls.levels ?? []).map((level: any, i: number) => ({ id: String(i), label: level.height ? level.height + "p" : Math.round((level.bitrate ?? 0) / 1000) + " kbps", height: level.height, bandwidth: level.bitrate, active: i === hls.currentLevel })));
      setAudioTracks((hls.audioTracks ?? []).map((track: any, i: number) => ({ id: String(i), label: track.name || track.lang || "Audio " + (i + 1) })));
      setTextTracks((hls.subtitleTracks ?? []).map((track: any, i: number) => ({ id: String(i), label: track.name || track.lang || "Subtitle " + (i + 1) })));
    }
  }, []);

  const playSource = useCallback(async (sourceIndex: number, generation: number) => {
    const video = videoRef.current;
    if (!video || generation !== generationRef.current) return;
    const resolved = playlist.source.includes("livetgtv.lovable.app/api/public/playlist.m3u") ? await resolveLiveTgTvChannel(channel) : channel;
    resolvedChannelRef.current = resolved;
    const source = resolved.sources[sourceIndex];
    if (!source) throw new Error("No playable stream source is available for this channel.");
    sourceIndexRef.current = sourceIndex;
    setError("");
    setLoading(true);
    await cleanup();
    const currentGeneration = generationRef.current;
    if (generation !== currentGeneration || !videoRef.current) return;
    const mediaVideo = videoRef.current;
    await window.tvApp?.setStreamRequestContext({ originUrl: source.url, headers: source.headers, licenseUrl: source.drm?.licenseUrl, licenseHeaders: source.drm?.licenseHeaders });
    try {
      if (source.type === "dash" || source.drm) {
        const shakaModule = await import("shaka-player");
        const shaka = shakaModule.default;
        if (!shaka.Player.isBrowserSupported()) throw new Error("This Windows system does not support the required DASH playback features.");
        const player = new shaka.Player();
        shakaRef.current = player;
        await player.attach(mediaVideo);
        player.configure({
          streaming: { bufferingGoal: 18, rebufferingGoal: 3, bufferBehind: 20, retryParameters: { maxAttempts: 3, baseDelay: 500, backoffFactor: 1.5 } },
          abr: { enabled: preferredQuality === "auto" },
          drm: source.drm?.scheme === "clearkey" ? { clearKeys: source.drm.clearKeys ?? {} } : source.drm?.licenseUrl ? { servers: { [source.drm.scheme === "widevine" ? "com.widevine.alpha" : source.drm.scheme]: source.drm.licenseUrl } } : {}
        });
        player.getNetworkingEngine()?.registerRequestFilter((_type: number, request: any) => {
          for (const [key, value] of Object.entries(source.headers)) request.headers[key] = value;
          if (source.drm?.licenseHeaders && request.uris?.some((uri: string) => uri === source.drm?.licenseUrl)) for (const [key, value] of Object.entries(source.drm.licenseHeaders)) request.headers[key] = value;
        });
        player.addEventListener("error", (event: any) => { if (generation === generationRef.current) void advance(event.detail?.message ?? "DASH playback failed."); });
        player.addEventListener("trackschanged", updateTracks);
        player.addEventListener("adaptation", updateTracks);
        await player.load(source.url);
        if (generation !== generationRef.current) return;
        engineRef.current = "shaka";
        if (preferredQuality !== "auto") {
          const tracks = player.getVariantTracks().filter((track: any) => track.height <= Number.parseInt(preferredQuality, 10));
          if (tracks.length) player.selectVariantTrack(tracks.sort((a: any, b: any) => b.height - a.height)[0], true);
        }
      } else if (source.type === "hls") {
        const module = await import("hls.js");
        const Hls = module.default;
        if (Hls.isSupported()) {
          const hls = new Hls({ enableWorker: true, lowLatencyMode: false, backBufferLength: 20, maxBufferLength: 18, xhrSetup: (xhr: XMLHttpRequest) => { for (const [key, value] of Object.entries(source.headers)) xhr.setRequestHeader(key, value); } });
          hlsRef.current = hls;
          hls.on(Hls.Events.MANIFEST_PARSED, () => { if (generation === generationRef.current) { engineRef.current = "hls"; updateTracks(); void mediaVideo.play().catch(() => undefined); } });
          hls.on(Hls.Events.ERROR, (_: unknown, data: any) => { if (data.fatal && generation === generationRef.current) void advance(data.details ?? "HLS playback failed."); });
          hls.on(Hls.Events.LEVEL_SWITCHED, updateTracks);
          hls.loadSource(source.url); hls.attachMedia(mediaVideo);
        } else if (mediaVideo.canPlayType("application/vnd.apple.mpegurl")) {
          mediaVideo.src = source.url; engineRef.current = "native";
        } else throw new Error("HLS playback is not supported by this Windows build.");
      } else {
        mediaVideo.src = source.url;
        engineRef.current = "native";
      }
      if (source.type !== "hls" || engineRef.current === "native") await mediaVideo.play().catch(() => undefined);
      if (generation === generationRef.current) {
        setLoading(false);
        recordRecentChannel(playlist.id, channel);
        updateTracks();
      }
    } catch (cause) {
      if (generation !== generationRef.current) return;
      await advance(cause instanceof Error ? cause.message : "Could not start this stream.");
    }
  }, [channel, cleanup, playlist.id, preferredQuality, recordRecentChannel, updateTracks]);

  const advance = useCallback(async (reason: string) => {
    const next = sourceIndexRef.current + 1;
    if (next < resolvedChannelRef.current.sources.length) {
      setError("Trying backup stream…");
      try { await playSource(next, generationRef.current); } catch {}
    } else {
      setLoading(false);
      setError(reason || "All available streams failed.");
      await cleanup();
    }
  }, [channel.sources.length, cleanup, playSource]);

  useEffect(() => {
    setChannel(initialChannel);
  }, [initialChannel.id]);

  useEffect(() => {
    const generation = ++generationRef.current;
    sourceIndexRef.current = 0;
    void playSource(0, generation);
    return () => { generationRef.current++; void cleanup(); };
  }, [channel.id, playlist.id]);

  useEffect(() => {
    setNowNext(currentProgrammes(guide, channel));
    const timer = window.setInterval(() => setNowNext(currentProgrammes(useAppStore.getState().guide, channel)), 30000);
    return () => window.clearInterval(timer);
  }, [channel, guide]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = volume;
    video.muted = muted;
  }, [volume, muted]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return;
      if (event.key === "Escape") setMenu(null);
      if (event.key === " " && event.target !== document.body) return;
      if (event.key.toLowerCase() === "m") setMuted(value => !value);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const selectChannel = (next: TvChannel) => {
    setChannel(next);
    onSelect(next);
    setMenu(null);
  };
  const changeVolume = (delta: number) => {
    setVolume(value => Math.max(0, Math.min(1, Math.round((value + delta) * 100) / 100)));
    setMuted(false);
    setVolumeVisible(true);
    window.setTimeout(() => setVolumeVisible(false), 1200);
  };
  const onWheel = (event: WheelEvent) => { event.preventDefault(); changeVolume(event.deltaY < 0 ? 0.05 : -0.05); };
  const setQuality = (id: string) => {
    if (shakaRef.current) {
      if (id === "auto") shakaRef.current.configure({ abr: { enabled: true } });
      else { shakaRef.current.configure({ abr: { enabled: false } }); const track = shakaRef.current.getVariantTracks().find((item: any) => String(item.id) === id); if (track) shakaRef.current.selectVariantTrack(track, true); }
    } else if (hlsRef.current) hlsRef.current.currentLevel = id === "auto" ? -1 : Number(id);
    setSelectedQuality(id); setMenu(null);
  };
  const setAudio = (id: string) => {
    if (shakaRef.current) shakaRef.current.selectAudioLanguage(id);
    else if (hlsRef.current) hlsRef.current.audioTrack = Number(id);
    setMenu(null);
  };
  const setCaption = (id: string) => {
    if (shakaRef.current) shakaRef.current.selectTextTrack(shakaRef.current.getTextTracks().find((item: any) => String(item.id) === id));
    else if (hlsRef.current) hlsRef.current.subtitleTrack = id === "off" ? -1 : Number(id);
    if (videoRef.current && !shakaRef.current) for (const track of Array.from(videoRef.current.textTracks)) track.mode = id === "off" ? "disabled" : "showing";
    setMenu(null);
  };
  const toggleFullscreen = () => { if (!document.fullscreenElement) void document.querySelector(".live-player-stage")?.requestFullscreen(); else void document.exitFullscreen(); };
  const togglePip = async () => { const video = videoRef.current; if (video && document.pictureInPictureEnabled) { try { if (document.pictureInPictureElement) await document.exitPictureInPicture(); else await video.requestPictureInPicture(); } catch {} } };
  const seekChannel = (delta: number) => { const index = channels.findIndex(item => item.id === channel.id); const next = channels[index + delta]; if (next) selectChannel(next); };

  return <section className="live-player-page">
    <div className="live-player-toolbar"><button className="player-back" onClick={onClose}><ArrowLeft size={17}/> Back</button><div className="player-channel-heading">{channel.logo && <img src={channel.logo} alt=""/>}<span><b>{channel.name}</b><small>{playlist.name} · {channel.group}</small></span></div><span className="live-indicator">LIVE</span></div>
    <div className="live-player-layout">
      <div className="live-player-main">
        <div className="live-player-stage" onWheel={onWheel}>
          <video ref={videoRef} playsInline autoPlay onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onWaiting={() => setLoading(true)} onPlaying={() => setLoading(false)} onError={() => { if (engineRef.current === "native") void advance("The stream could not be decoded."); }} style={{ objectFit: aspect as "contain" | "cover" | "fill" }}/>
          {loading && !error && <div className="player-loading"><span className="player-spinner"/><small>Connecting to stream…</small></div>}
          {error && <div className="player-error"><b>Playback issue</b><span>{error}</span><button onClick={() => { sourceIndexRef.current = -1; void playSource(0, generationRef.current); }}>Retry channel</button></div>}
          <div className="programme-overlay now"><b>Now: {nowNext.now?.title ?? "Live television"}</b>{nowNext.now?.description && <span>{nowNext.now.description}</span>}{nowNext.now && <div className="programme-progress"><i style={{ width: Math.max(0,Math.min(100,(Date.now()-nowNext.now.start)/(nowNext.now.stop-nowNext.now.start)*100))+"%" }}/></div>}</div>
          {nowNext.next && <div className="programme-overlay next"><b>Next: {nowNext.next.title}</b><span>{formatTime(nowNext.next.start)}{nowNext.next.description ? " · " + nowNext.next.description : ""}</span></div>}
          {volumeVisible && <div className="volume-indicator"><Volume2 size={18}/><b>{Math.round(volume*100)}%</b></div>}
          <div className="player-controls">
            <div className="player-control-left"><button onClick={() => seekChannel(-1)} title="Previous channel"><ChevronLeft/></button><button onClick={() => { if (videoRef.current?.paused) void videoRef.current.play(); else videoRef.current?.pause(); }} title={playing?"Pause":"Play"}>{playing?<Pause/>:<Play/>}</button><button onClick={() => seekChannel(1)} title="Next channel"><ChevronRight/></button></div>
            <div className="player-control-right"><button onClick={() => setMuted(v=>!v)} title="Mute">{muted||volume===0?<VolumeX/>:<Volume2/>}</button><button onClick={() => setMenu(menu==="settings"?null:"settings")} title="Player settings"><Settings2/></button><button onClick={togglePip} title="Picture in picture"><PictureInPicture/></button><button onClick={toggleFullscreen} title="Fullscreen"><Maximize/></button></div>
          </div>
          {menu && <div className="player-settings-popover">
            {menu==="settings" ? <><button onClick={()=>setMenu("audio")}><span>Language</span><b>{audioTracks[0]?.label ?? "Default"} <ChevronDown size={13}/></b></button><button onClick={()=>setMenu("quality")}><span>Quality</span><b>{selectedQuality==="auto"?"Auto":qualities.find(q=>q.id===selectedQuality)?.label ?? "Auto"} <ChevronDown size={13}/></b></button><button onClick={()=>setMenu("captions")}><span>Captions</span><b>{textTracks.length?"Available":"Off"} <ChevronDown size={13}/></b></button><button onClick={()=>setAspect(aspect==="contain"?"cover":aspect==="cover"?"fill":"contain")}><span>Aspect Ratio</span><b>{aspect==="contain"?"Fit to screen":aspect==="cover"?"Fill":"Stretch"}</b></button><button onClick={()=>void togglePip()}><span>Picture-in-Picture</span><PictureInPicture size={16}/></button><button onClick={()=>toggleFavorite(playlist.id,channel.id)}><span>{isFavorite?"Unfavorite":"Favorite"}</span><Heart size={16} fill={isFavorite?"currentColor":"none"}/></button></> :
            menu==="quality" ? <><button onClick={()=>setQuality("auto")}>Auto</button>{qualities.map(q=><button key={q.id} onClick={()=>setQuality(q.id)}>{q.label}{q.active?" ✓":""}</button>)}</> :
            menu==="audio" ? <>{audioTracks.length?audioTracks.map(t=><button key={t.id} onClick={()=>setAudio(t.id)}>{t.label}</button>):<span className="player-menu-empty">No alternate audio tracks</span>}</> :
            <><button onClick={()=>setCaption("off")}>Off</button>{textTracks.length?textTracks.map(t=><button key={t.id} onClick={()=>setCaption(t.id)}>{t.label}</button>):<span className="player-menu-empty">No subtitles available</span>}</>}
          </div>}
        </div>
        <div className="player-volume-hint"><span>Mouse wheel over video to adjust volume</span><span>{resolvedChannelRef.current.sources[sourceIndexRef.current]?.type.toUpperCase() ?? "STREAM"}</span></div>
      </div>
      <aside className="player-channel-panel"><div className="player-list-heading"><b>Channels</b><span>{channels.length}</span></div><label className="player-list-search"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search channels…"/></label><div className="player-channel-list">{filteredChannels.map((item,index)=><button className={item.id===channel.id?"player-channel-row active":"player-channel-row"} key={item.id} onClick={()=>selectChannel(item)}><span className="player-channel-number">{item.number ?? index+1}</span><span className="player-channel-logo">{item.logo?<img src={item.logo} alt="" loading="lazy"/>:<Monitor size={19}/>}</span><span className="player-channel-name"><b>{item.name}</b><small>{item.group}</small></span>{item.id===channel.id&&<span className="player-channel-live">LIVE</span>}</button>)}</div></aside>
    </div>
  </section>;
}
