import { useEffect, useState } from "react";
import { CalendarDays, ChevronRight, CircleHelp, Clock3, Heart, History, ListVideo, Menu, Moon, Radio, Settings, Sun, Tv2 } from "lucide-react";
import { useAppStore } from "./app/store";
import type { AppSection, AppSettings, ThemeMode } from "./app/models";

const navigation: Array<{ section: AppSection; icon: typeof Tv2; group: "watch" | "manage" }> = [
  { section: "Home", icon: Tv2, group: "watch" }, { section: "Live TV", icon: Radio, group: "watch" },
  { section: "Guide", icon: CalendarDays, group: "watch" }, { section: "Favorites", icon: Heart, group: "watch" },
  { section: "History", icon: History, group: "watch" }, { section: "Playlists", icon: ListVideo, group: "manage" },
  { section: "Settings", icon: Settings, group: "manage" }
];
const refreshOptions = [{ label: "Manual", value: 0 }, { label: "Every 1 minute", value: 60000 }, { label: "Every 5 minutes", value: 300000 }, { label: "Every 15 minutes", value: 900000 }, { label: "Every hour", value: 3600000 }];

function PageHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return <div className="page-heading"><div><p className="eyebrow">TG IPTV DESKTOP</p><h1>{title}</h1><p className="page-subtitle">{subtitle}</p></div></div>;
}
function EmptyState({ icon: Icon, title, detail, action, onAction }: { icon: typeof Tv2; title: string; detail: string; action?: string; onAction?: () => void }) {
  return <div className="empty-state"><div className="empty-state-icon"><Icon size={27} strokeWidth={1.7} /></div><h2>{title}</h2><p>{detail}</p>{action && onAction && <button className="primary-button" onClick={onAction}>{action}<ChevronRight size={16} /></button>}</div>;
}

function SettingsPage() {
  const settings = useAppStore(state => state.settings);
  const updateSettings = useAppStore(state => state.updateSettings);
  return <>
    <PageHeading title="Settings" subtitle="Configure the app, playlists and playback preferences." />
    <div className="settings-layout">
      <section className="settings-panel">
        <div className="panel-heading"><h2>Appearance</h2><p>Choose the look of the desktop application.</p></div>
        <div className="theme-options">
          {(["light", "dark"] as ThemeMode[]).map(theme => <button key={theme} className={settings.theme === theme ? "theme-option selected" : "theme-option"} onClick={() => updateSettings({ theme })}>
            <span className={`theme-preview ${theme}`}>{theme === "light" ? <Sun size={19} /> : <Moon size={19} />}</span>
            <span><b>{theme === "light" ? "Light" : "Dark"}</b><small>{theme === "light" ? "Bright Material surfaces" : "Low-glare dark surfaces"}</small></span><span className="selection-dot" />
          </button>)}
        </div>
      </section>
      <section className="settings-panel"><div className="panel-heading"><h2>Playlist defaults</h2><p>Defaults applied when a playlist is added.</p></div>
        <label className="setting-row"><span><b>Automatic playlist refresh</b><small>Refresh remote playlist data in the background.</small></span>
          <select value={settings.defaultRefreshIntervalMs} onChange={event => updateSettings({ defaultRefreshIntervalMs: Number(event.target.value) })}>{refreshOptions.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}</select>
        </label>
      </section>
      <section className="settings-panel"><div className="panel-heading"><h2>Playback defaults</h2><p>Initial behaviour for the built-in TV player.</p></div>
        <label className="setting-row"><span><b>Preferred stream quality</b><small>Auto lets the stream select the available quality.</small></span>
          <select value={settings.preferredQuality} onChange={event => updateSettings({ preferredQuality: event.target.value as AppSettings["preferredQuality"] })}><option value="auto">Auto</option><option value="1080p">1080p</option><option value="720p">720p</option><option value="480p">480p</option></select>
        </label>
        <label className="setting-row"><span><b>Show channel numbers</b><small>Display playlist channel numbers in the library.</small></span><input type="checkbox" checked={settings.showChannelNumbers} onChange={event => updateSettings({ showChannelNumbers: event.target.checked })} /></label>
        <label className="setting-row"><span><b>Diagnostics</b><small>Save local playback errors and performance details.</small></span><input type="checkbox" checked={settings.diagnosticsEnabled} onChange={event => updateSettings({ diagnosticsEnabled: event.target.checked })} /></label>
      </section>
    </div>
  </>;
}

