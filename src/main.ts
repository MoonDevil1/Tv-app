import { invoke } from '@tauri-apps/api/core';
import './style.css';

const APP_VERSION = '0.2.2';

type Channel = {
  id?: string | number; channelId?: string | number; channel_id?: string | number;
  name?: string; title?: string; category?: string; group?: string; genre?: string;
  logo?: string; image?: string; icon?: string; description?: string;
  [key: string]: unknown;
};
const API_HOME = 'https://livetgtv.lovable.app/';
const FAVORITES_KEY = 'tgtv-desktop-favorites-v1';
type PlayerMode = 'embed' | 'watch';
const state = {
  channels: [] as Channel[], query: '', category: 'All channels', selectedId: '',
  favoritesOnly: false, playerMode: 'embed' as PlayerMode,
  favorites: new Set<string>(loadFavorites())
};
const root = document.querySelector<HTMLDivElement>('#app')!;

root.innerHTML = `
<div class="shell">
  <aside class="sidebar">
    <div class="brand"><div class="brand-icon">▶</div><div><b>TGTV</b><small>DESKTOP <span>V1</span></small></div></div>
    <button class="nav active" id="all-channels">▦ <span>Live channels</span></button>
    <button class="nav" id="favorites-nav">★ <span>Favourites <em id="fav-count">0</em></span></button>
    <button class="nav" id="reload">↻ <span>Refresh directory</span></button>
    <button class="nav" id="settings-nav">⚙ <span>Settings</span></button>
    <div class="side-bottom"><div class="live-dot"></div><div><b>LiveTGTV V1</b><small>Public directory</small></div></div>
  </aside>
  <main class="main">
    <header class="topbar"><div><div class="eyebrow">LIVE TELEVISION</div><h1>Watch something live.</h1><p class="subtitle">Your channels, in one desktop window.</p></div><a class="web-link" href="${API_HOME}" target="_blank" rel="noreferrer">Open web version ↗</a></header>
    <section class="toolbar"><label class="search"><span>⌕</span><input id="search" placeholder="Search channels…" autocomplete="off" /></label><select id="categories" aria-label="Filter category"><option>All channels</option></select><span class="count" id="count">Loading…</span></section>
    <section class="content">
      <div class="directory"><div class="section-head"><div><div class="eyebrow">THE DIRECTORY</div><h2 id="directory-title">Channels</h2></div><span class="tiny-live"><i></i> LIVE DIRECTORY</span></div><div id="grid" class="grid"><div class="loading"><div class="spinner"></div>Loading channels from V1…</div></div></div>
      <aside class="player-panel"><div class="section-head player-title"><div><div class="eyebrow">NOW PLAYING</div><h2 id="playing-title">Choose a channel</h2></div><button id="player-favorite" class="favorite-player" title="Add current channel to favourites" aria-label="Toggle current channel favourite" disabled>☆</button></div>
        <div class="video-wrap"><iframe id="player" title="LiveTGTV V1 player" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe><button id="change-channel" class="change-channel" disabled>⇄ Change channel</button><div id="channel-picker" class="channel-picker hidden"><div class="picker-head"><b>Change channel</b><button id="close-channel-picker" title="Close channel list" aria-label="Close channel list">×</button></div><input id="picker-search" type="search" placeholder="Search channels…" autocomplete="off"><div id="picker-list" class="picker-list"></div></div><div id="video-empty" class="video-empty"><div class="play-symbol">▶</div><b>Your screen, live.</b><p>Select a channel to start playback.</p></div></div>
        <div id="player-status" class="status">Ready when you are.</div>
        <div class="player-actions"><button id="retry" class="secondary">↻ Reload player</button><button id="switch-player" class="secondary">⇄ Try Watch page</button><button id="open-source" class="secondary">↗ Open source page</button></div>
        <div class="note"><span>ⓘ</span><p>The official LiveTGTV V1 page handles playback. If one embed fails, use “Try Watch page” to switch its official player route. Availability and authorization are controlled by the source service.</p></div>
      </aside>
    </section>
    <footer><span>TGTV Desktop <b>v0.2.2</b></span><span>Lightweight Windows app · LiveTGTV V1 only</span></footer>
  </main>
</div>`;

