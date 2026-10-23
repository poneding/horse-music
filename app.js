const app = document.querySelector('#app');
const storedTheme = localStorage.getItem('horse-music-theme');
const state = {
  tracks: [], albums: [], artists: [], playlists: [], recentPlays: [], view: 'home', genre: '全部', query: '',
  queue: [], queueIndex: -1, playing: false, currentTime: 0, duration: 0, pendingRecord: null,
  favorites: new Set(JSON.parse(localStorage.getItem('luma-favorites') || '[]')),
  likedOnly: false, lyricsOpen: false, toastTimer: null, listLimit: 100,
  trackById: new Map(), artistIndex: new Map(), artistByName: new Map(), albumTracksMap: new Map(), artistAlbumCounts: new Map(),
  searchHaystack: new Map(), lyricsCache: new Map(), recentCache: null, rankedCache: null, artistRankCache: null,
  theme: ['system', 'light', 'dark'].includes(storedTheme) ? storedTheme : 'system',
  themeMenuOpen: false
};
const TRACK_PAGE_SIZE = 100;
const ADMIN_PAGE_SIZE = 100;
const IMG_LAZY = 'loading="lazy" decoding="async"';
const IMG_VISIBLE = 'decoding="async"';
const audio = new Audio();
audio.preload = 'metadata';
const genres = ['全部', '华语流行', '独立民谣', '电子', '轻爵士'];

const icons = {
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  library: '<path d="M4 19V5m5 14V5m5 14V5m5 14V5"/><path d="M3 21h18"/>',
  heart: '<path d="M20.8 8.7c0 5.1-8.8 10-8.8 10s-8.8-4.9-8.8-10a4.6 4.6 0 0 1 8.8-2.1 4.6 4.6 0 0 1 8.8 2.1z"/>',
  play: '<path d="m8 5 12 7-12 7z"/>', pause: '<path d="M8 5h3v14H8zm6 0h3v14h-3z"/>',
  next: '<path d="m5 5 10 7-10 7zM19 5v14"/>', prev: '<path d="m19 5-10 7 10 7zM5 5v14"/>',
  shuffle: '<path d="m18 14 4 4-4 4m0-20 4 4-4 4M2 18h2a6 6 0 0 0 4.2-1.8L17.8 6.2A6 6 0 0 1 22 4h0M2 6h2a6 6 0 0 1 4.2 1.8l1.3 1.3M17 17l.8.8A6 6 0 0 0 22 20h0"/>',
  volume: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7m3-10a9 9 0 0 1 0 13"/>',
  queue: '<path d="M4 6h16M4 12h16M4 18h9"/><path d="m17 16 4 2-4 2z"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  arrow: '<path d="M5 12h14m-7-7 7 7-7 7"/>', close: '<path d="m18 6-12 12M6 6l12 12"/>',
  plus: '<path d="M12 5v14m-7-7h14"/>', music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  disc: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2"/><path d="M12 3v7"/>',
  list: '<path d="M9 6h12M9 12h12M9 18h12"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>',
  upload: '<path d="M12 16V4m-5 5 5-5 5 5"/><path d="M4 16v4h16v-4"/>',
  logout: '<path d="M10 17l5-5-5-5m5 5H3"/><path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m4 4v6m6-6v6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  chart: '<path d="M4 20V11m5 9V4m5 16v-6m5 6V8"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  sparkle: '<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z"/><path d="m19 14 .9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/>',
  moon: '<path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z"/>',
  monitor: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/>'
};

function icon(name, size = 18, cls = '') {
  return `<svg class="icon ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.music}</svg>`;
}

const systemColorScheme = window.matchMedia('(prefers-color-scheme: dark)');

function applyTheme() {
  const dark = state.theme === 'dark' || (state.theme === 'system' && systemColorScheme.matches);
  document.documentElement.dataset.theme = state.theme;
  document.documentElement.classList.toggle('dark-theme', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#171815' : '#e45b3f');
}

function themeControl(className = '') {
  const labels = { system: '跟随系统', light: '浅色', dark: '深色' };
  const symbols = { system: 'monitor', light: 'sun', dark: 'moon' };
  return `<div class="theme-control ${className}"><button class="icon-button theme-toggle" type="button" data-theme-toggle aria-label="外观主题：${labels[state.theme]}" title="外观主题：${labels[state.theme]}" aria-expanded="${state.themeMenuOpen}">${icon(symbols[state.theme], 17)}</button>${state.themeMenuOpen ? `<div class="theme-menu" role="group" aria-label="外观主题">${Object.entries(labels).map(([value, label]) => `<button class="theme-option ${state.theme === value ? 'selected' : ''}" type="button" aria-pressed="${state.theme === value}" data-theme-choice="${value}">${icon(symbols[value], 16)}<span>${label}</span>${state.theme === value ? '<span class="theme-check">✓</span>' : ''}</button>`).join('')}</div>` : ''}</div>`;
}

applyTheme();
systemColorScheme.addEventListener?.('change', () => {
  if (state.theme === 'system') applyTheme();
});

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const HTML_ESCAPE_RE = /[&<>"']/g;
const DATE_LABEL_FORMAT = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: '2-digit' });
const RELATIVE_DATE_FORMAT = new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' });

function escapeHtml(value = '') {
  return String(value).replace(HTML_ESCAPE_RE, char => HTML_ESCAPES[char]);
}

function coverFor(item) {
  return item.coverUrl || 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=700&q=80';
}

function normalizeName(value) {
  return String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}

function rebuildIndexes() {
  const byId = new Map();
  const artistIndex = new Map();
  const albumById = new Map();
  const albumByTitle = new Map();
  const haystack = new Map();
  for (const track of state.tracks) {
    byId.set(track.id, track);
    haystack.set(track.id, `${track.title} ${track.artist} ${track.album} ${track.genre}`.toLowerCase());
    const names = Array.isArray(track.artistNames) && track.artistNames.length ? track.artistNames : [track.artist];
    const seen = new Set();
    for (const name of names) {
      const key = normalizeName(name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      let list = artistIndex.get(key);
      if (!list) { list = []; artistIndex.set(key, list); }
      list.push(track);
    }
    if (track.albumId) {
      let list = albumById.get(track.albumId);
      if (!list) { list = []; albumById.set(track.albumId, list); }
      list.push(track);
    } else if (track.album) {
      const key = normalizeName(track.album);
      let list = albumByTitle.get(key);
      if (!list) { list = []; albumByTitle.set(key, list); }
      list.push(track);
    }
  }
  const albumTracksMap = new Map();
  for (const album of state.albums) {
    const list = [...(albumById.get(album.id) || []), ...(albumByTitle.get(normalizeName(album.title)) || [])];
    albumTracksMap.set(album.id, list);
    albumTracksMap.set(normalizeName(album.title), list);
  }
  const artistAlbumCounts = new Map();
  for (const [key, list] of artistIndex) {
    artistAlbumCounts.set(key, new Set(list.map(track => track.albumId || track.album).filter(Boolean)).size);
  }
  state.trackById = byId;
  state.artistIndex = artistIndex;
  state.artistByName = new Map(state.artists.map(artist => [normalizeName(artist.name), artist]));
  state.albumTracksMap = albumTracksMap;
  state.artistAlbumCounts = artistAlbumCounts;
  state.searchHaystack = haystack;
  state.recentCache = null;
  state.rankedCache = null;
  state.artistRankCache = null;
  for (const id of state.lyricsCache.keys()) if (!byId.has(id)) state.lyricsCache.delete(id);
}

function albumTracks(album) {
  if (!album) return [];
  return state.albumTracksMap.get(album.id) || state.albumTracksMap.get(normalizeName(album.title)) || [];
}

function artistTracks(artist) {
  if (!artist) return [];
  return state.artistIndex.get(normalizeName(artist.name)) || [];
}

function artistAlbumCount(artist) {
  if (!artist) return 0;
  return state.artistAlbumCounts.get(normalizeName(artist.name)) || 0;
}

function formatTime(time) {
  if (!Number.isFinite(time) || time <= 0) return '0:00';
  return `${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, '0')}`;
}

function dateLabel() {
  return DATE_LABEL_FORMAT.format(new Date()).toUpperCase().replace(',', ' ·');
}

function showToast(message) {
  document.querySelector('.toast')?.remove();
  const toast = document.createElement('div');
  toast.className = 'toast'; toast.textContent = message; document.body.append(toast);
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => toast.remove(), 2400);
}

async function api(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || '请求失败');
  return data;
}

async function refreshLibrary() {
  const data = await api('/api/state');
  state.tracks = data.tracks || [];
  state.albums = data.albums || [];
  state.artists = data.artists || [];
  state.playlists = data.playlists || [];
  state.recentPlays = data.recentPlays || [];
  rebuildIndexes();
}

function recentTracks(limit = 50) {
  if (!state.recentCache) {
    const seen = new Set();
    const list = [];
    for (const entry of state.recentPlays || []) {
      if (!entry?.trackId || seen.has(entry.trackId)) continue;
      const track = state.trackById.get(entry.trackId);
      if (!track) continue;
      seen.add(entry.trackId);
      list.push({ ...track, lastPlayedAt: entry.playedAt });
      if (list.length >= 200) break;
    }
    state.recentCache = list;
  }
  return state.recentCache.slice(0, limit);
}

function rankedTracks() {
  if (!state.rankedCache) {
    state.rankedCache = state.tracks
      .filter(track => (Number(track.playCount) || 0) > 0)
      .sort((left, right) => (Number(right.playCount) || 0) - (Number(left.playCount) || 0)
        || String(right.lastPlayedAt || '').localeCompare(String(left.lastPlayedAt || '')));
  }
  return state.rankedCache;
}

function totalPlays() {
  return state.tracks.reduce((sum, track) => sum + (Number(track.playCount) || 0), 0);
}

function artistPlayRanking(limit = 6) {
  if (!state.artistRankCache) {
    const ranking = new Map();
    for (const track of rankedTracks()) {
      const names = Array.isArray(track.artistNames) && track.artistNames.length ? track.artistNames : [track.artist || '未知艺人'];
      for (const name of names) {
        const key = normalizeName(name);
        if (!key) continue;
        const entry = ranking.get(key) || { name, plays: 0, tracks: 0 };
        entry.plays += Number(track.playCount) || 0;
        entry.tracks += 1;
        ranking.set(key, entry);
      }
    }
    state.artistRankCache = [...ranking.values()].sort((left, right) => right.plays - left.plays);
  }
  return state.artistRankCache.slice(0, limit);
}