function App() {
  const activeSection = useAppStore(state => state.activeSection);
  const setActiveSection = useAppStore(state => state.setActiveSection);
  const settings = useAppStore(state => state.settings);
  const playlists = useAppStore(state => state.playlists);
  const favorites = useAppStore(state => state.favorites);
  const [navigationOpen, setNavigationOpen] = useState(false);

  useEffect(() => { document.documentElement.dataset.theme = settings.theme; }, [settings.theme]);
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setNavigationOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);
  const channelsCount = playlists.reduce((total, playlist) => total + playlist.channels.length, 0);
  const openSection = (section: AppSection) => { setActiveSection(section); setNavigationOpen(false); };

  return <div className="application">
    {navigationOpen && <button className="navigation-backdrop" aria-label="Close navigation" onClick={() => setNavigationOpen(false)} />}
    <aside className={navigationOpen ? "navigation-drawer open" : "navigation-drawer"}>
      <div className="brand-lockup"><div className="brand-icon"><Tv2 size={23} /></div><div><b>TG IPTV</b><small>WINDOWS PLAYER</small></div></div>
      <div className="profile-switcher"><div className="profile-avatar">T</div><span><b>My library</b><small>{playlists.length} playlist{playlists.length === 1 ? "" : "s"} connected</small></span></div>
      <p className="navigation-caption">WATCH</p>
      <nav>{navigation.filter(item => item.group === "watch").map(({ section, icon: Icon }) => <button key={section} className={activeSection === section ? "navigation-item active" : "navigation-item"} onClick={() => openSection(section)}><Icon size={19} /><span>{section}</span>{section === "Favorites" && favorites.length > 0 && <small>{favorites.length}</small>}</button>)}</nav>
      <p className="navigation-caption manage-caption">MANAGE</p>
      <nav>{navigation.filter(item => item.group === "manage").map(({ section, icon: Icon }) => <button key={section} className={activeSection === section ? "navigation-item active" : "navigation-item"} onClick={() => openSection(section)}><Icon size={19} /><span>{section}</span></button>)}</nav>
      <div className="navigation-bottom"><div className="connection-status"><span className="connection-indicator" /><span><b>Application ready</b><small>Windows desktop</small></span></div><button className="help-link" onClick={() => openSection("Settings")}><CircleHelp size={17} /> App preferences</button></div>
    </aside>
    <div className="main-column">
      <header className="app-bar"><div className="app-bar-title"><button className="menu-button" onClick={() => setNavigationOpen(value => !value)} aria-label="Toggle navigation"><Menu size={21} /></button><span>IPTV <i>/</i> {activeSection}</span></div><div className="app-bar-actions"><span className="platform-label"><span /> Windows Desktop</span></div></header>
      <main className="page-container">
        {activeSection === "Home" && <>
          <PageHeading title="Welcome to TG IPTV" subtitle="Your television library, playlists and programme guide in one place." />
          <div className="overview-cards">
            <button className="overview-card" onClick={() => openSection("Live TV")}><span className="overview-icon"><Radio size={21} /></span><b>{channelsCount.toLocaleString()}</b><small>Channels available</small><span className="card-link">Open Live TV <ChevronRight size={15} /></span></button>
            <button className="overview-card" onClick={() => openSection("Playlists")}><span className="overview-icon"><ListVideo size={21} /></span><b>{playlists.length}</b><small>Connected playlists</small><span className="card-link">Manage playlists <ChevronRight size={15} /></span></button>
            <button className="overview-card" onClick={() => openSection("Favorites")}><span className="overview-icon"><Heart size={21} /></span><b>{favorites.length}</b><small>Favorite channels</small><span className="card-link">View favorites <ChevronRight size={15} /></span></button>
          </div>
          <div className="home-content-grid">
            <section className="welcome-panel"><p className="eyebrow">YOUR ENTERTAINMENT HUB</p><h2>All your channels.<br /><span>One simple player.</span></h2><p>Start by connecting your IPTV playlist. Browse channels, switch streams, view what's on now and next, and manage your viewing preferences.</p><button className="primary-button" onClick={() => openSection("Playlists")}>Open playlist manager <ChevronRight size={16} /></button></section>
            <section className="quick-links"><h2>Quick access</h2><button onClick={() => openSection("Guide")}><CalendarDays size={19} /><span><b>Programme guide</b><small>See what's on now and next</small></span><ChevronRight size={17} /></button><button onClick={() => openSection("History")}><Clock3 size={19} /><span><b>Recently watched</b><small>Return to your last channels</small></span><ChevronRight size={17} /></button></section>
          </div>
        </>}
        {activeSection === "Live TV" && <><PageHeading title="Live TV" subtitle="Browse your channels and start watching." /><EmptyState icon={Radio} title="Your channel list will appear here" detail="Connect a playlist to import channels, logos and categories. The playlist engine is being rebuilt first." action="Open playlist manager" onAction={() => openSection("Playlists")} /></>}
        {activeSection === "Guide" && <><PageHeading title="TV Guide" subtitle="Programme schedules, now playing and what's coming next." /><EmptyState icon={CalendarDays} title="No programme guide loaded" detail="EPG support will connect XMLTV and LiveTGTV programme data to the channel library." /></>}
        {activeSection === "Favorites" && <><PageHeading title="Favorites" subtitle="Your saved channels in one place." /><EmptyState icon={Heart} title="No favorite channels yet" detail="Mark channels as favorites from the channel library and they will appear here." /></>}
        {activeSection === "History" && <><PageHeading title="Recently watched" subtitle="Quickly return to the channels you watched recently." /><EmptyState icon={History} title="Nothing watched yet" detail="Your viewing history will be recorded locally when you start watching channels." /></>}
        {activeSection === "Playlists" && <><PageHeading title="Playlist manager" subtitle="Add and organize M3U, M3U8 and JSON playlists." /><EmptyState icon={ListVideo} title="No playlists connected" detail="The new playlist manager will support multiple sources, custom request headers, refresh schedules and local playlist files." /></>}
        {activeSection === "Settings" && <SettingsPage />}
      </main>
      <footer className="app-footer"><span>TG IPTV Desktop</span><span>Windows edition <i>•</i> Rebuild in progress</span></footer>
    </div>
  </div>;
}
export default App;
