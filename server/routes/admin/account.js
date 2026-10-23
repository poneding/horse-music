const { respond, readJson } = require('../../lib/http');
const {
  getAdminUsername,
  verifyAdminPassword,
  rotateCredentials,
  sessionCookie
} = require('../../store/auth');

async function handle(req, res, url) {
  if (req.method !== 'PUT' || url.pathname !== '/api/admin/credentials') return false;
  const body = await readJson(req);
  const currentPassword = String(body.currentPassword || '');
  if (!currentPassword) return respond(res, 400, { error: '请输入当前密码' });
  if (!(await verifyAdminPassword(currentPassword))) return respond(res, 403, { error: '当前密码不正确' });

  const currentUsername = getAdminUsername();
  const username = body.username === undefined ? currentUsername : String(body.username).trim();
  if (!username) return respond(res, 400, { error: '管理员账号不能为空' });
  const usernameChanged = username !== currentUsername;
  if (usernameChanged) {
    if (username.length < 2 || username.length > 64) return respond(res, 400, { error: '账号长度需为 2–64 个字符' });
    if (/\s/.test(username)) return respond(res, 400, { error: '账号不能包含空格' });
  }
  const newPassword = String(body.newPassword || '');
  if (newPassword) {
    if (newPassword.length < 8 || newPassword.length > 128) return respond(res, 400, { error: '新密码长度需为 8–128 个字符' });
    if (newPassword === currentPassword) return respond(res, 400, { error: '新密码不能与当前密码相同' });
  }
  if (!usernameChanged && !newPassword) return respond(res, 400, { error: '账号和密码都未修改' });

  const token = await rotateCredentials(username, newPassword || currentPassword);
  return respond(res, 200, { ok: true, username }, { 'Set-Cookie': sessionCookie(req, token) });
}

module.exports = { handle };
