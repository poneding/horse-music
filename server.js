const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { promisify } = require('node:util');
const { pipeline } = require('node:stream/promises');
const Busboy = require('busboy');
const { parseFile } = require('music-metadata');

const ROOT = __dirname;
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const MEDIA_DIR = path.join(DATA_DIR, 'media');
const DB_FILE = path.join(DATA_DIR, 'library.json');
const PLAYS_FILE = path.join(DATA_DIR, 'plays.json');
const AUTH_FILE = path.join(DATA_DIR, 'auth.json');
const PORT = Number(process.env.PORT || 4173);
const MAX_UPLOAD = 60 * 1024 * 1024;
const MAX_COVER = 8 * 1024 * 1024;
const MAX_LYRICS = 500 * 1024;
const MAX_JSON = 1024 * 1024;
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const RECENT_PLAY_LIMIT = 200;
const DEFAULT_TRACK_COVER = 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=720&q=85';
const PUBLIC_CACHE = 'public, max-age=31536000, immutable';
const scrypt = promisify(crypto.scrypt);
const INSTANCE_ID = crypto.randomBytes(6).toString('hex');

let authStore;
let db;
let playStore;
let dbVersion = 1;
let dbDirty = false;
let dbWritePromise = null;
let stateCache = null;
let staticCache = new Map();
let tempCounter = 0;
let playWriteTimer = null;
let playDirty = false;
let playWritePromise = Promise.resolve();
let authWritePromise = Promise.resolve();

