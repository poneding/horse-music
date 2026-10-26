const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const zlib = require('node:zlib');
const { pipeline } = require('node:stream/promises');
const { ROOT, SRC_DIR } = require('../config');
const { json } = require('./http');

const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8'
};

const STATIC_FILES = new Map([
  ['/', 'index.html'],
  ['/index.html', 'index.html'],
  ['/styles.css', 'styles.css'],
  ['/bojack-mark.jpg', 'bojack-mark.jpg'],
  ['/favicon.png', 'favicon.png'],
  ['/manifest.webmanifest', 'manifest.webmanifest'],
  ['/sw.js', 'sw.js'],
  ['/icon-192.png', 'icon-192.png'],
  ['/icon-512.png', 'icon-512.png'],
  ['/icon-512-maskable.png', 'icon-512-maskable.png'],
  ['/apple-touch-icon.png', 'apple-touch-icon.png']
]);
const FONT_RE = /^\/fonts\/[a-z0-9-]+\.woff2$/;
const SRC_RE = /^\/src\/[a-zA-Z0-9_./-]+\.js$/;
const COMPRESSIBLE_RE = /\.(?:html|js|css)$/i;
// 图标/字体不是内容哈希文件名，只缓存一天并保留 ETag，替换后较快生效。
const STATIC_ASSET_CACHE = 'public, max-age=86400';
const staticCache = new Map();

function staticFileFor(pathname) {
  const mapped = STATIC_FILES.get(pathname);
  if (mapped) return { relative: mapped };
  if (FONT_RE.test(pathname)) return { relative: pathname.slice(1) };
  if (SRC_RE.test(pathname)) {
    const relative = pathname.slice(1);
    const file = path.resolve(SRC_DIR, relative.slice('src/'.length));
    if (!file.startsWith(`${SRC_DIR}${path.sep}`)) return null;
    return { relative, absolute: file };
  }
  return null;
}

function isAppRoute(pathname) {
  if (pathname === '/' || pathname === '/admin' || pathname.startsWith('/admin/')) return true;
  if (pathname.startsWith('/src/') || pathname.startsWith('/fonts/')) return false;
  return path.extname(pathname) === '';
}

function acceptsEncoding(req, name) {
  const header = req.headers['accept-encoding'] || '';
  return header.split(',').some(part => {
    const [encoding, ...params] = part.trim().split(';');
    if (encoding.toLowerCase() !== name) return false;
    const q = params.find(param => param.trim().startsWith('q='));
    return !q || Number(q.split('=')[1]) > 0;
  });
}

function compressedStatic(file, stat, raw) {
  const cached = staticCache.get(file);
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) return cached;
  const entry = {
    mtimeMs: stat.mtimeMs,
    size: stat.size,
    raw,
    gzip: zlib.gzipSync(raw, { level: 9 }),
    br: zlib.brotliCompressSync(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9 } })
  };
  staticCache.set(file, entry);
  return entry;
}

async function sendStaticFile(req, res, { relative, absolute }) {
  const file = absolute || path.join(ROOT, relative);
  if (!file.startsWith(`${ROOT}${path.sep}`) && file !== path.join(ROOT, 'index.html')) {
    return json(res, 403, { error: '禁止访问' });
  }
  let stat;
  try { stat = await fsp.stat(file); }
  catch { return json(res, 404, { error: '找不到页面' }); }
  if (!stat.isFile()) return json(res, 404, { error: '找不到页面' });

  const ext = path.extname(file).toLowerCase();
  const compressible = COMPRESSIBLE_RE.test(file);
  // 外壳、脚本与清单每次回源校验；图标/字体不是内容哈希文件名，使用 STATIC_ASSET_CACHE。
  const cacheControl = compressible || ext === '.webmanifest' ? 'no-cache' : STATIC_ASSET_CACHE;
  const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
  const headers = {
    'Content-Type': mimeTypes[ext] || 'application/octet-stream',
    'Cache-Control': cacheControl,
    'ETag': etag,
    'X-Content-Type-Options': 'nosniff'
  };
  if (req.headers['if-none-match'] === etag) return res.writeHead(304, headers).end();

  if (compressible) {
    const entry = compressedStatic(file, stat, await fsp.readFile(file));
    headers.Vary = 'Accept-Encoding';
    let body = entry.raw;
    if (acceptsEncoding(req, 'br')) { body = entry.br; headers['Content-Encoding'] = 'br'; }
    else if (acceptsEncoding(req, 'gzip')) { body = entry.gzip; headers['Content-Encoding'] = 'gzip'; }
    headers['Content-Length'] = body.length;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    return res.end(body);
  }

  headers['Content-Length'] = stat.size;
  res.writeHead(200, headers);
  if (req.method === 'HEAD') return res.end();
  try { await pipeline(fs.createReadStream(file), res); }
  catch (error) { if (!res.destroyed) res.destroy(error); }
}

async function serveStatic(req, res, pathname) {
  const target = staticFileFor(pathname);
  if (target) return sendStaticFile(req, res, target);
  // SPA 深链接：/library、/albums/xxx、/admin/tracks 都返回应用外壳。
  if (isAppRoute(pathname)) {
    return sendStaticFile(req, res, { relative: 'index.html', absolute: path.join(ROOT, 'index.html') });
  }
  return json(res, 404, { error: '找不到页面' });
}

module.exports = { serveStatic };
