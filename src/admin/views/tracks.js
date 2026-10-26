import { icon } from '../../core/icons.js';
import { IMG_LAZY, state } from '../../core/state.js';
import { coverFor, escapeHtml } from '../../core/util.js';
import { admin } from '../state.js';

export function filteredAdminTracks() {
  const query = (admin.trackQuery || '').trim().toLowerCase();
  return query ? state.tracks.filter(track => (state.searchHaystack.get(track.id) || '').includes(query)) : state.tracks;
}

export function pruneTrackSelection() {
  const existing = new Set(state.tracks.map(track => track.id));
  for (const id of admin.trackSelection) {
    if (!existing.has(id)) admin.trackSelection.delete(id);
  }
}

function renderBulkBar() {
  const disabled = admin.trackBatchBusy ? ' disabled' : '';
  const noPlaylists = state.playlists.length === 0;
  if (!state.playlists.some(playlist => playlist.id === admin.bulkPlaylistId)) {
    admin.bulkPlaylistId = state.playlists[0]?.id || '';
  }
  const playlistOptions = state.playlists
    .map(playlist => `<option value="${escapeHtml(playlist.id)}"${playlist.id === admin.bulkPlaylistId ? ' selected' : ''}>${escapeHtml(playlist.title)}</option>`)
    .join('');
  return `<div class="admin-bulk-bar" data-track-bulk-bar${admin.trackSelection.size ? '' : ' hidden'}><span class="bulk-count">已选择 <strong data-bulk-count>${admin.trackSelection.size}</strong> 首</span><button class="button button-outline" data-admin-action="select-all-tracks"${disabled}>全选当前结果</button><button class="button button-outline" data-admin-action="clear-track-selection"${disabled}>清空选择</button><button class="button button-outline bulk-delete" data-admin-action="bulk-delete-tracks"${disabled}>${icon('trash', 14)} 批量删除</button><span class="bulk-playlist"><label for="admin-bulk-playlist">加入歌单</label><select id="admin-bulk-playlist" data-bulk-playlist data-bulk-requires-playlist aria-label="选择要加入的歌单"${noPlaylists || admin.trackBatchBusy ? ' disabled' : ''}>${playlistOptions || '<option value="">暂无歌单</option>'}</select><button class="button button-dark" data-admin-action="bulk-add-to-playlist" data-bulk-requires-playlist${noPlaylists || admin.trackBatchBusy ? ' disabled' : ''}>加入</button></span></div>`;
}

