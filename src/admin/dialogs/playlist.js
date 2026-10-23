import { api } from '../../core/api.js';
import { enableDragSort } from '../../core/drag-sort.js';
import { icon } from '../../core/icons.js';
import { renderApp } from '../../core/render-bus.js';
import { IMG_LAZY, state } from '../../core/state.js';
import { showToast } from '../../core/toast.js';
import { coverFor, escapeHtml } from '../../core/util.js';
import { refreshLibrary } from '../../data/library.js';
import { dialogShell } from '../../components/dialog.js';

const AVAILABLE_LIMIT = 200;

export function openPlaylistEditor(id) {
  const playlist = state.playlists.find(item => item.id === id);
  if (!playlist) return null;
  const known = new Set(state.tracks.map(track => track.id));
  let selected = playlist.trackIds.filter(trackId => known.has(trackId));
  let query = '';

  const dialog = dialogShell(`<div class="dialog-head"><div><span class="eyebrow">CURATE A PLAYLIST</span><h2>管理歌曲</h2><p>${escapeHtml(playlist.title)} · 拖拽左侧歌曲可调整播放顺序</p></div><button type="button" class="icon-button" data-close>${icon('close', 19)}</button></div><div class="playlist-editor"><section class="playlist-editor-pane"><div class="playlist-editor-head"><h3>已选歌曲</h3><span data-selected-count></span></div><div class="sort-list playlist-selected" data-playlist-selected></div></section><section class="playlist-editor-pane"><div class="playlist-editor-head"><h3>添加歌曲</h3></div><label class="table-search playlist-search">${icon('search', 15)}<input data-playlist-search placeholder="搜索歌曲或艺人" /></label><div class="sort-list playlist-available" data-playlist-available></div></section></div><div class="dialog-actions"><button type="button" class="button button-quiet" data-close>取消</button><button type="button" class="button button-dark" data-save-playlist>保存歌单</button></div>`, 'form-dialog playlist-dialog');

  const selectedEl = dialog.querySelector('[data-playlist-selected]');
  const availableEl = dialog.querySelector('[data-playlist-available]');
  const countEl = dialog.querySelector('[data-selected-count]');
  const searchEl = dialog.querySelector('[data-playlist-search]');

  const renderSelected = () => {
    countEl.textContent = `${selected.length} 首`;
    selectedEl.innerHTML = selected.length
      ? selected.map(trackId => {
        const track = state.trackById.get(trackId);
        return `<div class="sort-row" data-sort-id="${escapeHtml(track.id)}"><button type="button" class="drag-handle" data-drag-handle aria-label="拖拽排序">${icon('grip', 15)}</button><img ${IMG_LAZY} src="${escapeHtml(coverFor(track))}" alt=""/><span class="sort-copy"><strong>${escapeHtml(track.title)}</strong><small>${escapeHtml(track.artist)}</small></span><button type="button" class="icon-button tiny" data-remove-track="${escapeHtml(track.id)}" aria-label="移除">${icon('close', 15)}</button></div>`;
      }).join('')
      : '<div class="sort-empty">还没有选择歌曲，从右侧添加</div>';
  };

  const renderAvailable = () => {
    const keyword = query.trim().toLowerCase();
    const chosen = new Set(selected);
    const items = state.tracks.filter(track => !chosen.has(track.id) && (!keyword || (state.searchHaystack.get(track.id) || '').includes(keyword)));
    const shown = items.slice(0, AVAILABLE_LIMIT);
    availableEl.innerHTML = shown.length
      ? shown.map(track => `<div class="sort-row available-row"><img ${IMG_LAZY} src="${escapeHtml(coverFor(track))}" alt=""/><span class="sort-copy"><strong>${escapeHtml(track.title)}</strong><small>${escapeHtml(track.artist)}${track.album ? ` · ${escapeHtml(track.album)}` : ''}</small></span><button type="button" class="icon-button tiny" data-add-track="${escapeHtml(track.id)}" aria-label="添加">${icon('plus', 15)}</button></div>`).join('')
      : `<div class="sort-empty">${keyword ? '没有找到相关歌曲' : '曲库里的歌曲都已加入'}</div>`;
    if (items.length > shown.length) {
      availableEl.insertAdjacentHTML('beforeend', `<div class="available-more">还有 ${items.length - shown.length} 首，输入关键词继续筛选</div>`);
    }
  };

  enableDragSort(selectedEl, { mode: 'list', onEnd: ids => { selected = ids; } });

  selectedEl.addEventListener('click', event => {
    const button = event.target.closest('[data-remove-track]');
    if (!button) return;
    selected = selected.filter(trackId => trackId !== button.dataset.removeTrack);
    renderSelected();
    renderAvailable();
  });

  availableEl.addEventListener('click', event => {
    const button = event.target.closest('[data-add-track]');
    if (!button) return;
    if (!selected.includes(button.dataset.addTrack)) selected.push(button.dataset.addTrack);
    renderSelected();
    renderAvailable();
  });

  searchEl.addEventListener('input', () => {
    query = searchEl.value;
    renderAvailable();
  });

  renderSelected();
  renderAvailable();

  dialog.querySelector('[data-save-playlist]').addEventListener('click', async event => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await api(`/api/admin/playlists/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackIds: selected })
      });
      await refreshLibrary();
      dialog.close();
      renderApp();
      showToast(`歌单已保存 · ${selected.length} 首歌曲`);
    } catch (error) {
      showToast(error.message);
      button.disabled = false;
    }
  });

  return dialog;
}
