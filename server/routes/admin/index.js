const { json } = require('../../lib/http');
const { requireAdmin } = require('../../store/auth');

const handlers = [
  require('./account'),
  require('./lyrics'),
  require('./plays'),
  require('./upload'),
  require('./albums'),
  require('./artists'),
  require('./playlists'),
  require('./tracks')
];

async function handleAdmin(req, res, url) {
  if (!requireAdmin(req, res)) return;
  for (const handler of handlers) {
    if (await handler.handle(req, res, url)) return;
  }
  json(res, 404, { error: '未知管理接口' });
}

module.exports = { handleAdmin };
