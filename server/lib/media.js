const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');
const { PUBLIC_CACHE } = require('../config');
const { safeMediaPath, mediaMimeType } = require('./files');
const { json } = require('./http');

async function serveMedia(req, res, pathname) {
  const file = safeMediaPath(pathname);
  if (!file) return json(res, 400, { error: '无效的媒体路径' });
  let stat;
  try { stat = await fsp.stat(file); }
  catch { return json(res, 404, { error: '找不到媒体文件' }); }
  if (!stat.isFile()) return json(res, 404, { error: '找不到媒体文件' });
  const ext = path.extname(file).toLowerCase();
  const type = mediaMimeType(ext);
  const baseHeaders = { 'Content-Type': type, 'Cache-Control': PUBLIC_CACHE, 'X-Content-Type-Options': 'nosniff' };
  const range = req.headers.range;
  if (range && type.startsWith('audio/')) {
    const match = range.match(/bytes=(\d*)-(\d*)/);
    if (!match) return res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }).end();
    const start = match[1] ? Number(match[1]) : Math.max(0, stat.size - Number(match[2]));
    const end = match[2] && match[1] ? Math.min(Number(match[2]), stat.size - 1) : stat.size - 1;
    if (start > end || start >= stat.size) return res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }).end();
    res.writeHead(206, {
      ...baseHeaders,
      'Content-Length': end - start + 1,
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges': 'bytes'
    });
    if (req.method === 'HEAD') return res.end();
    try { await pipeline(fs.createReadStream(file, { start, end }), res); }
    catch (error) { if (!res.destroyed) res.destroy(error); }
    return;
  }
  res.writeHead(200, {
    ...baseHeaders,
    'Content-Length': stat.size,
    'Accept-Ranges': type.startsWith('audio/') ? 'bytes' : 'none'
  });
  if (req.method === 'HEAD') return res.end();
  try { await pipeline(fs.createReadStream(file), res); }
  catch (error) { if (!res.destroyed) res.destroy(error); }
}

module.exports = { serveMedia };
