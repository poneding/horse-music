const { MAX_JSON } = require('../config');

function json(res, status, value, headers = {}) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
    ...headers
  });
  res.end(body);
}

function respond(res, status, value, headers) {
  json(res, status, value, headers);
  return true;
}

function readJson(req, limit = MAX_JSON) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let length = 0;
    req.on('data', chunk => {
      length += chunk.length;
      if (length > limit) {
        reject(Object.assign(new Error('请求内容过大'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch { reject(Object.assign(new Error('无效的 JSON 数据'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function parseCookies(header = '') {
  return Object.fromEntries(
    header.split(';')
      .map(part => part.trim().split(/=(.*)/s).slice(0, 2))
      .filter(([key, value]) => key && value)
  );
}

module.exports = { json, respond, readJson, parseCookies };
