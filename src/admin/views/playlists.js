import { icon } from '../../core/icons.js';
import { IMG_LAZY, state } from '../../core/state.js';
import { escapeHtml } from '../../core/util.js';
import { playlistCover } from '../../data/library.js';

export function renderPlaylists() {
  return `<div class="admin-page-heading"><div><span class="eyebrow">MIX YOUR MOMENTS</span><h1>歌单管理</h1><p>用喜欢的歌曲编织 ${state.playlists.length} 份歌单；悬浮后拖动封面左上角的手柄调整歌单顺序。</p></div><button class="button button-dark" data-admin-action="new-playlist">${icon('plus', 16)} 新建歌单</button></div><section class="playlist-admin-list" data-sort-list="playlists">${state.playlists.map(playlist => `<article class="playlist-admin-row" data-sort-id="${escapeHtml(playlist.id)}"><span class="manage-cover playlist-cover"><img ${IMG_LAZY} src="${escapeHtml(playlistCover(playlist))}" alt=""/><button type="button" class="drag-handle manage-grip" data-drag-handle title="拖拽排序" aria-label="拖拽排序">${icon('grip', 15)}</button></span><div class="playlist-admin-copy"><strong>${escapeHtml(playlist.title)}</strong><span>${escapeHtml(playlist.description || '暂无描述')}</span><small>${playlist.trackIds.length} 首歌曲</small></div><button class="button button-outline" data-edit-playlist="${escapeHtml(playlist.id)}">${icon('list', 15)} 管理歌曲</button><button class="icon-button delete-button" data-delete-playlist="${escapeHtml(playlist.id)}" title="删除歌单">${icon('trash', 16)}</button></article>`).join('') || '<div class="admin-empty">还没有歌单，创建一份自己的精选吧。</div>'}</section>`;
}
