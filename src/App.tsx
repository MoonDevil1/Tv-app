import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Activity, AudioLines, Check, ChevronDown, CircleHelp, Command, Compass, FileUp, Heart, History, LayoutGrid, ListVideo, LoaderCircle, Plus, Radio, RefreshCw, Search, Settings2, Signal, Sparkles, Trash2, Tv2, Wifi, X, Clock3, PlayCircle, Download, CheckCircle2, AlertCircle, RotateCw } from "lucide-react";
import type { Channel, Playlist, DesktopUpdateState } from "./core/types";
import { PlaylistManager } from "./core/parser/playlistManager";
import { parseClearKeys } from "./core/parser/clearKeyUtils";
import { parseXmltv, currentAndNext } from "./core/epg/xmltv";
import { useAppStore } from "./core/store/appStore";
import { Player } from "./components/Player";

const LIVE_TGTV_URL = "https://livetgtv.lovable.app/api/public/playlist.m3u";
const REFRESH_OPTIONS = [{ label: "Manual", value: 0 }, { label: "1 minute", value: 60000 }, { label: "5 minutes", value: 300000 }, { label: "15 minutes", value: 900000 }, { label: "1 hour", value: 3600000 }];
const navItems = [{ label: "Discover", icon: Compass }, { label: "Live TV", icon: Radio }, { label: "Favorites", icon: Heart }, { label: "Recently watched", icon: History }, { label: "EPG Guide", icon: LayoutGrid }];
const managementItems = [{ label: "Playlists", icon: ListVideo }, { label: "Single stream", icon: AudioLines }, { label: "Settings", icon: Settings2 }];
const channelKey = (playlistId: string, channel: Channel) => `${playlistId}:${channel.id}`;
const formatTime = (timestamp?: number) => timestamp ? new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";

function ChannelCard({ channel, favorite, selected, onSelect, onFavorite }: { channel: Channel; favorite: boolean; selected: boolean; onSelect: () => void; onFavorite: () => void }) {
  return <article className={selected ? "channel-card selected" : "channel-card"}>
    <button className="channel-main" onClick={onSelect} aria-label={`Select ${channel.name}`}>
      <div className="channel-logo">{channel.logo && <img src={channel.logo} alt="" loading="lazy" onError={e => { e.currentTarget.style.display = "none"; }} />}{!channel.logo && <Tv2 size={23} />}</div>
      <div className="channel-copy"><b title={channel.name}>{channel.name}</b><span>{channel.group}</span></div>
    </button>
    <div className="channel-meta"><span>{channel.manifestType === "dash" ? "DASH" : channel.manifestType === "hls" ? "HLS" : "STREAM"}</span><button className={favorite ? "favorite-button is-favorite" : "favorite-button"} onClick={onFavorite} aria-label={favorite ? "Remove favorite" : "Add favorite"}><Heart size={15} fill={favorite ? "currentColor" : "none"} /></button></div>
  </article>;
}

