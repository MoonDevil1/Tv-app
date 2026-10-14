import { invoke } from '@tauri-apps/api/core';
import './style.css';

type Channel = {
  id?: string | number;
  channelId?: string | number;
  channel_id?: string | number;
  name?: string;
  title?: string;
  category?: string;
  group?: string;
  genre?: string;
  logo?: string;
  image?: string;
  icon?: string;
  description?: string;
  [key: string]: unknown;
};

const API_HOME = 'https://livetgtv.lovable.app/';
const state = { channels: [] as Channel[], query: '', category: 'All channels', selectedId: '' };
const root = document.querySelector<HTMLDivElement>('#app')!;

root.innerHTML = `
<div class="shell">
  <aside class="sidebar">
    <div class="brand"><div class="brand-icon">▶</div><div><b>TGTV</b><small>DESKTOP <span>V1</span></small></div></div>
    <button class="nav active">▦ <span>Live channels</span></button>
    <button class="nav" id="reload">↻ <span>Refresh directory</span></button>
    <div class="side-bottom"><div class="live-dot"></div><div><b>LiveTGTV V1</b><small>Public directory</small></div></div>
  </aside>
  <main class="main">
    <header class="topbar"><div><div class="eyebrow">LIVE TELEVISION</div><h1>Watch something live.</h1><p class="subtitle">Your channels, in one desktop window.</p></div><a class="web-link" href="${API_HOME}" target="_blank" rel="noreferrer">Open web version ↗</a></header>
    <section class="toolbar"><label class="search"><span>⌕</span><input id="search" placeholder="Search channels…" autocomplete="off" /></label><select id="categories" aria-label="Filter category"><option>All channels</option></select><span class="count" id="count">Loading…</span></section>
    <section class="content">
      <div class="directory"><div class="section-head"><div><div class="eyebrow">THE DIRECTORY</div><h2>Channels</h2></div><span class="tiny-live"><i></i> LIVE DIRECTORY</span></div><div id="grid" class="grid"><div class="loading"><div class="spinner"></div>Loading channels from V1…</div></div></div>
      <aside class="player-panel"><div class="section-head player-title"><div><div class="eyebrow">NOW PLAYING</div><h2 id="playing-title">Choose a channel</h2></div><span class="on-air">● ON AIR</span></div>
        <div class="video-wrap"><iframe id="player" title="LiveTGTV V1 player" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe><div id="video-empty" class="video-empty"><div class="play-symbol">▶</div><b>Your screen, live.</b><p>Select a channel to start playback.</p></div></div>
        <div id="player-status" class="status">Ready when you are.</div><div class="player-actions"><button id="retry" class="secondary">↻ Reload player</button><button id="open-source" class="secondary">↗ Open source page</button></div>
        <div class="note"><span>ⓘ</span><p>The official LiveTGTV V1 embed handles its own playback. Stream availability, authorization and DRM requirements are controlled by the source service.</p></div>
      </aside>
    </section>
    <footer><span>TGTV Desktop <b>v0.1.0</b></span><span>Lightweight Windows app · LiveTGTV V1 only</span></footer>
  </main>
</div>`;

const grid = document.querySelector<HTMLDivElement>('#grid')!;
const search = document.querySelector<HTMLInputElement>('#search')!;
const categories = document.querySelector<HTMLSelectElement>('#categories')!;
const count = document.querySelector<HTMLSpanElement>('#count')!;
const player = document.querySelector<HTMLIFrameElement>('#player')!;
const empty = document.querySelector<HTMLDivElement>('#video-empty')!;
const status = document.querySelector<HTMLDivElement>('#player-status')!;
const playingTitle = document.querySelector<HTMLHeadingElement>('#playing-title')!;
const openSource = document.querySelector<HTMLButtonElement>('#open-source')!;