root.insertAdjacentHTML('beforeend', "<div id=\"settings-modal\" class=\"settings-backdrop hidden\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"settings-title\">\n  <section class=\"settings-card\"><div class=\"settings-head\"><div><div class=\"eyebrow\">PREFERENCES</div><h2 id=\"settings-title\">Settings</h2></div><button id=\"close-settings\" class=\"settings-close\" aria-label=\"Close settings\">×</button></div>\n    <div class=\"settings-row\"><div><b>App updates</b><p>Check GitHub for the latest TGTV Desktop release and install it without opening a browser.</p></div><span id=\"current-version\" class=\"version-pill\">v0.2.2</span></div>\n    <div id=\"update-status\" class=\"update-status\" role=\"status\">You are using TGTV Desktop v0.2.2.</div>\n    <div class=\"settings-actions\"><button id=\"check-updates\" class=\"primary-button\">Check for updates</button><button id=\"install-update\" class=\"primary-button hidden\">Download and install update</button></div>\n    <p class=\"settings-footnote\">Updates are downloaded from this app’s official GitHub Releases. Save your work before installing.</p>\n  </section>\n</div>");

const grid = document.querySelector<HTMLDivElement>('#grid')!;
const search = document.querySelector<HTMLInputElement>('#search')!;
const categories = document.querySelector<HTMLSelectElement>('#categories')!;
const count = document.querySelector<HTMLSpanElement>('#count')!;
const player = document.querySelector<HTMLIFrameElement>('#player')!;
const empty = document.querySelector<HTMLDivElement>('#video-empty')!;
const status = document.querySelector<HTMLDivElement>('#player-status')!;
const playingTitle = document.querySelector<HTMLHeadingElement>('#playing-title')!;
const openSource = document.querySelector<HTMLButtonElement>('#open-source')!;
const playerFavorite = document.querySelector<HTMLButtonElement>('#player-favorite')!;
const switchPlayer = document.querySelector<HTMLButtonElement>('#switch-player')!;
const changeChannelButton = document.querySelector<HTMLButtonElement>('#change-channel')!;
const channelPicker = document.querySelector<HTMLDivElement>('#channel-picker')!;
const pickerSearch = document.querySelector<HTMLInputElement>('#picker-search')!;
const pickerList = document.querySelector<HTMLDivElement>('#picker-list')!;
const settingsModal = document.querySelector<HTMLDivElement>('#settings-modal')!;
const updateStatus = document.querySelector<HTMLDivElement>('#update-status')!;
const checkUpdatesButton = document.querySelector<HTMLButtonElement>('#check-updates')!;
const installUpdateButton = document.querySelector<HTMLButtonElement>('#install-update')!;
type UpdateInfo = { version: string; download_url: string; file_name: string; notes: string };
let availableUpdate: UpdateInfo | null = null;