function relativeTime(value) {
  const time = new Date(value || '').getTime();
  if (!Number.isFinite(time)) return '';
  const diff = Math.max(0, Date.now() - time);
  if (diff < 60 * 1000) return '刚刚';
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)} 小时前`;
  if (diff < 7 * 24 * 60 * 60 * 1000) return `${Math.floor(diff / 86400000)} 天前`;
  return RELATIVE_DATE_FORMAT.format(time);
}

let playViewTimer = null;
function schedulePlayViewRefresh() {
  if (!['home', 'recent', 'charts'].includes(state.view)) return;
  clearTimeout(playViewTimer);
  playViewTimer = setTimeout(() => {
    if (['home', 'recent', 'charts'].includes(state.view)) render();
  }, 500);
}

function recordPlay(trackId) {
  if (!trackId) return;
  api('/api/plays', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trackId }) })
    .then(result => {
      const track = state.trackById.get(trackId);
      if (!track) return;
      track.playCount = Number(result.playCount) || 0;
      if (!result.counted) return;
      track.lastPlayedAt = result.lastPlayedAt;
      state.recentPlays = [{ trackId, playedAt: result.lastPlayedAt }, ...(state.recentPlays || [])].slice(0, 200);
      state.recentCache = null;
      state.rankedCache = null;
      state.artistRankCache = null;
      schedulePlayViewRefresh();
    })
    .catch(() => { /* Playback still works if the counter cannot be saved. */ });
}

function isAdminPath() { return location.pathname === '/admin'; }

function render() {
  if (isAdminPath()) return renderAdmin();
  renderPlayerApp();
}

function navItem(view, label, symbol, active = false) {
  return `<button class="nav-item ${active ? 'active' : ''}" data-view="${view}">${icon(symbol, 18)}<span>${label}</span></button>`;
}

function filteredTracks() {
  let tracks = state.tracks;
  if (state.genre !== '全部') tracks = tracks.filter(track => track.genre === state.genre);
  if (state.likedOnly) tracks = tracks.filter(track => state.favorites.has(track.id));
  const query = state.query.trim().toLowerCase();
  if (query) tracks = tracks.filter(track => (state.searchHaystack.get(track.id) || '').includes(query));
  return tracks;
}

function currentTrack() { return state.queue[state.queueIndex] || null; }

function trackRow(track, index, showAlbum = true, meta = '') {
  const current = currentTrack()?.id === track.id;
  const liked = state.favorites.has(track.id);
  return `<div class="track-row ${current ? 'is-current' : ''}" data-track-row="${escapeHtml(track.id)}">
    <button class="track-index" data-play-track="${escapeHtml(track.id)}" aria-label="播放 ${escapeHtml(track.title)}">${current && state.playing ? '<span class="playing-bars"><i></i><i></i><i></i></span>' : `<span class="row-number">${String(index + 1).padStart(2, '0')}</span><span class="row-play">${icon('play', 14)}</span>`}</button>
    <button class="track-main" data-play-track="${escapeHtml(track.id)}"><img class="track-cover" ${IMG_LAZY} src="${escapeHtml(coverFor(track))}" alt="" /><span class="track-copy"><strong>${escapeHtml(track.title)}</strong><span>${escapeHtml(track.artist)}</span></span></button>
    ${showAlbum ? `<button class="track-album" ${track.albumId ? `data-album-id="${escapeHtml(track.albumId)}"` : `data-album-name="${escapeHtml(track.album || '')}"`}>${escapeHtml(track.album || '单曲')}</button>` : ''}
    <span class="track-genre">${meta ? escapeHtml(meta) : escapeHtml(track.genre || '未分类')}</span>
    <button class="icon-button track-like ${liked ? 'liked' : ''}" data-favorite="${escapeHtml(track.id)}" aria-label="${liked ? '取消收藏' : '收藏'}">${icon('heart', 17)}</button>
    <span class="track-duration">${track.duration ? formatTime(track.duration) : '--:--'}</span>
  </div>`;
}

function albumCard(album) {
  const count = albumTracks(album).length;
  return `<button class="album-card" data-album-id="${escapeHtml(album.id)}"><span class="album-art"><img ${IMG_LAZY} src="${escapeHtml(coverFor(album))}" alt="" /><span class="album-play">${icon('play', 19)}</span></span><span class="album-card-title">${escapeHtml(album.title)}</span><span class="album-card-meta">${escapeHtml(album.artist || '未知艺人')} · ${count} 首</span></button>`;
}

function artistCard(artist) {
  const count = artistTracks(artist).length;
  return `<button class="artist-card" data-artist-id="${escapeHtml(artist.id)}"><span class="artist-avatar"><img ${IMG_LAZY} src="${escapeHtml(coverFor(artist))}" alt="" /></span><span class="album-card-title">${escapeHtml(artist.name)}</span><span class="album-card-meta">${count} 首歌曲 · ${artistAlbumCount(artist)} 张专辑</span></button>`;
}

function playlistCard(playlist) {
  const count = (playlist.trackIds || []).length;
  return `<button class="playlist-card" data-playlist="${escapeHtml(playlist.id)}"><span class="playlist-art"><img ${IMG_LAZY} src="${escapeHtml(coverFor(playlist))}" alt="" /><span class="playlist-play">${icon('play', 19)}</span></span><span class="album-card-title">${escapeHtml(playlist.title)}</span><span class="album-card-meta">${escapeHtml(playlist.description || '一头精选')} · ${count} 首</span></button>`;
}

function renderPlayerApp() {
  const tracks = filteredTracks();
  const home = state.view === 'home';
  const library = state.view === 'library';
  const favorites = state.view === 'favorites';
  const recent = state.view === 'recent';
  const charts = state.view === 'charts';
  const playlist = state.view.startsWith('playlist:') ? state.playlists.find(item => item.id === state.view.split(':')[1]) : null;
  const albumKey = state.view.startsWith('album:') ? state.view.slice(6) : '';
  const album = albumKey ? state.albums.find(item => item.id === albumKey) || state.albums.find(item => item.title === albumKey) : null;
  const artist = state.view.startsWith('artist:') ? state.artists.find(item => item.id === state.view.slice(7)) : null;
  const listedTracks = playlist ? playlist.trackIds.map(id => state.trackById.get(id)).filter(Boolean)
    : album ? albumTracks(album)
      : artist ? artistTracks(artist)
        : recent ? recentTracks(100)
          : charts ? rankedTracks()
            : favorites ? state.tracks.filter(track => state.favorites.has(track.id)) : tracks;
  const heading = playlist ? playlist.title : album ? album.title : artist ? artist.name : recent ? '最近播放' : charts ? '播放排行' : favorites ? '我的收藏' : library ? '全部歌曲' : state.query ? '搜索结果' : '全部新歌';
  const current = currentTrack();
  if (current) ensureLyrics(current);

  app.innerHTML = `<div class="app-shell">
    <aside class="sidebar">
      <button class="brand" data-view="home"><span class="brand-mark">诗</span><span class="brand-name">一头诗人</span></button>
      <div class="sidebar-label">探索</div>
      <nav class="primary-nav">${navItem('home', '为你推荐', 'home', home)}${navItem('discover', '发现音乐', 'search', state.view === 'discover')}${navItem('recent', '最近播放', 'clock', recent)}${navItem('charts', '播放排行', 'chart', charts)}${navItem('library', '全部歌曲', 'library', library)}${navItem('favorites', '我的收藏', 'heart', favorites)}</nav>
      <div class="sidebar-rule"></div>
      <div class="sidebar-heading"><span class="sidebar-label">我的歌单</span><button class="icon-button tiny" data-action="new-playlist" aria-label="新建歌单">${icon('plus', 17)}</button></div>
      <nav class="playlist-nav">${state.playlists.slice(0, 7).map(item => `<button class="playlist-nav-item ${playlist?.id === item.id ? 'active' : ''}" data-playlist="${escapeHtml(item.id)}"><span class="playlist-dot"></span>${escapeHtml(item.title)}</button>`).join('')}</nav>
      <div class="sidebar-bottom"><span class="mini-live"><i></i> 正在连接音乐库</span><a class="admin-link" href="/admin">${icon('disc', 15)} 管理音乐库</a></div>
    </aside>
    <main class="main-panel">
      <header class="topbar"><button class="mobile-brand brand" data-view="home"><span class="brand-mark">诗</span><span class="brand-name">一头诗人</span></button><div class="topbar-arrows"><button class="icon-button" data-action="back" aria-label="返回">‹</button><button class="icon-button" data-action="forward" aria-label="前进">›</button></div><label class="search-box">${icon('search', 17)}<input id="search-input" type="search" placeholder="搜索歌曲、艺人或专辑" value="${escapeHtml(state.query)}" /><kbd>⌘ K</kbd></label><button class="avatar-button" title="管理音乐库" onclick="location.href='/admin'">诗</button></header>
      <div class="page-content">
        ${home ? `<section class="welcome-strip"><div><span class="eyebrow">${dateLabel()}</span><h1>让今天，<em>有点不一样。</em></h1><p>收好耳机，把喜欢的旋律留给自己。</p></div><span class="welcome-sparkle">${icon('sparkle', 58)}</span></section>
        <section class="featured-section"><div class="section-heading"><div><span class="eyebrow">CURATED FOR YOU</span><h2>今天想听什么？</h2></div><button class="text-link" data-view="discover">探索全部歌单 ${icon('arrow', 15)}</button></div><div class="playlist-grid">${state.playlists.slice(0, 3).map(playlistCard).join('') || '<p class="empty-hint">还没有歌单，从管理端创建一个吧。</p>'}</div></section>
        <section class="featured-section album-section"><div class="section-heading"><div><span class="eyebrow">FROM YOUR LIBRARY</span><h2>专辑与故事</h2></div><span class="subtle-count">${state.albums.length} 张专辑</span></div><div class="album-grid">${state.albums.slice(0, 4).map(albumCard).join('')}</div></section>
        <section class="featured-section artist-section"><div class="section-heading"><div><span class="eyebrow">VOICES IN YOUR LIBRARY</span><h2>歌手</h2></div><span class="subtle-count">${state.artists.length} 位歌手</span></div><div class="artist-grid">${state.artists.slice(0, 6).map(artistCard).join('') || '<p class="empty-hint">还没有歌手档案，上传音乐后会自动创建。</p>'}</div></section>
        ${renderHomeActivity()}
        <section class="track-section"><div class="section-heading track-section-heading"><div><span class="eyebrow">FRESH FINDS</span><h2>为你挑选的歌曲</h2></div><button class="round-play" data-action="play-filtered" aria-label="播放列表">${icon('play', 18)}</button></div>${renderFilters(tracks.length)}${renderTrackList(tracks)}</section>`
      : `<section class="inner-heading ${playlist || album || artist ? 'collection-heading' : ''}">${playlist || album || artist ? `<img class="${artist ? 'artist-heading-avatar' : ''}" ${IMG_VISIBLE} src="${escapeHtml(coverFor(playlist || album || artist))}" alt="" />` : ''}<div><span class="eyebrow">${recent ? 'LISTENING HISTORY' : charts ? 'PLAY CHARTS' : library ? 'YOUR MUSIC' : favorites ? 'SAVED TRACKS' : playlist ? 'PLAYLIST' : album ? 'ALBUM' : artist ? 'ARTIST' : 'DISCOVER'}</span><h1>${escapeHtml(heading)}</h1><p>${playlist ? escapeHtml(playlist.description || '你的专属音乐时光') : album ? `${escapeHtml(album.artist)} · ${listedTracks.length} 首歌曲` : artist ? `${artistTracks(artist).length} 首歌曲 · ${artistAlbumCount(artist)} 张专辑${artist.description ? ` · ${escapeHtml(artist.description)}` : ''}` : recent ? `${listedTracks.length} 首歌曲 · 按最近播放时间排序` : charts ? `${totalPlays()} 次播放 · 按累计播放次数排序` : favorites ? `${listedTracks.length} 首收藏歌曲` : `${listedTracks.length} 首歌曲，慢慢听。`}</p></div>${listedTracks.length ? `<button class="round-play large-play" data-action="play-listed" aria-label="播放全部">${icon('play', 21)}</button>` : ''}</section>
        <section class="track-section inner-track-section">${state.view === 'discover' ? `<div class="playlist-grid discover-grid">${state.playlists.map(playlistCard).join('')}</div>` : ''}${!playlist && !album && !artist && !favorites && !recent && !charts ? renderFilters(tracks.length) : ''}${recent ? (listedTracks.length ? renderTrackList(listedTracks, true, track => relativeTime(track.lastPlayedAt), '最近播放') : `<div class="empty-state">${icon('clock', 30)}<strong>还没有播放记录</strong><span>播放一首歌，最近听过的音乐就会出现在这里</span></div>`) : charts ? renderChartList(listedTracks) : renderTrackList(listedTracks, playlist || album || artist || favorites)}${charts ? renderArtistCharts() : ''}</section>`}
      </div>
    </main>
    <footer class="player-bar"><div class="player-track">${current ? `<img class="player-cover" ${IMG_VISIBLE} src="${escapeHtml(coverFor(current))}" alt="" /><div class="player-meta"><strong>${escapeHtml(current.title)}</strong><span>${escapeHtml(current.artist)}</span></div><button class="icon-button player-fav ${state.favorites.has(current.id) ? 'liked' : ''}" data-favorite="${escapeHtml(current.id)}" aria-label="收藏">${icon('heart', 17)}</button>` : `<span class="player-placeholder">${icon('music', 23)}<span>选择一首喜欢的歌</span></span>`}</div>
      <div class="player-center"><div class="player-controls"><button class="icon-button control-secondary ${state.shuffle ? 'control-active' : ''}" data-action="shuffle" aria-label="随机播放">${icon('shuffle', 17)}</button><button class="icon-button" data-action="previous" aria-label="上一首">${icon('prev', 18)}</button><button class="main-play" data-action="toggle-play" aria-label="${state.playing ? '暂停' : '播放'}">${icon(state.playing ? 'pause' : 'play', 18)}</button><button class="icon-button" data-action="next" aria-label="下一首">${icon('next', 18)}</button><button class="icon-button control-secondary ${state.repeat ? 'control-active' : ''}" data-action="repeat" aria-label="${state.repeatOne ? '单曲循环' : state.repeat ? '列表循环' : '关闭循环'}">${icon('queue', 17)}${state.repeatOne ? '<span class="repeat-one-mark">1</span>' : ''}</button></div><div class="progress-row"><span>${formatTime(state.currentTime)}</span><input class="progress-slider" type="range" min="0" max="${state.duration || 100}" value="${state.currentTime}" aria-label="播放进度" style="--progress:${state.duration ? state.currentTime / state.duration * 100 : 0}%" /><span>${formatTime(state.duration)}</span></div></div>
      <div class="player-extra"><button class="icon-button lyric-toggle ${state.lyricsOpen ? 'control-active' : ''}" data-action="lyrics" aria-label="显示歌词">詞</button><div class="volume-control">${icon('volume', 17)}<input class="volume-slider" aria-label="音量" type="range" min="0" max="1" step="0.01" value="${audio.volume}" /></div><button class="icon-button" data-action="queue" aria-label="播放队列">${icon('list', 18)}</button></div></footer>
    <nav class="mobile-nav">${navItem('home', '推荐', 'home', home)}${navItem('recent', '最近', 'clock', recent)}${navItem('charts', '排行', 'chart', charts)}${navItem('library', '曲库', 'library', library)}${navItem('favorites', '收藏', 'heart', favorites)}</nav>
    ${state.lyricsOpen ? renderLyricsPanel() : ''}<div class="toast-host"></div>
  </div>`;
  app.querySelector('.search-box')?.insertAdjacentHTML('afterend', themeControl());
}

function renderFilters(total = filteredTracks().length) {
  return `<div class="filter-row">${genres.map(genre => `<button class="filter-chip ${state.genre === genre ? 'selected' : ''}" data-genre="${genre}">${genre}</button>`).join('')}<span class="filter-result">${total} 首歌曲</span></div>`;
}

function renderTrackList(tracks, compact = false, metaFor = null, metaLabel = '风格') {
  if (!tracks.length) return `<div class="empty-state">${icon('music', 30)}<strong>${state.likedOnly ? '这里还没有收藏' : state.query ? '没有找到相关歌曲' : '曲库暂时是空的'}</strong><span>${state.query ? '换个关键词试试' : '从管理端上传音乐，开始构建你的音乐空间'}</span>${!state.query ? '<a href="/admin" class="button button-dark">打开管理端</a>' : ''}</div>`;
  const visible = tracks.slice(0, state.listLimit);
  const remaining = tracks.length - visible.length;
  return `<div class="track-list ${compact ? 'compact-list' : ''}"><div class="track-list-head"><span>#</span><span>歌曲</span><span>专辑</span><span>${metaLabel}</span><span>${icon('clock', 14)}</span></div>${visible.map((track, index) => trackRow(track, index, true, metaFor ? metaFor(track) : '')).join('')}</div>${remaining > 0 ? `<div class="load-more-row"><button class="button button-outline" data-action="load-more">加载更多（剩余 ${remaining} 首）</button></div>` : ''}`;
}

