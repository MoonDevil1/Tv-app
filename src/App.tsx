import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Activity, AudioLines, Bookmark, ChevronDown, CircleHelp, Command, Compass,
  Film, Heart, History, LayoutGrid, ListVideo, Plus, Radio, Search, Settings2,
  ShieldCheck, Signal, Sparkles, Tv2, Wifi
} from "lucide-react";

const navItems = [
  { label: "Discover", icon: Compass },
  { label: "Live TV", icon: Radio },
  { label: "Favorites", icon: Heart },
  { label: "Recently watched", icon: History },
  { label: "EPG Guide", icon: LayoutGrid },
];
const managementItems = [
  { label: "Playlists", icon: ListVideo },
  { label: "Single stream", icon: AudioLines },
  { label: "Settings", icon: Settings2 },
];

export default function App() {
  const [active, setActive] = useState("Discover");
  const [query, setQuery] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const reduceMotion = useReducedMotion();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Tv2 size={22} strokeWidth={2.2} /></div>
          <div><strong>TG IPTV</strong><span>LIVE ENTERTAINMENT</span></div>
        </div>
        <div className="workspace"><div className="workspace-icon">T</div><div><b>My library</b><small>Personal workspace</small></div><ChevronDown size={15} /></div>
        <div className="nav-label">YOUR SPACE</div>
        <nav>{navItems.map(({ label, icon: Icon }) => (
          <button key={label} className={active === label ? "nav-item active" : "nav-item"} onClick={() => setActive(label)}>
            <Icon size={18} /><span>{label}</span>{label === "Favorites" && <span className="nav-count">0</span>}
          </button>
        ))}</nav>
        <div className="nav-label library-label">MANAGE</div>
        <nav>{managementItems.map(({ label, icon: Icon }) => (
          <button key={label} className={active === label ? "nav-item active" : "nav-item"} onClick={() => setActive(label)}>
            <Icon size={18} /><span>{label}</span>
          </button>
        ))}</nav>
        <div className="sidebar-bottom">
          <div className="connection"><span className="status-dot" /><div><b>Player ready</b><small>Waiting for a stream</small></div></div>
          <button className="help-link"><CircleHelp size={17} /> Help & shortcuts</button>
          <div className="profile"><div className="avatar">N</div><div><b>Local profile</b><small>On this device</small></div><Settings2 size={16} /></div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumbs"><span>YOUR LIBRARY</span><span className="crumb-slash">/</span><b>{active}</b></div>
          <div className="topbar-actions">
            <label className="search-box"><Search size={17} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search channels" /><kbd><Command size={11} /> K</kbd></label>
            <button className="icon-button" aria-label="Activity"><Activity size={18} /></button>
            <button className="add-button" onClick={() => setShowAdd(true)}><Plus size={17} /> Add playlist</button>
          </div>
        </header>

        <section className="page-content">
          <motion.div className="welcome-row" initial={reduceMotion ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .45 }}>
            <div><div className="eyebrow"><Sparkles size={13} /> YOUR SCREEN, REIMAGINED</div><h1>Every channel.<br /><span>One beautiful place.</span></h1><p>Bring your live TV playlists together and settle into the good stuff.</p>
              <div className="hero-actions"><button className="primary-button" onClick={() => setShowAdd(true)}><Plus size={17} /> Connect a playlist</button><button className="quiet-button" onClick={() => setActive("Live TV")}>Explore Live TV <span>↗</span></button></div>
            </div>
            <div className="hero-art" aria-hidden="true">
              <div className="orbit orbit-one" /><div className="orbit orbit-two" />
              <div className="hero-screen"><div className="screen-glow" /><div className="screen-icon"><Radio size={42} /></div><span>LIVE · ANYWHERE</span></div>
              <div className="floating-chip chip-top"><Signal size={14} /> Adaptive streaming</div>
              <div className="floating-chip chip-bottom"><ShieldCheck size={14} /> Secure playback</div>
            </div>
          </motion.div>

          <div className="section-heading"><div><span className="eyebrow">OVERVIEW</span><h2>Your entertainment hub</h2></div><span className="updated-label"><Wifi size={14} /> All systems ready</span></div>
          <div className="stat-grid">
            {[{ label: "Channels", value: "—", note: "Across all playlists", icon: Radio }, { label: "Playlists", value: "0", note: "No sources connected", icon: ListVideo }, { label: "Favorites", value: "0", note: "Your saved channels", icon: Bookmark }, { label: "Recently played", value: "0", note: "Pick up where you left off", icon: Film }].map(({ label, value, note, icon: Icon }, i) => (
              <motion.div key={label} className="stat-card" initial={reduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * .06, duration: .35 }}>
                <div className="stat-top"><span>{label}</span><Icon size={17} /></div><strong>{value}</strong><small>{note}</small>
              </motion.div>
            ))}
          </div>

          <div className="section-heading playlist-heading"><div><span className="eyebrow">GET STARTED</span><h2>Make it yours</h2></div><button className="text-action" onClick={() => setShowAdd(true)}>Manage sources <span>→</span></button></div>
          <motion.button className="empty-playlist" onClick={() => setShowAdd(true)} whileHover={reduceMotion ? undefined : { y: -3 }} whileTap={reduceMotion ? undefined : { scale: .99 }}>
            <div className="empty-icon"><Plus size={23} /></div><div><b>Your channel library starts here</b><span>Add an M3U/M3U8 URL or import a local playlist to see your channels.</span></div><span className="empty-cta">Add source <span>↗</span></span>
          </motion.button>
          <footer className="page-footer"><span>TG IPTV <i>·</i> Built for the big screen</span><span><kbd>?</kbd> Keyboard shortcuts <i>·</i> Version 2.0.0</span></footer>
        </section>
      </main>

      <AnimatePresence>
        {showAdd && <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={e => { if (e.target === e.currentTarget) setShowAdd(false); }}>
          <motion.div className="add-modal" initial={reduceMotion ? false : { opacity: 0, y: 18, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: .98 }} transition={{ type: "spring", stiffness: 320, damping: 30 }}>
            <button className="modal-close" onClick={() => setShowAdd(false)}>×</button><div className="modal-icon"><ListVideo size={22} /></div><div className="eyebrow">SOURCE MANAGER</div><h2>Connect your playlist</h2><p>Bring your channels into one personal library. Playlist importing is being wired into the next phase.</p>
            <div className="modal-option"><div className="option-icon"><Wifi size={19} /></div><div><b>Playlist URL</b><small>M3U, M3U8 or JSON endpoint</small></div><span className="soon-tag">NEXT PHASE</span></div>
            <div className="modal-option"><div className="option-icon"><Plus size={19} /></div><div><b>Local playlist file</b><small>Import a playlist from your device</small></div><span className="soon-tag">NEXT PHASE</span></div>
            <button className="primary-button modal-done" onClick={() => setShowAdd(false)}>Got it</button>
          </motion.div>
        </motion.div>}
      </AnimatePresence>
    </div>
  );
}
