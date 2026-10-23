const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');
const { respond } = require('../../lib/http');
const { mediaMimeType } = require('../../lib/files');
const { getStagedUpload, discardStagedUpload } = require('../../services/uploads');
const { inspectUpload, commitUpload } = require('../../services/import-track');

async function handle(req, res, url) {
  const { pathname } = url;

  if (req.method === 'POST' && pathname === '/api/admin/upload/inspect') {
    const result = await inspectUpload(req);
    return respond(res, 200, result);
  }

  const previewMatch = pathname.match(/^\/api\/admin\/upload\/preview\/([^/]+)$/);
  if (req.method === 'GET' && previewMatch) {
    let token = '';
    try { token = decodeURIComponent(previewMatch[1]); }
    catch { return respond(res, 400, { error: '无效的上传凭证' }); }
    const staged = getStagedUpload(token);
    if (!staged?.cover) return respond(res, 404, { error: '这首歌没有内嵌封面' });
    const file = path.join(staged.dir, staged.cover);
    let stat;
    try { stat = await fsp.stat(file); }
    catch { return respond(res, 404, { error: '这首歌没有内嵌封面' }); }
    res.writeHead(200, {
      'Content-Type': mediaMimeType(path.extname(file).toLowerCase()),
      'Content-Length': stat.size,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    try { await pipeline(fs.createReadStream(file), res); }
    catch (error) { if (!res.destroyed) res.destroy(error); }
    return true;
  }

  const discardMatch = pathname.match(/^\/api\/admin\/upload\/([^/]+)$/);
  if (req.method === 'DELETE' && discardMatch) {
    let token = '';
    try { token = decodeURIComponent(discardMatch[1]); }
    catch { return respond(res, 400, { error: '无效的上传凭证' }); }
    await discardStagedUpload(token);
    return respond(res, 200, { ok: true });
  }

  if (req.method === 'POST' && pathname === '/api/admin/upload') {
    const result = await commitUpload(req);
    return respond(res, result.status, result.body);
  }

  return false;
}

module.exports = { handle };