function renderHomeActivity() {
  const recentList = recentTracks(5);
  const topTracks = rankedTracks().slice(0, 5);
  if (!recentList.length && !topTracks.length) return '';
  const recentRows = recentList.map(track => `<button class="mini-track-row" data-track-row="${escapeHtml(track.id)}" data-play-track="${escapeHtml(track.id)}"><img ${IMG_LAZY} src="${escapeHtml(coverFor(track))}" alt="" /><span class="mini-track-copy"><strong>${escapeHtml(track.title)}</strong><span>${escapeHtml(track.artist)}</span></span><span class="mini-track-meta">${escapeHtml(relativeTime(track.lastPlayedAt))}</span></button>`).join('');
  const chartRows = topTracks.map((track, index) => `<button class="mini-track-row has-rank" data-track-row="${escapeHtml(track.id)}" data-play-track="${escapeHtml(track.id)}"><span class="mini-rank ${index < 3 ? 'top' : ''}">${String(index + 1).padStart(2, '0')}</span><img ${IMG_LAZY} src="${escapeHtml(coverFor(track))}" alt="" /><span class="mini-track-copy"><strong>${escapeHtml(track.title)}</strong><span>${escapeHtml(track.artist)}</span></span><span class="mini-track-meta">${Number(track.playCount) || 0} 次</span></button>`).join('');
  return `<section class="featured-section activity-section"><div class="activity-grid"><div class="activity-card"><div class="section-heading"><div><span class="eyebrow">RECENTLY PLAYED</span><h2>最近播放</h2></div><button class="text-link" data-view="recent">查看全部 ${icon('arrow', 15)}</button></div><div class="mini-list">${recentRows || '<p class="empty-hint">还没有播放记录</p>'}</div></div><div class="activity-card"><div class="section-heading"><div><span class="eyebrow">MOST PLAYED</span><h2>播放排行</h2></div><button class="text-link" data-view="charts">查看全部 ${icon('arrow', 15)}</button></div><div class="mini-list">${chartRows || '<p class="empty-hint">播放歌曲后会生成排行</p>'}</div></div></div></section>`;
}

function chartRow(track, index, max) {
  const current = currentTrack()?.id === track.id;
  const liked = state.favorites.has(track.id);
  const count = Number(track.playCount) || 0;
  return `<div class="chart-row ${current ? 'is-current' : ''}" data-track-row="${escapeHtml(track.id)}">
    <span class="chart-rank ${index < 3 ? 'chart-rank-top' : ''}">${String(index + 1).padStart(2, '0')}</span>
    <button class="track-main" data-play-track="${escapeHtml(track.id)}"><img class="track-cover" ${IMG_LAZY} src="${escapeHtml(coverFor(track))}" alt="" /><span class="track-copy"><strong>${escapeHtml(track.title)}</strong><span>${escapeHtml(track.artist)}</span></span></button>
    <span class="chart-track-album">${escapeHtml(track.album || '单曲')}</span>
    <span class="chart-bar" aria-hidden="true"><i style="width:${Math.max(6, Math.round(count / max * 100))}%"></i></span>
    <span class="chart-count">${count} 次</span>
    <button class="icon-button track-like ${liked ? 'liked' : ''}" data-favorite="${escapeHtml(track.id)}" aria-label="${liked ? '取消收藏' : '收藏'}">${icon('heart', 17)}</button>
    <span class="track-duration">${track.duration ? formatTime(track.duration) : '--:--'}</span>
  </div>`;
}

