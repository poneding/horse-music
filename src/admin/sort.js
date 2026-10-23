import { api } from '../core/api.js';
import { enableDragSort } from '../core/drag-sort.js';
import { renderApp } from '../core/render-bus.js';
import { showToast } from '../core/toast.js';
import { refreshLibrary } from '../data/library.js';

const SORT_CONFIG = {
  albums: { selector: '[data-sort-list="albums"]', mode: 'grid', url: '/api/admin/albums/order', message: '专辑顺序已保存' },
  artists: { selector: '[data-sort-list="artists"]', mode: 'grid', url: '/api/admin/artists/order', message: '歌手顺序已保存' },
  playlists: { selector: '[data-sort-list="playlists"]', mode: 'list', url: '/api/admin/playlists/order', message: '歌单顺序已保存' }
};

async function persistOrder(url, ids, message) {
  try {
    await api(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids })
    });
    await refreshLibrary();
    renderApp();
    showToast(message);
  } catch (error) {
    showToast(error.message);
    await refreshLibrary().catch(() => {});
    renderApp();
  }
}

export function mountAdminSort(tab) {
  const config = SORT_CONFIG[tab];
  if (!config) return;
  const container = document.querySelector(config.selector);
  if (!container) return;
  enableDragSort(container, {
    mode: config.mode,
    onEnd: ids => { void persistOrder(config.url, ids, config.message); }
  });
}
