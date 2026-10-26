const crypto = require('node:crypto');
const { respond, readJson } = require('../../lib/http');
const { applyOrder } = require('../../lib/order');
const { getDb, touchDb, writeDb } = require('../../store/library');

async function handle(req, res, url) {
  const { pathname } = url;

  if (req.method === 'POST' && pathname === '/api/admin/playlists') {
    const body = await readJson(req);
    if (!String(body.title || '').trim()) return respond(res, 400, { error: '歌单名称不能为空' });
    const db = getDb();
    const validTrackIds = new Set(db.tracks.map(track => track.id));
    const trackIds = Array.isArray(body.trackIds) ? [...new Set(body.trackIds.filter(id => validTrackIds.has(id)))] : [];
    const now = new Date().toISOString();
    const playlist = {
      id: crypto.randomUUID(),
      title: String(body.title).trim(),
      description: String(body.description || '').trim(),
      trackIds,
      // 歌单封面跟随最近加入的歌曲，addedAt 记录每首歌的加入时间。
      addedAt: Object.fromEntries(trackIds.map(id => [id, now]))
    };
    db.playlists.unshift(playlist);
    touchDb();
    await writeDb();
    return respond(res, 201, { playlist });
  }

  if (req.method === 'PUT' && pathname === '/api/admin/playlists/order') {
    const body = await readJson(req);
    if (!Array.isArray(body.ids) || !body.ids.length) return respond(res, 400, { error: '缺少排序结果' });
    const db = getDb();
    db.playlists = applyOrder(db.playlists, body.ids);
    touchDb();
    await writeDb();
    return respond(res, 200, { ok: true, ids: db.playlists.map(playlist => playlist.id) });
  }

  const playlistMatch = pathname.match(/^\/api\/admin\/playlists\/([^/]+)$/);
  if (playlistMatch && req.method === 'PUT') {
    const body = await readJson(req);
    const db = getDb();
    const playlist = db.playlists.find(item => item.id === decodeURIComponent(playlistMatch[1]));
    if (!playlist) return respond(res, 404, { error: '找不到这个歌单' });
    const requested = Array.isArray(body.trackIds) ? body.trackIds : [];
    const validTrackIds = new Set(db.tracks.map(track => track.id));
    const previousAddedAt = playlist.addedAt && typeof playlist.addedAt === 'object' ? playlist.addedAt : {};
    playlist.trackIds = [...new Set(requested.filter(id => validTrackIds.has(id)))];
    const now = new Date().toISOString();
    playlist.addedAt = Object.fromEntries(playlist.trackIds.map(id => [
      id,
      typeof previousAddedAt[id] === 'string' && previousAddedAt[id] ? previousAddedAt[id] : now
    ]));
    touchDb();
    await writeDb();
    return respond(res, 200, { playlist });
  }

  if (playlistMatch && req.method === 'DELETE') {
    const db = getDb();
    const next = db.playlists.filter(item => item.id !== decodeURIComponent(playlistMatch[1]));
    if (next.length === db.playlists.length) return respond(res, 404, { error: '找不到这个歌单' });
    db.playlists = next;
    touchDb();
    await writeDb();
    return respond(res, 200, { ok: true });
  }

  return false;
}

module.exports = { handle };
