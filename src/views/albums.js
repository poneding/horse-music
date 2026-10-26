import { state } from '../core/state.js';
import { albumCard } from '../components/cards.js';
import { renderPageHeading } from '../components/page-heading.js';

export function renderAlbums() {
  return `${renderPageHeading({
    eyebrow: 'ALBUMS & STORIES',
    title: '专辑与故事',
    description: `${state.albums.length} 张专辑与作品集 · 按管理端顺序排列`
  })}<section class="track-section inner-track-section"><div class="album-grid all-albums-grid">${state.albums.map(albumCard).join('') || '<p class="empty-hint">还没有专辑，上传音乐后会自动创建。</p>'}</div></section>`;
}
