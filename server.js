const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { parseBuffer } = require('music-metadata');

const ROOT = __dirname;
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const MEDIA_DIR = path.join(DATA_DIR, 'media');
const DB_FILE = path.join(DATA_DIR, 'library.json');
const AUTH_FILE = path.join(DATA_DIR, 'auth.json');
const PORT = Number(process.env.PORT || 4173);
const MAX_UPLOAD = 60 * 1024 * 1024;
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const RECENT_PLAY_LIMIT = 200;
const DEFAULT_TRACK_COVER = 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=720&q=85';
let authStore;

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

async function ensureStore() {
  await fsp.mkdir(MEDIA_DIR, { recursive: true });
  let db;
  let shouldWrite = false;
  try {
    db = JSON.parse(await fsp.readFile(DB_FILE, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn(`Could not read library store: ${error.message}`);
    db = structuredClone(seed);
    shouldWrite = true;
  }
  if (migrateDb(db)) shouldWrite = true;
  if (shouldWrite) await writeDb(db);
  await initializeAuthStore();
}

function passwordHash(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
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

function createAdminRecord(username, password, updatedAt = new Date().toISOString()) {
  const salt = crypto.randomBytes(16).toString('hex');
  return { username, salt, passwordHash: passwordHash(password, salt), updatedAt };
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
    authStore = { admin: createAdminRecord(username, password), sessions: {}, envFingerprint: fingerprint };
    await writeAuthStore();
    return;
  }

  // Environment credentials only reset the store when their values change.
  // This keeps account changes made in the admin UI across restarts while
  // keeping the documented behavior of rotating ADMIN_USER / ADMIN_PASSWORD.
  if (authStore.envFingerprint !== fingerprint) {
    const legacyMatches = !authStore.envFingerprint
      && authStore.admin.username === username
      && safeEqual(passwordHash(password, authStore.admin.salt), authStore.admin.passwordHash);
    if (!legacyMatches) {
      authStore.admin = createAdminRecord(username, password);
      authStore.sessions = {};
    }
    authStore.envFingerprint = fingerprint;
  }
  const now = Date.now();
  for (const [tokenHash, session] of Object.entries(authStore.sessions)) {
    if (!session?.expiresAt || session.expiresAt <= now) delete authStore.sessions[tokenHash];
  }
  await writeAuthStore();
}

async function writeAuthStore() {
  const tempFile = `${AUTH_FILE}.${process.pid}.tmp`;
  await fsp.writeFile(tempFile, JSON.stringify(authStore, null, 2), { mode: 0o600 });
  await fsp.rename(tempFile, AUTH_FILE);
  await fsp.chmod(AUTH_FILE, 0o600);
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

function verifyAdminPassword(password) {
  return safeEqual(passwordHash(String(password || ''), authStore.admin.salt), authStore.admin.passwordHash);
}

async function readDb() {
  try { return JSON.parse(await fsp.readFile(DB_FILE, 'utf8')); }
  catch { return structuredClone(seed); }
}

async function writeDb(db) {
  const tempFile = `${DB_FILE}.${process.pid}.tmp`;
  await fsp.writeFile(tempFile, JSON.stringify(db, null, 2));
  await fsp.rename(tempFile, DB_FILE);
}

function json(res, status, value, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(value));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let length = 0;
    req.on('data', chunk => {
      length += chunk.length;
      if (length > 1024 * 1024) { reject(Object.assign(new Error('请求内容过大'), { status: 413 })); req.destroy(); return; }
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

function parseMultipart(buffer, contentType) {
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) throw Object.assign(new Error('缺少上传边界信息'), { status: 400 });
  const delimiter = Buffer.from(`--${boundaryMatch[1] || boundaryMatch[2]}`);
  const fields = {};
  const files = {};
  let cursor = 0;
  while (true) {
    const start = buffer.indexOf(delimiter, cursor);
    if (start < 0) break;
    cursor = start + delimiter.length;
    if (buffer.subarray(cursor, cursor + 2).toString() === '--') break;
    if (buffer.subarray(cursor, cursor + 2).toString() === '\r\n') cursor += 2;
    const headerEnd = buffer.indexOf(Buffer.from('\r\n\r\n'), cursor);
    if (headerEnd < 0) break;
    const headers = buffer.subarray(cursor, headerEnd).toString('utf8');
    const next = buffer.indexOf(delimiter, headerEnd + 4);
    if (next < 0) break;
    let end = next;
    if (buffer.subarray(end - 2, end).toString() === '\r\n') end -= 2;
    const body = buffer.subarray(headerEnd + 4, end);
    const disposition = headers.match(/content-disposition:\s*form-data;([^\r\n]+)/i)?.[1] || '';
    const name = disposition.match(/name="([^"]+)"/)?.[1];
    const filename = disposition.match(/filename="([^"]*)"/)?.[1];
    if (name && filename) files[name] = { filename: path.basename(filename), data: body };
    else if (name) fields[name] = body.toString('utf8');
    cursor = next;
  }
  return { fields, files };
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
  const declaredLength = Number(req.headers['content-length'] || 0);
  if (declaredLength > MAX_UPLOAD) throw Object.assign(new Error('单次上传上限为 60 MB'), { status: 413 });
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > MAX_UPLOAD) throw Object.assign(new Error('单次上传上限为 60 MB'), { status: 413 });
    chunks.push(chunk);
  }
  return parseMultipart(Buffer.concat(chunks), req.headers['content-type'] || '');
}

