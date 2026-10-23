import { icon } from '../../core/icons.js';
import { IMG_LAZY, state } from '../../core/state.js';
import { coverFor, escapeHtml } from '../../core/util.js';
import { artistAlbumCount, artistTracks } from '../../data/library.js';

export function renderArtists() {
  return `<div class="admin-page-heading"><div><span class="eyebrow">VOICES IN YOUR LIBRARY</span><h1>歌手管理</h1><p>曲库中有 ${state.artists.length} 位歌手；拖拽头像上的手柄可调整顺序，上传音乐时会读取标签并自动创建。</p></div></div><div class="admin-manage-album-grid" data-sort-list="artists">${state.artists.map(artist => `<article class="manage-album manage-artist" data-sort-id="${escapeHtml(artist.id)}"><span class="manage-cover"><img ${IMG_LAZY} src="${escapeHtml(coverFor(artist))}" alt=""/><button type="button" class="drag-handle manage-grip" data-drag-handle title="拖拽排序" aria-label="拖拽排序">${icon('grip', 16)}</button></span><div><span class="eyebrow">ARTIST</span><h2>${escapeHtml(artist.name)}</h2><p>${artistTracks(artist).length} 首歌曲 · ${artistAlbumCount(artist)} 张专辑</p><small>${artist.description ? escapeHtml(artist.description) : '由上传音乐的标签自动创建'}</small></div><button class="icon-button delete-button" data-delete-artist="${escapeHtml(artist.id)}" title="删除歌手档案" aria-label="删除歌手档案">${icon('trash', 16)}</button></article>`).join('') || '<div class="admin-empty">还没有歌手档案，上传带艺人标签的音乐即可自动创建。</div>'}</div>`;
}
