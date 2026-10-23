const fsp = require('node:fs/promises');
const path = require('node:path');
const { MEDIA_DIR } = require('../../config');
const { respond } = require('../../lib/http');
const { getDb, touchDb, writeDb } = require('../../store/library');
const { removeTrackStats, flushPlayStore } = require('../../store/plays');
const { editTrack } = require('../../services/import-track');

async function handle(req, res, url) {
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
    const db = getDb();
    const removedTrack = db.tracks.find(track => track.id === id);
    if (!removedTrack) return respond(res, 404, { error: '找不到这首歌' });
    db.tracks = db.tracks.filter(track => track.id !== id);
    db.playlists.forEach(playlist => {
      playlist.trackIds = playlist.trackIds.filter(trackId => trackId !== id);
    });
    removeTrackStats(id);
    touchDb();
    await writeDb();
    await flushPlayStore(true);
    for (const mediaUrl of [removedTrack.src, removedTrack.coverUrl, removedTrack.lyricsUrl]) {
      if (!mediaUrl?.startsWith('/media/')) continue;
      const filename = path.basename(mediaUrl.slice('/media/'.length));
      if (filename.startsWith(id)) await fsp.unlink(path.join(MEDIA_DIR, filename)).catch(() => {});
    }
    return respond(res, 200, { ok: true });
  }

  return false;
}

module.exports = { handle };
