import { api } from '../core/api.js';
import { currentRoute } from '../core/router.js';
import { renderApp } from '../core/render-bus.js';
import { state } from '../core/state.js';

// 分享链接一旦打开就缓存，避免每次重绘都重新请求；失败后由用户主动重试。
const entries = new Map();

function isCurrentShare(code) {
  const route = currentRoute();
  return route.name === 'share' && route.code === code;
}

export function shareEntry(code) {
  return entries.get(code) || null;
}

export function loadShare(code) {
  if (!code) return null;
  const existing = entries.get(code);
  if (existing) return existing;
  const entry = { status: 'loading', data: null, error: '' };
  entries.set(code, entry);
  api(`/api/shares/${encodeURIComponent(code)}`)
    .then(result => {
      if (entries.get(code) !== entry) return;
      entries.set(code, { status: 'ready', data: result.share, error: '' });
      if (isCurrentShare(code)) renderApp();
    })
    .catch(error => {
      if (entries.get(code) !== entry) return;
      entries.set(code, { status: 'error', data: null, error: error.message || '分享链接无法打开' });
      if (isCurrentShare(code)) renderApp();
    });
  return entry;
}

export function retryShare(code) {
  entries.delete(code);
  const entry = loadShare(code);
  if (isCurrentShare(code)) renderApp();
  return entry;
}

export function shareTracks(code) {
  const data = entries.get(code)?.data;
  if (!data) return [];
  return data.trackIds.map(id => state.trackById.get(id)).filter(Boolean);
}

export function createShare(body) {
  return api('/api/shares', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).then(result => result.share);
}
