const crypto = require('node:crypto');

function cleanTag(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeKey(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function splitArtistText(value) {
  return cleanTag(value).split(/\s*[、;；]\s*|\s+\/\s+/).map(cleanTag).filter(Boolean);
}

function uniqueArtistNames(values) {
  const seen = new Set();
  const names = [];
  for (const value of values) {
    const name = cleanTag(value);
    const key = normalizeKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

function namesFromTag(plural, singular) {
  const listed = Array.isArray(plural) ? uniqueArtistNames(plural) : [];
  return listed.length ? listed : uniqueArtistNames(splitArtistText(singular));
}

function ensureArtist(db, name, coverUrl = '') {
  const cleanName = cleanTag(name);
  const key = normalizeKey(cleanName);
  if (!key || key === normalizeKey('未知艺人')) return { artist: null, created: false, updated: false };
  let artist = db.artists.find(item => normalizeKey(item.name) === key);
  if (!artist) {
    artist = { id: crypto.randomUUID(), name: cleanName, description: '', coverUrl: cleanTag(coverUrl), createdAt: new Date().toISOString() };
    db.artists.unshift(artist);
    return { artist, created: true, updated: false };
  }
  let updated = false;
  if (!artist.id) { artist.id = crypto.randomUUID(); updated = true; }
  if (!artist.coverUrl && coverUrl) { artist.coverUrl = coverUrl; updated = true; }
  return { artist, created: false, updated };
}

function findAlbum(db, title, artist, requireArtistMatch = false) {
  const titleKey = normalizeKey(title);
  if (!titleKey) return null;
  const candidates = db.albums.filter(item => normalizeKey(item.title) === titleKey);
  if (!candidates.length) return null;
  if (!requireArtistMatch) return candidates[0];
  const artistKey = normalizeKey(artist);
  return candidates.find(item => {
    if (!artistKey) return true;
    if (normalizeKey(item.artist) === artistKey) return true;
    const names = uniqueArtistNames([
      ...(Array.isArray(item.artistNames) ? item.artistNames : []),
      ...splitArtistText(item.artist)
    ]);
    return names.some(name => normalizeKey(name) === artistKey);
  }) || null;
}

function nextAlbumOrder(db, albumId) {
  if (!albumId) return 0;
  let max = -1;
  for (const track of db.tracks) {
    if (track.albumId !== albumId) continue;
    const value = Number(track.albumOrder);
    if (Number.isFinite(value)) max = Math.max(max, value);
  }
  return max + 1;
}

module.exports = { cleanTag, normalizeKey, splitArtistText, uniqueArtistNames, namesFromTag, ensureArtist, findAlbum, nextAlbumOrder };
