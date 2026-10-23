const { respond } = require('../../lib/http');
const { writeDb } = require('../../store/library');
const { clearPlayHistory } = require('../../store/plays');

async function handle(req, res, url) {
  if (req.method !== 'DELETE' || url.pathname !== '/api/admin/plays') return false;
  await clearPlayHistory();
  await writeDb();
  return respond(res, 200, { ok: true });
}

module.exports = { handle };