function safeMediaPath(urlPath) {
  const name = path.basename(decodeURIComponent(urlPath.slice('/media/'.length)));
  if (!name || name !== urlPath.slice('/media/'.length)) return null;
  return path.join(MEDIA_DIR, name);
}

async function serveMedia(req, res, pathname) {
  const file = safeMediaPath(pathname);
  if (!file) return json(res, 400, { error: '无效的媒体路径' });
  let stat;
  try { stat = await fsp.stat(file); }
  catch { return json(res, 404, { error: '找不到媒体文件' }); }
  const ext = path.extname(file).toLowerCase();
  const type = ({ '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.flac': 'audio/flac', '.webm': 'audio/webm', '.lrc': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' })[ext] || 'application/octet-stream';
  const range = req.headers.range;
  if (range && type.startsWith('audio/')) {
    const match = range.match(/bytes=(\d*)-(\d*)/);
    if (!match) return res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }).end();
    const start = match[1] ? Number(match[1]) : Math.max(0, stat.size - Number(match[2]));
    const end = match[2] && match[1] ? Math.min(Number(match[2]), stat.size - 1) : stat.size - 1;
    if (start > end || start >= stat.size) return res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }).end();
    res.writeHead(206, { 'Content-Type': type, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=31536000, immutable' });
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': stat.size, 'Accept-Ranges': type.startsWith('audio/') ? 'bytes' : 'none', 'Cache-Control': 'public, max-age=3600' });
  fs.createReadStream(file).pipe(res);
}

const mimeTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };

