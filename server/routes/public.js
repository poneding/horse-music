const fsp = require('node:fs/promises');
const path = require('node:path');
const zlib = require('node:zlib');
const { INSTANCE_ID, MAX_LYRICS, MAX_SHARE_TRACKS, SRC_DIR, TRUST_PROXY } = require('../config');
const { json, readJson } = require('../lib/http');
const { safeMediaPath } = require('../lib/files');
const { getDb, getDbVersion, buildStatePayload } = require('../store/library');
const { getRecentPlays, recordPlay } = require('../store/plays');
const { getShare, createShare } = require('../store/shares');
const { favoritePayload, setFavorite, mergeFavorites } = require('../store/favorites');
const { normalizeKey } = require('../services/catalog');
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
  const payload = buildStatePayload(getRecentPlays());
  payload.favorites = favoritePayload().favorites;
  const body = Buffer.from(JSON.stringify(payload));
  stateCache = {
    version,
    body,
    gzip: zlib.gzipSync(body, { level: 6 }),
    etag: `W/"${INSTANCE_ID}-${version}-${body.length}"`
  };
  return stateCache;
}

let clientAssetsCache = null;
// 曲目 id 集合按库版本缓存，避免公开分享查询每次重建。
let trackIndexCache = null;

function trackIndex() {
  const version = getDbVersion();
  if (trackIndexCache && trackIndexCache.version === version) return trackIndexCache;
  const map = new Map(getDb().tracks.map(track => [track.id, track]));
  trackIndexCache = { version, map, ids: new Set(map.keys()) };
  return trackIndexCache;
}

async function clientAssets() {
  if (clientAssetsCache) return clientAssetsCache;
  const files = [];
  async function walk(dir, prefix) {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full, `${prefix}${entry.name}/`);
      else if (entry.isFile() && entry.name.endsWith('.js')) files.push(`/src/${prefix}${entry.name}`);
    }
  }
  try { await walk(SRC_DIR, ''); }
  catch { /* 源码目录不可读时返回已有列表。 */ }
  clientAssetsCache = files.sort();
  return clientAssetsCache;
}

const MAX_RATE_BUCKETS = 10000;

function clientIp(req) {
  // 仅当明确部署在单层反向代理之后才信任 XFF，取最右一项（由代理追加的真实来源）。
  // 直连时不要开启 TRUST_PROXY，否则伪造该头即可绕过限流。
  if (TRUST_PROXY) {
    const forwarded = String(req.headers['x-forwarded-for'] || '')
      .split(',').map(part => part.trim()).filter(Boolean);
    if (forwarded.length) return forwarded[forwarded.length - 1];
  }
  return req.socket.remoteAddress || 'unknown';
}

function allowRequest(map, ip, windowMs, limit) {
  const now = Date.now();
  let entry = map.get(ip);
  if (!entry || entry.reset <= now) {
    entry = { count: 0, reset: now + windowMs };
    map.set(ip, entry);
  }
  entry.count += 1;
  // 桶数量有上限：先清过期项，仍超限时淘汰最旧项，防止伪造来源把内存撑爆。
  if (map.size > MAX_RATE_BUCKETS) {
    for (const [key, value] of map) if (value.reset <= now) map.delete(key);
    while (map.size > MAX_RATE_BUCKETS) {
      const oldest = map.keys().next().value;
      if (oldest === undefined) break;
      map.delete(oldest);
    }
  }
  return entry.count <= limit;
}

const playRate = new Map();
const shareRate = new Map();
const favoriteRate = new Map();

function albumTracksFor(db, album) {
  const titleKey = normalizeKey(album.title);
  return db.tracks
    .filter(track => track.albumId === album.id || (!track.albumId && titleKey && normalizeKey(track.album) === titleKey))
    .sort((left, right) => {
      const leftOrder = Number(left.albumOrder);
      const rightOrder = Number(right.albumOrder);
      return (Number.isFinite(leftOrder) ? leftOrder : Number.MAX_SAFE_INTEGER)
        - (Number.isFinite(rightOrder) ? rightOrder : Number.MAX_SAFE_INTEGER);
    });
}

