import { api } from '../../core/api.js';
import { renderApp } from '../../core/render-bus.js';
import { showToast } from '../../core/toast.js';
import { escapeHtml } from '../../core/util.js';
import { admin } from '../state.js';

export function renderAccount() {
  return `<div class="admin-page-heading"><div><span class="eyebrow">ACCOUNT &amp; SECURITY</span><h1>账号设置</h1><p>修改管理端的登录账号或密码，保存后立即生效。</p></div></div><div class="account-grid"><section class="admin-section-card account-card"><div class="admin-section-heading"><div><h2>登录凭证</h2><span>修改账号或密码前需要验证当前密码</span></div></div><form id="account-form" class="account-form"><label class="field-label">管理员账号<input name="username" value="${escapeHtml(admin.username || 'admin')}" autocomplete="username" maxlength="64" required /><small>登录管理端时使用的账号，2–64 个字符，不能包含空格</small></label><label class="field-label">当前密码<input name="currentPassword" type="password" autocomplete="current-password" required placeholder="请输入当前登录密码" /></label><div class="account-divider"><span>修改密码</span></div><label class="field-label">新密码<input name="newPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" placeholder="留空表示不修改密码" /><small>8–128 个字符；保存后其他设备上的登录会话会失效</small></label><label class="field-label">确认新密码<input name="confirmPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" placeholder="再次输入新密码" /></label><div class="account-message" aria-live="polite"></div><button class="button button-dark account-submit" type="submit">保存账号设置</button></form></section><aside class="admin-section-card account-tips"><div class="admin-section-heading"><div><h2>安全提示</h2><span>关于管理员凭证</span></div></div><ul><li>保存成功后当前会话会继续保持登录，其他设备需要重新输入新凭证。</li><li>账号与加盐密码哈希保存在数据目录的 <code>auth.json</code>，不会写入明文密码。</li><li>通过 <code>ADMIN_USER</code> / <code>ADMIN_PASSWORD</code> 环境变量更换凭证并重启后，会以环境变量为准并重置登录会话。</li></ul></aside></div>`;
}

export function mountAccountForm() {
  const form = document.querySelector('#account-form');
  if (!form) return;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const fields = new FormData(form);
    const message = form.querySelector('.account-message');
    const submit = form.querySelector('[type="submit"]');
    const username = String(fields.get('username') || '').trim();
    const currentPassword = String(fields.get('currentPassword') || '');
    const newPassword = String(fields.get('newPassword') || '');
    const confirmPassword = String(fields.get('confirmPassword') || '');
    const setMessage = text => { message.textContent = text; message.classList.remove('success'); };
    if (!username) return setMessage('管理员账号不能为空');
    if (username.length < 2) return setMessage('管理员账号至少需要 2 个字符');
    if (/\s/.test(username)) return setMessage('管理员账号不能包含空格');
    if (newPassword !== confirmPassword) return setMessage('两次输入的新密码不一致');
    if (newPassword && newPassword.length < 8) return setMessage('新密码至少需要 8 个字符');
    if (!newPassword && username === admin.username) return setMessage('账号和密码都未修改');
    submit.disabled = true;
    setMessage('');
    try {
      const result = await api('/api/admin/credentials', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, currentPassword, newPassword })
      });
      admin.username = result.username || username;
      renderApp();
      showToast('账号设置已更新');
    } catch (error) {
      setMessage(error.message);
      submit.disabled = false;
    }
  });
}