async function serveStatic(res, pathname) {
  let requested = pathname === '/' || pathname === '/admin' ? '/index.html' : pathname;
  let file;
  try { file = path.resolve(ROOT, `.${decodeURIComponent(requested)}`); }
  catch { return json(res, 400, { error: '无效路径' }); }
  if (!file.startsWith(`${ROOT}${path.sep}`)) return json(res, 403, { error: '禁止访问' });
  try {
    const stat = await fsp.stat(file);
    if (!stat.isFile()) throw new Error('not a file');
    res.writeHead(200, { 'Content-Type': mimeTypes[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  } catch {
    json(res, 404, { error: '找不到页面' });
  }
}

async function handleApi(req, res, url) {
  const { pathname } = url;
  if (req.method === 'GET' && pathname === '/api/state') {
    const db = await readDb();
    return json(res, 200, db);
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
    const passOk = verifyAdminPassword(body.password);
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
    const body = await readJson(req);
    const trackId = String(body.trackId || '');
    const db = await readDb();
    const track = db.tracks.find(item => item.id === trackId);
    if (!track) return json(res, 404, { error: '找不到这首歌' });
    if (!Array.isArray(db.recentPlays)) db.recentPlays = [];
    const now = Date.now();
    const last = db.recentPlays[0];
    const lastAt = last ? new Date(last.playedAt).getTime() : 0;
    // Ignore duplicate reports (for example a quick page reload) for the same track.
    if (last && last.trackId === trackId && now - lastAt < 10000) {
      return json(res, 200, { ok: true, counted: false, trackId, playCount: Number(track.playCount) || 0, lastPlayedAt: track.lastPlayedAt || '' });
    }
    track.playCount = (Number(track.playCount) || 0) + 1;
    track.lastPlayedAt = new Date(now).toISOString();
    db.recentPlays.unshift({ trackId, playedAt: track.lastPlayedAt });
    db.recentPlays = db.recentPlays.slice(0, RECENT_PLAY_LIMIT);
    await writeDb(db);
    return json(res, 200, { ok: true, counted: true, trackId, playCount: track.playCount, lastPlayedAt: track.lastPlayedAt });
  }
  if (!pathname.startsWith('/api/admin/')) return json(res, 404, { error: '未知接口' });
  if (!requireAdmin(req, res)) return;

  if (req.method === 'PUT' && pathname === '/api/admin/credentials') {
    const body = await readJson(req);
    const currentPassword = String(body.currentPassword || '');
    if (!currentPassword) return json(res, 400, { error: '请输入当前密码' });
    if (!verifyAdminPassword(currentPassword)) return json(res, 403, { error: '当前密码不正确' });
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
    authStore.admin = createAdminRecord(username, newPassword || currentPassword);
    // Rotate the session so existing cookies on other devices stop working.
    authStore.sessions = {};
    const token = createSession();
    await writeAuthStore();
    return json(res, 200, { ok: true, username }, { 'Set-Cookie': sessionCookie(req, token) });
  }

  if (req.method === 'DELETE' && pathname === '/api/admin/plays') {
    const db = await readDb();
    db.recentPlays = [];
    for (const track of db.tracks) {
      track.playCount = 0;
      track.lastPlayedAt = '';
    }
    await writeDb(db);
    return json(res, 200, { ok: true });
  }

  if (req.method === 'POST' && pathname === '/api/admin/upload') {
    const { fields, files } = await readUpload(req);
    const audio = files.audio;
    if (!audio?.data.length) return json(res, 400, { error: '请选择音乐文件' });
    const allowedAudio = new Set(['.mp3', '.m4a', '.aac', '.wav', '.ogg', '.flac', '.webm']);
    const audioExt = extension(audio.filename, '.mp3');
    if (!allowedAudio.has(audioExt)) return json(res, 400, { error: '音乐格式支持 MP3、M4A、AAC、WAV、OGG、FLAC、WebM' });
    if (files.lyrics?.data.length > 500 * 1024) return json(res, 413, { error: '歌词文件不能超过 500 KB' });
    if (files.cover?.data.length > 8 * 1024 * 1024) return json(res, 413, { error: '封面图片不能超过 8 MB' });
    let tags = null;
    try {
      tags = await parseBuffer(audio.data, { mimeType: audioMimeType(audioExt) });
    } catch (error) {
      console.warn(`Could not read audio tags from ${audio.filename}: ${error.message}`);
    }
    const id = crypto.randomUUID();
    const audioName = `${id}${audioExt}`;
    await fsp.writeFile(path.join(MEDIA_DIR, audioName), audio.data);
    let lyrics = '';
    let lyricsUrl = '';
    if (files.lyrics?.data.length) {
      const lyricsName = `${id}${extension(files.lyrics.filename, '.lrc')}`;
      await fsp.writeFile(path.join(MEDIA_DIR, lyricsName), files.lyrics.data);
      lyrics = files.lyrics.data.toString('utf8');
      lyricsUrl = `/media/${lyricsName}`;
    }
    let coverUrl = String(fields.coverUrl || '').trim();
    const hasManualCover = Boolean(files.cover?.data.length);
    if (files.cover?.data.length) {
      const coverName = `${id}${extension(files.cover.filename, '.jpg')}`;
      await fsp.writeFile(path.join(MEDIA_DIR, coverName), files.cover.data);
      coverUrl = `/media/${coverName}`;
    } else if (!coverUrl) {
      const picture = embeddedCover(tags);
      if (picture) {
        const coverName = `${id}-cover${picture.ext}`;
        await fsp.writeFile(path.join(MEDIA_DIR, coverName), picture.data);
        coverUrl = `/media/${coverName}`;
      }
    }
    const db = await readDb();
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
    const track = { id, title, artist, artistNames, album: albumTitle, albumId: album?.id || '', genre: String(fields.genre || '未分类'), duration, coverUrl: coverUrl || DEFAULT_TRACK_COVER, src: `/media/${audioName}`, lyrics, lyricsUrl, createdAt: new Date().toISOString() };
    db.tracks.unshift(track);
    await writeDb(db);
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
  }

  if (req.method === 'POST' && pathname === '/api/admin/albums') {
    const body = await readJson(req);
    if (!String(body.title || '').trim()) return json(res, 400, { error: '专辑名称不能为空' });
    const db = await readDb();
    const artist = String(body.artist || '未知艺人').trim() || '未知艺人';
    const artistNames = uniqueArtistNames(splitArtistText(artist));
    const album = { id: crypto.randomUUID(), title: String(body.title).trim(), artist, artistNames, description: String(body.description || '').trim(), coverUrl: String(body.coverUrl || '') };
    db.albums.unshift(album);
    for (const name of artistNames) ensureArtist(db, name, album.coverUrl);
    await writeDb(db);
    return json(res, 201, { album });
  }

  const albumMatch = pathname.match(/^\/api\/admin\/albums\/([^/]+)$/);
  if (albumMatch && req.method === 'DELETE') {
    const db = await readDb();
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
    await writeDb(db);
    return json(res, 200, { ok: true });
  }

  const artistMatch = pathname.match(/^\/api\/admin\/artists\/([^/]+)$/);
  if (artistMatch && req.method === 'DELETE') {
    const db = await readDb();
    const id = decodeURIComponent(artistMatch[1]);
    const next = db.artists.filter(item => item.id !== id);
    if (next.length === db.artists.length) return json(res, 404, { error: '找不到这位歌手' });
    db.artists = next;
    await writeDb(db);
    return json(res, 200, { ok: true });
  }

  if (req.method === 'POST' && pathname === '/api/admin/playlists') {
    const body = await readJson(req);
    if (!String(body.title || '').trim()) return json(res, 400, { error: '歌单名称不能为空' });
    const db = await readDb();
    const playlist = { id: crypto.randomUUID(), title: String(body.title).trim(), description: String(body.description || '').trim(), coverUrl: String(body.coverUrl || ''), trackIds: Array.isArray(body.trackIds) ? [...new Set(body.trackIds.filter(id => db.tracks.some(track => track.id === id)))] : [] };
    db.playlists.unshift(playlist);
    await writeDb(db);
    return json(res, 201, { playlist });
  }

  const playlistMatch = pathname.match(/^\/api\/admin\/playlists\/([^/]+)$/);
  if (playlistMatch && req.method === 'PUT') {
    const body = await readJson(req);
    const db = await readDb();
    const playlist = db.playlists.find(item => item.id === decodeURIComponent(playlistMatch[1]));
    if (!playlist) return json(res, 404, { error: '找不到这个歌单' });
    const requested = Array.isArray(body.trackIds) ? body.trackIds : [];
    playlist.trackIds = [...new Set(requested.filter(id => db.tracks.some(track => track.id === id)))];
    await writeDb(db);
    return json(res, 200, { playlist });
  }
  if (playlistMatch && req.method === 'DELETE') {
    const db = await readDb();
    const next = db.playlists.filter(item => item.id !== decodeURIComponent(playlistMatch[1]));
    if (next.length === db.playlists.length) return json(res, 404, { error: '找不到这个歌单' });
    db.playlists = next;
    await writeDb(db);
    return json(res, 200, { ok: true });
  }

  const trackMatch = pathname.match(/^\/api\/admin\/tracks\/([^/]+)$/);
  if (trackMatch && req.method === 'DELETE') {
    const db = await readDb();
    const id = decodeURIComponent(trackMatch[1]);
    const removedTrack = db.tracks.find(track => track.id === id);
    if (!removedTrack) return json(res, 404, { error: '找不到这首歌' });
    const next = db.tracks.filter(track => track.id !== id);
    db.tracks = next;
    db.playlists.forEach(playlist => { playlist.trackIds = playlist.trackIds.filter(trackId => trackId !== id); });
    db.recentPlays = (db.recentPlays || []).filter(entry => entry.trackId !== id);
    await writeDb(db);
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
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (url.pathname.startsWith('/media/')) return await serveMedia(req, res, url.pathname);
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: '不支持的请求方式' });
    return await serveStatic(res, url.pathname);
  } catch (error) {
    if (!res.headersSent) json(res, error.status || 500, { error: error.message || '服务器出错' });
    else res.destroy(error);
  }
});

ensureStore().then(() => {
  server.listen(PORT, '0.0.0.0', () => console.log(`一头诗人 running at http://localhost:${PORT}`));
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