const seed = {
  tracks: [
    { id: 'seed-1', title: '雨后慢行', artist: '林岚', album: '夜色公路', genre: '华语流行', duration: 0, coverUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=720&q=85', src: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', lyrics: '[00:00.00] 街灯慢慢亮起来\n[00:10.00] 雨水把城市洗成了新的模样\n[00:20.00] 我们沿着熟悉的路，走向远方' },
    { id: 'seed-2', title: '在风经过的地方', artist: '周与海', album: '沿岸', genre: '独立民谣', duration: 0, coverUrl: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=720&q=85', src: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3', lyrics: '[00:00.00] 风从海面吹来\n[00:12.00] 把没说完的话带向远方\n[00:24.00] 我在风经过的地方等你' },
    { id: 'seed-3', title: '凌晨两点的蓝', artist: 'Mori', album: '夜色公路', genre: '电子', duration: 0, coverUrl: 'https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=720&q=85', src: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3', lyrics: '[00:00.00] 夜色落在窗边\n[00:14.00] 一座城市进入安静\n[00:28.00] 只剩心跳和微弱的蓝' },
    { id: 'seed-4', title: '把日子唱成歌', artist: '许安然', album: '晴天清单', genre: '轻爵士', duration: 0, coverUrl: 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=720&q=85', src: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3', lyrics: '[00:00.00] 早餐的咖啡还冒着热气\n[00:11.00] 今天也有新的好天气\n[00:22.00] 把平凡的日子唱成歌' },
    { id: 'seed-5', title: '海风写给你', artist: '白屿', album: '沿岸', genre: '独立民谣', duration: 0, coverUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=720&q=85', src: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3', lyrics: '[00:00.00] 海风写下你的名字\n[00:13.00] 潮汐又把它轻轻擦去\n[00:26.00] 我仍然记得那片蓝' },
    { id: 'seed-6', title: '失重派对', artist: 'Neon Field', album: '微光俱乐部', genre: '电子', duration: 0, coverUrl: 'https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=720&q=85', src: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3', lyrics: '[00:00.00] 灯光亮起，世界失重\n[00:15.00] 跟着节拍穿过人群\n[00:30.00] 今晚我们不必着陆' }
  ],
  albums: [
    { id: 'album-1', title: '夜色公路', artist: '林岚 / Mori', description: '写给每一个晚归的人。', coverUrl: 'https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=900&q=88' },
    { id: 'album-2', title: '沿岸', artist: '周与海 / 白屿', description: '沿着海岸线，把故事唱给风听。', coverUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=900&q=88' },
    { id: 'album-3', title: '晴天清单', artist: '许安然', description: '给普通日子的一点明亮。', coverUrl: 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=900&q=88' },
    { id: 'album-4', title: '微光俱乐部', artist: 'Neon Field', description: '夜晚的另一种打开方式。', coverUrl: 'https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=900&q=88' }
  ],
  artists: [],
  recentPlays: [],
  playlists: [
    { id: 'playlist-1', title: '慢一点也没关系', description: '给需要喘口气的下午', coverUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=900&q=88', trackIds: ['seed-1', 'seed-2', 'seed-5'] },
    { id: 'playlist-2', title: '窗外的夜', description: '适合一个人听的深夜歌单', coverUrl: 'https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=900&q=88', trackIds: ['seed-3', 'seed-1', 'seed-6'] },
    { id: 'playlist-3', title: '今天是晴天', description: '让好心情多停留一会儿', coverUrl: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=88', trackIds: ['seed-4', 'seed-2', 'seed-5'] }
  ]
};

async function loadLibrary() {
  try {
    return { db: JSON.parse(await fsp.readFile(DB_FILE, 'utf8')), created: false };
  } catch (error) {
    if (error.code === 'ENOENT') return { db: structuredClone(seed), created: true };
    const backup = `${DB_FILE}.corrupt-${Date.now()}`;
    await fsp.rename(DB_FILE, backup).catch(() => {});
    throw new Error(`library.json 无法解析，已备份到 ${backup}。请恢复备份后重启。原始错误：${error.message}`);
  }
}

async function ensureStore() {
  await fsp.mkdir(MEDIA_DIR, { recursive: true });
  for (const name of await fsp.readdir(DATA_DIR)) {
    if (name.startsWith('.upload-')) await fsp.rm(path.join(DATA_DIR, name), { recursive: true, force: true }).catch(() => {});
  }
  const loaded = await loadLibrary();
  db = loaded.db;
  let shouldWrite = loaded.created;
  if (migrateDb(db)) shouldWrite = true;
  await loadPlayStore();
  db.recentPlays = playStore.recent;
  if (shouldWrite) await writeDb();
  await initializeAuthStore();
}

async function passwordHash(password, salt) {
  return (await scrypt(password, salt, 64)).toString('hex');
}

function adminCredentialsFromEnv() {
  return {
    username: (process.env.ADMIN_USER || 'admin').trim() || 'admin',
    password: process.env.ADMIN_PASSWORD || 'admin123'
  };
}

function credentialsFingerprint(username, password) {
  return crypto.createHash('sha256').update(`${username}\0${password}`).digest('hex');
}

async function createAdminRecord(username, password, updatedAt = new Date().toISOString()) {
  const salt = crypto.randomBytes(16).toString('hex');
  return { username, salt, passwordHash: await passwordHash(password, salt), updatedAt };
}

async function initializeAuthStore() {
  const { username, password } = adminCredentialsFromEnv();
  const fingerprint = credentialsFingerprint(username, password);
  try {
    authStore = JSON.parse(await fsp.readFile(AUTH_FILE, 'utf8'));
    if (!authStore.admin?.username || !authStore.admin?.salt || !authStore.admin?.passwordHash || typeof authStore.sessions !== 'object') {
      throw new Error('Invalid admin auth store');
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    authStore = { admin: await createAdminRecord(username, password), sessions: {}, envFingerprint: fingerprint };
    await writeAuthStore();
    return;
  }

  // Environment credentials only reset the store when their values change.
  // This keeps account changes made in the admin UI across restarts while
  // keeping the documented behavior of rotating ADMIN_USER / ADMIN_PASSWORD.
  if (authStore.envFingerprint !== fingerprint) {
    const legacyMatches = !authStore.envFingerprint
      && authStore.admin.username === username
      && safeEqual(await passwordHash(password, authStore.admin.salt), authStore.admin.passwordHash);
    if (!legacyMatches) {
      authStore.admin = await createAdminRecord(username, password);
      authStore.sessions = {};
    }
    authStore.envFingerprint = fingerprint;
  }
  pruneSessions();
  await writeAuthStore();
}

function pruneSessions() {
  const now = Date.now();
  for (const [tokenHash, session] of Object.entries(authStore.sessions)) {
    if (!session?.expiresAt || session.expiresAt <= now) delete authStore.sessions[tokenHash];
  }
}

function writeAuthStore() {
  pruneSessions();
  authWritePromise = authWritePromise.then(
    () => atomicWrite(AUTH_FILE, JSON.stringify(authStore, null, 2), 0o600),
    () => atomicWrite(AUTH_FILE, JSON.stringify(authStore, null, 2), 0o600)
  );
  return authWritePromise;
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function sessionKey(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function createSession() {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  authStore.sessions[sessionKey(token)] = { createdAt: now, expiresAt: now + SESSION_TTL_SECONDS * 1000 };
  return token;
}

function sessionCookie(req, token) {
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  return `luma_admin=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_SECONDS}${secure}`;
}

async function verifyAdminPassword(password) {
  return safeEqual(await passwordHash(String(password || ''), authStore.admin.salt), authStore.admin.passwordHash);
}

function getDb() {
  return db;
}

function touchDb() {
  dbVersion += 1;
  stateCache = null;
}

async function atomicWrite(file, data, mode) {
  const tempFile = `${file}.${process.pid}.${++tempCounter}.tmp`;
  try {
    await fsp.writeFile(tempFile, data, mode === undefined ? undefined : { mode });
    await fsp.rename(tempFile, file);
  } catch (error) {
    await fsp.unlink(tempFile).catch(() => {});
    throw error;
  }
}

function writeDb() {
  dbDirty = true;
  if (!dbWritePromise) {
    dbWritePromise = (async () => {
      do {
        dbDirty = false;
        await atomicWrite(DB_FILE, JSON.stringify(db, null, 2));
      } while (dbDirty);
    })().finally(() => {
      dbWritePromise = null;
      if (dbDirty) writeDb().catch(error => console.error(`Could not write library store: ${error.message}`));
    });
  }
  return dbWritePromise;
}

function flushDb() {
  return dbDirty && !dbWritePromise ? writeDb() : (dbWritePromise || Promise.resolve());
}

function schedulePlayStoreWrite() {
  playDirty = true;
  if (playWriteTimer) return;
  playWriteTimer = setTimeout(() => {
    playWriteTimer = null;
    flushPlayStore().catch(error => console.error(`Could not write play store: ${error.message}`));
  }, 750);
  if (playWriteTimer.unref) playWriteTimer.unref();
}

function flushPlayStore(immediate = false) {
  if (immediate) {
    playDirty = true;
    if (playWriteTimer) { clearTimeout(playWriteTimer); playWriteTimer = null; }
  }
  const write = async () => {
    if (!playDirty) return;
    playDirty = false;
    await atomicWrite(PLAYS_FILE, JSON.stringify(playStore));
  };
  playWritePromise = playWritePromise.then(write, write);
  return playWritePromise;
}

async function loadPlayStore() {
  let store = null;
  let created = false;
  try {
    store = JSON.parse(await fsp.readFile(PLAYS_FILE, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') created = true;
    else console.warn(`Could not read play store, rebuilding: ${error.message}`);
    created = true;
  }
  if (!store || typeof store !== 'object' || typeof store.counts !== 'object' || !Array.isArray(store.recent)) {
    store = { counts: {}, recent: [] };
    created = true;
  }
  const trackIds = new Set(db.tracks.map(track => track.id));
  const counts = {};
  let changed = created;
  for (const [trackId, value] of Object.entries(store.counts)) {
    if (!trackIds.has(trackId) || !value || typeof value !== 'object') { changed = true; continue; }
    const count = Number(value.count) || 0;
    const lastPlayedAt = typeof value.lastPlayedAt === 'string' ? value.lastPlayedAt : '';
    counts[trackId] = { count, lastPlayedAt };
    if (count !== value.count || lastPlayedAt !== value.lastPlayedAt) changed = true;
  }
  const recent = [];
  for (const entry of store.recent) {
    if (!entry || !trackIds.has(entry.trackId) || typeof entry.playedAt !== 'string') { changed = true; continue; }
    recent.push({ trackId: entry.trackId, playedAt: entry.playedAt });
    if (recent.length >= RECENT_PLAY_LIMIT) { changed = true; break; }
  }
  store = { counts, recent };
  if (created) {
    for (const track of db.tracks) {
      const count = Number(track.playCount) || 0;
      if (count > 0 || track.lastPlayedAt) store.counts[track.id] = { count, lastPlayedAt: track.lastPlayedAt || '' };
    }
    const seen = new Set();
    const legacyRecent = Array.isArray(db.recentPlays) ? db.recentPlays : [];
    for (const entry of legacyRecent) {
      if (!entry || !trackIds.has(entry.trackId) || typeof entry.playedAt !== 'string' || seen.has(entry.trackId)) continue;
      seen.add(entry.trackId);
      store.recent.push({ trackId: entry.trackId, playedAt: entry.playedAt });
      if (store.recent.length >= RECENT_PLAY_LIMIT) break;
    }
  }
  playStore = store;
  for (const track of db.tracks) {
    const stats = store.counts[track.id];
    if (!stats) continue;
    track.playCount = stats.count;
    track.lastPlayedAt = stats.lastPlayedAt;
  }
  if (changed) await flushPlayStore(true);
}

function json(res, status, value, headers = {}) {
  const body = JSON.stringify(value);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body), ...headers });
  res.end(body);
}

function readJson(req, limit = MAX_JSON) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let length = 0;
    req.on('data', chunk => {
      length += chunk.length;
      if (length > limit) { reject(Object.assign(new Error('请求内容过大'), { status: 413 })); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch { reject(Object.assign(new Error('无效的 JSON 数据'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map(part => part.trim().split(/=(.*)/s).slice(0, 2)).filter(([key, value]) => key && value));
}

function requireAdmin(req, res) {
  const token = parseCookies(req.headers.cookie).luma_admin;
  const session = token && authStore.sessions[sessionKey(token)];
  if (session && session.expiresAt > Date.now()) return true;
  json(res, 401, { error: '请先登录管理端' });
  return false;
}

function extension(filename, fallback) {
  const ext = path.extname(filename || '').toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : fallback;
}

function audioMimeType(ext) {
  return ({
    '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac',
    '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.flac': 'audio/flac',
    '.webm': 'audio/webm'
  })[ext] || 'application/octet-stream';
}

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

const SCHEMA_VERSION = 3;

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
  if (Number(db.schemaVersion || 0) >= SCHEMA_VERSION) return changed;

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

function imageExtension(data) {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return '.jpg';
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return '.png';
  if (data.length >= 6 && ['GIF87a', 'GIF89a'].includes(data.toString('ascii', 0, 6))) return '.gif';
  if (data.length >= 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') return '.webp';
  if (data.length >= 2 && data[0] === 0x42 && data[1] === 0x4d) return '.bmp';
  return '';
}

function embeddedCover(tags) {
  const pictures = tags?.common?.picture || [];
  const ordered = [...pictures].sort((left, right) => Number(right.type === 'Cover (front)') - Number(left.type === 'Cover (front)'));
  for (const picture of ordered) {
    const data = Buffer.from(picture.data || []);
    if (!data.length || data.length > 8 * 1024 * 1024) continue;
    const ext = imageExtension(data);
    if (ext) return { data, ext };
  }
  return null;
}

async function readUpload(req) {
  const tempDir = await fsp.mkdtemp(path.join(DATA_DIR, '.upload-'));
  const fields = {};
  const files = {};
  const writes = [];
  let totalBytes = 0;
  const cleanup = () => fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  try {
    await new Promise((resolve, reject) => {
      let busboy;
      let settled = false;
      const fail = error => {
        if (settled) return;
        settled = true;
        try { req.unpipe(busboy); } catch {}
        req.resume();
        reject(error);
      };
      try {
        busboy = Busboy({ headers: req.headers, limits: { fileSize: MAX_UPLOAD, files: 3, fields: 24, fieldSize: 128 * 1024 } });
      } catch (error) {
        fail(Object.assign(new Error('无效的上传请求'), { status: 400 }));
        return;
      }
      busboy.on('file', (name, stream, info) => {
        if (!['audio', 'cover', 'lyrics'].includes(name)) { stream.resume(); return; }
        const original = path.basename(info.filename || '');
        const target = path.join(tempDir, `${name}-${crypto.randomUUID()}`);
        stream.on('data', chunk => {
          totalBytes += chunk.length;
          if (totalBytes > MAX_UPLOAD + MAX_COVER + MAX_LYRICS) fail(Object.assign(new Error('上传内容过大'), { status: 413 }));
        });
        stream.on('limit', () => fail(Object.assign(new Error('单次上传上限为 60 MB'), { status: 413 })));
        const write = pipeline(stream, fs.createWriteStream(target, { mode: 0o600 }))
          .then(() => fsp.stat(target))
          .then(stat => { files[name] = { filename: original, path: target, size: stat.size }; })
          .catch(fail);
        writes.push(write);
      });
      busboy.on('field', (name, value) => { fields[name] = value; });
      busboy.on('filesLimit', () => fail(Object.assign(new Error('上传文件过多'), { status: 400 })));
      busboy.on('fieldsLimit', () => fail(Object.assign(new Error('上传字段过多'), { status: 400 })));
      busboy.on('partsLimit', () => fail(Object.assign(new Error('上传内容过多'), { status: 400 })));
      busboy.on('error', error => fail(Object.assign(new Error(`上传解析失败：${error.message}`), { status: 400 })));
      busboy.on('close', async () => {
        try {
          await Promise.all(writes);
          if (!settled) { settled = true; resolve(); }
        } catch (error) { fail(error); }
      });
      req.on('aborted', () => fail(Object.assign(new Error('上传已中断'), { status: 400 })));
      req.pipe(busboy);
    });
    if (!files.audio?.size) throw Object.assign(new Error('请选择音乐文件'), { status: 400 });
    if (files.cover && files.cover.size > MAX_COVER) throw Object.assign(new Error('封面图片不能超过 8 MB'), { status: 413 });
    if (files.lyrics && files.lyrics.size > MAX_LYRICS) throw Object.assign(new Error('歌词文件不能超过 500 KB'), { status: 413 });
    return { fields, files, tempDir };
  } catch (error) {
    await Promise.allSettled(writes);
    await cleanup();
    throw error;
  }
}

function safeMediaPath(urlPath) {
  let raw;
  try { raw = decodeURIComponent(urlPath.slice('/media/'.length)); }
  catch { return null; }
  const name = path.basename(raw);
  if (!name || name !== raw) return null;
  return path.join(MEDIA_DIR, name);
}

function mediaMimeType(ext) {
  return ({
    '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.wav': 'audio/wav',
    '.ogg': 'audio/ogg', '.flac': 'audio/flac', '.webm': 'audio/webm',
    '.lrc': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
    '.gif': 'image/gif', '.bmp': 'image/bmp'
  })[ext] || 'application/octet-stream';
}

async function serveMedia(req, res, pathname) {
  const file = safeMediaPath(pathname);
  if (!file) return json(res, 400, { error: '无效的媒体路径' });
  let stat;
  try { stat = await fsp.stat(file); }
  catch { return json(res, 404, { error: '找不到媒体文件' }); }
  if (!stat.isFile()) return json(res, 404, { error: '找不到媒体文件' });
  const ext = path.extname(file).toLowerCase();
  const type = mediaMimeType(ext);
  const baseHeaders = { 'Content-Type': type, 'Cache-Control': PUBLIC_CACHE, 'X-Content-Type-Options': 'nosniff' };
  const range = req.headers.range;
  if (range && type.startsWith('audio/')) {
    const match = range.match(/bytes=(\d*)-(\d*)/);
    if (!match) return res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }).end();
    const start = match[1] ? Number(match[1]) : Math.max(0, stat.size - Number(match[2]));
    const end = match[2] && match[1] ? Math.min(Number(match[2]), stat.size - 1) : stat.size - 1;
    if (start > end || start >= stat.size) return res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }).end();
    res.writeHead(206, { ...baseHeaders, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Accept-Ranges': 'bytes' });
    if (req.method === 'HEAD') return res.end();
    try { await pipeline(fs.createReadStream(file, { start, end }), res); }
    catch (error) { if (!res.destroyed) res.destroy(error); }
    return;
  }
  res.writeHead(200, { ...baseHeaders, 'Content-Length': stat.size, 'Accept-Ranges': type.startsWith('audio/') ? 'bytes' : 'none' });
  if (req.method === 'HEAD') return res.end();
  try { await pipeline(fs.createReadStream(file), res); }
  catch (error) { if (!res.destroyed) res.destroy(error); }
}

const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json; charset=utf-8'
};
const STATIC_FILES = new Map([
  ['/', 'index.html'], ['/index.html', 'index.html'], ['/admin', 'index.html'], ['/admin/', 'index.html'],
  ['/app.js', 'app.js'], ['/styles.css', 'styles.css'],
  ['/bojack-mark.jpg', 'bojack-mark.jpg'], ['/favicon.png', 'favicon.png']
]);
const FONT_RE = /^\/fonts\/[a-z0-9-]+\.woff2$/;

function acceptsEncoding(req, name) {
  const header = req.headers['accept-encoding'] || '';
  return header.split(',').some(part => {
    const [encoding, ...params] = part.trim().split(';');
    if (encoding.toLowerCase() !== name) return false;
    const q = params.find(param => param.trim().startsWith('q='));
    return !q || Number(q.split('=')[1]) > 0;
  });
}

function compressedStatic(file, stat, raw) {
  const cached = staticCache.get(file);
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) return cached;
  const entry = {
    mtimeMs: stat.mtimeMs,
    size: stat.size,
    raw,
    gzip: zlib.gzipSync(raw, { level: 9 }),
    br: zlib.brotliCompressSync(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9 } })
  };
  staticCache.set(file, entry);
  return entry;
}

async function serveStatic(req, res, pathname) {
  const relative = STATIC_FILES.get(pathname) || (FONT_RE.test(pathname) ? pathname.slice(1) : null);
  if (!relative) return json(res, 404, { error: '找不到页面' });
  const file = path.join(ROOT, relative);
  if (!file.startsWith(`${ROOT}${path.sep}`)) return json(res, 403, { error: '禁止访问' });
  let stat;
  try { stat = await fsp.stat(file); }
  catch { return json(res, 404, { error: '找不到页面' }); }
  if (!stat.isFile()) return json(res, 404, { error: '找不到页面' });
  const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
  const cacheControl = relative === 'index.html' || relative === 'app.js' || relative === 'styles.css' ? 'no-cache' : PUBLIC_CACHE;
  const headers = {
    'Content-Type': mimeTypes[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': cacheControl,
    'ETag': etag,
    'X-Content-Type-Options': 'nosniff'
  };
  if (req.headers['if-none-match'] === etag) return res.writeHead(304, headers).end();
  if (relative === 'index.html' || relative === 'app.js' || relative === 'styles.css') {
    const entry = compressedStatic(file, stat, await fsp.readFile(file));
    headers['Vary'] = 'Accept-Encoding';
    let body = entry.raw;
    if (acceptsEncoding(req, 'br')) { body = entry.br; headers['Content-Encoding'] = 'br'; }
    else if (acceptsEncoding(req, 'gzip')) { body = entry.gzip; headers['Content-Encoding'] = 'gzip'; }
    headers['Content-Length'] = body.length;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    return res.end(body);
  }
  headers['Content-Length'] = stat.size;
  res.writeHead(200, headers);
  if (req.method === 'HEAD') return res.end();
  try { await pipeline(fs.createReadStream(file), res); }
  catch (error) { if (!res.destroyed) res.destroy(error); }
}

function buildStatePayload() {
  return {
    ...db,
    tracks: db.tracks.map(track => {
      const { lyrics, ...rest } = track;
      return { ...rest, hasLyrics: Boolean(lyrics || track.lyricsUrl) };
    }),
    recentPlays: playStore?.recent || []
  };
}

function getStateCache() {
  if (stateCache && stateCache.version === dbVersion) return stateCache;
  const body = Buffer.from(JSON.stringify(buildStatePayload()));
  stateCache = {
    version: dbVersion,
    body,
    gzip: zlib.gzipSync(body, { level: 6 }),
    etag: `W/"${INSTANCE_ID}-${dbVersion}-${body.length}"`
  };
  return stateCache;
}

const playRate = new Map();
function allowPlayReport(ip) {
  const now = Date.now();
  let entry = playRate.get(ip);
  if (!entry || entry.reset <= now) {
    entry = { count: 0, reset: now + 60_000 };
    playRate.set(ip, entry);
  }
  entry.count += 1;
  if (playRate.size > 5000) {
    for (const [key, value] of playRate) if (value.reset <= now) playRate.delete(key);
  }
  return entry.count <= 120;
}

async function handleApi(req, res, url) {
  const { pathname } = url;
  if (req.method === 'GET' && pathname === '/api/state') {
    const cache = getStateCache();
    if (req.headers['if-none-match'] === cache.etag) {
      return res.writeHead(304, { ETag: cache.etag, 'Cache-Control': 'no-cache', Vary: 'Accept-Encoding' }).end();
    }
    const useGzip = acceptsEncoding(req, 'gzip');
    const body = useGzip ? cache.gzip : cache.body;
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': body.length,
      'ETag': cache.etag,
      'Cache-Control': 'no-cache',
      'Vary': 'Accept-Encoding',
      ...(useGzip ? { 'Content-Encoding': 'gzip' } : {})
    });
    return res.end(body);
  }
  const lyricsMatch = pathname.match(/^\/api\/tracks\/([^/]+)\/lyrics$/);
  if (req.method === 'GET' && lyricsMatch) {
    let id;
    try { id = decodeURIComponent(lyricsMatch[1]); }
    catch { return json(res, 400, { error: '无效的歌曲编号' }); }
    const track = db.tracks.find(item => item.id === id);
    if (!track) return json(res, 404, { error: '找不到这首歌' });
    let lyrics = track.lyrics || '';
    if (!lyrics && track.lyricsUrl?.startsWith('/media/')) {
      const file = safeMediaPath(track.lyricsUrl);
      if (file) {
        try {
          const stat = await fsp.stat(file);
          if (stat.isFile() && stat.size <= MAX_LYRICS) lyrics = await fsp.readFile(file, 'utf8');
        } catch { /* Lyrics are optional. */ }
      }
    }
    return json(res, 200, { lyrics, lyricsUrl: track.lyricsUrl || '' }, { 'Cache-Control': 'public, max-age=3600' });
  }
  if (req.method === 'GET' && pathname === '/api/session') {
    const token = parseCookies(req.headers.cookie).luma_admin;
    const session = token && authStore.sessions[sessionKey(token)];
    const authenticated = Boolean(session && session.expiresAt > Date.now());
    return json(res, 200, authenticated ? { authenticated, username: authStore.admin.username } : { authenticated });
  }
  if (req.method === 'POST' && pathname === '/api/login') {
    const body = await readJson(req);
    const userOk = safeEqual(String(body.username || '').trim(), authStore.admin.username);
    const passOk = await verifyAdminPassword(body.password);
    if (!userOk || !passOk) return json(res, 401, { error: '账号或密码不正确' });
    const token = createSession();
    await writeAuthStore();
    return json(res, 200, { ok: true, username: authStore.admin.username }, { 'Set-Cookie': sessionCookie(req, token) });
  }
  if (req.method === 'POST' && pathname === '/api/logout') {
    const token = parseCookies(req.headers.cookie).luma_admin;
    if (token) delete authStore.sessions[sessionKey(token)];
    await writeAuthStore();
    return json(res, 200, { ok: true }, { 'Set-Cookie': 'luma_admin=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' });
  }
  if (req.method === 'POST' && pathname === '/api/plays') {
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
    if (!allowPlayReport(ip)) return json(res, 429, { error: '播放上报过于频繁' });
    const body = await readJson(req, 8 * 1024);
    const trackId = String(body.trackId || '');
    const track = db.tracks.find(item => item.id === trackId);
    if (!track) return json(res, 404, { error: '找不到这首歌' });
    const now = Date.now();
    const last = playStore.recent[0];
    const lastAt = last ? new Date(last.playedAt).getTime() : 0;
    // Ignore duplicate reports (for example a quick page reload) for the same track.
    if (last && last.trackId === trackId && now - lastAt < 10000) {
      return json(res, 200, { ok: true, counted: false, trackId, playCount: Number(track.playCount) || 0, lastPlayedAt: track.lastPlayedAt || '' });
    }
    track.playCount = (Number(track.playCount) || 0) + 1;
    track.lastPlayedAt = new Date(now).toISOString();
    playStore.counts[trackId] = { count: track.playCount, lastPlayedAt: track.lastPlayedAt };
    playStore.recent.unshift({ trackId, playedAt: track.lastPlayedAt });
    if (playStore.recent.length > RECENT_PLAY_LIMIT) playStore.recent.length = RECENT_PLAY_LIMIT;
    db.recentPlays = playStore.recent;
    touchDb();
    schedulePlayStoreWrite();
    return json(res, 200, { ok: true, counted: true, trackId, playCount: track.playCount, lastPlayedAt: track.lastPlayedAt });
  }
  if (!pathname.startsWith('/api/admin/')) return json(res, 404, { error: '未知接口' });
  if (!requireAdmin(req, res)) return;

  if (req.method === 'PUT' && pathname === '/api/admin/credentials') {
    const body = await readJson(req);
    const currentPassword = String(body.currentPassword || '');
    if (!currentPassword) return json(res, 400, { error: '请输入当前密码' });
    if (!(await verifyAdminPassword(currentPassword))) return json(res, 403, { error: '当前密码不正确' });
    const currentUsername = authStore.admin.username;
    const username = body.username === undefined ? currentUsername : String(body.username).trim();
    if (!username) return json(res, 400, { error: '管理员账号不能为空' });
    const usernameChanged = username !== currentUsername;
    if (usernameChanged) {
      if (username.length < 2 || username.length > 64) return json(res, 400, { error: '账号长度需为 2–64 个字符' });
      if (/\s/.test(username)) return json(res, 400, { error: '账号不能包含空格' });
    }
    const newPassword = String(body.newPassword || '');
    if (newPassword) {
      if (newPassword.length < 8 || newPassword.length > 128) return json(res, 400, { error: '新密码长度需为 8–128 个字符' });
      if (newPassword === currentPassword) return json(res, 400, { error: '新密码不能与当前密码相同' });
    }
    if (!usernameChanged && !newPassword) return json(res, 400, { error: '账号和密码都未修改' });
    authStore.admin = await createAdminRecord(username, newPassword || currentPassword);
    // Rotate the session so existing cookies on other devices stop working.
    authStore.sessions = {};
    const token = createSession();
    await writeAuthStore();
    return json(res, 200, { ok: true, username }, { 'Set-Cookie': sessionCookie(req, token) });
  }

  if (req.method === 'DELETE' && pathname === '/api/admin/plays') {
    playStore.counts = {};
    playStore.recent = [];
    db.recentPlays = playStore.recent;
    for (const track of db.tracks) {
      track.playCount = 0;
      track.lastPlayedAt = '';
    }
    touchDb();
    await writeDb();
    await flushPlayStore(true);
    return json(res, 200, { ok: true });
  }

  if (req.method === 'POST' && pathname === '/api/admin/upload') {
    const { fields, files, tempDir } = await readUpload(req);
    try {
      const audio = files.audio;
      if (!audio?.size) return json(res, 400, { error: '请选择音乐文件' });
      const allowedAudio = new Set(['.mp3', '.m4a', '.aac', '.wav', '.ogg', '.flac', '.webm']);
      const audioExt = extension(audio.filename, '.mp3');
      if (!allowedAudio.has(audioExt)) return json(res, 400, { error: '音乐格式支持 MP3、M4A、AAC、WAV、OGG、FLAC、WebM' });
      if (files.cover && files.cover.size > MAX_COVER) return json(res, 413, { error: '封面图片不能超过 8 MB' });
      if (files.lyrics && files.lyrics.size > MAX_LYRICS) return json(res, 413, { error: '歌词文件不能超过 500 KB' });
      let tags = null;
      try {
        tags = await parseFile(audio.path, { mimeType: audioMimeType(audioExt) });
      } catch (error) {
        console.warn(`Could not read audio tags from ${audio.filename}: ${error.message}`);
      }
      const id = crypto.randomUUID();
      const audioName = `${id}${audioExt}`;
      await fsp.rename(audio.path, path.join(MEDIA_DIR, audioName));
      let lyrics = '';
      let lyricsUrl = '';
      if (files.lyrics?.size) {
        const lyricsName = `${id}${extension(files.lyrics.filename, '.lrc')}`;
        lyrics = await fsp.readFile(files.lyrics.path, 'utf8');
        await fsp.rename(files.lyrics.path, path.join(MEDIA_DIR, lyricsName));
        lyricsUrl = `/media/${lyricsName}`;
      }
      let coverUrl = String(fields.coverUrl || '').trim();
      const hasManualCover = Boolean(files.cover?.size);
      if (hasManualCover) {
        const coverName = `${id}${extension(files.cover.filename, '.jpg')}`;
        await fsp.rename(files.cover.path, path.join(MEDIA_DIR, coverName));
        coverUrl = `/media/${coverName}`;
      } else if (!coverUrl) {
        const picture = embeddedCover(tags);
        if (picture) {
          const coverName = `${id}-cover${picture.ext}`;
          await fsp.writeFile(path.join(MEDIA_DIR, coverName), picture.data);
          coverUrl = `/media/${coverName}`;
        }
      }
      const db = getDb();
      const taggedArtistNames = namesFromTag(tags?.common?.artists, tags?.common?.artist);
      const taggedAlbumArtistNames = namesFromTag(tags?.common?.albumartists, tags?.common?.albumartist);
      const manualArtist = cleanTag(fields.artist);
      const artistNames = uniqueArtistNames(manualArtist ? splitArtistText(manualArtist) : taggedArtistNames);
      if (!artistNames.length) artistNames.push('未知艺人');
      const artist = artistNames.join(', ');
      const title = cleanTag(fields.title) || cleanTag(tags?.common?.title) || path.basename(audio.filename, path.extname(audio.filename));
      const albumTitle = cleanTag(fields.album) || cleanTag(tags?.common?.album);
      const albumArtistNames = uniqueArtistNames(
        manualArtist ? artistNames : (taggedAlbumArtistNames.length ? taggedAlbumArtistNames : artistNames)
      );
      const albumArtist = albumArtistNames.join(' / ') || artist;
      const hasTaggedAlbumArtist = !manualArtist && taggedAlbumArtistNames.length > 0;
      const duration = Number.isFinite(tags?.format?.duration) ? Math.round(tags.format.duration) : 0;
      let album = null;
      let albumCreated = false;
      if (albumTitle) {
        album = findAlbum(db, albumTitle, albumArtist, hasTaggedAlbumArtist);
        if (!album) {
          album = { id: crypto.randomUUID(), title: albumTitle, artist: albumArtist, artistNames: albumArtistNames, description: '', coverUrl, createdAt: new Date().toISOString() };
          db.albums.unshift(album);
          albumCreated = true;
        } else {
          if (!album.artist) album.artist = albumArtist;
          if (!Array.isArray(album.artistNames) || !album.artistNames.length) album.artistNames = albumArtistNames;
          if (!album.coverUrl && coverUrl) album.coverUrl = coverUrl;
        }
      }
      const artistResults = [];
      const seenArtistKeys = new Set();
      for (const name of [...artistNames, ...albumArtistNames]) {
        const key = normalizeKey(name);
        if (!key || seenArtistKeys.has(key)) continue;
        seenArtistKeys.add(key);
        const result = ensureArtist(db, name, coverUrl);
        if (result.artist) artistResults.push(result);
      }
      const track = { id, title, artist, artistNames, album: albumTitle, albumId: album?.id || '', genre: String(fields.genre || '未分类'), duration, coverUrl: coverUrl || DEFAULT_TRACK_COVER, src: `/media/${audioName}`, lyrics, lyricsUrl, playCount: 0, lastPlayedAt: '', createdAt: new Date().toISOString() };
      db.tracks.unshift(track);
      touchDb();
      await writeDb();
      return json(res, 201, {
        track,
        metadata: {
          title: Boolean(cleanTag(tags?.common?.title)),
          artist: Boolean(taggedArtistNames.length),
          album: Boolean(cleanTag(tags?.common?.album)),
          albumArtist: Boolean(taggedAlbumArtistNames.length),
          cover: !hasManualCover && Boolean(coverUrl.startsWith('/media/'))
        },
        created: {
          album: albumCreated,
          artists: artistResults.filter(item => item.created).map(item => item.artist.name)
        },
        library: {
          album: album ? { id: album.id, title: album.title, artist: album.artist } : null,
          artists: artistResults.map(item => ({ id: item.artist.id, name: item.artist.name, created: item.created }))
        }
      });
    } finally {
      await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  if (req.method === 'POST' && pathname === '/api/admin/albums') {
    const body = await readJson(req);
    if (!String(body.title || '').trim()) return json(res, 400, { error: '专辑名称不能为空' });
    const db = getDb();
    const artist = String(body.artist || '未知艺人').trim() || '未知艺人';
    const artistNames = uniqueArtistNames(splitArtistText(artist));
    const album = { id: crypto.randomUUID(), title: String(body.title).trim(), artist, artistNames, description: String(body.description || '').trim(), coverUrl: String(body.coverUrl || '') };
    db.albums.unshift(album);
    for (const name of artistNames) ensureArtist(db, name, album.coverUrl);
    touchDb();
    await writeDb();
    return json(res, 201, { album });
  }

  const albumMatch = pathname.match(/^\/api\/admin\/albums\/([^/]+)$/);
  if (albumMatch && req.method === 'DELETE') {
    const db = getDb();
    const id = decodeURIComponent(albumMatch[1]);
    const album = db.albums.find(item => item.id === id);
    if (!album) return json(res, 404, { error: '找不到这张专辑' });
    db.albums = db.albums.filter(item => item.id !== id);
    db.tracks.forEach(track => {
      if (track.albumId === album.id || (!track.albumId && track.album === album.title)) {
        track.album = '';
        track.albumId = '';
      }
    });
    touchDb();
    await writeDb();
    return json(res, 200, { ok: true });
  }

  const artistMatch = pathname.match(/^\/api\/admin\/artists\/([^/]+)$/);
  if (artistMatch && req.method === 'DELETE') {
    const db = getDb();
    const id = decodeURIComponent(artistMatch[1]);
    const next = db.artists.filter(item => item.id !== id);
    if (next.length === db.artists.length) return json(res, 404, { error: '找不到这位歌手' });
    db.artists = next;
    touchDb();
    await writeDb();
    return json(res, 200, { ok: true });
  }

  if (req.method === 'POST' && pathname === '/api/admin/playlists') {
    const body = await readJson(req);
    if (!String(body.title || '').trim()) return json(res, 400, { error: '歌单名称不能为空' });
    const db = getDb();
    const validTrackIds = new Set(db.tracks.map(track => track.id));
    const playlist = { id: crypto.randomUUID(), title: String(body.title).trim(), description: String(body.description || '').trim(), coverUrl: String(body.coverUrl || ''), trackIds: Array.isArray(body.trackIds) ? [...new Set(body.trackIds.filter(id => validTrackIds.has(id)))] : [] };
    db.playlists.unshift(playlist);
    touchDb();
    await writeDb();
    return json(res, 201, { playlist });
  }

  const playlistMatch = pathname.match(/^\/api\/admin\/playlists\/([^/]+)$/);
  if (playlistMatch && req.method === 'PUT') {
    const body = await readJson(req);
    const db = getDb();
    const playlist = db.playlists.find(item => item.id === decodeURIComponent(playlistMatch[1]));
    if (!playlist) return json(res, 404, { error: '找不到这个歌单' });
    const requested = Array.isArray(body.trackIds) ? body.trackIds : [];
    const validTrackIds = new Set(db.tracks.map(track => track.id));
    playlist.trackIds = [...new Set(requested.filter(id => validTrackIds.has(id)))];
    touchDb();
    await writeDb();
    return json(res, 200, { playlist });
  }
  if (playlistMatch && req.method === 'DELETE') {
    const db = getDb();
    const next = db.playlists.filter(item => item.id !== decodeURIComponent(playlistMatch[1]));
    if (next.length === db.playlists.length) return json(res, 404, { error: '找不到这个歌单' });
    db.playlists = next;
    touchDb();
    await writeDb();
    return json(res, 200, { ok: true });
  }

  const trackMatch = pathname.match(/^\/api\/admin\/tracks\/([^/]+)$/);
  if (trackMatch && req.method === 'DELETE') {
    const db = getDb();
    const id = decodeURIComponent(trackMatch[1]);
    const removedTrack = db.tracks.find(track => track.id === id);
    if (!removedTrack) return json(res, 404, { error: '找不到这首歌' });
    const next = db.tracks.filter(track => track.id !== id);
    db.tracks = next;
    db.playlists.forEach(playlist => { playlist.trackIds = playlist.trackIds.filter(trackId => trackId !== id); });
    delete playStore.counts[id];
    playStore.recent = playStore.recent.filter(entry => entry.trackId !== id);
    db.recentPlays = playStore.recent;
    touchDb();
    await writeDb();
    await flushPlayStore(true);
    for (const mediaUrl of [removedTrack.src, removedTrack.coverUrl, removedTrack.lyricsUrl]) {
      if (!mediaUrl?.startsWith('/media/')) continue;
      const filename = path.basename(mediaUrl.slice('/media/'.length));
      if (filename.startsWith(id)) await fsp.unlink(path.join(MEDIA_DIR, filename)).catch(() => {});
    }
    return json(res, 200, { ok: true });
  }
  return json(res, 404, { error: '未知管理接口' });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if ((req.method === 'GET' || req.method === 'HEAD') && url.pathname === '/healthz') return json(res, 200, { ok: true });
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (url.pathname.startsWith('/media/')) return await serveMedia(req, res, url.pathname);
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: '不支持的请求方式' });
    return await serveStatic(req, res, url.pathname);
  } catch (error) {
    if (!res.headersSent) json(res, error.status || 500, { error: error.message || '服务器出错' });
    else if (!res.destroyed) res.destroy(error);
  }
});
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

async function shutdown() {
  try { await Promise.allSettled([flushPlayStore(true), flushDb()]); } catch {}
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

ensureStore().then(() => {
  server.listen(PORT, '0.0.0.0', () => console.log(`一头诗人 running at http://localhost:${PORT}`));
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
