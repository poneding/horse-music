const { json } = require('../lib/http');
const { handlePublic } = require('./public');
const { handleAdmin } = require('./admin');

async function handleApi(req, res, url) {
  if (await handlePublic(req, res, url)) return;
  if (!url.pathname.startsWith('/api/admin/')) return json(res, 404, { error: '未知接口' });
  return handleAdmin(req, res, url);
}

module.exports = { handleApi };
