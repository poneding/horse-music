import { icon } from '../core/icons.js';
import { renderApp } from '../core/render-bus.js';
import { albumPath, navigate } from '../core/router.js';
import { state } from '../core/state.js';
import { coverFor, escapeHtml } from '../core/util.js';
import { toggleFavorite } from '../data/favorites.js';
import { shareTrack } from '../features/share.js';
import { enqueueTrack, playTrack } from '../features/player.js';

let activeMenu = null;

function closeActiveMenu() {
  if (!activeMenu) return;
  const { element, cleanup } = activeMenu;
  activeMenu = null;
  cleanup();
  element.remove();
}

function menuItem(action, label, symbol, { active = false, disabled = false } = {}) {
  return `<button type="button" class="track-menu-item${active ? ' is-active' : ''}" role="menuitem" data-menu-action="${action}"${disabled ? ' disabled' : ''}>${icon(symbol, 16)}<span>${label}</span></button>`;
}

export function openTrackMenu(trackId, anchor, contextTracks = []) {
  const track = state.trackById.get(trackId);
  if (!track || !(anchor instanceof Element)) return null;
  if (activeMenu?.trackId === trackId) {
    closeActiveMenu();
    return null;
  }
  closeActiveMenu();

  const liked = state.favorites.has(track.id);
  const element = document.createElement('div');
  element.className = 'track-menu';
  element.setAttribute('role', 'menu');
  element.setAttribute('aria-label', `${track.title} 的操作`);
  element.innerHTML = `<div class="track-menu-head"><img src="${escapeHtml(coverFor(track))}" alt="" /><span><strong>${escapeHtml(track.title)}</strong><small>${escapeHtml(track.artist)}</small></span></div>
    ${menuItem('play', '立即播放', 'play')}
    ${menuItem('next', '下一首播放', 'queue')}
    ${menuItem('enqueue', '加入播放队列', 'list')}
    <div class="track-menu-rule"></div>
    ${menuItem('favorite', liked ? '取消收藏' : '收藏这首歌', 'heart', { active: liked })}
    ${track.album ? menuItem('album', '查看专辑', 'disc') : ''}
    ${menuItem('share', '分享歌曲', 'share')}`;
  document.body.append(element);

  const width = element.offsetWidth || 212;
  const height = element.offsetHeight || 280;
  const rect = anchor.getBoundingClientRect();
  let x = Math.min(Math.max(10, rect.right - width), window.innerWidth - width - 10);
  let y = rect.bottom + 6;
  if (y + height > window.innerHeight - 10) y = Math.max(10, rect.top - height - 6);
  element.style.setProperty('--menu-x', `${x}px`);
  element.style.setProperty('--menu-y', `${y}px`);

  const onPointerDown = event => {
    if (!(event.target instanceof Node)) return;
    if (element.contains(event.target) || anchor.contains(event.target)) return;
    closeActiveMenu();
  };
  const onKeyDown = event => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      closeActiveMenu();
      anchor.focus({ preventScroll: true });
    }
  };
  const timer = setTimeout(() => document.addEventListener('pointerdown', onPointerDown, true), 0);
  document.addEventListener('keydown', onKeyDown);

  const cleanup = () => {
    clearTimeout(timer);
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('keydown', onKeyDown);
  };

  element.addEventListener('click', event => {
    event.stopPropagation();
    const target = event.target instanceof Element ? event.target.closest('[data-menu-action]') : null;
    if (!target) return;
    const action = target.dataset.menuAction;
    closeActiveMenu();
    if (action === 'play') playTrack(track.id, contextTracks.length ? contextTracks : state.tracks);
    else if (action === 'next') enqueueTrack(track.id, 'next');
    else if (action === 'enqueue') enqueueTrack(track.id, 'end');
    else if (action === 'favorite') { toggleFavorite(track.id); renderApp(); }
    else if (action === 'album') navigate(albumPath(track.albumId || track.album));
    else if (action === 'share') shareTrack(track);
  });

  activeMenu = { element, cleanup, trackId };
  element.querySelector('.track-menu-item:not(:disabled)')?.focus({ preventScroll: true });
  return element;
}

export { closeActiveMenu };
