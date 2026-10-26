const storedTheme = localStorage.getItem('horse-music-theme');

export const TRACK_PAGE_SIZE = 100;
export const ADMIN_PAGE_SIZE = 100;
export const IMG_LAZY = 'loading="lazy" decoding="async"';
export const IMG_VISIBLE = 'decoding="async"';
export const genres = ['全部', '华语流行', '独立民谣', '电子', '轻爵士'];

export const state = {
  tracks: [],
  albums: [],
  artists: [],
  playlists: [],
  recentPlays: [],
  genre: '全部',
  sort: 'recent',
  query: '',
  favorites: new Set(),
  listLimit: TRACK_PAGE_SIZE,
  queue: [],
  queueIndex: -1,
  playing: false,
  currentTime: 0,
  duration: 0,
  pendingRecord: null,
  recordedForCurrent: false,
  shuffle: false,
  repeat: false,
  repeatOne: false,
  repeatMode: 0,
  shufflePool: [],
  shuffleHistory: [],
  volume: 1,
  muted: false,
  lyricsOpen: false,
  trackById: new Map(),
  artistIndex: new Map(),
  artistByName: new Map(),
  albumTracksMap: new Map(),
  artistAlbumCounts: new Map(),
  searchHaystack: new Map(),
  lyricsCache: new Map(),
  recentCache: null,
  rankedCache: null,
  artistRankCache: null,
  theme: ['system', 'light', 'dark'].includes(storedTheme) ? storedTheme : 'system',
  themeMenuOpen: false
};

export function currentTrack() {
  return state.queue[state.queueIndex]?.track || null;
}

export function hasPlayerSession() {
  return state.queue.length > 0;
}
