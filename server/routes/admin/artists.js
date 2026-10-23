const { respond, readJson } = require('../../lib/http');
const { applyOrder } = require('../../lib/order');
const { getDb, touchDb, writeDb } = require('../../store/library');

async function handle(req, res, url) {
  if (req.method === 'PUT' && url.pathname === '/api/admin/artists/order') {
    const body = await readJson(req);
    if (!Array.isArray(body.ids) || !body.ids.length) return respond(res, 400, { error: '缺少排序结果' });
    const db = getDb();
    db.artists = applyOrder(db.artists, body.ids);
    touchDb();
    await writeDb();
    return respond(res, 200, { ok: true, ids: db.artists.map(artist => artist.id) });
  }

  const artistMatch = url.pathname.match(/^\/api\/admin\/artists\/([^/]+)$/);
  if (!artistMatch || req.method !== 'DELETE') return false;
  const db = getDb();
  const id = decodeURIComponent(artistMatch[1]);
  const next = db.artists.filter(item => item.id !== id);
  if (next.length === db.artists.length) return respond(res, 404, { error: '找不到这位歌手' });
  db.artists = next;
  touchDb();
  await writeDb();
  return respond(res, 200, { ok: true });
}

module.exports = { handle };