function renderChartList(tracks) {
  if (!tracks.length) return `<div class="empty-state">${icon('chart', 30)}<strong>还没有播放记录</strong><span>开始播放歌曲，这里会按播放次数生成排行</span></div>`;
  const max = Math.max(1, Number(tracks[0].playCount) || 1);
  const visible = tracks.slice(0, state.listLimit);
  const remaining = tracks.length - visible.length;
  return `<div class="track-list chart-list">${visible.map((track, index) => chartRow(track, index, max)).join('')}</div>${remaining > 0 ? `<div class="load-more-row"><button class="button button-outline" data-action="load-more">加载更多（剩余 ${remaining} 首）</button></div>` : ''}`;
}

function renderArtistCharts() {
  const ranking = artistPlayRanking();
  if (!ranking.length) return '';
  return `<section class="artist-chart-section"><div class="section-heading"><div><span class="eyebrow">MOST PLAYED ARTISTS</span><h2>歌手播放排行</h2></div><span class="subtle-count">按累计播放次数</span></div><div class="artist-chart-grid">${ranking.map((entry, index) => {
    const profile = state.artistByName.get(normalizeName(entry.name));
    return `<button class="artist-chart-card" ${profile ? `data-artist-id="${escapeHtml(profile.id)}"` : ''}><span class="artist-chart-rank">${String(index + 1).padStart(2, '0')}</span><img ${IMG_LAZY} src="${escapeHtml(coverFor(profile || {}))}" alt="" /><span class="artist-chart-copy"><strong>${escapeHtml(entry.name)}</strong><span>${entry.plays} 次播放 · ${entry.tracks} 首歌曲</span></span></button>`;
  }).join('')}</div></section>`;
}

function parseLyrics(text = '') {
  return text.split(/\r?\n/).map(line => {
    const match = line.match(/^\[(\d{2}):(\d{2}(?:\.\d+)?)\]\s*(.*)$/);
    if (!match) return line.trim() ? { time: null, text: line.trim() } : null;
    return { time: Number(match[1]) * 60 + Number(match[2]), text: match[3] };
  }).filter(Boolean);
}

function ensureLyrics(track) {
  if (!track || state.lyricsCache.has(track.id)) return;
  const hasLyrics = track.hasLyrics !== false;
  const entry = { loading: hasLyrics, lines: [], active: -1 };
  state.lyricsCache.set(track.id, entry);
  if (!hasLyrics) return;
  api(`/api/tracks/${encodeURIComponent(track.id)}/lyrics`)
    .then(data => {
      const current = state.lyricsCache.get(track.id);
      if (!current) return;
      current.lines = parseLyrics(data.lyrics || '');
      current.loading = false;
      if (currentTrack()?.id === track.id && state.lyricsOpen) updateLyricsPanel();
    })
    .catch(() => {
      const current = state.lyricsCache.get(track.id);
      if (current) current.loading = false;
    });
}

function updateLyricsPanel() {
  const panel = app.querySelector('.lyrics-panel');
  if (panel && state.lyricsOpen) panel.outerHTML = renderLyricsPanel();
}

function renderLyricsPanel() {
  const track = currentTrack();
  if (!track) return '';
  ensureLyrics(track);
  const entry = state.lyricsCache.get(track.id) || { loading: false, lines: [], active: -1 };
  const lyrics = entry.lines;
  let active = -1;
  lyrics.forEach((line, index) => { if (line.time !== null && line.time <= state.currentTime) active = index; });
  entry.active = active;
  const body = lyrics.length
    ? lyrics.map((line, index) => `<p class="${index === active ? 'lyric-active' : ''}" data-lyric="${index}">${escapeHtml(line.text)}</p>`).join('')
    : entry.loading ? '<p class="lyric-empty">歌词加载中…</p>' : '<p class="lyric-empty">暂无歌词</p>';
  return `<section class="lyrics-panel"><div class="lyrics-top"><span>正在播放</span><button class="icon-button" data-action="lyrics">${icon('close', 18)}</button></div><div class="lyrics-identity"><img ${IMG_VISIBLE} src="${escapeHtml(coverFor(track))}" alt=""/><strong>${escapeHtml(track.title)}</strong><span>${escapeHtml(track.artist)}</span></div><div class="lyrics-lines">${body}</div></section>`;
}

let searchTimer = null;
let adminSearchTimer = null;
let searchComposing = false;

function toggleFavorite(id) {
  if (!id) return;
  if (state.favorites.has(id)) state.favorites.delete(id); else state.favorites.add(id);
  localStorage.setItem('luma-favorites', JSON.stringify([...state.favorites]));
  const escaped = window.CSS && CSS.escape ? CSS.escape(id) : id.replace(/"/g, '\\"');
  document.querySelectorAll(`[data-favorite="${escaped}"]`).forEach(button => {
    const liked = state.favorites.has(id);
    button.classList.toggle('liked', liked);
    button.setAttribute('aria-label', liked ? '取消收藏' : '收藏');
  });
  if (state.view === 'favorites') render();
}

function scheduleSearchRender() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    const input = app.querySelector('#search-input');
    const position = input?.selectionStart ?? state.query.length;
    render();
    const next = app.querySelector('#search-input');
    if (next) {
      next.focus();
      const nextPosition = Math.min(position, state.query.length);
      next.setSelectionRange(nextPosition, nextPosition);
    }
  }, 150);
}

function scheduleAdminSearchRender() {
  clearTimeout(adminSearchTimer);
  adminSearchTimer = setTimeout(() => {
    const input = app.querySelector('#admin-track-search');
    const position = input?.selectionStart ?? admin.trackQuery.length;
    renderAdmin();
    const next = app.querySelector('#admin-track-search');
    if (next) {
      next.focus();
      const nextPosition = Math.min(position, admin.trackQuery.length);
      next.setSelectionRange(nextPosition, nextPosition);
    }
  }, 150);
}

function handleGlobalClick(event) {
  const node = event.target;
  if (!(node instanceof Element)) return;
  const find = selector => node.closest(selector);

  const themeToggle = find('[data-theme-toggle]');
  if (themeToggle) { state.themeMenuOpen = !state.themeMenuOpen; render(); return; }
  const themeChoice = find('[data-theme-choice]');
  if (themeChoice) {
    state.theme = themeChoice.dataset.themeChoice;
    state.themeMenuOpen = false;
    localStorage.setItem('horse-music-theme', state.theme);
    applyTheme();
    render();
    return;
  }
  const close = find('[data-close]');
  if (close) { close.closest('dialog')?.close(); return; }
  const queueItem = find('[data-queue-index]');
  if (queueItem) {
    const index = Number(queueItem.dataset.queueIndex);
    const track = state.queue[index];
    if (track) playTrack(track.id, state.queue);
    return;
  }
  const adminTab = find('[data-admin-tab]');
  if (adminTab) { admin.tab = adminTab.dataset.adminTab; renderAdmin(); return; }
  const adminAction = find('[data-admin-action]');
  if (adminAction) { handleAdminAction(adminAction.dataset.adminAction); return; }
  const deleteTrackButton = find('[data-delete-track]');
  if (deleteTrackButton) { deleteTrack(deleteTrackButton.dataset.deleteTrack); return; }
  const editPlaylistButton = find('[data-edit-playlist]');
  if (editPlaylistButton) { openPlaylistEditor(editPlaylistButton.dataset.editPlaylist); return; }
  const deletePlaylistButton = find('[data-delete-playlist]');
  if (deletePlaylistButton) { deletePlaylist(deletePlaylistButton.dataset.deletePlaylist); return; }
  const deleteAlbumButton = find('[data-delete-album]');
  if (deleteAlbumButton) { deleteAlbum(deleteAlbumButton.dataset.deleteAlbum); return; }
  const deleteArtistButton = find('[data-delete-artist]');
  if (deleteArtistButton) { deleteArtist(deleteArtistButton.dataset.deleteArtist); return; }

  const favorite = find('[data-favorite]');
  if (favorite) { toggleFavorite(favorite.dataset.favorite); return; }
  const playTarget = find('[data-play-track]');
  if (playTarget) {
    const list = playTarget.closest('.track-list, .mini-list');
    const rows = list ? [...list.querySelectorAll('[data-track-row]')] : [];
    const visibleQueue = rows.map(row => state.trackById.get(row.dataset.trackRow)).filter(Boolean);
    playTrack(playTarget.dataset.playTrack, visibleQueue);
    return;
  }
  const viewButton = find('[data-view]');
  if (viewButton) {
    state.view = viewButton.dataset.view;
    state.query = '';
    state.genre = '全部';
    state.likedOnly = false;
    state.listLimit = TRACK_PAGE_SIZE;
    clearTimeout(searchTimer);
    render();
    return;
  }
  const genreButton = find('[data-genre]');
  if (genreButton) { state.genre = genreButton.dataset.genre; state.listLimit = TRACK_PAGE_SIZE; render(); return; }
  const albumIdButton = find('[data-album-id]');
  if (albumIdButton) { state.view = `album:${albumIdButton.dataset.albumId}`; state.listLimit = TRACK_PAGE_SIZE; render(); return; }
  const albumNameButton = find('[data-album-name]');
  if (albumNameButton) { state.view = `album:${albumNameButton.dataset.albumName}`; state.listLimit = TRACK_PAGE_SIZE; render(); return; }
  const artistButton = find('[data-artist-id]');
  if (artistButton) { state.view = `artist:${artistButton.dataset.artistId}`; state.listLimit = TRACK_PAGE_SIZE; render(); return; }
  const playlistButton = find('[data-playlist]');
  if (playlistButton) { state.view = `playlist:${playlistButton.dataset.playlist}`; state.listLimit = TRACK_PAGE_SIZE; render(); return; }
  const actionButton = find('[data-action]');
  if (actionButton) { handlePlayerAction(actionButton.dataset.action); return; }
  const lyricLine = find('[data-lyric]');
  if (lyricLine) {
    const entry = state.lyricsCache.get(currentTrack()?.id);
    const line = entry?.lines?.[Number(lyricLine.dataset.lyric)];
    if (line?.time != null) audio.currentTime = line.time;
  }
}