export function renderTracks() {
  pruneTrackSelection();
  const filtered = filteredAdminTracks();
  const visible = filtered.slice(0, admin.trackLimit);
  const remaining = filtered.length - visible.length;
  const selectedFiltered = filtered.filter(track => admin.trackSelection.has(track.id)).length;
  const allFilteredSelected = filtered.length > 0 && selectedFiltered === filtered.length;
  return `<div class="admin-page-heading"><div><span class="eyebrow">TRACK LIBRARY</span><h1>歌曲管理</h1><p>你的音乐曲库中共有 ${state.tracks.length} 首歌曲。</p></div><button class="button button-dark" data-admin-action="upload">${icon('upload', 16)} 上传音乐</button></div><section class="admin-section-card full-table"><div class="table-toolbar"><div class="table-search">${icon('search', 16)}<input id="admin-track-search" value="${escapeHtml(admin.trackQuery || '')}" placeholder="搜索歌曲或艺人" /></div><span>${filtered.length} 首歌曲</span></div>${renderBulkBar()}<div class="admin-track-table"><div class="admin-table-head"><span class="table-select-cell"><input type="checkbox" data-track-select-all aria-label="全选当前筛选的歌曲"${allFilteredSelected ? ' checked' : ''}${admin.trackBatchBusy ? ' disabled' : ''}/></span><span>#</span><span>歌曲</span><span>专辑</span><span>风格</span><span>操作</span></div>${visible.map((track, index) => `<div class="admin-table-row${admin.trackSelection.has(track.id) ? ' is-selected' : ''}"><span class="table-select-cell"><input type="checkbox" data-track-select="${escapeHtml(track.id)}" aria-label="选择歌曲 ${escapeHtml(track.title)}"${admin.trackSelection.has(track.id) ? ' checked' : ''}${admin.trackBatchBusy ? ' disabled' : ''}/></span><span>${String(index + 1).padStart(2, '0')}</span><span class="table-song"><img ${IMG_LAZY} src="${escapeHtml(coverFor(track))}" alt=""/><span><strong>${escapeHtml(track.title)}</strong><small>${escapeHtml(track.artist)}</small></span></span><span>${escapeHtml(track.album || '单曲')}</span><span><i class="genre-dot"></i>${escapeHtml(track.genre || '未分类')}</span><span class="table-actions"><button class="icon-button" data-edit-track="${escapeHtml(track.id)}" title="编辑歌曲" aria-label="编辑歌曲">${icon('edit', 15)}</button><button class="icon-button ${track.hasLyrics ? 'lyrics-ready' : ''}" data-track-lyrics="${escapeHtml(track.id)}" title="${track.hasLyrics ? '歌词（已匹配）' : '匹配歌词'}" aria-label="歌词">${icon('lyrics', 15)}</button><button class="icon-button delete-button" data-delete-track="${escapeHtml(track.id)}" title="删除歌曲" aria-label="删除歌曲">${icon('trash', 15)}</button></span></div>`).join('') || `<div class="admin-empty">${admin.trackQuery.trim() ? '没有找到匹配的歌曲' : '曲库还没有歌曲，上传第一首吧。'}</div>`}</div>${remaining > 0 ? `<div class="table-more"><button class="button button-outline" data-admin-action="load-more-tracks">加载更多（剩余 ${remaining} 首）</button></div>` : ''}</section>`;
}

function syncTrackSelectionUI() {
  const selection = admin.trackSelection;
  document.querySelectorAll('[data-track-select]').forEach(input => {
    const selected = selection.has(input.dataset.trackSelect);
    input.checked = selected;
    input.disabled = admin.trackBatchBusy;
    input.closest('.admin-table-row')?.classList.toggle('is-selected', selected);
  });

  const header = document.querySelector('[data-track-select-all]');
  if (header) {
    const filtered = filteredAdminTracks();
    const selectedCount = filtered.filter(track => selection.has(track.id)).length;
    header.checked = filtered.length > 0 && selectedCount === filtered.length;
    header.indeterminate = selectedCount > 0 && selectedCount < filtered.length;
    header.disabled = admin.trackBatchBusy;
  }

  const bar = document.querySelector('[data-track-bulk-bar]');
  if (!bar) return;
  bar.hidden = selection.size === 0;
  const count = bar.querySelector('[data-bulk-count]');
  if (count) count.textContent = String(selection.size);
  bar.querySelectorAll('button, select').forEach(control => {
    control.disabled = admin.trackBatchBusy || (control.dataset.bulkRequiresPlaylist !== undefined && state.playlists.length === 0);
  });
}

export function mountTrackSelection() {
  const table = document.querySelector('.admin-track-table');
  if (!table) return;
  document.querySelector('[data-track-bulk-bar]')?.addEventListener('change', event => {
    const select = event.target instanceof Element ? event.target.closest('[data-bulk-playlist]') : null;
    if (select) admin.bulkPlaylistId = select.value;
  });
  table.addEventListener('change', event => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (admin.trackBatchBusy) {
      target.checked = !target.checked;
      return;
    }
    if (target.matches('[data-track-select]')) {
      if (target.checked) admin.trackSelection.add(target.dataset.trackSelect);
      else admin.trackSelection.delete(target.dataset.trackSelect);
      syncTrackSelectionUI();
      return;
    }
    if (target.matches('[data-track-select-all]')) {
      const filtered = filteredAdminTracks();
      for (const track of filtered) {
        if (target.checked) admin.trackSelection.add(track.id);
        else admin.trackSelection.delete(track.id);
      }
      syncTrackSelectionUI();
    }
  });
  syncTrackSelectionUI();
}