function shareResponse(record, totalCount) {
  return {
    ...record,
    path: `/s/${record.code}`,
    trackCount: record.trackIds.length,
    totalCount: totalCount ?? record.trackIds.length
  };
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

  if (req.method === 'GET' && pathname === '/api/assets') {
    return json(res, 200, { assets: await clientAssets() }, { 'Cache-Control': 'no-cache' });
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
    const ip = clientIp(req);
    if (!allowRequest(playRate, ip, 60_000, 120)) return json(res, 429, { error: '播放上报过于频繁' });
    const body = await readJson(req, 8 * 1024);
    const result = recordPlay(String(body.trackId || ''));
    if (!result.found) return json(res, 404, { error: '找不到这首歌' });
    return json(res, 200, { ok: true, ...result });
  }

  if (req.method === 'POST' && (pathname === '/api/favorites' || pathname === '/api/favorites/merge')) {
    const ip = clientIp(req);
    if (!allowRequest(favoriteRate, ip, 60_000, 240)) return json(res, 429, { error: '收藏操作过于频繁，请稍后再试' });
    const body = await readJson(req, 512 * 1024);
    if (pathname === '/api/favorites/merge') {
      if (!Array.isArray(body.ids)) return json(res, 400, { error: '缺少收藏列表' });
      const result = await mergeFavorites(body.ids.slice(0, 5000));
      return json(res, 200, { ok: true, ...result });
    }
    if (typeof body.trackId !== 'string' || !body.trackId) return json(res, 400, { error: '缺少歌曲编号' });
    if (typeof body.favorite !== 'boolean') return json(res, 400, { error: '收藏状态必须是布尔值' });
    const result = await setFavorite(body.trackId, body.favorite);
    if (!result.found) return json(res, 404, { error: '找不到这首歌' });
    return json(res, 200, { ok: true, favorite: result.favorite });
  }

  if (req.method === 'POST' && pathname === '/api/shares') {
    const ip = clientIp(req);
    if (!allowRequest(shareRate, ip, 10 * 60_000, 60)) return json(res, 429, { error: '分享链接创建过于频繁，请稍后再试' });
    const body = await readJson(req, 512 * 1024);
    const kind = String(body.kind || '');
    const db = getDb();
    let share;

    if (kind === 'track') {
      const track = trackIndex().map.get(String(body.trackId || body.id || ''));
      if (!track) return json(res, 404, { error: '找不到这首歌' });
      share = {
        kind,
        title: track.title || '未命名歌曲',
        description: [track.artist, track.album].filter(Boolean).join(' · '),
        coverUrl: track.coverUrl || '',
        trackIds: [track.id]
      };
    } else if (kind === 'album') {
      const album = db.albums.find(item => item.id === String(body.albumId || body.id || ''));
      if (!album) return json(res, 404, { error: '找不到这张专辑' });
      const tracks = albumTracksFor(db, album);
      if (!tracks.length) return json(res, 400, { error: '这张专辑还没有歌曲' });
      share = {
        kind,
        title: album.title || '未命名专辑',
        description: `${album.artist || '未知艺人'} · ${tracks.length} 首歌曲`,
        coverUrl: album.coverUrl || tracks[0]?.coverUrl || '',
        trackIds: tracks.map(track => track.id)
      };
    } else if (kind === 'playlist') {
      const playlist = db.playlists.find(item => item.id === String(body.playlistId || body.id || ''));
      if (!playlist) return json(res, 404, { error: '找不到这个歌单' });
      const byId = trackIndex().map;
      const seen = new Set();
      const trackIds = [];
      for (const value of Array.isArray(playlist.trackIds) ? playlist.trackIds : []) {
        const id = String(value || '');
        if (!id || seen.has(id) || !byId.has(id)) continue;
        seen.add(id);
        trackIds.push(id);
        if (trackIds.length >= MAX_SHARE_TRACKS) break;
      }
      if (!trackIds.length) return json(res, 400, { error: '这个歌单还没有歌曲' });
      share = {
        kind,
        title: playlist.title || '未命名歌单',
        description: `${trackIds.length} 首歌曲`,
        coverUrl: playlist.coverUrl || byId.get(trackIds[0])?.coverUrl || '',
        trackIds
      };
    } else {
      return json(res, 400, { error: '不支持的分享类型' });
    }

    const record = await createShare(share);
    return json(res, 201, { share: shareResponse(record) });
  }

  const shareMatch = pathname.match(/^\/api\/shares\/([^/]+)$/);
  if (req.method === 'GET' && shareMatch) {
    let code;
    try { code = decodeURIComponent(shareMatch[1]); }
    catch { return json(res, 400, { error: '无效的分享编号' }); }
    const record = getShare(code);
    if (!record) return json(res, 404, { error: '找不到这个分享链接' });
    const byId = trackIndex().ids;
    const trackIds = record.trackIds.filter(id => byId.has(id));
    return json(res, 200, { share: shareResponse({ ...record, trackIds }, record.trackIds.length) });
  }

  return false;
}

module.exports = { handlePublic };
