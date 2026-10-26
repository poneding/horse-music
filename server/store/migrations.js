const crypto = require('node:crypto');
const { RECENT_PLAY_LIMIT } = require('../config');
const { normalizeKey, splitArtistText, uniqueArtistNames, ensureArtist, findAlbum } = require('../services/catalog');

// v5：清洗歌手名里的零宽字符，避免前端按名字统计的歌曲数量与服务端认领的歌手对不上。
const SCHEMA_VERSION = 5;

function migrateDb(db) {
  let changed = false;
  for (const key of ['tracks', 'albums', 'playlists', 'artists']) {
    if (!Array.isArray(db[key])) { db[key] = []; changed = true; }
  }
  if (!Array.isArray(db.recentPlays)) { db.recentPlays = []; changed = true; }
  for (const track of db.tracks) {
    if (!track.id) { track.id = crypto.randomUUID(); changed = true; }
    if (!Number.isFinite(Number(track.playCount))) { track.playCount = 0; changed = true; }
    else if (typeof track.playCount !== 'number') { track.playCount = Number(track.playCount); changed = true; }
    if (typeof track.lastPlayedAt !== 'string') { track.lastPlayedAt = ''; changed = true; }
  }
  const trackIds = new Set(db.tracks.map(track => track.id));
  const validPlays = db.recentPlays.filter(entry => entry && trackIds.has(entry.trackId) && typeof entry.playedAt === 'string');
  if (validPlays.length !== db.recentPlays.length) { db.recentPlays = validPlays; changed = true; }
  if (db.recentPlays.length > RECENT_PLAY_LIMIT) { db.recentPlays = db.recentPlays.slice(0, RECENT_PLAY_LIMIT); changed = true; }
  const previousVersion = Number(db.schemaVersion || 0);
  if (previousVersion >= SCHEMA_VERSION) return changed;

  if (previousVersion < 4) {
    // 以当前（新歌在前）的展示顺序回填专辑内序号，避免排序功能上线后曲目顺序跳动。
    const counters = new Map();
    for (const track of db.tracks) {
      const key = track.albumId || (track.album ? `title:${normalizeKey(track.album)}` : '');
      if (!key) {
        track.albumOrder = 0;
      } else {
        const next = counters.get(key) || 0;
        track.albumOrder = next;
        counters.set(key, next + 1);
      }
      changed = true;
    }
  }

  const albumIds = new Set();
  for (const album of db.albums) {
    if (!album.id) { album.id = crypto.randomUUID(); changed = true; }
    albumIds.add(album.id);
    if (typeof album.title !== 'string') { album.title = String(album.title || ''); changed = true; }
    if (!Array.isArray(album.artistNames)) { album.artistNames = []; changed = true; }
    if (album.coverUrl == null) { album.coverUrl = ''; changed = true; }
  }

  for (const track of db.tracks) {
    const names = uniqueArtistNames(
      Array.isArray(track.artistNames) && track.artistNames.length ? track.artistNames : splitArtistText(track.artist)
    );
    if (!names.length) names.push('未知艺人');
    if (!Array.isArray(track.artistNames) || track.artistNames.join('\u0000') !== names.join('\u0000')) {
      track.artistNames = names;
      changed = true;
    }
    if (track.artist !== names.join(', ')) { track.artist = names.join(', '); changed = true; }
    for (const name of names) {
      const result = ensureArtist(db, name, track.coverUrl);
      if (result.created || result.updated) changed = true;
    }
    if (track.albumId && !albumIds.has(track.albumId)) { track.albumId = ''; changed = true; }
    if (!track.albumId && track.album) {
      const album = findAlbum(db, track.album, track.artist);
      if (album) { track.albumId = album.id; changed = true; }
    }
  }

  for (const album of db.albums) {
    const names = uniqueArtistNames([
      ...(Array.isArray(album.artistNames) ? album.artistNames : []),
      ...splitArtistText(album.artist)
    ]);
    if (!album.artist && names.length) { album.artist = names.join(' / '); changed = true; }
    if (names.join('\u0000') !== (album.artistNames || []).join('\u0000')) {
      album.artistNames = names;
      changed = true;
    }
    if (!album.coverUrl) {
      const track = db.tracks.find(item => item.albumId === album.id || (!item.albumId && normalizeKey(item.album) === normalizeKey(album.title)));
      if (track?.coverUrl) { album.coverUrl = track.coverUrl; changed = true; }
    }
    for (const name of names) {
      const result = ensureArtist(db, name, album.coverUrl);
      if (result.created || result.updated) changed = true;
    }
  }

  for (const artist of db.artists) {
    if (!artist.id) { artist.id = crypto.randomUUID(); changed = true; }
    if (!artist.coverUrl) {
      const key = normalizeKey(artist.name);
      const track = db.tracks.find(item => {
        const names = Array.isArray(item.artistNames) ? item.artistNames : [item.artist];
        return item.coverUrl && names.some(name => normalizeKey(name) === key);
      });
      if (track?.coverUrl) { artist.coverUrl = track.coverUrl; changed = true; }
    }
  }

  db.schemaVersion = SCHEMA_VERSION;
  return true;
}

module.exports = { migrateDb, SCHEMA_VERSION };
