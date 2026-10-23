const fsp = require('node:fs/promises');
const zlib = require('node:zlib');
const { INSTANCE_ID, MAX_LYRICS } = require('../config');
const { json, readJson } = require('../lib/http');
const { safeMediaPath } = require('../lib/files');
const { getDb, getDbVersion, buildStatePayload } = require('../store/library');
const { getRecentPlays, recordPlay } = require('../store/plays');
const {
  isAuthenticated,
  getAdminUsername,
  authenticate,
  logout,
  sessionCookie
} = require('../store/auth');

let stateCache = null;

function getStateCache() {
  const version = getDbVersion();
  if (stateCache && stateCache.version === version) return stateCache;
  const body = Buffer.from(JSON.stringify(buildStatePayload(getRecentPlays())));
  stateCache = {
    version,
    body,
    gzip: zlib.gzipSync(body, { level: 6 }),
    etag: `W/"${INSTANCE_ID}-${version}-${body.length}"`
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

async function handlePublic(req, res, url) {
  const { pathname } = url;

  if (req.method === 'GET' && pathname === '/api/state') {
    const cache = getStateCache();
    if (req.headers['if-none-match'] === cache.etag) {
      return res.writeHead(304, { ETag: cache.etag, 'Cache-Control': 'no-cache', Vary: 'Accept-Encoding' }).end();
    }
    const useGzip = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
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
    const track = getDb().tracks.find(item => item.id === id);
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
    return json(res, 200, { lyrics, lyricsUrl: track.lyricsUrl || '', source: track.lyricsSource || null }, { 'Cache-Control': 'no-store' });
  }

  if (req.method === 'GET' && pathname === '/api/session') {
    return json(res, 200, isAuthenticated(req)
      ? { authenticated: true, username: getAdminUsername() }
      : { authenticated: false });
  }

  if (req.method === 'POST' && pathname === '/api/login') {
    const body = await readJson(req);
    const token = await authenticate(body.username, body.password);
    if (!token) return json(res, 401, { error: '账号或密码不正确' });
    return json(res, 200, { ok: true, username: getAdminUsername() }, { 'Set-Cookie': sessionCookie(req, token) });
  }

  if (req.method === 'POST' && pathname === '/api/logout') {
    await logout(req);
    return json(res, 200, { ok: true }, { 'Set-Cookie': 'luma_admin=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' });
  }

  if (req.method === 'POST' && pathname === '/api/plays') {
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
    if (!allowPlayReport(ip)) return json(res, 429, { error: '播放上报过于频繁' });
    const body = await readJson(req, 8 * 1024);
    const result = recordPlay(String(body.trackId || ''));
    if (!result.found) return json(res, 404, { error: '找不到这首歌' });
    return json(res, 200, { ok: true, ...result });
  }

  return false;
}

module.exports = { handlePublic };
