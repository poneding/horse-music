import { api } from '../core/api.js';
import { currentRoute } from '../core/router.js';
import { renderApp } from '../core/render-bus.js';
import { state, genres } from '../core/state.js';
import { normalizeName } from '../core/util.js';
import { hydrateFavorites } from './favorites.js';

export { genres };

const textCollator = new Intl.Collator('zh-Hans-CN', { numeric: true, sensitivity: 'base' });
// 过滤/排序结果缓存：曲库引用、排序条件变化时失效，避免每次渲染都重排全库。
let filteredCache = null;

export async function refreshLibrary() {
  const data = await api('/api/state');
  state.tracks = data.tracks || [];
  state.albums = data.albums || [];
  state.artists = data.artists || [];
  state.playlists = data.playlists || [];
  state.recentPlays = data.recentPlays || [];
  rebuildIndexes();
  if (state.genre !== '全部' && !state.tracks.some(track => track.genre === state.genre)) state.genre = '全部';
  hydrateFavorites(Array.isArray(data.favorites) ? data.favorites : []);
  window.dispatchEvent(new CustomEvent('horse:librarychange'));
}

function albumOrderValue(track) {
  const value = Number(track.albumOrder);
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

export function rebuildIndexes() {
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
    list.sort((left, right) => albumOrderValue(left) - albumOrderValue(right));
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
  filteredCache = null;
  for (const id of state.lyricsCache.keys()) if (!byId.has(id)) state.lyricsCache.delete(id);
}


export function albumTracks(album) {
  if (!album) return [];
  return state.albumTracksMap.get(album.id) || state.albumTracksMap.get(normalizeName(album.title)) || [];
}

export function artistTracks(artist) {
  if (!artist) return [];
  return state.artistIndex.get(normalizeName(artist.name)) || [];
}

export function artistAlbumCount(artist) {
  if (!artist) return 0;
  return state.artistAlbumCounts.get(normalizeName(artist.name)) || 0;
}

export function genreOptions() {
  const values = new Set();
  for (const track of state.tracks) {
    const genre = String(track.genre || '').trim();
    if (genre) values.add(genre);
  }
  return ['全部', ...[...values].sort((left, right) => textCollator.compare(left, right))];
}

function compareText(left, right) {
  return textCollator.compare(String(left || ''), String(right || ''));
}

function addedAt(track) {
  const value = Date.parse(track.createdAt || '');
  return Number.isFinite(value) ? value : 0;
}

function sortTracks(tracks) {
  const list = [...tracks];
  if (state.sort === 'title') {
    list.sort((left, right) => compareText(left.title, right.title) || compareText(left.artist, right.artist));
  } else if (state.sort === 'artist') {
    list.sort((left, right) => compareText(left.artist, right.artist) || compareText(left.album, right.album) || compareText(left.title, right.title));
  } else if (state.sort === 'duration') {
    list.sort((left, right) => (Number(left.duration) || 0) - (Number(right.duration) || 0) || compareText(left.title, right.title));
  } else if (state.sort === 'plays') {
    list.sort((left, right) => (Number(right.playCount) || 0) - (Number(left.playCount) || 0)
      || String(right.lastPlayedAt || '').localeCompare(String(left.lastPlayedAt || ''))
      || compareText(left.title, right.title));
  } else {
    list.sort((left, right) => addedAt(right) - addedAt(left) || compareText(left.title, right.title));
  }
  return list;
}

export function filteredTracks() {
  const key = `${state.sort}\u0000${state.genre}\u0000${state.query}`;
  if (filteredCache && filteredCache.tracks === state.tracks && filteredCache.key === key) return filteredCache.result;
  let tracks = state.tracks;
  if (state.genre !== '全部') tracks = tracks.filter(track => track.genre === state.genre);
  const query = state.query.trim().toLowerCase();
  if (query) tracks = tracks.filter(track => (state.searchHaystack.get(track.id) || '').includes(query));
  const result = sortTracks(tracks);
  filteredCache = { tracks: state.tracks, key, result };
  return result;
}

export function searchGroups(query) {
  const value = String(query || '').trim().toLowerCase();
  if (!value) return { albums: [], artists: [], playlists: [] };
  const match = text => String(text || '').toLowerCase().includes(value);
  return {
    albums: state.albums.filter(album => match(album.title) || match(album.artist)).slice(0, 6),
    artists: state.artists.filter(artist => match(artist.name) || match(artist.description)).slice(0, 6),
    playlists: state.playlists.filter(playlist => match(playlist.title) || match(playlist.description)).slice(0, 6)
  };
}

export function recentTracks(limit = 50) {
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

export function rankedTracks() {
  if (!state.rankedCache) {
    state.rankedCache = state.tracks
      .filter(track => (Number(track.playCount) || 0) > 0)
      .sort((left, right) => (Number(right.playCount) || 0) - (Number(left.playCount) || 0)
        || String(right.lastPlayedAt || '').localeCompare(String(left.lastPlayedAt || '')));
  }
  return state.rankedCache;
}

export const CHART_LIMIT = 50;

export function chartTracks() {
  return rankedTracks().slice(0, CHART_LIMIT);
}

export function totalPlays() {
  return state.tracks.reduce((sum, track) => sum + (Number(track.playCount) || 0), 0);
}

export function artistPlayRanking(limit = 6) {
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

let playViewTimer = null;
function schedulePlayViewRefresh() {
  const name = currentRoute().name;
  if (!['home', 'recent', 'charts'].includes(name)) return;
  clearTimeout(playViewTimer);
  playViewTimer = setTimeout(() => {
    if (['home', 'recent', 'charts'].includes(currentRoute().name)) renderApp();
  }, 500);
}

export function recordPlay(trackId) {
  if (!trackId) return;
  api('/api/plays', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trackId })
  })
    .then(result => {
      const track = state.trackById.get(trackId);
      if (!track) return;
      track.playCount = Number(result.playCount) || 0;
      if (state.sort === 'plays') filteredCache = null;
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
