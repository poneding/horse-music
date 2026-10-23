import { state } from '../core/state.js';
import { playlistCard } from '../components/cards.js';
import { renderPageHeading } from '../components/page-heading.js';

export function renderDiscover() {
  return `${renderPageHeading({
    eyebrow: 'DISCOVER',
    title: '发现音乐',
    description: `${state.playlists.length} 份歌单，选一份适合此刻的心情。`
  })}<section class="track-section inner-track-section"><div class="playlist-grid discover-grid">${state.playlists.map(playlistCard).join('') || '<p class="empty-hint">还没有歌单，从管理端创建一个吧。</p>'}</div></section>`;
}
