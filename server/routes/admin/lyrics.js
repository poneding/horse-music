const { respond, readJson } = require('../../lib/http');
const { getDb, touchDb, writeDb } = require('../../store/library');
const { cleanTag } = require('../../services/catalog');
const { searchLyricsOnline, saveTrackLyrics, normalizeLyricsText } = require('../../services/lyrics');

async function handle(req, res, url) {
  const { pathname } = url;

  if (req.method === 'GET' && pathname === '/api/admin/lyrics/search') {
    const title = cleanTag(url.searchParams.get('title'));
    const artist = cleanTag(url.searchParams.get('artist'));
    const duration = Math.max(0, Math.round(Number(url.searchParams.get('duration')) || 0));
    if (!title) return respond(res, 400, { error: '请先填写歌曲名' });
    if (title.length > 200) return respond(res, 400, { error: '歌曲名过长' });
    try {
      return respond(res, 200, await searchLyricsOnline({ title, artist, duration }));
    } catch (error) {
      return respond(res, error.status || 502, { error: error.message || '歌词服务暂时不可用' });
    }
  }

  const trackLyricsMatch = pathname.match(/^\/api\/admin\/tracks\/([^/]+)\/lyrics$/);
  if (trackLyricsMatch && req.method === 'POST') {
    let id;
    try { id = decodeURIComponent(trackLyricsMatch[1]); }
    catch { return respond(res, 400, { error: '无效的歌曲编号' }); }
    const db = getDb();
    const track = db.tracks.find(item => item.id === id);
    if (!track) return respond(res, 404, { error: '找不到这首歌' });
    const body = await readJson(req);
    const lyrics = normalizeLyricsText(body.lyrics);
    const source = lyrics ? {
      provider: cleanTag(body.provider) || 'manual',
      externalId: String(body.externalId ?? ''),
      title: cleanTag(body.matchedTitle),
      artist: cleanTag(body.matchedArtist),
      album: cleanTag(body.matchedAlbum),
      duration: Math.max(0, Math.round(Number(body.matchedDuration) || 0)),
      appliedAt: new Date().toISOString()
    } : null;
    await saveTrackLyrics(track, lyrics, source);
    touchDb();
    await writeDb();
    return respond(res, 200, {
      ok: true,
      hasLyrics: Boolean(track.lyrics || track.lyricsUrl),
      lyrics: track.lyrics || '',
      lyricsSource: track.lyricsSource
    });
  }

  return false;
}

module.exports = { handle };
