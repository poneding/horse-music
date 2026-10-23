import { api } from '../core/api.js';
import { admin } from './state.js';

export function ensureAdminSession() {
  if (admin.sessionChecked) return Promise.resolve(admin.authenticated);
  if (!admin.sessionPromise) {
    admin.sessionPromise = api('/api/session')
      .then(session => {
        admin.authenticated = Boolean(session.authenticated);
        admin.username = session.username || '';
        return admin.authenticated;
      })
      .catch(() => {
        admin.authenticated = false;
        return false;
      })
      .finally(() => {
        admin.sessionChecked = true;
        admin.sessionPromise = null;
      });
  }
  return admin.sessionPromise;
}

export async function loginAdmin(username, password) {
  const result = await api('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  admin.authenticated = true;
  admin.sessionChecked = true;
  admin.username = result.username || String(username || '').trim();
  return result;
}

export async function logoutAdmin() {
  try { await api('/api/logout', { method: 'POST' }); }
  finally {
    admin.authenticated = false;
    admin.sessionChecked = true;
    admin.username = '';
  }
}