function handleGlobalInput(event) {
  const target = event.target;
  if (target.id === 'search-input') {
    if (target.value === state.query) return;
    state.query = target.value;
    state.listLimit = TRACK_PAGE_SIZE;
    if (state.view !== 'library' && state.view !== 'discover') state.view = 'library';
    if (!searchComposing) scheduleSearchRender();
    return;
  }
  if (target.id === 'admin-track-search') {
    admin.trackQuery = target.value;
    admin.trackLimit = ADMIN_PAGE_SIZE;
    scheduleAdminSearchRender();
    return;
  }
  if (target.classList.contains('progress-slider')) {
    if (audio.duration) audio.currentTime = Number(target.value);
    return;
  }
  if (target.classList.contains('volume-slider')) audio.volume = Number(target.value);
}

document.addEventListener('compositionstart', event => {
  if (event.target.id === 'search-input') searchComposing = true;
});
document.addEventListener('compositionend', event => {
  if (event.target.id === 'search-input') {
    searchComposing = false;
    scheduleSearchRender();
  }
});

function updatePlaybackUi() {
  const button = app.querySelector('.main-play');
  if (!button) return;
  button.innerHTML = icon(state.playing ? 'pause' : 'play', 18);
  button.setAttribute('aria-label', state.playing ? '暂停' : '播放');
}

function playTrack(id, queue = state.tracks) {
  const track = state.trackById.get(id) || state.tracks.find(item => item.id === id);
  if (!track) return;
  const sourceQueue = queue.length ? queue : state.tracks;
  state.queue = [...sourceQueue];
  state.queueIndex = state.queue.findIndex(item => item.id === id);
  if (state.queueIndex < 0) { state.queue.unshift(track); state.queueIndex = 0; }
  state.pendingRecord = track.id;
  ensureLyrics(track);
  audio.src = track.src;
  state.playing = true;
  render();
  audio.play().catch(() => { state.playing = false; render(); showToast('音频无法播放，请检查文件格式或媒体链接'); });
}

function playFromList(tracks) {
  if (!tracks.length) return;
  state.queue = [...tracks];
  state.queueIndex = 0;
  state.pendingRecord = tracks[0].id;
  ensureLyrics(tracks[0]);
  audio.src = tracks[0].src;
  state.playing = true;
  render();
  audio.play().catch(() => { state.playing = false; render(); showToast('音频无法播放，请检查媒体链接'); });
}

function handlePlayerAction(action) {
  if (action === 'toggle-play') {
    if (!currentTrack()) return playFromList(state.tracks);
    if (audio.paused) {
      state.playing = true;
      render();
      audio.play().catch(() => { state.playing = false; render(); showToast('音频无法播放'); });
    } else {
      audio.pause();
      state.playing = false;
      render();
    }
  } else if (action === 'next' || action === 'previous') moveQueue(action === 'next' ? 1 : -1);
  else if (action === 'play-filtered') playFromList(filteredTracks());
  else if (action === 'load-more') { state.listLimit += TRACK_PAGE_SIZE; render(); }
  else if (action === 'play-listed') {
    const playlist = state.view.startsWith('playlist:') ? state.playlists.find(item => item.id === state.view.split(':')[1]) : null;
    const albumKey = state.view.startsWith('album:') ? state.view.slice(6) : '';
    const album = albumKey ? state.albums.find(item => item.id === albumKey) || state.albums.find(item => item.title === albumKey) : null;
    const artist = state.view.startsWith('artist:') ? state.artists.find(item => item.id === state.view.slice(7)) : null;
    const tracks = playlist ? playlist.trackIds.map(id => state.trackById.get(id)).filter(Boolean)
      : album ? albumTracks(album)
        : artist ? artistTracks(artist)
          : state.view === 'recent' ? recentTracks(100)
            : state.view === 'charts' ? rankedTracks()
              : state.tracks.filter(track => state.favorites.has(track.id));
    playFromList(tracks);
  } else if (action === 'lyrics') { state.lyricsOpen = !state.lyricsOpen; render(); }
  else if (action === 'shuffle') { state.shuffle = !state.shuffle; render(); }
  else if (action === 'repeat') {
    state.repeatMode = ((state.repeatMode || 0) + 1) % 3;
    state.repeat = state.repeatMode === 1;
    state.repeatOne = state.repeatMode === 2;
    showToast(['关闭循环', '列表循环', '单曲循环'][state.repeatMode]);
    render();
  }
  else if (action === 'queue') showQueue();
  else if (action === 'new-playlist') promptPlaylist();
  else if (action === 'back') { history.back(); }
  else if (action === 'forward') { history.forward(); }
}

function moveQueue(direction) {
  if (!state.queue.length) return;
  if (direction === 1 && state.repeatOne) {
    state.pendingRecord = currentTrack()?.id || null;
    ensureLyrics(currentTrack());
    audio.currentTime = 0;
    audio.play();
    return;
  }
  if (direction === 1 && state.queueIndex === state.queue.length - 1 && !state.repeat) {
    audio.pause(); state.playing = false; state.currentTime = 0; render(); return;
  }
  if (state.shuffle && direction === 1) state.queueIndex = Math.floor(Math.random() * state.queue.length);
  else state.queueIndex = (state.queueIndex + direction + state.queue.length) % state.queue.length;
  const track = currentTrack();
  state.pendingRecord = track.id;
  ensureLyrics(track);
  audio.src = track.src;
  state.playing = true;
  render();
  audio.play().catch(() => { state.playing = false; render(); showToast('音频无法播放'); });
}

function showQueue() {
  if (!state.queue.length) return showToast('播放队列还是空的');
  const dialog = document.createElement('dialog'); dialog.className = 'queue-dialog';
  dialog.innerHTML = `<div class="dialog-head"><div><span class="eyebrow">UP NEXT</span><h2>播放队列</h2></div><button class="icon-button" data-close>${icon('close', 19)}</button></div><div class="queue-items">${state.queue.map((track, index) => `<button class="queue-item ${index === state.queueIndex ? 'queue-current' : ''}" data-queue-index="${index}"><img ${IMG_LAZY} src="${escapeHtml(coverFor(track))}" alt=""/><span><strong>${escapeHtml(track.title)}</strong><small>${escapeHtml(track.artist)}</small></span>${index === state.queueIndex ? icon('volume', 16) : ''}</button>`).join('')}</div>`;
  document.body.append(dialog); dialog.showModal();
  dialog.addEventListener('close', () => dialog.remove());
}

function promptPlaylist() {
  const dialog = document.createElement('dialog'); dialog.className = 'form-dialog';
  dialog.innerHTML = `<form method="dialog"><div class="dialog-head"><div><span class="eyebrow">YOUR COLLECTION</span><h2>新建歌单</h2></div><button type="button" class="icon-button" data-close aria-label="关闭">${icon('close', 19)}</button></div><label class="field-label">歌单名称<input name="title" required maxlength="60" placeholder="比如：日落时分"/></label><label class="field-label">一句描述<input name="description" maxlength="120" placeholder="给这份歌单留句话"/></label><div class="dialog-actions"><button type="button" class="button button-quiet" data-close>取消</button><button type="submit" class="button button-dark">创建歌单</button></div></form></dialog>`;
  document.body.append(dialog); dialog.showModal();
  dialog.querySelector('form').addEventListener('submit', async event => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    try {
      await api('/api/admin/playlists', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: form.get('title'), description: form.get('description'), trackIds: [] }) });
      showToast('歌单已创建'); dialog.close(); await refreshLibrary(); render();
    } catch (error) { showToast('请先在管理端登录后创建歌单'); location.href = '/admin'; }
  });
  dialog.addEventListener('close', () => dialog.remove());
}

audio.addEventListener('play', () => { state.playing = true; updatePlaybackUi(); });
audio.addEventListener('playing', () => {
  if (!state.pendingRecord) return;
  const trackId = state.pendingRecord;
  state.pendingRecord = null;
  recordPlay(trackId);
});
audio.addEventListener('pause', () => { state.playing = false; updatePlaybackUi(); });
audio.addEventListener('timeupdate', () => {
  state.currentTime = audio.currentTime || 0;
  const slider = app.querySelector('.progress-slider');
  if (slider) { slider.value = state.currentTime; slider.style.setProperty('--progress', `${state.duration ? state.currentTime / state.duration * 100 : 0}%`); }
  const panel = app.querySelector('.lyrics-panel');
  if (!panel || !state.lyricsOpen) return;
  const entry = state.lyricsCache.get(currentTrack()?.id);
  if (!entry?.lines?.length) return;
  let active = -1;
  entry.lines.forEach((line, index) => { if (line.time !== null && line.time <= state.currentTime) active = index; });
  if (active === entry.active) return;
  entry.active = active;
  panel.querySelectorAll('[data-lyric]').forEach((line, index) => line.classList.toggle('lyric-active', index === active));
  if (active >= 0) panel.querySelector('.lyric-active')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
});
audio.addEventListener('loadedmetadata', () => {
  state.duration = Number.isFinite(audio.duration) ? audio.duration : 0;
  const slider = app.querySelector('.progress-slider');
  if (slider) slider.max = state.duration || 100;
  const labels = app.querySelectorAll('.progress-row > span');
  if (labels[1]) labels[1].textContent = formatTime(state.duration);
});
audio.addEventListener('ended', () => { if (state.repeatOne) { state.pendingRecord = currentTrack()?.id || null; audio.currentTime = 0; audio.play(); } else moveQueue(1); });
audio.addEventListener('error', () => { state.playing = false; state.pendingRecord = null; if (currentTrack()) showToast('这首歌暂时无法播放'); render(); });

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && state.themeMenuOpen) { state.themeMenuOpen = false; render(); return; }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && !isAdminPath()) { event.preventDefault(); app.querySelector('#search-input')?.focus(); }
  if (event.code === 'Space' && !['INPUT', 'TEXTAREA', 'BUTTON'].includes(document.activeElement?.tagName) && !isAdminPath()) { event.preventDefault(); handlePlayerAction('toggle-play'); }
  if (event.key === 'Escape' && state.lyricsOpen) { state.lyricsOpen = false; render(); }
});

