import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { CalendarDays, ChevronRight, CircleHelp, Clock3, FileUp, Heart, History, ListVideo, Menu, Moon, Play, Radio, RefreshCw, Search, Settings, Sun, Trash2, Tv2, Upload } from "lucide-react";
import { useAppStore, channelKey } from "./app/store";
import type { AppSection, AppSettings, EpgProgramme, Playlist, ThemeMode, TvChannel } from "./app/models";
import { addLiveTgTvFallbacks, fetchPlaylistText, LIVE_TGTV_SOURCE, parsePlaylistText } from "./core/playlist/parser";
import LivePlayer from "./components/LivePlayer";
import { parseXmltv } from "./core/epg/xmltv";

const navigation: Array<{ section: AppSection; icon: typeof Tv2; group: "watch" | "manage" }> = [
  { section: "Home", icon: Tv2, group: "watch" }, { section: "Live TV", icon: Radio, group: "watch" },
  { section: "Guide", icon: CalendarDays, group: "watch" }, { section: "Favorites", icon: Heart, group: "watch" },
  { section: "History", icon: History, group: "watch" }, { section: "Playlists", icon: ListVideo, group: "manage" },
  { section: "Settings", icon: Settings, group: "manage" }
];
const refreshOptions = [{ label: "Manual", value: 0 }, { label: "Every 1 minute", value: 60000 }, { label: "Every 5 minutes", value: 300000 }, { label: "Every 15 minutes", value: 900000 }, { label: "Every hour", value: 3600000 }];
function PageHeading({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) {
  return <div className="page-heading"><div><p className="eyebrow">TG IPTV DESKTOP</p><h1>{title}</h1><p className="page-subtitle">{subtitle}</p></div>{action}</div>;
}
function EmptyState({ icon: Icon, title, detail, action, onAction }: { icon: typeof Tv2; title: string; detail: string; action?: string; onAction?: () => void }) {
  return <div className="empty-state"><div className="empty-state-icon"><Icon size={27} strokeWidth={1.7} /></div><h2>{title}</h2><p>{detail}</p>{action && onAction && <button className="primary-button" onClick={onAction}>{action}<ChevronRight size={16} /></button>}</div>;
}
function SettingsPage() {
  const settings = useAppStore(state => state.settings), updateSettings = useAppStore(state => state.updateSettings);
  return <><PageHeading title="Settings" subtitle="Configure the app, playlists and playback preferences." /><div className="settings-layout">
    <section className="settings-panel"><div className="panel-heading"><h2>Appearance</h2><p>Choose the look of the desktop application.</p></div><div className="theme-options">
      {(["light", "dark"] as ThemeMode[]).map(theme => <button key={theme} className={settings.theme === theme ? "theme-option selected" : "theme-option"} onClick={() => updateSettings({ theme })}><span className={`theme-preview ${theme}`}>{theme === "light" ? <Sun size={19} /> : <Moon size={19} />}</span><span><b>{theme === "light" ? "Light" : "Dark"}</b><small>{theme === "light" ? "Bright Material surfaces" : "Low-glare dark surfaces"}</small></span><span className="selection-dot" /></button>)}
    </div></section>
    <section className="settings-panel"><div className="panel-heading"><h2>Playlist defaults</h2><p>Defaults applied when a playlist is added.</p></div><label className="setting-row"><span><b>Automatic playlist refresh</b><small>Refresh remote playlist data in the background.</small></span><select value={settings.defaultRefreshIntervalMs} onChange={e => updateSettings({ defaultRefreshIntervalMs: Number(e.target.value) })}>{refreshOptions.map(o => <option value={o.value} key={o.value}>{o.label}</option>)}</select></label></section>
    <section className="settings-panel"><div className="panel-heading"><h2>Playback defaults</h2><p>Initial behaviour for the built-in TV player.</p></div>
      <label className="setting-row"><span><b>Preferred stream quality</b><small>Auto lets the stream select the available quality.</small></span><select value={settings.preferredQuality} onChange={e => updateSettings({ preferredQuality: e.target.value as AppSettings["preferredQuality"] })}><option value="auto">Auto</option><option value="1080p">1080p</option><option value="720p">720p</option><option value="480p">480p</option></select></label>
      <label className="setting-row"><span><b>Show channel numbers</b><small>Display playlist channel numbers in the library.</small></span><input type="checkbox" checked={settings.showChannelNumbers} onChange={e => updateSettings({ showChannelNumbers: e.target.checked })} /></label>
      <label className="setting-row"><span><b>Diagnostics</b><small>Save local playback errors and performance details.</small></span><input type="checkbox" checked={settings.diagnosticsEnabled} onChange={e => updateSettings({ diagnosticsEnabled: e.target.checked })} /></label>
    </section></div></>;
}
function PlaylistManager() {
  const playlists = useAppStore(state => state.playlists), settings = useAppStore(state => state.settings);
  const addPlaylist = useAppStore(state => state.addPlaylist), replacePlaylist = useAppStore(state => state.replacePlaylist), removePlaylist = useAppStore(state => state.removePlaylist);
  const [url,setUrl] = useState(""), [name,setName] = useState(""), [headersText,setHeadersText] = useState("{}"), [paste,setPaste] = useState("");
  const [error,setError] = useState(""), [busy,setBusy] = useState(false), [busyId,setBusyId] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const refreshing = useRef(new Set<string>());
  const lastAttempt = useRef(new Map<string,number>());
  const importContent = async (text:string, source:string, customName:string, headers:Record<string,string> = {}) => {
    const parsed = await addLiveTgTvFallbacks(parsePlaylistText(text,source,customName));
    parsed.refreshIntervalMs = settings.defaultRefreshIntervalMs;
    parsed.requestHeaders = headers;
    addPlaylist(parsed);
    setUrl(""); setName(""); setPaste(""); setHeadersText("{}"); setError("");
  };
  const importUrl = async (target:string) => {
    setBusy(true); setError("");
    try {
      let headers:Record<string,string> = {};
      try { const raw=JSON.parse(headersText); if (!raw || Array.isArray(raw) || typeof raw!=="object" || Object.values(raw).some(v=>typeof v!=="string")) throw new Error(); headers=raw; }
      catch { throw new Error("Request headers must be a JSON object with text values."); }
      const result=await fetchPlaylistText(target,headers);
      await importContent(result.text,result.finalUrl,name,headers);
    } catch(e) { setError(e instanceof Error ? e.message : "Playlist import failed."); }
    finally { setBusy(false); }
  };
  const importFile = async (file?:File) => {
    if (!file) return;
    setBusy(true); setError("");
    try { await importContent(await file.text(),file.name,name || file.name); }
    catch(e) { setError(e instanceof Error ? e.message : "File import failed."); }
    finally { setBusy(false); if(fileRef.current) fileRef.current.value=""; }
  };
  const refresh = async (playlist:Playlist, background = false) => {
    if (refreshing.current.has(playlist.id) || !(playlist.source.startsWith("http://") || playlist.source.startsWith("https://"))) return;
    refreshing.current.add(playlist.id);
    lastAttempt.current.set(playlist.id, Date.now());
    if (!background) { setBusyId(playlist.id); setError(""); }
    try {
      const result=await fetchPlaylistText(playlist.source,playlist.requestHeaders);
      const updated=await addLiveTgTvFallbacks(parsePlaylistText(result.text,result.finalUrl,playlist.name));
      replacePlaylist({...updated,id:playlist.id,name:playlist.name,importedAt:playlist.importedAt,refreshedAt:Date.now(),refreshIntervalMs:playlist.refreshIntervalMs,requestHeaders:playlist.requestHeaders});
    } catch(e) { setError(`Could not refresh ${playlist.name}: ${e instanceof Error ? e.message : "network error"}`); }
    finally { refreshing.current.delete(playlist.id); if (!background) setBusyId(""); }
  };
  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now();
      for (const playlist of useAppStore.getState().playlists) {
        const lastRefresh = playlist.refreshedAt ?? playlist.importedAt;
        const lastAttemptAt = lastAttempt.current.get(playlist.id) ?? lastRefresh;
        if (playlist.refreshIntervalMs > 0 && (playlist.source.startsWith("http://") || playlist.source.startsWith("https://")) && now - Math.max(lastRefresh,lastAttemptAt) >= playlist.refreshIntervalMs) void refresh(playlist, true);
      }
    }, 15000);
    return () => window.clearInterval(timer);
  }, []);
  return <><PageHeading title="Playlist manager" subtitle="Connect remote or local M3U, M3U8 and JSON playlists." action={<button className="secondary-button" onClick={() => void importUrl(LIVE_TGTV_SOURCE)} disabled={busy}><Radio size={15}/> Add LiveTGTV</button>} />
    <section className="import-panel"><div className="panel-heading"><h2>Add a playlist</h2><p>Use a playlist URL, paste its contents or select a local file.</p></div>
      <div className="import-grid"><label><span>Playlist URL</span><input value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://example.com/playlist.m3u" /></label><label><span>Display name (optional)</span><input value={name} onChange={e=>setName(e.target.value)} placeholder="My IPTV playlist" /></label></div>
      <label className="import-label"><span>Request headers (JSON, optional)</span><textarea rows={2} value={headersText} onChange={e=>setHeadersText(e.target.value)} spellCheck={false}/></label>
      <div className="import-actions"><button className="primary-button" disabled={busy || !url.trim()} onClick={()=>void importUrl(url.trim())}>{busy ? "Importing…" : "Import URL"} <ChevronRight size={15}/></button><button className="secondary-button" disabled={busy || !paste.trim()} onClick={()=>void importContent(paste,"pasted-playlist",name || "Pasted playlist").catch(e=>setError(e.message))}><Upload size={15}/> Import pasted text</button><button className="secondary-button" disabled={busy} onClick={()=>fileRef.current?.click()}><FileUp size={15}/> Choose local file</button><input ref={fileRef} hidden type="file" accept=".m3u,.m3u8,.txt,.json,application/json,audio/x-mpegurl,text/plain" onChange={e=>void importFile(e.target.files?.[0])}/></div>
      <label className="import-label"><span>Or paste playlist contents</span><textarea rows={4} value={paste} onChange={e=>setPaste(e.target.value)} placeholder="#EXTM3U … or JSON playlist" spellCheck={false}/></label>
      {error && <p className="error-message" role="alert">{error}</p>}
    </section>
    <section className="playlist-list-section"><div className="list-section-heading"><h2>Connected playlists</h2><span>{playlists.length}</span></div>
      {playlists.length===0 ? <div className="compact-empty">No playlists added yet.</div> : playlists.map(playlist=><article className="playlist-row" key={playlist.id}><div className="playlist-row-icon"><ListVideo size={20}/></div><div className="playlist-row-info"><b>{playlist.name}</b><small>{playlist.channels.length.toLocaleString()} channels · {playlist.groups.length} groups · {playlist.source}</small><small>{playlist.refreshedAt ? "Last refreshed " + new Date(playlist.refreshedAt).toLocaleString() : "Imported " + new Date(playlist.importedAt).toLocaleString()}</small></div><select className="playlist-refresh-select" aria-label={"Refresh interval for " + playlist.name} value={playlist.refreshIntervalMs} onChange={e=>replacePlaylist({...playlist,refreshIntervalMs:Number(e.target.value)})}>{refreshOptions.map(option=><option value={option.value} key={option.value}>{option.label}</option>)}</select><button className="icon-button" title="Refresh playlist" disabled={busyId===playlist.id || !(playlist.source.startsWith("http://") || playlist.source.startsWith("https://"))} onClick={()=>void refresh(playlist)}>{busyId===playlist.id ? <span className="spinner"/> : <RefreshCw size={16}/>}</button><button className="icon-button danger" title="Remove playlist" onClick={()=>removePlaylist(playlist.id)}><Trash2 size={16}/></button></article>)}
    </section>
  </>;
}
function ChannelLibrary({ mode, onPlay }: { mode: "all" | "favorites" | "recent"; onPlay: (playlist: Playlist, channel: import("./app/models").TvChannel) => void }) {
  const playlists=useAppStore(state=>state.playlists), favorites=useAppStore(state=>state.favorites);
  const toggleFavorite=useAppStore(state=>state.toggleFavorite), recentChannels=useAppStore(state=>state.recentChannels);
  const [query,setQuery]=useState(""),[group,setGroup]=useState("All groups"),[source,setSource]=useState("All playlists");
  const entries=useMemo(()=>playlists.flatMap(playlist=>playlist.channels.map(channel=>({playlist,channel}))),[playlists]);
  const groups=useMemo(()=>["All groups",...new Set(entries.map(x=>x.channel.group).filter(Boolean))],[entries]);
  const recentOrder=new Map(recentChannels.map((item,index)=>[channelKey(item.playlistId,item.channelId),index]));
  const filtered=entries.filter(({playlist,channel})=>(mode==="all"||(mode==="favorites"&&favorites.includes(channelKey(playlist.id,channel.id)))||(mode==="recent"&&recentOrder.has(channelKey(playlist.id,channel.id)))) && (source==="All playlists"||playlist.id===source) && (group==="All groups"||channel.group===group) && (!query||channel.name.toLowerCase().includes(query.toLowerCase())||channel.group.toLowerCase().includes(query.toLowerCase()))).sort((a,b)=>(recentOrder.get(channelKey(a.playlist.id,a.channel.id))??999)-(recentOrder.get(channelKey(b.playlist.id,b.channel.id))??999));
  return <div className="channel-library"><div className="channel-toolbar"><label className="channel-search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search channels…"/></label><select value={source} onChange={e=>setSource(e.target.value)}><option>All playlists</option>{playlists.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select><select value={group} onChange={e=>setGroup(e.target.value)}>{groups.map(g=><option key={g}>{g}</option>)}</select><span>{filtered.length} channels</span></div>
    {filtered.length===0 ? <EmptyState icon={mode==="all"?Radio:Heart} title={mode==="all"?"No channels found":mode==="favorites"?"No favorite channels yet":"No viewing history yet"} detail={mode==="all"?"Add a playlist or adjust your search and filters.":mode==="favorites"?"Use the star on a channel to save it here.":"Channels you play will appear here."}/> : <div className="channel-grid">{filtered.map(({playlist,channel})=><article className="channel-card" key={playlist.id+":"+channel.id}><div className="channel-logo">{channel.logo ? <img src={channel.logo} alt="" loading="lazy" onError={e=>{e.currentTarget.style.display="none";}}/> : <Tv2 size={22}/>}</div><div className="channel-card-info"><b>{channel.name}</b><small>{channel.group} · {playlist.name}</small><small>{channel.sources[0]?.type.toUpperCase() ?? "STREAM"}</small></div><button className="channel-play-button" onClick={()=>onPlay(playlist,channel)} aria-label={"Play " + channel.name}><Play size={14}/></button><button className={favorites.includes(channelKey(playlist.id,channel.id))?"favorite-button selected":"favorite-button"} aria-label="Toggle favorite" onClick={()=>toggleFavorite(playlist.id,channel.id)}><Heart size={17} fill={favorites.includes(channelKey(playlist.id,channel.id))?"currentColor":"none"}/></button></article>)}</div>}
  </div>;
}
function programmeTime(value: number): string { return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
function GuidePage({ playlists, onPlay, status, refreshedAt }: { playlists: Playlist[]; onPlay: (playlist: Playlist, channel: TvChannel) => void; status: string; refreshedAt: number }) {
  const guide = useAppStore(state => state.guide); const [query, setQuery] = useState(""); const [, setClock] = useState(Date.now()); const now = Date.now();\n  useEffect(() => { const timer = window.setInterval(() => setClock(Date.now()), 30000); return () => window.clearInterval(timer); }, []);
  const entries = playlists.flatMap(playlist => playlist.channels.map(channel => { const programmes = guide[channel.tvgId ?? ""] ?? guide[channel.id] ?? []; return { playlist, channel, current: programmes.find(item => item.start <= now && item.stop > now), next: programmes.find(item => item.start > now) }; })).filter(item => item.current || item.next).filter(item => !query || item.channel.name.toLowerCase().includes(query.toLowerCase()) || item.current?.title.toLowerCase().includes(query.toLowerCase()) || item.next?.title.toLowerCase().includes(query.toLowerCase()));
  const feedCount = new Set(playlists.flatMap(item => item.epgUrls)).size;
  return <><PageHeading title="TV Guide" subtitle="Live programmes and what is coming up next." action={<span className="guide-updated">{refreshedAt ? "Updated " + new Date(refreshedAt).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}) : status}</span>} />
    <label className="channel-search guide-search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search channels or programmes…"/></label>{status && <p className="guide-status" role="status">{status}</p>}
    {entries.length ? <div className="guide-list">{entries.map(({playlist,channel,current,next})=><article className="guide-row" key={playlist.id+":"+channel.id}>
      <button className="guide-channel" onClick={()=>onPlay(playlist,channel)}><span className="guide-logo">{channel.logo ? <img src={channel.logo} alt="" loading="lazy"/> : <Tv2 size={20}/>}</span><span><b>{channel.name}</b><small>{channel.group}</small></span></button>
      <div className="guide-programmes"><div className="guide-programme current"><span className="guide-time">{current ? programmeTime(current.start)+" – "+programmeTime(current.stop) : "NOW"}</span><div><b>{current?.title ?? "No current programme data"}</b>{current?.description && <p>{current.description}</p>}</div>{current && <span className="guide-live">LIVE</span>}</div>
        <div className="guide-programme"><span className="guide-time">{next ? programmeTime(next.start)+" – "+programmeTime(next.stop) : "NEXT"}</span><div><b>{next?.title ?? "Schedule unavailable"}</b>{next?.description && <p>{next.description}</p>}</div></div></div>
      <button className="guide-play" onClick={()=>onPlay(playlist,channel)} aria-label={"Watch "+channel.name}><Play size={16}/></button></article>)}</div> : <EmptyState icon={CalendarDays} title={feedCount ? "No matching programme data" : "No programme guide connected"} detail={feedCount ? "The connected EPG feeds did not provide current or upcoming schedules for these channels." : "Add a playlist containing an XMLTV URL (url-tvg, x-tvg-url or epg_url) to load programme schedules."} action="Manage playlists" onAction={()=>useAppStore.getState().setActiveSection("Playlists")}/>}</>;
}
function App() {
  const activeSection=useAppStore(state=>state.activeSection),setActiveSection=useAppStore(state=>state.setActiveSection);
  const settings=useAppStore(state=>state.settings),playlists=useAppStore(state=>state.playlists),favorites=useAppStore(state=>state.favorites);
  const setGuide=useAppStore(state=>state.setGuide);
  const [guideStatus,setGuideStatus]=useState(""),[guideRefreshedAt,setGuideRefreshedAt]=useState(0);
  const [navigationOpen,setNavigationOpen]=useState(false);
  const [activePlayback,setActivePlayback]=useState<{playlistId:string;channelId:string}|null>(null);
  const selectedPlaylist=activePlayback ? playlists.find(item=>item.id===activePlayback.playlistId) : undefined;
  const selectedChannel=selectedPlaylist?.channels.find(item=>item.id===activePlayback?.channelId);
  const openPlayer=(playlist:Playlist,channel:import("./app/models").TvChannel)=>setActivePlayback({playlistId:playlist.id,channelId:channel.id});
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const sources = playlists.flatMap(playlist => playlist.epgUrls.map(url => ({ playlist, url })));
      if (!sources.length) { setGuide({}); setGuideStatus(""); setGuideRefreshedAt(0); return; }
      setGuideStatus("Updating programme schedules…");
      const results = await Promise.allSettled(sources.map(async ({playlist,url}) => { const response = await fetchPlaylistText(url, playlist.requestHeaders); return parseXmltv(response.text, playlist.channels); }));
      if (cancelled) return;
      const merged: Record<string, EpgProgramme[]> = {}; let successful = 0;
      for (const result of results) if (result.status === "fulfilled") { successful++; for (const [id, programmes] of Object.entries(result.value)) merged[id] = [...(merged[id] ?? []), ...programmes]; }
      for (const items of Object.values(merged)) { const unique = new Map(items.map(item => [item.channelId + ":" + item.start, item])); items.splice(0, items.length, ...[...unique.values()].sort((a,b)=>a.start-b.start)); }
      setGuide(merged); setGuideRefreshedAt(Date.now());
      setGuideStatus(successful ? "Loaded schedules from " + successful + " of " + sources.length + " EPG feeds." : "Could not load the configured EPG feeds. Check the feed URL and request headers.");
    };
    void load(); const timer = window.setInterval(() => void load(), 30 * 60 * 1000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [playlists, setGuide]);
  useEffect(()=>{document.documentElement.dataset.theme=settings.theme;},[settings.theme]);
  useEffect(()=>{const close=(e:KeyboardEvent)=>{if(e.key==="Escape")setNavigationOpen(false);};window.addEventListener("keydown",close);return()=>window.removeEventListener("keydown",close);},[]);
  const channelsCount=playlists.reduce((total,p)=>total+p.channels.length,0);
  const openSection=(section:AppSection)=>{setActiveSection(section);setNavigationOpen(false);};
  return <div className="application">
    {navigationOpen&&<button className="navigation-backdrop" aria-label="Close navigation" onClick={()=>setNavigationOpen(false)}/>}
    <aside className={navigationOpen?"navigation-drawer open":"navigation-drawer"}><div className="brand-lockup"><div className="brand-icon"><Tv2 size={23}/></div><div><b>TG IPTV</b><small>WINDOWS PLAYER</small></div></div>
      <div className="profile-switcher"><div className="profile-avatar">T</div><span><b>My library</b><small>{playlists.length} playlist{playlists.length===1?"":"s"} connected</small></span></div>
      <p className="navigation-caption">WATCH</p><nav>{navigation.filter(n=>n.group==="watch").map(({section,icon:Icon})=><button key={section} className={activeSection===section?"navigation-item active":"navigation-item"} onClick={()=>openSection(section)}><Icon size={19}/><span>{section}</span>{section==="Favorites"&&favorites.length>0&&<small>{favorites.length}</small>}</button>)}</nav>
      <p className="navigation-caption manage-caption">MANAGE</p><nav>{navigation.filter(n=>n.group==="manage").map(({section,icon:Icon})=><button key={section} className={activeSection===section?"navigation-item active":"navigation-item"} onClick={()=>openSection(section)}><Icon size={19}/><span>{section}</span></button>)}</nav>
      <div className="navigation-bottom"><div className="connection-status"><span className="connection-indicator"/><span><b>Application ready</b><small>Windows desktop</small></span></div><button className="help-link" onClick={()=>openSection("Settings")}><CircleHelp size={17}/> App preferences</button></div>
    </aside>
    <div className="main-column"><header className="app-bar"><div className="app-bar-title"><button className="menu-button" onClick={()=>setNavigationOpen(v=>!v)} aria-label="Toggle navigation"><Menu size={21}/></button><span>IPTV <i>/</i> {activeSection}</span></div><div className="app-bar-actions"><span className="platform-label"><span/> Windows Desktop</span></div></header>
      <main className="page-container">
        {selectedPlaylist && selectedChannel ? <LivePlayer playlist={selectedPlaylist} channel={selectedChannel} onClose={()=>setActivePlayback(null)} onSelect={channel=>setActivePlayback({playlistId:selectedPlaylist.id,channelId:channel.id})}/> : <>
        {activeSection==="Home"&&<><PageHeading title="Welcome to TG IPTV" subtitle="Your television library, playlists and programme guide in one place."/><div className="overview-cards">
          <button className="overview-card" onClick={()=>openSection("Live TV")}><span className="overview-icon"><Radio size={21}/></span><b>{channelsCount.toLocaleString()}</b><small>Channels available</small><span className="card-link">Open Live TV <ChevronRight size={15}/></span></button>
          <button className="overview-card" onClick={()=>openSection("Playlists")}><span className="overview-icon"><ListVideo size={21}/></span><b>{playlists.length}</b><small>Connected playlists</small><span className="card-link">Manage playlists <ChevronRight size={15}/></span></button>
          <button className="overview-card" onClick={()=>openSection("Favorites")}><span className="overview-icon"><Heart size={21}/></span><b>{favorites.length}</b><small>Favorite channels</small><span className="card-link">View favorites <ChevronRight size={15}/></span></button>
        </div><div className="home-content-grid"><section className="welcome-panel"><p className="eyebrow">YOUR ENTERTAINMENT HUB</p><h2>All your channels.<br/><span>One simple player.</span></h2><p>Connect a playlist to browse channels and build your TV library. Open any channel to start watching with automatic stream fallback.</p><button className="primary-button" onClick={()=>openSection("Playlists")}>Open playlist manager <ChevronRight size={16}/></button></section><section className="quick-links"><h2>Quick access</h2><button onClick={()=>openSection("Guide")}><CalendarDays size={19}/><span><b>Programme guide</b><small>See what's on now and next</small></span><ChevronRight size={17}/></button><button onClick={()=>openSection("History")}><Clock3 size={19}/><span><b>Recently watched</b><small>Return to your last channels</small></span><ChevronRight size={17}/></button></section></div></>}
        {activeSection==="Live TV"&&<><PageHeading title="Live TV" subtitle="Browse all channels across your connected playlists."/><ChannelLibrary mode="all" onPlay={openPlayer}/></>}
         {activeSection==="Guide"&&<GuidePage playlists={playlists} onPlay={openPlayer} status={guideStatus} refreshedAt={guideRefreshedAt}/>}
        {activeSection==="Favorites"&&<><PageHeading title="Favorites" subtitle="Your saved channels in one place."/><ChannelLibrary mode="favorites" onPlay={openPlayer}/></>}
        {activeSection==="History"&&<><PageHeading title="Recently watched" subtitle="Quickly return to the channels you watched recently."/><ChannelLibrary mode="recent" onPlay={openPlayer}/></>}
        {activeSection==="Playlists"&&<PlaylistManager/>}
        {activeSection==="Settings"&&<SettingsPage/>}
        </>}
      </main><footer className="app-footer"><span>TG IPTV Desktop</span><span>Windows edition <i>•</i> Live player</span></footer>
    </div>
  </div>;
}
export default App;
