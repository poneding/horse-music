import { api } from '../../core/api.js';
import { enableDragSort } from '../../core/drag-sort.js';
import { icon } from '../../core/icons.js';
import { renderApp } from '../../core/render-bus.js';
import { IMG_LAZY, state } from '../../core/state.js';
import { showToast } from '../../core/toast.js';
import { coverFor, escapeHtml } from '../../core/util.js';
import { albumTracks, refreshLibrary } from '../../data/library.js';
import { dialogShell } from '../../components/dialog.js';

export function openAlbumTracksDialog(albumId) {
  const album = state.albums.find(item => item.id === albumId);
  if (!album) return null;
  const tracks = albumTracks(album);
  const dialog = dialogShell(`<div class="dialog-head"><div><span class="eyebrow">TRACK ORDER</span><h2>曲目顺序</h2><p>${escapeHtml(album.title)} · ${tracks.length} 首歌曲</p></div><button type="button" class="icon-button" data-close>${icon('close', 19)}</button></div><div class="sort-list album-tracks-dialog-list">${tracks.map(track => `<div class="sort-row" data-sort-id="${escapeHtml(track.id)}"><button type="button" class="drag-handle" data-drag-handle aria-label="拖拽排序">${icon('grip', 15)}</button><img ${IMG_LAZY} src="${escapeHtml(coverFor(track))}" alt=""/><span class="sort-copy"><strong>${escapeHtml(track.title)}</strong><small>${escapeHtml(track.artist)}</small></span></div>`).join('') || '<div class="sort-empty">这张专辑还没有歌曲</div>'}</div><div class="dialog-actions"><button type="button" class="button button-quiet" data-close>取消</button><button type="button" class="button button-dark" data-save-order${tracks.length < 2 ? ' disabled' : ''}>保存顺序</button></div>`, 'form-dialog album-tracks-dialog');
  const list = dialog.querySelector('.sort-list');
  enableDragSort(list, { mode: 'list' });
  dialog.querySelector('[data-save-order]')?.addEventListener('click', async event => {
    const button = event.currentTarget;
    const trackIds = [...list.querySelectorAll('[data-sort-id]')].map(node => node.dataset.sortId);
    button.disabled = true;
    try {
      await api(`/api/admin/albums/${encodeURIComponent(album.id)}/order`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackIds })
      });
      await refreshLibrary();
      dialog.close();
      renderApp();
      showToast('曲目顺序已保存');
    } catch (error) {
      showToast(error.message);
      button.disabled = false;
    }
  });
  return dialog;
}
