import { api } from '../core/api.js';
import { renderApp } from '../core/render-bus.js';
import { state } from '../core/state.js';
import { showToast } from '../core/toast.js';

const LEGACY_KEY = 'luma-favorites';
const MIGRATED_KEY = 'horse-favorites-migrated-v1';

function readLegacyFavorites() {
  try {
    const value = JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]');
    return Array.isArray(value) ? value.filter(id => typeof id === 'string' && id) : [];
  } catch {
    return [];
  }
}

let migrated = (() => {
  try { return localStorage.getItem(MIGRATED_KEY) === '1'; }
  catch { return true; }
})();
const pendingLegacy = new Set(migrated ? [] : readLegacyFavorites());
// 服务端收藏上限为 5000 首，迁移时与之一致。
const LEGACY_LIMIT = 5000;

function validFavorites(values) {
  const valid = new Set();
  for (const id of Array.isArray(values) ? values : []) {
    if (typeof id === 'string' && state.trackById.has(id)) valid.add(id);
  }
  return valid;
}

export function hydrateFavorites(values) {
  const next = validFavorites(values);
  if (!migrated) for (const id of pendingLegacy) if (state.trackById.has(id)) next.add(id);
  state.favorites = next;
}

function markMigrated({ keepLegacy = false } = {}) {
  migrated = true;
  pendingLegacy.clear();
  try {
    localStorage.setItem(MIGRATED_KEY, '1');
    if (!keepLegacy) localStorage.removeItem(LEGACY_KEY);
  } catch { /* 存储不可用时忽略 */ }
}

function keepLegacyRemainder(ids) {
  try { localStorage.setItem(LEGACY_KEY, JSON.stringify(ids)); }
  catch { /* 存储不可用时只能放弃余量 */ }
  console.warn(`旧收藏超过服务端上限，剩余 ${ids.length} 首已保留在 localStorage[${LEGACY_KEY}]。`);
}

export async function initFavorites() {
  if (migrated) return;
  if (!pendingLegacy.size) {
    markMigrated();
    return;
  }
  // 升级后的第一次启动：把旧浏览器里的收藏合并到服务端，成功后以服务端为准。
  const usable = [...pendingLegacy].filter(id => state.trackById.has(id));
  const ids = usable.slice(0, LEGACY_LIMIT);
  if (!ids.length) {
    markMigrated();
    return;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const result = await api('/api/favorites/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
      signal: controller.signal
    });
    // 以服务端最终列表为准；服务端已满或未接受的旧收藏保留在本地，避免静默丢失。
    const merged = Array.isArray(result.favorites) ? validFavorites(result.favorites) : null;
    if (merged) state.favorites = merged;
    const missing = merged ? usable.filter(id => !merged.has(id)) : [];
    if (missing.length) {
      keepLegacyRemainder(missing);
      markMigrated({ keepLegacy: true });
    } else {
      markMigrated();
    }
  } catch (error) {
    // 合并失败时保留本地收藏并下次启动重试，不清除旧数据。
    console.warn('Could not merge legacy favorites:', error.message);
  } finally {
    clearTimeout(timer);
  }
}

export function isFavorite(id) {
  return state.favorites.has(id);
}

const favoriteRequests = new Map();

export function toggleFavorite(id) {
  if (!id) return false;
  const liked = state.favorites.has(id);
  if (liked) state.favorites.delete(id);
  else state.favorites.add(id);

  const sequence = (favoriteRequests.get(id) || 0) + 1;
  favoriteRequests.set(id, sequence);
  void api('/api/favorites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trackId: id, favorite: !liked })
  }).then(result => {
    if (favoriteRequests.get(id) !== sequence) return;
    if (result?.favorite) state.favorites.add(id);
    else state.favorites.delete(id);
  }).catch(error => {
    if (favoriteRequests.get(id) !== sequence) return;
    if (liked) state.favorites.add(id);
    else state.favorites.delete(id);
    showToast(error.message || '收藏保存失败，请稍后再试');
    renderApp();
  });

  return !liked;
}
