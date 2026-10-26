const crypto = require('node:crypto');

// 零宽空格、BOM 这类不可见字符常随标签或复制粘贴混进歌手名。
// 服务端匹配时一直是忽略它们的，如果把它们真的存进档案，前端按名字统计歌曲数量时就会对不上，
// 表现为「改了歌手，但歌手的歌曲数量没有变化」。
const INVISIBLE_NAME_RE = /[\u200B-\u200D\u2060\uFEFF]/g;

function cleanTag(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function stripInvisible(value) {
  return String(value || '').replace(INVISIBLE_NAME_RE, '');
}

function cleanArtistName(value) {
  return cleanTag(stripInvisible(value));
}

function normalizeKey(value) {
  return stripInvisible(String(value || '').normalize('NFKC'))
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
    const name = cleanArtistName(value);
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
  const cleanName = cleanArtistName(name);
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
  // 旧数据里歌手名可能带着不可见字符：只把这类字符清掉，保留档案本来的大小写与写法。
  const storedName = cleanArtistName(artist.name);
  if (artist.name !== storedName) { artist.name = storedName; updated = true; }
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

module.exports = { cleanTag, cleanArtistName, normalizeKey, splitArtistText, uniqueArtistNames, namesFromTag, ensureArtist, findAlbum, nextAlbumOrder };