window.addEventListener('popstate', render);
window.addEventListener('DOMContentLoaded', bootstrap);

async function bootstrap() {
  try {
    if (isAdminPath()) {
      try {
        const session = await api('/api/session');
        if (session.authenticated) {
          admin.authenticated = true;
          admin.username = session.username || '';
        }
      } catch { /* The login screen can still render while the API is unavailable. */ }
    }
    await refreshLibrary();
    render();
  } catch (error) {
    app.innerHTML = `<div class="boot-error">音乐库暂时无法加载：${escapeHtml(error.message)}</div>`;
  }
}

// Admin studio
let admin = { authenticated: false, tab: 'overview', username: '', toast: '', trackQuery: '', trackLimit: ADMIN_PAGE_SIZE };

function renderAdmin() {
  if (!admin.authenticated) return renderAdminLogin();
  const view = admin.tab;
  const trackCount = state.tracks.length;
  const accountName = admin.username || '管理员';
  const accountInitial = Array.from(accountName)[0]?.toUpperCase() || 'A';
  app.innerHTML = `<div class="admin-shell"><aside class="admin-sidebar"><a class="brand" href="/"><span class="brand-mark">诗</span><span class="brand-name">一头诗人<span>管理</span></span></a><div class="admin-side-caption">工作空间</div><button class="admin-nav ${view === 'overview' ? 'active' : ''}" data-admin-tab="overview">${icon('home', 17)}总览</button><button class="admin-nav ${view === 'tracks' ? 'active' : ''}" data-admin-tab="tracks">${icon('music', 17)}歌曲管理 <span>${state.tracks.length}</span></button><button class="admin-nav ${view === 'albums' ? 'active' : ''}" data-admin-tab="albums">${icon('disc', 17)}专辑管理 <span>${state.albums.length}</span></button><button class="admin-nav ${view === 'artists' ? 'active' : ''}" data-admin-tab="artists">${icon('heart', 17)}歌手管理 <span>${state.artists.length}</span></button><button class="admin-nav ${view === 'playlists' ? 'active' : ''}" data-admin-tab="playlists">${icon('list', 17)}歌单管理 <span>${state.playlists.length}</span></button><button class="admin-nav ${view === 'account' ? 'active' : ''}" data-admin-tab="account">${icon('user', 17)}账号设置</button><div class="admin-sidebar-bottom"><a class="back-to-player" href="/">${icon('arrow', 16)} 返回播放器</a><button class="admin-logout" data-admin-action="logout">${icon('logout', 16)} 退出登录</button></div></aside><main class="admin-main"><header class="admin-topbar"><span class="admin-breadcrumb">音乐管理 <span>/</span> ${adminLabel(view)}</span><div class="admin-user" title="当前登录账号"><span class="admin-avatar">${escapeHtml(accountInitial)}</span><span>${escapeHtml(accountName)}</span></div></header><div class="admin-content">${renderAdminView(view, trackCount)}</div></main></div>`;
  app.querySelector('.admin-user')?.insertAdjacentHTML('afterbegin', themeControl());
  app.querySelector('#account-form')?.addEventListener('submit', submitAccountUpdate);
}

function adminLabel(tab) { return ({ overview: '总览', tracks: '歌曲管理', albums: '专辑管理', artists: '歌手管理', playlists: '歌单管理', account: '账号设置' })[tab] || '总览'; }

