const fsp = require('node:fs/promises');
const path = require('node:path');
const { MEDIA_DIR } = require('../../config');
const { respond, readJson } = require('../../lib/http');
const { getDb, touchDb, writeDb } = require('../../store/library');
const { removeTrackStats, flushPlayStore } = require('../../store/plays');
const { editTrack } = require('../../services/import-track');
const { removeTrackFavorite } = require('../../store/favorites');

const MAX_BULK_DELETE = 500;

async function removeTrackMedia(track) {
  for (const mediaUrl of [track.src, track.coverUrl, track.lyricsUrl]) {
    if (!mediaUrl?.startsWith('/media/')) continue;
    const filename = path.basename(mediaUrl.slice('/media/'.length));
    if (filename.startsWith(track.id)) await fsp.unlink(path.join(MEDIA_DIR, filename)).catch(() => {});
  }
}

async function deleteTracks(ids) {
  const db = getDb();
  const wanted = new Set(ids);
  const removed = db.tracks.filter(track => wanted.has(track.id));
  if (!removed.length) return 0;
  db.tracks = db.tracks.filter(track => !wanted.has(track.id));
  db.playlists.forEach(playlist => {
    playlist.trackIds = playlist.trackIds.filter(trackId => !wanted.has(trackId));
  });
  for (const track of removed) {
    removeTrackStats(track.id);
    removeTrackFavorite(track.id);
  }
  touchDb();
  await writeDb();
  await flushPlayStore(true);
  await Promise.all(removed.map(removeTrackMedia));
  return removed.length;
}

async function handleBulkDelete(req, res) {
  const body = await readJson(req);
  const rawIds = body.ids;
  if (!Array.isArray(rawIds) || !rawIds.length) return respond(res, 400, { error: '请选择要删除的歌曲' });
  if (rawIds.length > MAX_BULK_DELETE) return respond(res, 400, { error: `一次最多删除 ${MAX_BULK_DELETE} 首歌曲` });
  if (rawIds.some(id => typeof id !== 'string' || !id.trim())) return respond(res, 400, { error: '无效的歌曲编号' });
  const ids = [...new Set(rawIds.map(id => id.trim()))];
  const existing = new Set(getDb().tracks.map(track => track.id));
  const targets = ids.filter(id => existing.has(id));
  await deleteTracks(targets);
  return respond(res, 200, { ok: true, deleted: targets.length, missing: ids.length - targets.length });
}

async function handle(req, res, url) {
  if (req.method === 'POST' && url.pathname === '/api/admin/tracks/bulk-delete') {
    return handleBulkDelete(req, res);
  }

  const trackMatch = url.pathname.match(/^\/api\/admin\/tracks\/([^/]+)$/);
  if (!trackMatch) return false;

  let id;
  try { id = decodeURIComponent(trackMatch[1]); }
  catch { return respond(res, 400, { error: '无效的歌曲编号' }); }

  if (req.method === 'PUT') {
    const track = await editTrack(req, id);
    return respond(res, 200, { ok: true, track });
  }

  if (req.method === 'DELETE') {
    const removedTrack = getDb().tracks.find(track => track.id === id);
    if (!removedTrack) return respond(res, 404, { error: '找不到这首歌' });
    await deleteTracks([id]);
    return respond(res, 200, { ok: true });
  }

  return false;
}

module.exports = { handle };
