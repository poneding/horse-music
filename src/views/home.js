import { icon } from '../core/icons.js';
import { state } from '../core/state.js';
import { dateLabel } from '../core/util.js';
import { albumCard, artistCard, playlistCard } from '../components/cards.js';
import { renderHomeActivity } from '../components/home-activity.js';
import { renderFilters, renderTrackList } from '../components/track-list.js';
import { filteredTracks } from '../data/library.js';

export function renderHome() {
  const tracks = filteredTracks();
  return `<section class="welcome-strip"><div><span class="eyebrow">${dateLabel()}</span><h1>让今天，<em>有点不一样。</em></h1><p>收好耳机，把喜欢的旋律留给自己。</p></div><span class="welcome-sparkle">${icon('sparkle', 58)}</span></section>
  <section class="featured-section"><div class="section-heading"><div><span class="eyebrow">CURATED FOR YOU</span><h2>今天想听什么？</h2></div><button class="text-link" data-route="/discover">探索全部歌单 ${icon('arrow', 15)}</button></div><div class="playlist-grid">${state.playlists.slice(0, 3).map(playlistCard).join('') || '<p class="empty-hint">还没有歌单，从管理端创建一个吧。</p>'}</div></section>
  <section class="featured-section album-section"><div class="section-heading"><div><span class="eyebrow">FROM YOUR LIBRARY</span><h2>专辑与故事</h2></div><button class="text-link" data-route="/albums">查看全部 ${icon('arrow', 15)}</button></div><div class="album-grid">${state.albums.slice(0, 4).map(albumCard).join('')}</div></section>
  <section class="featured-section artist-section"><div class="section-heading"><div><span class="eyebrow">VOICES IN YOUR LIBRARY</span><h2>歌手</h2></div><span class="subtle-count">${state.artists.length} 位歌手</span></div><div class="artist-grid">${state.artists.slice(0, 6).map(artistCard).join('') || '<p class="empty-hint">还没有歌手档案，上传音乐后会自动创建。</p>'}</div></section>
  ${renderHomeActivity()}
  <section class="track-section"><div class="section-heading track-section-heading"><div><span class="eyebrow">FRESH FINDS</span><h2>为你挑选的歌曲</h2></div><button class="round-play" data-action="play-filtered" aria-label="播放列表">${icon('play', 18)}</button></div>${renderFilters(tracks.length)}${renderTrackList(tracks)}</section>`;
}