function loadFavorites(): string[] {
  try { const value = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]'); return Array.isArray(value) ? value.map(String) : []; }
  catch { return []; }
}
function saveFavorites() { try { localStorage.setItem(FAVORITES_KEY, JSON.stringify([...state.favorites])); } catch { /* storage may be disabled */ } }
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
function updateFavoriteControls() {
  changeChannelButton.disabled = state.channels.length === 0;
  changeChannelButton.textContent = state.selectedId ? '⇄ Change channel' : '☷ Choose channel';
  document.querySelector<HTMLSpanElement>('#fav-count')!.textContent = String(state.favorites.size);
  const currentIsFav = state.favorites.has(state.selectedId);
  playerFavorite.textContent = currentIsFav ? '★' : '☆';
  playerFavorite.classList.toggle('is-favorite', currentIsFav);
  playerFavorite.disabled = !state.selectedId;
  playerFavorite.title = currentIsFav ? 'Remove from favourites' : 'Add to favourites';
  switchPlayer.textContent = state.playerMode === 'embed' ? '⇄ Try Watch page' : '⇄ Try Embed page';
}
function rebuildCategories() {
  const all = [...new Set(state.channels.map(category).filter(Boolean))].sort((a,b) => a.localeCompare(b));
  categories.innerHTML = '<option>All channels</option>' + all.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  categories.value = all.includes(state.category) ? state.category : 'All channels';
  state.category = categories.value;
}
function render() {
  const q = state.query.trim().toLowerCase();
  const list = state.channels.filter(c =>
    (!state.favoritesOnly || state.favorites.has(id(c))) &&
    (state.category === 'All channels' || category(c) === state.category) &&
    (!q || `${name(c)} ${category(c)}`.toLowerCase().includes(q))
  );
  count.textContent = `${list.length} channel${list.length === 1 ? '' : 's'}`;
  document.querySelector<HTMLHeadingElement>('#directory-title')!.textContent = state.favoritesOnly ? 'Favourites' : 'Channels';
  document.querySelector<HTMLButtonElement>('#all-channels')!.classList.toggle('active', !state.favoritesOnly);
  document.querySelector<HTMLButtonElement>('#favorites-nav')!.classList.toggle('active', state.favoritesOnly);
  updateFavoriteControls();
  if (!list.length) {
    grid.innerHTML = state.favoritesOnly && state.favorites.size === 0
      ? '<div class="empty-list"><b>Your favourites are empty</b><p>Tap the ☆ on any channel card or in the player to save it here.</p></div>'
      : '<div class="empty-list"><b>No channels found</b><p>Try another search or refresh the directory.</p></div>';
    return;
  }
  grid.innerHTML = list.map(c => {
    const img = safeHttpUrl(logo(c));
    const selected = state.selectedId && state.selectedId === id(c);
    const fav = state.favorites.has(id(c));
    return `<div class="channel-card-wrap">
      <button class="channel-card ${selected ? 'selected' : ''}" data-id="${esc(id(c))}" title="Play ${esc(name(c))}">
        <div class="channel-art">${img ? `<img loading="lazy" src="${esc(img)}" alt="" onerror="this.remove()">` : ''}<span class="fallback-logo">${esc(name(c).slice(0,2).toUpperCase())}</span><span class="card-live"><i></i> LIVE</span></div>
        <div class="channel-meta"><b>${esc(name(c))}</b><small>${esc(category(c))}</small></div><span class="card-play">▶</span>
      </button><button class="favorite-card ${fav ? 'is-favorite' : ''}" data-fav-id="${esc(id(c))}" title="${fav ? 'Remove from favourites' : 'Add to favourites'}" aria-label="${fav ? 'Remove from favourites' : 'Add to favourites'}">${fav ? '★' : '☆'}</button>
    </div>`;
  }).join('');
  grid.querySelectorAll<HTMLButtonElement>('.channel-card').forEach(el => el.addEventListener('click', () => {
    const ch = state.channels.find(c => id(c) === el.dataset.id);
    if (ch) playChannel(ch, state.playerMode);
  }));
  grid.querySelectorAll<HTMLButtonElement>('.favorite-card').forEach(el => el.addEventListener('click', event => {
    event.stopPropagation(); toggleFavorite(el.dataset.favId || '');
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
function toggleFavorite(channelId: string) {
  if (!channelId) return;
  if (state.favorites.has(channelId)) state.favorites.delete(channelId); else state.favorites.add(channelId);
  saveFavorites(); render();
}
function playerUrl(channelId: string, mode: PlayerMode) {
  return `${API_HOME}${mode === 'embed' ? 'embed' : 'watch'}/${encodeURIComponent(channelId)}`;
}
function renderChannelPicker() {
  const q = pickerSearch.value.trim().toLowerCase();
  const list = state.channels.filter(c => `${name(c)} ${category(c)}`.toLowerCase().includes(q));
  pickerList.innerHTML = list.length ? list.map(c => `<button class="picker-channel ${id(c) === state.selectedId ? 'current' : ''}" data-picker-id="${esc(id(c))}"><span class="picker-channel-name">${esc(name(c))}</span><small>${esc(category(c))}</small>${id(c) === state.selectedId ? '<span class="picker-playing">PLAYING</span>' : ''}</button>`).join('') : '<div class="picker-empty">No matching channels</div>';
  pickerList.querySelectorAll<HTMLButtonElement>('.picker-channel').forEach(el => el.addEventListener('click', () => {
    const ch = state.channels.find(c => id(c) === el.dataset.pickerId);
    if (ch) { channelPicker.classList.add('hidden'); pickerSearch.value = ''; playChannel(ch, state.playerMode); }
  }));
}
function playChannel(ch: Channel, mode: PlayerMode = 'embed') {
  const channelId = id(ch);
  if (!channelId) { setStatus('This channel has no ID in the V1 directory.', true); return; }
  state.selectedId = channelId; state.playerMode = mode;
  channelPicker.classList.add('hidden');
  playingTitle.textContent = name(ch);
  const url = playerUrl(channelId, mode);
  player.src = url;
  empty.classList.add('hidden');
  render();
  setStatus(`Opening official V1 ${mode === 'embed' ? 'embed' : 'watch'} page for ${name(ch)}…`);
  openSource.onclick = () => window.open(url, '_blank', 'noopener,noreferrer');
  player.onload = () => setStatus(`The V1 ${mode} page loaded for ${name(ch)}. If video stays black or shows an error, try switching the player page or opening it in your browser.`);
}
changeChannelButton.addEventListener('click', () => {
  const opening = channelPicker.classList.contains('hidden');
  channelPicker.classList.toggle('hidden', !opening);
  if (opening) { pickerSearch.value = ''; renderChannelPicker(); pickerSearch.focus(); }
});
document.querySelector('#close-channel-picker')?.addEventListener('click', () => channelPicker.classList.add('hidden'));
pickerSearch.addEventListener('input', renderChannelPicker);
search.addEventListener('input', () => { state.query = search.value; render(); });
categories.addEventListener('change', () => { state.category = categories.value; render(); });
document.querySelector('#reload')?.addEventListener('click', () => void loadChannels());
document.querySelector('#all-channels')?.addEventListener('click', () => { state.favoritesOnly = false; render(); });
document.querySelector('#favorites-nav')?.addEventListener('click', () => { state.favoritesOnly = true; render(); });
playerFavorite.addEventListener('click', () => toggleFavorite(state.selectedId));
switchPlayer.addEventListener('click', () => {
  const ch = state.channels.find(c => id(c) === state.selectedId);
  if (ch) playChannel(ch, state.playerMode === 'embed' ? 'watch' : 'embed');
});
document.querySelector('#retry')?.addEventListener('click', () => {
  const ch = state.channels.find(c => id(c) === state.selectedId);
  if (ch) playChannel(ch, state.playerMode); else void loadChannels();
});
openSource.addEventListener('click', () => window.open(API_HOME, '_blank', 'noopener,noreferrer'));
document.querySelector('#settings-nav')?.addEventListener('click', () => { settingsModal.classList.remove('hidden'); document.querySelector('#settings-nav')?.classList.add('active'); });
function closeSettings() { settingsModal.classList.add('hidden'); document.querySelector('#settings-nav')?.classList.remove('active'); }
document.querySelector('#close-settings')?.addEventListener('click', closeSettings);
settingsModal.addEventListener('click', event => { if (event.target === settingsModal) closeSettings(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeSettings(); });
checkUpdatesButton.addEventListener('click', async () => {
  checkUpdatesButton.disabled = true; installUpdateButton.classList.add('hidden'); availableUpdate = null;
  updateStatus.textContent = 'Checking the latest GitHub release…'; updateStatus.classList.remove('error', 'success');
  try {
    const update = await invoke<UpdateInfo | null>('check_for_updates');
    if (!update || compareVersions(update.version, APP_VERSION) <= 0) { updateStatus.textContent = `You’re up to date — TGTV Desktop v${APP_VERSION}.`; updateStatus.classList.add('success'); }
    else { availableUpdate = update; updateStatus.textContent = `Version ${update.version} is available. ${update.notes || 'Install it to get the latest improvements.'}`; installUpdateButton.classList.remove('hidden'); }
  } catch (error) { updateStatus.textContent = `Could not check for updates: ${String(error)}`; updateStatus.classList.add('error'); }
  finally { checkUpdatesButton.disabled = false; }
});
installUpdateButton.addEventListener('click', async () => {
  if (!availableUpdate) return; installUpdateButton.disabled = true; installUpdateButton.textContent = 'Downloading…';
  updateStatus.textContent = `Downloading TGTV Desktop v${availableUpdate.version}…`; updateStatus.classList.remove('error', 'success');
  try { await invoke('download_and_install_update', { downloadUrl: availableUpdate.download_url, fileName: availableUpdate.file_name }); updateStatus.textContent = 'Installer launched. Follow the installer prompts to finish updating.'; updateStatus.classList.add('success'); }
  catch (error) { updateStatus.textContent = `Update failed: ${String(error)}`; updateStatus.classList.add('error'); installUpdateButton.disabled = false; installUpdateButton.textContent = 'Retry update'; }
});
function compareVersions(a: string, b: string) { const pa = a.replace(/^v/i, '').split('.').map(n => Number.parseInt(n, 10) || 0); const pb = b.replace(/^v/i, '').split('.').map(n => Number.parseInt(n, 10) || 0); for (let i = 0; i < Math.max(pa.length, pb.length); i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0); } return 0; }
void loadChannels();

