import { api } from '../core/api.js';
import { currentRoute } from '../core/router.js';
import { renderApp } from '../core/render-bus.js';
import { state, genres } from '../core/state.js';
import { artistNamesFor, coverFor, normalizeName } from '../core/util.js';
import { hydrateFavorites } from './favorites.js';

export { genres };

const textCollator = new Intl.Collator('zh-Hans-CN', { numeric: true, sensitivity: 'base' });
// 过滤/排序结果缓存：曲库引用、排序条件变化时失效，避免每次渲染都重排全库。
let filteredCache = null;

export async function refreshLibrary() {
  const data = await api('/api/state');
  applyLibraryState(data);
  return data;
}

/**
 * 其他标签页或设备改动曲库后，回到本页时按服务端版本号决定是否刷新。
 * 歌手卡片的歌曲数量是从曲库实时算出来的，只要曲库没同步，改了歌手的页面就还是旧数字；
 * 这里只在版本真的变化时重新应用状态，避免每次切回窗口都白白重渲染。
 */
export async function refreshLibraryIfStale() {
  const data = await api('/api/state');
  if (data.version === undefined || data.version === state.libraryVersion) return false;
  applyLibraryState(data);
  return true;
}

function applyLibraryState(data) {
  state.tracks = data.tracks || [];
  state.albums = data.albums || [];
  state.artists = data.artists || [];
  state.playlists = data.playlists || [];
  state.recentPlays = data.recentPlays || [];
  if (data.version !== undefined) state.libraryVersion = data.version;
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
    const names = artistNamesFor(track);
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
  // 歌手页的专辑列表：既包含歌手演唱的歌曲所在专辑，也包含以该歌手为专辑艺人的专辑。
  // 用专辑 id 去重，名称大小写 / 别名不会把同一张专辑算两次。
  const artistAlbumIds = new Map();
  const addArtistAlbum = (name, albumId) => {
    const key = normalizeName(name);
    if (!key) return;
    let set = artistAlbumIds.get(key);
    if (!set) { set = new Set(); artistAlbumIds.set(key, set); }
    set.add(albumId);
  };
  for (const album of state.albums) {
    for (const name of artistNamesFor(album)) addArtistAlbum(name, album.id);
    for (const track of albumTracksMap.get(album.id) || []) {
      for (const name of artistNamesFor(track)) addArtistAlbum(name, album.id);
    }
  }
  state.trackById = byId;
  state.artistIndex = artistIndex;
  state.artistByName = new Map(state.artists.map(artist => [normalizeName(artist.name), artist]));
  state.albumTracksMap = albumTracksMap;
  state.artistAlbumIds = artistAlbumIds;
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

export function artistAlbums(artist) {
  if (!artist) return [];
  const ids = state.artistAlbumIds.get(normalizeName(artist.name));
  if (!ids || !ids.size) return [];
  return state.albums.filter(album => ids.has(album.id));
}

export function artistAlbumCount(artist) {
  if (!artist) return 0;
  return state.artistAlbumIds.get(normalizeName(artist.name))?.size || 0;
}

// 空歌单的兜底封面：从内置图片里按歌单 id 稳定选一张，
// 既不需要用户手动选封面，也不会每次渲染都换一张造成闪烁。
const PLAYLIST_FALLBACK_COVERS = [
  'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=700&q=80',
  'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=700&q=80',
  'https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=700&q=80',
  'https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=700&q=80',
  'https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=700&q=80',
  'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=700&q=80'
];

function coverHash(value) {
  let hash = 0;
  const text = String(value || '');
  for (let index = 0; index < text.length; index += 1) hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  return hash;
}

export function playlistFallbackCover(playlist) {
  const key = playlist?.id || playlist?.title || '';
  return PLAYLIST_FALLBACK_COVERS[coverHash(key) % PLAYLIST_FALLBACK_COVERS.length];
}

/**
 * 歌单封面跟随「最近加入歌单的歌曲」：
 * addedAt 记录每首歌加入歌单的时间；没有 addedAt 的旧歌单退回到顺序末尾那首歌。
 * 歌曲全部被删除或歌单为空时，使用内置兜底封面。
 */
export function playlistCover(playlist) {
  if (!playlist) return PLAYLIST_FALLBACK_COVERS[0];
  const ids = Array.isArray(playlist.trackIds) ? playlist.trackIds : [];
  const addedAt = playlist.addedAt && typeof playlist.addedAt === 'object' ? playlist.addedAt : null;
  let latest = null;
  let latestAt = -Infinity;
  let lastAdded = null;
  for (const id of ids) {
    const track = state.trackById.get(id);
    if (!track) continue;
    lastAdded = track;
    const stamp = Date.parse(addedAt?.[id] || '');
    if (Number.isFinite(stamp) && stamp >= latestAt) { latestAt = stamp; latest = track; }
  }
  if (latest) return coverFor(latest);
  if (lastAdded) return coverFor(lastAdded);
  return playlistFallbackCover(playlist);
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
      const names = artistNamesFor(track);
      for (const name of names) {
        const key = normalizeName(name);
        if (!key) continue;
        const entry = ranking.get(key) || {
          name,
          plays: 0,
          // 「N 首歌曲」应该等于这位歌手在曲库里的全部歌曲数；
          // 只统计有播放记录的歌曲时，改了未播放歌曲的歌手后这个数字不会变。
          tracks: (state.artistIndex.get(key) || []).length
        };
        entry.plays += Number(track.playCount) || 0;
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