function renderAdminLogin() {
  app.innerHTML = `<main class="login-screen"><div class="login-visual"><div class="login-visual-top"><a class="brand" href="/"><span class="brand-mark">诗</span><span class="brand-name">一头诗人</span></a><span class="visual-note">A HOME FOR<br/>GOOD MUSIC</span></div><div class="login-visual-copy"><span class="eyebrow">THE SOUND OF YOUR OWN</span><h1>每首歌，<br/><em>都有自己的位置。</em></h1><p>整理音乐，编织歌单，让喜欢的声音被好好收藏。</p></div><div class="login-artwork"><img loading="eager" decoding="async" src="https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=1100&q=88" alt="录音棚中的歌手" /><span>MAKE ROOM FOR MUSIC</span></div></div><section class="login-side"><a class="login-mobile-brand brand" href="/"><span class="brand-mark">诗</span><span class="brand-name">一头诗人</span></a><form class="login-card"><span class="eyebrow">一头诗人 · STUDIO</span><h2>欢迎回来</h2><p class="login-description">登录你的管理空间，继续整理音乐。</p><label class="field-label">管理员账号<input name="username" autocomplete="username" required placeholder="输入账号" /></label><label class="field-label">登录密码<input name="password" autocomplete="current-password" required type="password" placeholder="输入密码" /></label><div class="login-error" aria-live="polite"></div><button class="button button-dark login-submit" type="submit">进入管理端 ${icon('arrow', 16)}</button><a class="login-back" href="/">${icon('arrow', 14)} 返回音乐播放器</a></form><div class="login-footer">© 2026 一头诗人</div></section></main>`;
  app.querySelector('.login-side')?.insertAdjacentHTML('afterbegin', themeControl('login-theme-control'));
  app.querySelector('.demo-credentials')?.remove();
  app.querySelector('.login-divider')?.remove();
  app.querySelector('.login-card').addEventListener('submit', async event => {
    event.preventDefault(); const form = new FormData(event.currentTarget); const submit = event.currentTarget.querySelector('button[type="submit"]'); submit.disabled = true;
    try { const result = await api('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: form.get('username'), password: form.get('password') }) }); admin.authenticated = true; admin.username = result.username || String(form.get('username') || '').trim(); await refreshLibrary(); renderAdmin(); }
    catch (error) { app.querySelector('.login-error').textContent = error.message; submit.disabled = false; }
  });
}

function adminStat(label, value, detail, symbol) {
  return `<div class="stat-block"><span class="stat-icon">${icon(symbol, 18)}</span><span class="stat-label">${label}</span><strong>${value}</strong><span class="stat-detail">${detail}</span></div>`;
}

function renderAdminPlayColumns() {
  const recentRows = recentTracks(5).map(track => `<div class="admin-play-row"><img ${IMG_LAZY} src="${escapeHtml(coverFor(track))}" alt=""/><span class="admin-track-copy"><strong>${escapeHtml(track.title)}</strong><small>${escapeHtml(track.artist)}</small></span><span class="admin-play-meta">${escapeHtml(relativeTime(track.lastPlayedAt))}</span></div>`).join('');
  const rankedRows = rankedTracks().slice(0, 5).map((track, index) => `<div class="admin-play-row"><span class="admin-row-no">${String(index + 1).padStart(2, '0')}</span><span class="admin-track-copy"><strong>${escapeHtml(track.title)}</strong><small>${escapeHtml(track.artist)}</small></span><span class="admin-play-meta">${Number(track.playCount) || 0} 次</span></div>`).join('');
  return `<div class="admin-plays-column"><h3>最近播放</h3>${recentRows || '<div class="admin-empty">还没有播放记录</div>'}</div><div class="admin-plays-column"><h3>播放排行</h3>${rankedRows || '<div class="admin-empty">还没有播放记录</div>'}</div>`;
}

function renderAdminView(view, trackCount) {
  if (view === 'overview') return `<div class="admin-page-heading"><div><span class="eyebrow">LIBRARY OVERVIEW</span><h1>音乐库总览</h1><p>看看你的音乐空间最近都发生了什么。</p></div><button class="button button-dark" data-admin-action="upload">${icon('upload', 16)} 上传音乐</button></div><div class="stat-grid">${adminStat('歌曲总数', trackCount, '首音乐已入库', 'music')}${adminStat('专辑', state.albums.length, '张专辑与作品集', 'disc')}${adminStat('歌手', state.artists.length, '位歌手档案', 'heart')}${adminStat('歌单', state.playlists.length, '份精选收藏', 'list')}${adminStat('已关联歌词', state.tracks.filter(track => track.hasLyrics).length, '首带有歌词', 'queue')}</div><div class="admin-content-grid"><section class="admin-section-card recent-tracks"><div class="admin-section-heading"><div><h2>最近添加</h2><span>曲库中最近添加的音乐</span></div><button class="text-link" data-admin-tab="tracks">查看全部 ${icon('arrow', 15)}</button></div>${state.tracks.slice(0, 5).map((track, index) => `<div class="admin-track-row"><span class="admin-row-no">${String(index + 1).padStart(2, '0')}</span><img ${IMG_LAZY} src="${escapeHtml(coverFor(track))}" alt=""/><span class="admin-track-copy"><strong>${escapeHtml(track.title)}</strong><small>${escapeHtml(track.artist)}</small></span><span class="admin-row-album">${escapeHtml(track.album || '单曲')}</span><span class="admin-row-genre">${escapeHtml(track.genre || '未分类')}</span></div>`).join('') || '<div class="admin-empty">曲库还没有歌曲</div>'}</section><section class="admin-section-card quick-actions"><div class="admin-section-heading"><div><h2>快捷操作</h2><span>整理音乐库</span></div></div><button class="quick-action" data-admin-action="upload"><span class="quick-action-icon">${icon('upload', 18)}</span><span><strong>上传新音乐</strong><small>添加歌曲和同步歌词</small></span>${icon('arrow', 16)}</button><button class="quick-action" data-admin-action="new-album"><span class="quick-action-icon alt">${icon('disc', 18)}</span><span><strong>创建专辑</strong><small>把歌曲组织成专辑</small></span>${icon('arrow', 16)}</button><button class="quick-action" data-admin-action="new-playlist"><span class="quick-action-icon green">${icon('list', 18)}</span><span><strong>新建歌单</strong><small>挑选歌曲编成歌单</small></span>${icon('arrow', 16)}</button></section></div><section class="admin-section-card albums-overview"><div class="admin-section-heading"><div><h2>专辑与作品集</h2><span>管理你的音乐作品</span></div><button class="text-link" data-admin-tab="albums">管理专辑 ${icon('arrow', 15)}</button></div><div class="admin-album-grid">${state.albums.slice(0, 4).map(album => `<div class="admin-album-item"><img ${IMG_LAZY} src="${escapeHtml(coverFor(album))}" alt=""/><strong>${escapeHtml(album.title)}</strong><span>${escapeHtml(album.artist)} · ${albumTracks(album).length} 首</span></div>`).join('')}</div></section><section class="admin-section-card admin-plays-card"><div class="admin-section-heading"><div><h2>播放统计</h2><span>累计播放 ${totalPlays()} 次 · 最近播放与热门歌曲</span></div><button class="text-link" data-admin-action="clear-plays">清空记录 ${icon('trash', 13)}</button></div><div class="admin-plays-grid">${renderAdminPlayColumns()}</div></section>`;
  if (view === 'tracks') {
    const query = (admin.trackQuery || '').trim().toLowerCase();
    const filtered = query ? state.tracks.filter(track => (state.searchHaystack.get(track.id) || '').includes(query)) : state.tracks;
    const visible = filtered.slice(0, admin.trackLimit);
    const remaining = filtered.length - visible.length;
    return `<div class="admin-page-heading"><div><span class="eyebrow">TRACK LIBRARY</span><h1>歌曲管理</h1><p>你的音乐曲库中共有 ${trackCount} 首歌曲。</p></div><button class="button button-dark" data-admin-action="upload">${icon('upload', 16)} 上传音乐</button></div><section class="admin-section-card full-table"><div class="table-toolbar"><div class="table-search">${icon('search', 16)}<input id="admin-track-search" value="${escapeHtml(admin.trackQuery || '')}" placeholder="搜索歌曲或艺人" /></div><span>${filtered.length} 首歌曲</span></div><div class="admin-track-table"><div class="admin-table-head"><span>#</span><span>歌曲</span><span>专辑</span><span>风格</span><span>操作</span></div>${visible.map((track, index) => `<div class="admin-table-row"><span>${String(index + 1).padStart(2, '0')}</span><span class="table-song"><img ${IMG_LAZY} src="${escapeHtml(coverFor(track))}" alt=""/><span><strong>${escapeHtml(track.title)}</strong><small>${escapeHtml(track.artist)}</small></span></span><span>${escapeHtml(track.album || '单曲')}</span><span><i class="genre-dot"></i>${escapeHtml(track.genre || '未分类')}</span><button class="icon-button delete-button" data-delete-track="${escapeHtml(track.id)}" title="删除歌曲">${icon('trash', 16)}</button></div>`).join('') || `<div class="admin-empty">${query ? '没有找到匹配的歌曲' : '曲库还没有歌曲，上传第一首吧。'}</div>`}</div>${remaining > 0 ? `<div class="table-more"><button class="button button-outline" data-admin-action="load-more-tracks">加载更多（剩余 ${remaining} 首）</button></div>` : ''}</section>`;
  }
  if (view === 'albums') return `<div class="admin-page-heading"><div><span class="eyebrow">YOUR RECORDS</span><h1>专辑管理</h1><p>管理 ${state.albums.length} 张专辑与作品集。</p></div><button class="button button-dark" data-admin-action="new-album">${icon('plus', 16)} 创建专辑</button></div><div class="admin-manage-album-grid">${state.albums.map(album => `<article class="manage-album"><img ${IMG_LAZY} src="${escapeHtml(coverFor(album))}" alt=""/><div><span class="eyebrow">ALBUM</span><h2>${escapeHtml(album.title)}</h2><p>${escapeHtml(album.artist || '未知艺人')}</p><small>${albumTracks(album).length} 首歌曲${album.description ? ` · ${escapeHtml(album.description)}` : ''}</small></div><button class="icon-button delete-button" data-delete-album="${escapeHtml(album.id)}" title="删除专辑" aria-label="删除专辑">${icon('trash', 16)}</button></article>`).join('') || '<div class="admin-empty">暂时没有专辑</div>'}</div>`;
  if (view === 'artists') return `<div class="admin-page-heading"><div><span class="eyebrow">VOICES IN YOUR LIBRARY</span><h1>歌手管理</h1><p>曲库中有 ${state.artists.length} 位歌手，上传音乐时会读取标签并自动创建。</p></div></div><div class="admin-manage-album-grid">${state.artists.map(artist => `<article class="manage-album manage-artist"><img ${IMG_LAZY} src="${escapeHtml(coverFor(artist))}" alt=""/><div><span class="eyebrow">ARTIST</span><h2>${escapeHtml(artist.name)}</h2><p>${artistTracks(artist).length} 首歌曲 · ${artistAlbumCount(artist)} 张专辑</p><small>${artist.description ? escapeHtml(artist.description) : '由上传音乐的标签自动创建'}</small></div><button class="icon-button delete-button" data-delete-artist="${escapeHtml(artist.id)}" title="删除歌手档案" aria-label="删除歌手档案">${icon('trash', 16)}</button></article>`).join('') || '<div class="admin-empty">还没有歌手档案，上传带艺人标签的音乐即可自动创建。</div>'}</div>`;
  if (view === 'account') return `<div class="admin-page-heading"><div><span class="eyebrow">ACCOUNT &amp; SECURITY</span><h1>账号设置</h1><p>修改管理端的登录账号或密码，保存后立即生效。</p></div></div><div class="account-grid"><section class="admin-section-card account-card"><div class="admin-section-heading"><div><h2>登录凭证</h2><span>修改账号或密码前需要验证当前密码</span></div></div><form id="account-form" class="account-form"><label class="field-label">管理员账号<input name="username" value="${escapeHtml(admin.username || 'admin')}" autocomplete="username" maxlength="64" required /><small>登录管理端时使用的账号，2–64 个字符，不能包含空格</small></label><label class="field-label">当前密码<input name="currentPassword" type="password" autocomplete="current-password" required placeholder="请输入当前登录密码" /></label><div class="account-divider"><span>修改密码</span></div><label class="field-label">新密码<input name="newPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" placeholder="留空表示不修改密码" /><small>8–128 个字符；保存后其他设备上的登录会话会失效</small></label><label class="field-label">确认新密码<input name="confirmPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" placeholder="再次输入新密码" /></label><div class="account-message" aria-live="polite"></div><button class="button button-dark account-submit" type="submit">保存账号设置</button></form></section><aside class="admin-section-card account-tips"><div class="admin-section-heading"><div><h2>安全提示</h2><span>关于管理员凭证</span></div></div><ul><li>保存成功后当前会话会继续保持登录，其他设备需要重新输入新凭证。</li><li>账号与加盐密码哈希保存在数据目录的 <code>auth.json</code>，不会写入明文密码。</li><li>通过 <code>ADMIN_USER</code> / <code>ADMIN_PASSWORD</code> 环境变量更换凭证并重启后，会以环境变量为准并重置登录会话。</li></ul></aside></div>`;
  return `<div class="admin-page-heading"><div><span class="eyebrow">MIX YOUR MOMENTS</span><h1>歌单管理</h1><p>用喜欢的歌曲编织 ${state.playlists.length} 份歌单。</p></div><button class="button button-dark" data-admin-action="new-playlist">${icon('plus', 16)} 新建歌单</button></div><section class="playlist-admin-list">${state.playlists.map(playlist => `<article class="playlist-admin-row"><img ${IMG_LAZY} src="${escapeHtml(coverFor(playlist))}" alt=""/><div class="playlist-admin-copy"><strong>${escapeHtml(playlist.title)}</strong><span>${escapeHtml(playlist.description || '暂无描述')}</span><small>${playlist.trackIds.length} 首歌曲</small></div><button class="button button-outline" data-edit-playlist="${escapeHtml(playlist.id)}">${icon('list', 15)} 管理歌曲</button><button class="icon-button delete-button" data-delete-playlist="${escapeHtml(playlist.id)}" title="删除歌单">${icon('trash', 16)}</button></article>`).join('') || '<div class="admin-empty">还没有歌单，创建一份自己的精选吧。</div>'}</section>`;
}

function handleAdminAction(action) {
  if (action === 'logout') api('/api/logout', { method: 'POST' }).finally(() => { admin.authenticated = false; admin.username = ''; renderAdmin(); });
  if (action === 'upload') openUploadDialog();
  if (action === 'new-album') openAlbumDialog();
  if (action === 'new-playlist') openPlaylistCreateDialog();
  if (action === 'clear-plays') clearPlayHistory();
  if (action === 'load-more-tracks') { admin.trackLimit += ADMIN_PAGE_SIZE; renderAdmin(); }
}

async function submitAccountUpdate(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const fields = new FormData(form);
  const message = form.querySelector('.account-message');
  const submit = form.querySelector('[type="submit"]');
  const username = String(fields.get('username') || '').trim();
  const currentPassword = String(fields.get('currentPassword') || '');
  const newPassword = String(fields.get('newPassword') || '');
  const confirmPassword = String(fields.get('confirmPassword') || '');
  const setMessage = text => { message.textContent = text; message.classList.remove('success'); };
  if (!username) return setMessage('管理员账号不能为空');
  if (username.length < 2) return setMessage('管理员账号至少需要 2 个字符');
  if (/\s/.test(username)) return setMessage('管理员账号不能包含空格');
  if (newPassword !== confirmPassword) return setMessage('两次输入的新密码不一致');
  if (newPassword && newPassword.length < 8) return setMessage('新密码至少需要 8 个字符');
  if (!newPassword && username === admin.username) return setMessage('账号和密码都未修改');
  submit.disabled = true;
  setMessage('');
  try {
    const result = await api('/api/admin/credentials', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, currentPassword, newPassword }) });
    admin.username = result.username || username;
    renderAdmin();
    showToast('账号设置已更新');
  } catch (error) {
    setMessage(error.message);
    submit.disabled = false;
  }
}

function dialogShell(content, className = 'form-dialog') {
  const dialog = document.createElement('dialog'); dialog.className = className; dialog.innerHTML = content; document.body.append(dialog); dialog.showModal();
  dialog.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => dialog.close()));
  dialog.addEventListener('close', () => dialog.remove()); return dialog;
}