function getList(data: unknown): Channel[] {
  if (Array.isArray(data)) return data as Channel[];
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    for (const key of ['channels', 'data', 'results', 'items']) {
      const value = obj[key];
      if (Array.isArray(value)) return value as Channel[];
      if (value && typeof value === 'object' && Array.isArray((value as Record<string, unknown>).channels)) return (value as {channels: Channel[]}).channels;
    }
  }
  return [];
}
function name(c: Channel) { return String(c.name ?? c.title ?? `Channel ${id(c)}`); }
function id(c: Channel) { return String(c.id ?? c.channelId ?? c.channel_id ?? ''); }
function category(c: Channel) { return String(c.category ?? c.group ?? c.genre ?? 'Other'); }
function logo(c: Channel) { return String(c.logo ?? c.image ?? c.icon ?? ''); }
function esc(s: string) { return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!)); }
function safeHttpUrl(raw: string) { try { const u = new URL(raw); return ['https:', 'http:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } }
function setStatus(message: string, error = false) { status.textContent = message; status.classList.toggle('error', error); }
function rebuildCategories() {
  const all = [...new Set(state.channels.map(category).filter(Boolean))].sort((a,b) => a.localeCompare(b));
  categories.innerHTML = '<option>All channels</option>' + all.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  categories.value = all.includes(state.category) ? state.category : 'All channels';
  state.category = categories.value;
}
function render() {
  const q = state.query.trim().toLowerCase();
  const list = state.channels.filter(c => (state.category === 'All channels' || category(c) === state.category) && (!q || `${name(c)} ${category(c)}`.toLowerCase().includes(q)));
  count.textContent = `${list.length} channel${list.length === 1 ? '' : 's'}`;
  if (!list.length) {
    grid.innerHTML = '<div class="empty-list"><b>No channels found</b><p>Try another search or refresh the directory.</p></div>';
    return;
  }
  grid.innerHTML = list.map(c => {
    const img = safeHttpUrl(logo(c));
    const selected = state.selectedId && state.selectedId === id(c);
    return `<button class="channel-card ${selected ? 'selected' : ''}" data-id="${esc(id(c))}" title="Play ${esc(name(c))}">
      <div class="channel-art">${img ? `<img loading="lazy" src="${esc(img)}" alt="" onerror="this.remove()">` : ''}<span class="fallback-logo">${esc(name(c).slice(0,2).toUpperCase())}</span><span class="card-live"><i></i> LIVE</span></div>
      <div class="channel-meta"><b>${esc(name(c))}</b><small>${esc(category(c))}</small></div><span class="card-play">▶</span>
    </button>`;
  }).join('');
  grid.querySelectorAll<HTMLButtonElement>('.channel-card').forEach(el => el.addEventListener('click', () => {
    const ch = state.channels.find(c => id(c) === el.dataset.id);
    if (ch) playChannel(ch);
  }));
}
async function loadChannels() {
  grid.innerHTML = '<div class="loading"><div class="spinner"></div>Loading channels from V1…</div>';
  count.textContent = 'Connecting…'; setStatus('Contacting LiveTGTV V1…');
  try {
    const data = await invoke<unknown>('get_channels');
    state.channels = getList(data);
    if (!state.channels.length) throw new Error('The V1 API returned no recognizable channel list. Check its response format.');
    rebuildCategories(); render(); setStatus(`Loaded ${state.channels.length} channels from LiveTGTV V1.`);
  } catch (e) {
    grid.innerHTML = `<div class="empty-list"><b>Could not load channels</b><p>${esc(String(e))}</p><button id="load-again" class="secondary">Try again</button></div>`;
    document.querySelector('#load-again')?.addEventListener('click', () => void loadChannels());
    count.textContent = 'Offline'; setStatus(String(e), true);
  }
}
function playChannel(ch: Channel) {
  const channelId = id(ch);
  if (!channelId) { setStatus('This channel has no ID in the V1 directory.', true); return; }
  state.selectedId = channelId;
  playingTitle.textContent = name(ch);
  const embedUrl = `${API_HOME}embed/${encodeURIComponent(channelId)}`;
  player.src = embedUrl;
  empty.classList.add('hidden');
  render();
  setStatus(`Opening official V1 player for ${name(ch)}…`);
  openSource.onclick = () => window.open(embedUrl, '_blank', 'noopener,noreferrer');
  player.onload = () => setStatus(`Player page loaded for ${name(ch)}. If playback does not start, check the service's on-page message or open it in a browser.`);
}
search.addEventListener('input', () => { state.query = search.value; render(); });
categories.addEventListener('change', () => { state.category = categories.value; render(); });
document.querySelector('#reload')?.addEventListener('click', () => void loadChannels());
document.querySelector('#retry')?.addEventListener('click', () => {
  const ch = state.channels.find(c => id(c) === state.selectedId);
  if (ch) playChannel(ch); else void loadChannels();
});
document.querySelector<HTMLButtonElement>('#open-source')!.addEventListener('click', () => window.open(API_HOME, '_blank', 'noopener,noreferrer'));
void loadChannels();
