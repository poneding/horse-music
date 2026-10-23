import { icon } from '../../core/icons.js';
import { IMG_LAZY, state } from '../../core/state.js';
import { coverFor, escapeHtml } from '../../core/util.js';
import { albumTracks } from '../../data/library.js';

export function renderAlbums() {
  return `<div class="admin-page-heading"><div><span class="eyebrow">YOUR RECORDS</span><h1>专辑管理</h1><p>管理 ${state.albums.length} 张专辑与作品集；拖动封面上的手柄排序，点列表图标调整专辑内曲目顺序。</p></div><button class="button button-dark" data-admin-action="new-album">${icon('plus', 16)} 创建专辑</button></div><div class="admin-manage-album-grid" data-sort-list="albums">${state.albums.map(album => `<article class="manage-album" data-sort-id="${escapeHtml(album.id)}"><span class="manage-cover"><img ${IMG_LAZY} src="${escapeHtml(coverFor(album))}" alt=""/><button type="button" class="drag-handle manage-grip" data-drag-handle title="拖拽排序" aria-label="拖拽排序">${icon('grip', 16)}</button></span><div><span class="eyebrow">ALBUM</span><h2>${escapeHtml(album.title)}</h2><p>${escapeHtml(album.artist || '未知艺人')}</p><small>${albumTracks(album).length} 首歌曲${album.description ? ` · ${escapeHtml(album.description)}` : ''}</small></div><span class="manage-actions"><button class="icon-button" data-album-tracks="${escapeHtml(album.id)}" title="曲目顺序" aria-label="曲目顺序">${icon('list', 16)}</button><button class="icon-button delete-button" data-delete-album="${escapeHtml(album.id)}" title="删除专辑" aria-label="删除专辑">${icon('trash', 16)}</button></span></article>`).join('') || '<div class="admin-empty">暂时没有专辑</div>'}</div>`;
}
