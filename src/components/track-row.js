import { icon } from '../core/icons.js';
import { albumPath } from '../core/router.js';
import { currentTrack, IMG_LAZY, state } from '../core/state.js';
import { coverFor, escapeHtml, formatTime } from '../core/util.js';

export function trackRow(track, index, showAlbum = true, meta = '') {
  const current = currentTrack()?.id === track.id;
  const liked = state.favorites.has(track.id);
  const album = track.album
    ? `<button class="track-album" data-route="${albumPath(track.albumId || track.album)}">${escapeHtml(track.album)}</button>`
    : '<span class="track-album">单曲</span>';
  return `<div class="track-row ${current ? 'is-current' : ''}" data-track-row="${escapeHtml(track.id)}">
    <button class="track-index" data-play-track="${escapeHtml(track.id)}" aria-label="播放 ${escapeHtml(track.title)}">${current && state.playing ? '<span class="playing-bars"><i></i><i></i><i></i></span>' : `<span class="row-number">${String(index + 1).padStart(2, '0')}</span><span class="row-play">${icon('play', 14)}</span>`}</button>
    <button class="track-main" data-play-track="${escapeHtml(track.id)}"><img class="track-cover" ${IMG_LAZY} src="${escapeHtml(coverFor(track))}" alt="" /><span class="track-copy"><strong>${escapeHtml(track.title)}</strong><span>${escapeHtml(track.artist)}</span></span></button>
    ${showAlbum ? album : ''}
    <span class="track-genre">${meta ? escapeHtml(meta) : escapeHtml(track.genre || '未分类')}</span>
    <div class="track-actions"><button class="icon-button track-like ${liked ? 'liked' : ''}" data-favorite="${escapeHtml(track.id)}" aria-label="${liked ? '取消收藏' : '收藏'}">${icon('heart', 17)}</button><button class="icon-button track-more" data-track-menu="${escapeHtml(track.id)}" aria-label="${escapeHtml(track.title)} 的更多操作" title="更多操作">${icon('more', 16)}</button></div>
    <span class="track-duration">${track.duration ? formatTime(track.duration) : '--:--'}</span>
  </div>`;
}
