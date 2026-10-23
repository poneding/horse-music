const http = require('node:http');
const { PORT } = require('./config');
const { json } = require('./lib/http');
const { serveStatic } = require('./lib/static');
const { serveMedia } = require('./lib/media');
const { initLibrary, flushDb } = require('./store/library');
const { initPlays, flushPlayStore } = require('./store/plays');
const { initAuth } = require('./store/auth');
const { handleApi } = require('./routes/api');

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if ((req.method === 'GET' || req.method === 'HEAD') && url.pathname === '/healthz') {
      return json(res, 200, { ok: true });
    }
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (url.pathname.startsWith('/media/')) return await serveMedia(req, res, url.pathname);
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: '不支持的请求方式' });
    return await serveStatic(req, res, url.pathname);
  } catch (error) {
    if (!res.headersSent) json(res, error.status || 500, { error: error.message || '服务器出错' });
    else if (!res.destroyed) res.destroy(error);
  }
});

server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

async function shutdown() {
  try { await Promise.allSettled([flushPlayStore(true), flushDb()]); } catch {}
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

async function start() {
  await initLibrary();
  await initPlays();
  await initAuth();
  server.listen(PORT, '0.0.0.0', () => console.log(`一头诗人 running at http://localhost:${PORT}`));
}

start().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

module.exports = { server, start };
