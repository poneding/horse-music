const crypto = require('node:crypto');
const { respond, readJson } = require('../../lib/http');
const { applyOrder } = require('../../lib/order');
const { getDb, touchDb, writeDb } = require('../../store/library');
const { splitArtistText, uniqueArtistNames, cleanArtistName, ensureArtist, normalizeKey } = require('../../services/catalog');

async function handle(req, res, url) {
  const { pathname } = url;

  if (req.method === 'PUT' && pathname === '/api/admin/albums/order') {
    const body = await readJson(req);
    if (!Array.isArray(body.ids) || !body.ids.length) return respond(res, 400, { error: '缺少排序结果' });
    const db = getDb();
    db.albums = applyOrder(db.albums, body.ids);
    touchDb();
    await writeDb();
    return respond(res, 200, { ok: true, ids: db.albums.map(album => album.id) });
  }

  const albumOrderMatch = pathname.match(/^\/api\/admin\/albums\/([^/]+)\/order$/);
  if (albumOrderMatch && req.method === 'PUT') {
    const body = await readJson(req);
    const db = getDb();
    const album = db.albums.find(item => item.id === decodeURIComponent(albumOrderMatch[1]));
    if (!album) return respond(res, 404, { error: '找不到这张专辑' });
    const albumTracks = db.tracks.filter(track => (track.albumId
      ? track.albumId === album.id
      : Boolean(track.album) && normalizeKey(track.album) === normalizeKey(album.title)));
    if (!albumTracks.length) return respond(res, 200, { ok: true, trackIds: [] });
    if (!Array.isArray(body.trackIds) || !body.trackIds.length) return respond(res, 400, { error: '缺少排序结果' });
    const known = new Set(albumTracks.map(track => track.id));
    const order = new Map();
    let index = 0;
    for (const id of body.trackIds) {
      if (!known.has(id) || order.has(id)) continue;
      order.set(id, index);
      index += 1;
    }
    for (const track of albumTracks) {
      track.albumOrder = order.has(track.id) ? order.get(track.id) : index++;
    }
    touchDb();
    await writeDb();
    return respond(res, 200, { ok: true });
  }

  if (req.method === 'POST' && pathname === '/api/admin/albums') {
    const body = await readJson(req);
    if (!String(body.title || '').trim()) return respond(res, 400, { error: '专辑名称不能为空' });
    const db = getDb();
    const artist = cleanArtistName(String(body.artist || '未知艺人')) || '未知艺人';
    const artistNames = uniqueArtistNames(splitArtistText(artist));
    const album = {
      id: crypto.randomUUID(),
      title: String(body.title).trim(),
      artist,
      artistNames,
      description: String(body.description || '').trim(),
      coverUrl: String(body.coverUrl || '')
    };
    db.albums.unshift(album);
    for (const name of artistNames) ensureArtist(db, name, album.coverUrl);
    touchDb();
    await writeDb();
    return respond(res, 201, { album });
  }

  const albumMatch = pathname.match(/^\/api\/admin\/albums\/([^/]+)$/);
  if (albumMatch && req.method === 'DELETE') {
    const db = getDb();
    const id = decodeURIComponent(albumMatch[1]);
    const album = db.albums.find(item => item.id === id);
    if (!album) return respond(res, 404, { error: '找不到这张专辑' });
    db.albums = db.albums.filter(item => item.id !== id);
    db.tracks.forEach(track => {
      if (track.albumId === album.id || (!track.albumId && track.album === album.title)) {
        track.album = '';
        track.albumId = '';
      }
    });
    touchDb();
    await writeDb();
    return respond(res, 200, { ok: true });
  }

  return false;
}

module.exports = { handle };