export default function App() {
  const reduceMotion = useReducedMotion();
  const manager = useMemo(() => new PlaylistManager(), []);
  const playlists = useAppStore(s => s.playlists), favorites = useAppStore(s => s.favorites), recentlyWatched = useAppStore(s => s.recentlyWatched), epgPrograms = useAppStore(s => s.epgPrograms);
  const addPlaylist = useAppStore(s => s.addPlaylist), replacePlaylist = useAppStore(s => s.replacePlaylist), removeStoredPlaylist = useAppStore(s => s.removePlaylist), toggleFavorite = useAppStore(s => s.toggleFavorite), recordWatch = useAppStore(s => s.recordWatch), setEpgPrograms = useAppStore(s => s.setEpgPrograms);
  const [active, setActive] = useState("Discover"), [query, setQuery] = useState(""), [selectedPlaylistId, setSelectedPlaylistId] = useState(""), [selectedGroup, setSelectedGroup] = useState("All");
  const [selectedChannel, setSelectedChannel] = useState<{ playlistId: string; channel: Channel } | null>(null);
  const [showAdd, setShowAdd] = useState(false), [sourceUrl, setSourceUrl] = useState(LIVE_TGTV_URL), [playlistName, setPlaylistName] = useState("LiveTGTV"), [refreshInterval, setRefreshInterval] = useState(300000);
  const [busy, setBusy] = useState(false), [epgBusy, setEpgBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState(""), [scrollTop, setScrollTop] = useState(0), [columns, setColumns] = useState(4);
  const [updateState, setUpdateState] = useState<DesktopUpdateState>({ status: "idle", message: "Checking update status…" });
  const fileInput = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const playlistsRef = useRef(playlists);
  const selectedPlaylistIdRef = useRef("");
  playlistsRef.current = playlists;
  selectedPlaylistIdRef.current = selectedChannel?.playlistId ?? "";

  useEffect(() => {
    const api = window.tvApp;
    if (!api) return;
    let active = true;
    const unsubscribe = api.onUpdateState(state => { if (active) setUpdateState(state); });
    void api.getUpdateState().then(state => { if (active) setUpdateState(state); });
    return () => { active = false; unsubscribe(); };
  }, []);

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); searchRef.current?.focus(); }
      if (event.key === "/" && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)) { event.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const savedPlaylists = useAppStore.getState().playlists;
    void (async () => {
      for (const saved of savedPlaylists) {
        try {
          const restoredPlaylist = await manager.load(saved.source, { id: saved.id, name: saved.name, refreshIntervalMs: saved.refreshIntervalMs });
          if (cancelled) return;
          replacePlaylist(restoredPlaylist);
          if (restoredPlaylist.refreshIntervalMs) manager.startAutoRefresh(restoredPlaylist, replacePlaylist, e => setError(e.message));
        } catch (e) { if (!cancelled) setError(`Could not restore ${saved.name}: ${e instanceof Error ? e.message : String(e)}`); }
      }
    })();
    return () => { cancelled = true; manager.dispose(); };
  }, [manager, replacePlaylist]);

  useEffect(() => {
    const wide = window.matchMedia("(max-width: 1080px)");
    const medium = window.matchMedia("(max-width: 1320px)");
    const updateColumns = () => { setColumns(wide.matches ? 2 : medium.matches ? 3 : 4); setScrollTop(0); };
    updateColumns();
    wide.addEventListener("change", updateColumns);
    medium.addEventListener("change", updateColumns);
    return () => { wide.removeEventListener("change", updateColumns); medium.removeEventListener("change", updateColumns); };
  }, []);

  useEffect(() => {
    if (!selectedPlaylistId && playlists[0]) setSelectedPlaylistId(playlists[0].id);
    if (selectedPlaylistId && !playlists.some(item => item.id === selectedPlaylistId)) setSelectedPlaylistId(playlists[0]?.id ?? "");
  }, [playlists, selectedPlaylistId]);

  const selectedPlaylist = playlists.find(item => item.id === selectedPlaylistId) ?? playlists[0];
  const allChannels = useMemo(() => playlists.flatMap(playlist => playlist.channels.map(channel => ({ playlistId: playlist.id, channel }))), [playlists]);
  const visibleChannels = useMemo(() => {
    let rows = allChannels;
    if (active === "Favorites") rows = rows.filter(row => favorites.includes(channelKey(row.playlistId, row.channel)));
    else if (active === "Recently watched") rows = recentlyWatched.map(item => ({ playlistId: item.playlistId, channel: item.channel }));
    else if (selectedPlaylist) rows = rows.filter(row => row.playlistId === selectedPlaylist.id);
    if (selectedGroup !== "All" && active !== "Favorites" && active !== "Recently watched") rows = rows.filter(row => row.channel.group === selectedGroup);
    const term = query.trim().toLocaleLowerCase();
    if (term) rows = rows.filter(row => [row.channel.name, row.channel.group, row.channel.tvgId].some(value => value?.toLocaleLowerCase().includes(term)));
    return rows;
  }, [allChannels, active, favorites, recentlyWatched, selectedPlaylist, selectedGroup, query]);
  const groups = useMemo(() => ["All", ...new Set((selectedPlaylist?.channels ?? []).map(channel => channel.group).filter(Boolean))], [selectedPlaylist]);
  const statChannels = playlists.reduce((sum, item) => sum + item.channels.length, 0);
  const guideRows = (selectedPlaylist?.channels ?? []).map(channel => ({ channel, programs: epgPrograms[channel.tvgId ?? ""] ?? [] }));

  async function addSource(source: string, name: string, file?: File) {
    setBusy(true); setError(""); setNotice("");
    try {
      const singleStream = !file && name === "Single stream" && /^https?:\/\//i.test(source.trim());
      const playlistInput = singleStream ? `#EXTM3U\n#EXTINF:-1,${name}\n${source.trim()}` : source.trim();
      const options = { name: name.trim() || file?.name || "My playlist", refreshIntervalMs: singleStream ? 0 : refreshInterval };
      const playlist = file ? await manager.loadFile(file, options) : await manager.load(playlistInput, options);
      addPlaylist(playlist); setSelectedPlaylistId(playlist.id); setSelectedGroup("All");
      if (playlist.refreshIntervalMs) manager.startAutoRefresh(playlist, replacePlaylist, e => setError(e.message));
      setShowAdd(false); setActive("Live TV"); setNotice(`Imported ${playlist.channels.length.toLocaleString()} channels from ${playlist.name}.`);
      setSourceUrl(LIVE_TGTV_URL);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void addSource("", file.name.replace(/\.[^.]+$/, ""), file);
    event.target.value = "";
  }
  async function refreshPlaylist(playlist: Playlist) {
    setError(""); setNotice("");
    try { const next = await manager.refresh(playlist.id); replacePlaylist(next); setNotice(`Updated ${next.name}: ${next.channels.length.toLocaleString()} channels.`); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }
  async function loadGuide() {
    const url = selectedPlaylist?.epgUrls[0];
    if (!url) { setError("This playlist does not declare an XMLTV EPG URL."); return; }
    setEpgBusy(true); setError("");
    try {
      if (!window.tvApp?.fetchRemoteText) throw new Error("EPG downloads are only available in the desktop app.");
      const response = await window.tvApp.fetchRemoteText(url);
      const parsed = parseXmltv(response.text); setEpgPrograms(parsed);
      setNotice(`Loaded guide data for ${Object.keys(parsed).length} channels.`);
    } catch (e) { setError(`Could not load EPG: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setEpgBusy(false); }
  }
  function selectChannel(playlistId: string, channel: Channel) { setSelectedChannel({ playlistId, channel }); recordWatch(playlistId, channel); }
  const resolveLiveTgChannel = useCallback(async (channel: Channel): Promise<Channel | null> => {
    const ownerId = selectedPlaylistIdRef.current;
    const owner = playlistsRef.current.find(item => item.id === ownerId && item.channels.some(candidate => candidate.id === channel.id));
    if (!owner || owner.source.split("?")[0] !== LIVE_TGTV_URL || !channel.tvgId || !/^\d+$/.test(channel.tvgId)) return null;
    if (!window.tvApp?.fetchRemoteText) return null;
    const requestId = globalThis.crypto.randomUUID();
    try {
      const response = await window.tvApp.fetchRemoteText("https://livetgtv.lovable.app/api/public/channels/" + encodeURIComponent(channel.tvgId), undefined, requestId);
      if (response.status < 200 || response.status >= 300) throw new Error("LiveTGTV returned HTTP " + response.status);
      const payload = JSON.parse(response.text) as { sources?: unknown; drm?: { type?: string; keyId?: string; key?: string } };
      const source = Array.isArray(payload.sources) ? payload.sources.find((item): item is string => typeof item === "string" && /^https?:\/\//i.test(item)) : undefined;
      if (!source) return null;
      const clearKeys = payload.drm?.type?.toLowerCase() === "clearkey" && payload.drm.keyId && payload.drm.key
        ? parseClearKeys({ [payload.drm.keyId]: payload.drm.key }) : undefined;
      return { ...channel, url: source, headers: {},
        manifestType: /\.mpd(?:$|[?#])/i.test(source) ? "dash" : /\.m3u8(?:$|[?#])/i.test(source) ? "hls" : channel.manifestType,
        drm: clearKeys ? { scheme: "clearkey", clearKeys } : undefined };
    } catch { return null; }
    finally { void window.tvApp?.cancelRemoteText(requestId); }
  }, []);
  const recoverChannel = useCallback(async (channel: Channel) => {
    const resolved = await resolveLiveTgChannel(channel);
    if (resolved) return resolved;
    const ownerId = selectedPlaylistIdRef.current;
    const owner = playlistsRef.current.find(item => item.id === ownerId && item.channels.some(candidate => candidate.id === channel.id));
    if (!owner) return null;
    try {
      const refreshed = await manager.refresh(owner.id);
      replacePlaylist(refreshed);
      return refreshed.channels.find(candidate => candidate.id === channel.id) ?? null;
    } catch { return null; }
  }, [manager, replacePlaylist, resolveLiveTgChannel]);
  const playerChannels = selectedChannel
    ? playlists.find(item => item.id === selectedChannel.playlistId)?.channels ?? []
    : [];

  const rowHeight = 106, startRow = Math.max(0, Math.floor(scrollTop / rowHeight) - 1), visibleRows = 6;
  const totalRows = Math.ceil(visibleChannels.length / columns);
  const renderedChannels = visibleChannels.slice(startRow * columns, (startRow + visibleRows) * columns);
  const isGridView = ["Discover", "Live TV", "Favorites", "Recently watched"].includes(active);

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Tv2 size={22} /></div><div><strong>TG IPTV</strong><span>LIVE ENTERTAINMENT</span></div></div>
      <div className="workspace"><div className="workspace-icon">T</div><div><b>My library</b><small>{playlists.length} connected source{playlists.length === 1 ? "" : "s"}</small></div><ChevronDown size={15} /></div>
      <div className="nav-label">YOUR SPACE</div><nav>{navItems.map(({ label, icon: Icon }) => <button key={label} className={active === label ? "nav-item active" : "nav-item"} onClick={() => { setActive(label); setSelectedGroup("All"); }}><Icon size={18} /><span>{label}</span>{label === "Favorites" && <span className="nav-count">{favorites.length}</span>}</button>)}</nav>
      <div className="nav-label library-label">MANAGE</div><nav>{managementItems.map(({ label, icon: Icon }) => <button key={label} className={active === label ? "nav-item active" : "nav-item"} onClick={() => setActive(label)}><Icon size={18} /><span>{label}</span></button>)}</nav>
      <div className="sidebar-bottom"><div className="connection"><span className="status-dot" /><div><b>{statChannels ? `${statChannels.toLocaleString()} channels ready` : "Player ready"}</b><small>{playlists.length ? "Library is on this device" : "Waiting for a playlist"}</small></div></div><button className="help-link" onClick={() => setNotice("Shortcuts: Ctrl/⌘+K or / to search; Space/K to play; arrows to zap or seek; M mute; F fullscreen; I picture-in-picture.")}><CircleHelp size={17} /> Help & shortcuts</button><div className="profile"><div className="avatar">N</div><div><b>Local profile</b><small>On this device</small></div><Settings2 size={16} /></div></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="breadcrumbs"><span>YOUR LIBRARY</span><span className="crumb-slash">/</span><b>{active}</b></div><div className="topbar-actions"><label className="search-box"><Search size={17} /><input ref={searchRef} value={query} onChange={e => setQuery(e.target.value)} placeholder="Search channels, groups…" /><kbd><Command size={11} /> K</kbd></label><button className="icon-button" aria-label="Refresh playlist" onClick={() => selectedPlaylist && void refreshPlaylist(selectedPlaylist)} disabled={!selectedPlaylist}><Activity size={18} /></button><button className="add-button" onClick={() => setShowAdd(true)}><Plus size={17} /> Add playlist</button></div></header>
      <section className="page-content">
        <AnimatePresence mode="wait">
          {isGridView && <motion.div key="channels" className="library-view" initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}>
            <div className="library-intro"><div><div className="eyebrow"><Sparkles size={13} /> YOUR CHANNEL UNIVERSE</div><h1>{active === "Discover" ? <>Every channel.<br /><span>One beautiful place.</span></> : active === "Live TV" ? <>Find your next<br /><span>live moment.</span></> : active === "Favorites" ? <>Your favorites.<br /><span>Always close.</span></> : <>Pick up right<br /><span>where you left off.</span></>}</h1><p>{selectedPlaylist ? `${selectedPlaylist.name} · ${selectedPlaylist.channels.length.toLocaleString()} channels in this source` : "Connect an M3U, M3U8 or JSON playlist to populate your library."}</p></div>
              <div className="hero-art" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="hero-screen"><div className="screen-glow" /><div className="screen-icon"><Radio size={42} /></div><span>LIVE · ANYWHERE</span></div><div className="floating-chip chip-top"><Signal size={14} /> Adaptive streaming</div><div className="floating-chip chip-bottom"><Wifi size={14} /> Playlist library</div></div>
            </div>
            <div className="section-heading library-heading"><div><span className="eyebrow">CHANNEL LIBRARY</span><h2>{visibleChannels.length.toLocaleString()} channels</h2></div><div className="library-tools">{playlists.length > 0 && <select className="playlist-select" value={selectedPlaylist?.id ?? ""} onChange={e => { setSelectedPlaylistId(e.target.value); setSelectedGroup("All"); }} aria-label="Choose playlist">{playlists.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}<span className="updated-label"><Wifi size={14} /> Local library</span></div></div>
            {active !== "Favorites" && active !== "Recently watched" && <div className="group-filters">{groups.map(group => <button key={group} className={selectedGroup === group ? "group-chip active" : "group-chip"} onClick={() => { setSelectedGroup(group); setScrollTop(0); }}>{group}<span>{group === "All" ? selectedPlaylist?.channels.length ?? 0 : selectedPlaylist?.channels.filter(channel => channel.group === group).length ?? 0}</span></button>)}</div>}
            {error && <div className="notice error"><X size={15} />{error}<button onClick={() => setError("")}>Dismiss</button></div>}{notice && <div className="notice success"><Check size={15} />{notice}<button onClick={() => setNotice("")}>Dismiss</button></div>}
            {selectedChannel && <div className="selected-strip"><div className="selected-mark"><PlayCircle size={18} /></div><div><b>{selectedChannel.channel.name}</b><span>Selected from {playlists.find(item => item.id === selectedChannel.playlistId)?.name ?? "your library"} · Playing in the built-in player</span></div><button onClick={() => setSelectedChannel(null)} aria-label="Close selection"><X size={16} /></button></div>}
            {visibleChannels.length ? <div className="virtual-grid" onScroll={e => setScrollTop(e.currentTarget.scrollTop)}><div style={{ height: startRow * rowHeight }} /><div className="channel-grid">{renderedChannels.map(({ playlistId, channel }) => <ChannelCard key={channelKey(playlistId, channel)} channel={channel} favorite={favorites.includes(channelKey(playlistId, channel))} selected={selectedChannel?.playlistId === playlistId && selectedChannel.channel.id === channel.id} onSelect={() => selectChannel(playlistId, channel)} onFavorite={() => toggleFavorite(channelKey(playlistId, channel))} />)}</div><div style={{ height: Math.max(0, (totalRows - startRow - visibleRows) * rowHeight) }} /></div> : <div className="empty-library"><div className="empty-icon"><Radio size={23} /></div><b>{playlists.length ? "No channels match this view" : "Your channel library starts here"}</b><span>{playlists.length ? "Try another category or search term." : "Add an M3U/M3U8 URL, JSON endpoint or local playlist file."}</span>{!playlists.length && <button className="primary-button" onClick={() => setShowAdd(true)}><Plus size={16} /> Connect a playlist</button>}</div>}
          </motion.div>}

          {active === "Playlists" && <motion.div key="playlists" className="management-view" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}><div className="eyebrow">SOURCE MANAGER</div><h1>Your playlists.<br /><span>One library.</span></h1><p className="view-lead">Manage M3U, M3U8 and JSON sources, refresh them, or remove a source from this device.</p><div className="manage-toolbar"><h2>{playlists.length} connected sources</h2><button className="primary-button" onClick={() => setShowAdd(true)}><Plus size={16} /> Add playlist</button></div>
            {playlists.length ? <div className="playlist-list">{playlists.map(playlist => <article className="playlist-row" key={playlist.id}><div className="playlist-row-icon"><ListVideo size={20} /></div><div className="playlist-row-copy"><b>{playlist.name}</b><span>{playlist.channels.length.toLocaleString()} channels · {playlist.groups.length} categories · updated {new Date(playlist.fetchedAt).toLocaleString()}</span><small>{/^https?:/i.test(playlist.source) ? playlist.source : "Local playlist file"}</small></div><button className="small-icon-button" onClick={() => void refreshPlaylist(playlist)} title="Refresh"><RefreshCw size={16} /></button><button className="small-icon-button danger" onClick={() => { manager.remove(playlist.id); removeStoredPlaylist(playlist.id); if (selectedPlaylistId === playlist.id) setSelectedPlaylistId(""); }} title="Remove playlist"><Trash2 size={16} /></button></article>)}</div> : <div className="empty-library"><div className="empty-icon"><FileUp size={23} /></div><b>No playlists connected yet</b><span>Add a remote URL or choose a local playlist file.</span><button className="primary-button" onClick={() => setShowAdd(true)}><Plus size={16} /> Add first playlist</button></div>}
          </motion.div>}

          {active === "EPG Guide" && <motion.div key="epg" className="management-view" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}><div className="eyebrow">PROGRAM GUIDE</div><h1>What's on.<br /><span>What's next.</span></h1><p className="view-lead">XMLTV now-and-next guide, matched to channel tvg-id values.</p><div className="manage-toolbar"><h2>{selectedPlaylist?.name ?? "Choose a playlist"}</h2><div className="library-tools">{playlists.length > 0 && <select className="playlist-select" value={selectedPlaylist?.id ?? ""} onChange={e => setSelectedPlaylistId(e.target.value)}>{playlists.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}<button className="primary-button" onClick={() => void loadGuide()} disabled={epgBusy || !selectedPlaylist?.epgUrls.length}>{epgBusy ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />} Load guide</button></div></div>
            {error && <div className="notice error">{error}</div>}{guideRows.some(row => row.programs.length) ? <div className="guide-list">{guideRows.filter(row => row.programs.length).map(({ channel, programs }) => { const { current, next } = currentAndNext(programs); return <article className="guide-row" key={channel.id}><div className="guide-channel"><b>{channel.name}</b><span>{channel.group}</span></div><div className="guide-program"><span className="live-tag">{current ? "NOW" : "NO LIVE DATA"}</span><b>{current?.title ?? "No current programme"}</b><small>{current ? `${formatTime(current.start)} – ${formatTime(current.stop)}` : "Programme information unavailable"}</small></div><div className="guide-program next"><span className="next-tag">UP NEXT</span><b>{next?.title ?? "—"}</b><small>{next ? formatTime(next.start) : "No upcoming listing"}</small></div></article>; })}</div> : <div className="empty-library"><div className="empty-icon"><Clock3 size={23} /></div><b>No guide data loaded</b><span>{selectedPlaylist?.epgUrls.length ? "Load the XMLTV feed declared in this playlist." : "This playlist does not declare an XMLTV URL yet."}</span></div>}
          </motion.div>}

          {active === "Single stream" && <motion.div key="single" className="management-view" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}><div className="eyebrow">QUICK CONNECT</div><h1>One link.<br /><span>Instant library.</span></h1><p className="view-lead">Add a direct stream URL as a one-channel source. It opens directly in the built-in player.</p><button className="primary-button" onClick={() => { setSourceUrl(""); setPlaylistName("Single stream"); setShowAdd(true); }}><Plus size={16} /> Add a stream URL</button></motion.div>}
          {active === "Settings" && <motion.div key="settings" className="management-view" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}><div className="eyebrow">PREFERENCES</div><h1>Your setup.<br /><span>Your rules.</span></h1><p className="view-lead">Choose the automatic refresh interval applied to newly added remote playlists.</p><div className="settings-card"><b>Default automatic refresh</b><span>Applied to new playlists.</span><div className="group-filters">{REFRESH_OPTIONS.map(option => <button key={option.value} className={refreshInterval === option.value ? "group-chip active" : "group-chip"} onClick={() => setRefreshInterval(option.value)}>{option.label}</button>)}</div></div><div className="settings-card update-card"><div className="update-heading"><div><b>Desktop app updates</b><span>Checks published TG IPTV releases on GitHub.</span></div><button className="small-icon-button" title="Check for updates" onClick={() => void window.tvApp?.checkForUpdates()} disabled={updateState.status === "checking" || updateState.status === "downloading"}><RotateCw size={16} /></button></div><div className="update-status"><span className={updateState.status === "error" ? "update-indicator error" : "update-indicator"}>{updateState.status === "checking" || updateState.status === "downloading" ? <LoaderCircle className="spin" size={16} /> : updateState.status === "error" ? <AlertCircle size={16} /> : updateState.status === "downloaded" || updateState.status === "not-available" ? <CheckCircle2 size={16} /> : <Activity size={16} />}</span><span>{updateState.message ?? "Update status unknown."}</span></div>{updateState.status === "downloading" && <div className="update-progress"><div style={{ width: `${updateState.percent ?? 0}%` }} /></div>}{updateState.status === "available" && <button className="primary-button" onClick={() => void window.tvApp?.downloadUpdate()}><Download size={15} /> Download {updateState.version}</button>}{updateState.status === "downloaded" && <button className="primary-button" onClick={() => void window.tvApp?.installUpdate()}><RotateCw size={15} /> Restart to install {updateState.version}</button>}</div></motion.div>}
        </AnimatePresence>
        <footer className="page-footer"><span>TG IPTV <i>·</i> Built for the big screen</span><span><kbd>?</kbd> Keyboard shortcuts <i>·</i> Version 2.0.1</span></footer>
      </section>
    </main>
    {selectedChannel && <Player channel={selectedChannel.channel} channels={playerChannels} onClose={() => setSelectedChannel(null)} onChangeChannel={next => { setSelectedChannel({ playlistId: selectedChannel.playlistId, channel: next }); recordWatch(selectedChannel.playlistId, next); }} onRecover={recoverChannel} onResolve={resolveLiveTgChannel} />}
    <input ref={fileInput} type="file" accept=".m3u,.m3u8,.txt,.json,application/json,audio/x-mpegurl,application/vnd.apple.mpegurl" hidden onChange={onFileChange} />
    <AnimatePresence>{showAdd && <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={e => { if (e.target === e.currentTarget && !busy) setShowAdd(false); }}>
      <motion.div className="add-modal" initial={reduceMotion ? false : { opacity: 0, y: 18, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: .98 }} transition={{ type: "spring", stiffness: 320, damping: 30 }}>
        <button className="modal-close" onClick={() => setShowAdd(false)} disabled={busy}><X size={19} /></button><div className="modal-icon"><ListVideo size={22} /></div><div className="eyebrow">SOURCE MANAGER</div><h2>Connect your playlist</h2><p>Import a remote M3U/M3U8 or JSON source, or open a playlist file stored on this device.</p>
        <label className="field-label">Playlist name<input value={playlistName} onChange={e => setPlaylistName(e.target.value)} placeholder="My playlist" /></label>
        <label className="field-label">Playlist URL<input value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} placeholder="https://example.com/playlist.m3u" /></label>
        <label className="field-label">Automatic refresh<select value={refreshInterval} onChange={e => setRefreshInterval(Number(e.target.value))}>{REFRESH_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        {error && <div className="notice error">{error}</div>}
        <button className="primary-button modal-done" disabled={busy || !sourceUrl.trim()} onClick={() => void addSource(sourceUrl, playlistName)}>{busy ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />}{busy ? "Importing playlist…" : "Import playlist"}</button>
        <div className="modal-divider"><span>OR</span></div><button className="file-button" disabled={busy} onClick={() => fileInput.current?.click()}><FileUp size={17} /> Choose local playlist file</button><small className="modal-footnote">Supports M3U, M3U8 and JSON. Only HTTP(S) stream URLs are accepted.</small>
      </motion.div>
    </motion.div>}</AnimatePresence>
  </div>;
}