function openUploadDialog() {
  const dialog = dialogShell(`<form class="upload-form"><div class="dialog-head"><div><span class="eyebrow">ADD TO YOUR LIBRARY</span><h2>上传音乐</h2></div><button type="button" class="icon-button" data-close>${icon('close', 19)}</button></div><label class="upload-dropzone" for="audio-file"><span class="upload-symbol">${icon('upload', 23)}</span><strong>选择或拖入音频文件</strong><small>自动读取内嵌标签和封面，并按专辑 / 歌手自动建档 · MP3、M4A、AAC、WAV、OGG、FLAC · 最大 60 MB</small><span class="selected-file" data-audio-name>尚未选择文件</span><input id="audio-file" name="audio" type="file" accept="audio/*,.flac" required /></label><div class="upload-fields"><label class="field-label">歌曲名称<input name="title" maxlength="120" placeholder="自动读取标签，无标签时用文件名" /></label><label class="field-label">演唱者<input name="artist" maxlength="120" placeholder="自动读取标签，可填多个用 / 分隔" /></label><label class="field-label">所属专辑<input name="album" maxlength="120" placeholder="自动读取标签，同名专辑只创建一次" /></label><label class="field-label">音乐风格<select name="genre">${genres.slice(1).map(genre => `<option>${genre}</option>`).join('')}<option>独立摇滚</option><option>古典</option><option>其他</option></select></label><label class="field-label full-field">封面图片<input name="cover" type="file" accept="image/jpeg,image/png,image/webp" /><small>可选，手动选择的封面优先；否则使用音频内嵌封面</small></label><label class="field-label full-field">同步歌词 <span class="optional-label">可选</span><input name="lyrics" type="file" accept=".lrc,.txt,text/plain" /><small>支持 LRC / TXT 文本歌词</small></label><label class="field-label full-field">歌词文本<textarea name="lyricsText" rows="3" placeholder="也可以直接粘贴歌词，支持 [00:12.00] 时间戳格式"></textarea></label></div><div class="dialog-actions"><button class="button button-quiet" type="button" data-close>取消</button><button class="button button-dark" type="submit">${icon('upload', 16)} 上传到曲库</button></div><div class="upload-progress" aria-live="polite"></div></form>`);
  const input = dialog.querySelector('#audio-file');
  input.addEventListener('change', () => {
    const file = input.files[0]; dialog.querySelector('[data-audio-name]').textContent = file?.name || '尚未选择文件';
  });
  const dropzone = dialog.querySelector('.upload-dropzone');
  dropzone.addEventListener('dragover', event => { event.preventDefault(); dropzone.classList.add('dragging'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragging'));
  dropzone.addEventListener('drop', event => { event.preventDefault(); dropzone.classList.remove('dragging'); const files = event.dataTransfer.files; if (files.length) { input.files = files; input.dispatchEvent(new Event('change')); } });
  dialog.querySelector('form').addEventListener('submit', async event => {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    if (!data.get('audio')?.size) return showToast('请选择音乐文件');
    const lyricText = String(data.get('lyricsText') || '').trim();
    if (lyricText) data.set('lyrics', new File([lyricText], 'lyrics.lrc', { type: 'text/plain' }));
    data.delete('lyricsText');
    const submit = form.querySelector('[type="submit"]'); submit.disabled = true; dialog.querySelector('.upload-progress').textContent = '正在上传并保存音乐…';
    try {
      const result = await api('/api/admin/upload', { method: 'POST', body: data });
      await refreshLibrary(); admin.tab = 'tracks'; dialog.close(); renderAdmin();
      const recognized = [result.metadata?.artist && '歌手', result.metadata?.album && '专辑', result.metadata?.cover && '封面'].filter(Boolean);
      const creations = [];
      if (result.created?.album) creations.push(`专辑「${result.library?.album?.title || '未命名'}」`);
      if (result.created?.artists?.length) creations.push(`${result.created.artists.length} 位歌手`);
      let message = recognized.length ? `已自动识别${recognized.join('、')}并添加到曲库` : '歌曲已添加到音乐库';
      if (creations.length) message += `，新建了${creations.join('、')}`;
      else if (result.library?.album || result.library?.artists?.length) message += '，对应的专辑与歌手档案已存在';
      showToast(message);
    }
    catch (error) { dialog.querySelector('.upload-progress').textContent = error.message; submit.disabled = false; }
  });
}

function openAlbumDialog() {
  const dialog = dialogShell(`<form><div class="dialog-head"><div><span class="eyebrow">ORGANIZE YOUR RECORDS</span><h2>创建专辑</h2></div><button type="button" class="icon-button" data-close>${icon('close', 19)}</button></div><label class="field-label">专辑名称<input name="title" required maxlength="120" placeholder="为这张专辑取个名字"/></label><label class="field-label">艺人<input name="artist" maxlength="120" placeholder="演唱者或乐队"/></label><label class="field-label">专辑介绍<input name="description" maxlength="200" placeholder="可选，简单介绍这张专辑"/></label><label class="field-label">封面图片地址<input name="coverUrl" type="url" placeholder="https://…"/></label><div class="dialog-actions"><button type="button" class="button button-quiet" data-close>取消</button><button class="button button-dark" type="submit">创建专辑</button></div></form>`);
  dialog.querySelector('form').addEventListener('submit', async event => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    try { await api('/api/admin/albums', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(form)) }); await refreshLibrary(); dialog.close(); renderAdmin(); showToast('专辑已创建'); }
    catch (error) { showToast(error.message); }
  });
}

function openPlaylistCreateDialog() {
  const dialog = dialogShell(`<form><div class="dialog-head"><div><span class="eyebrow">MAKE A MIX</span><h2>新建歌单</h2></div><button type="button" class="icon-button" data-close>${icon('close', 19)}</button></div><label class="field-label">歌单名称<input name="title" required maxlength="120" placeholder="给歌单起个名字"/></label><label class="field-label">一句描述<input name="description" maxlength="200" placeholder="这份歌单适合什么时候听？"/></label><label class="field-label">封面图片地址<input name="coverUrl" type="url" placeholder="https://…"/></label><div class="dialog-actions"><button type="button" class="button button-quiet" data-close>取消</button><button class="button button-dark" type="submit">创建歌单</button></div></form>`);
  dialog.querySelector('form').addEventListener('submit', async event => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    try { await api('/api/admin/playlists', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...Object.fromEntries(form), trackIds: [] }) }); await refreshLibrary(); dialog.close(); renderAdmin(); showToast('歌单已创建，添加喜欢的歌曲吧'); }
    catch (error) { showToast(error.message); }
  });
}

function openPlaylistEditor(id) {
  const playlist = state.playlists.find(item => item.id === id); if (!playlist) return;
  const dialog = dialogShell(`<form><div class="dialog-head"><div><span class="eyebrow">CURATE A PLAYLIST</span><h2>管理歌曲</h2><p>${escapeHtml(playlist.title)}</p></div><button type="button" class="icon-button" data-close>${icon('close', 19)}</button></div><div class="playlist-pick-list">${state.tracks.map(track => `<label class="playlist-pick"><input type="checkbox" name="trackIds" value="${escapeHtml(track.id)}" ${playlist.trackIds.includes(track.id) ? 'checked' : ''}/><img ${IMG_LAZY} src="${escapeHtml(coverFor(track))}" alt=""/><span><strong>${escapeHtml(track.title)}</strong><small>${escapeHtml(track.artist)} · ${escapeHtml(track.album || '单曲')}</small></span></label>`).join('') || '<div class="admin-empty">先上传一些歌曲吧</div>'}</div><div class="dialog-actions"><button type="button" class="button button-quiet" data-close>取消</button><button class="button button-dark" type="submit">保存歌单</button></div></form>`);
  dialog.querySelector('form').addEventListener('submit', async event => {
    event.preventDefault(); const trackIds = [...new FormData(event.currentTarget).getAll('trackIds')];
    try { await api(`/api/admin/playlists/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trackIds }) }); await refreshLibrary(); dialog.close(); renderAdmin(); showToast(`歌单已保存 · ${trackIds.length} 首歌曲`); }
    catch (error) { showToast(error.message); }
  });
}

async function deleteTrack(id) {
  const track = state.tracks.find(item => item.id === id); if (!track || !confirm(`确定从曲库删除「${track.title}」吗？`)) return;
  try { await api(`/api/admin/tracks/${encodeURIComponent(id)}`, { method: 'DELETE' }); await refreshLibrary(); renderAdmin(); showToast('歌曲已删除'); }
  catch (error) { showToast(error.message); }
}

async function deletePlaylist(id) {
  const playlist = state.playlists.find(item => item.id === id); if (!playlist || !confirm(`确定删除歌单「${playlist.title}」吗？`)) return;
  try { await api(`/api/admin/playlists/${encodeURIComponent(id)}`, { method: 'DELETE' }); await refreshLibrary(); renderAdmin(); showToast('歌单已删除'); }
  catch (error) { showToast(error.message); }
}

async function deleteAlbum(id) {
  const album = state.albums.find(item => item.id === id); if (!album || !confirm(`确定删除专辑「${album.title}」吗？歌曲会保留在曲库中。`)) return;
  try { await api(`/api/admin/albums/${encodeURIComponent(id)}`, { method: 'DELETE' }); await refreshLibrary(); renderAdmin(); showToast('专辑已删除，歌曲仍保留在曲库'); }
  catch (error) { showToast(error.message); }
}

async function deleteArtist(id) {
  const artist = state.artists.find(item => item.id === id); if (!artist || !confirm(`确定删除歌手档案「${artist.name}」吗？歌曲与专辑会保留，再次上传同名歌手时会重新创建。`)) return;
  try { await api(`/api/admin/artists/${encodeURIComponent(id)}`, { method: 'DELETE' }); await refreshLibrary(); renderAdmin(); showToast('歌手档案已删除，歌曲仍保留在曲库'); }
  catch (error) { showToast(error.message); }
}

async function clearPlayHistory() {
  if (!confirm('确定清空所有播放记录和播放次数吗？此操作不可撤销。')) return;
  try { await api('/api/admin/plays', { method: 'DELETE' }); await refreshLibrary(); renderAdmin(); showToast('播放记录已清空'); }
  catch (error) { showToast(error.message); }
}

document.addEventListener('click', handleGlobalClick);
document.addEventListener('input', handleGlobalInput);
