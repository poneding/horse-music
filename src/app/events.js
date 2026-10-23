import { currentRoute, back, forward, isAdminRoute, navigate, searchPath } from '../core/router.js';
import { renderApp } from '../core/render-bus.js';
import { ADMIN_PAGE_SIZE, state, TRACK_PAGE_SIZE } from '../core/state.js';
import { setTheme, toggleThemeMenu } from '../core/theme.js';
import { safeCssEscape } from '../core/util.js';
import { toggleFavorite } from '../data/favorites.js';
import { handlePlayerAction, playTrack, seekTo, setVolume } from '../features/player.js';
import { bindLyricsSwipe, getLyricsEntry } from '../features/lyrics.js';
import { admin } from '../admin/state.js';
import {
  deleteAlbum,
  deleteArtist,
  deletePlaylist,
  deleteTrack,
  handleAdminAction,
  openAlbumTracksDialog,
  openPlaylistEditor,
  openTrackEditDialog,
  openTrackLyricsDialog
} from '../admin/actions.js';

let searchTimer = null;
let adminSearchTimer = null;
let searchComposing = false;

function scheduleSearchRender() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    const input = document.querySelector('#search-input');
    const position = input?.selectionStart ?? state.query.length;
    renderApp();
    const next = document.querySelector('#search-input');
    if (next) {
      next.focus();
      const nextPosition = Math.min(position, state.query.length);
      next.setSelectionRange(nextPosition, nextPosition);
    }
  }, 150);
}

function scheduleAdminSearchRender() {
  clearTimeout(adminSearchTimer);
  adminSearchTimer = setTimeout(() => {
    const input = document.querySelector('#admin-track-search');
    const position = input?.selectionStart ?? admin.trackQuery.length;
    renderApp();
    const next = document.querySelector('#admin-track-search');
    if (next) {
      next.focus();
      const nextPosition = Math.min(position, admin.trackQuery.length);
      next.setSelectionRange(nextPosition, nextPosition);
    }
  }, 150);
}

function handleLinkClick(event, node) {
  const link = node.closest('a[data-link]');
  if (!link) return false;
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (link.target && link.target !== '_self') return false;
  event.preventDefault();
  navigate(link.getAttribute('href'));
  return true;
}

function handleGlobalClick(event) {
  const node = event.target;
  if (!(node instanceof Element)) return;
  const find = selector => node.closest(selector);

  const adminDropdown = find('details.admin-nav-dropdown');
  document.querySelectorAll('details.admin-nav-dropdown[open]').forEach(item => {
    if (item !== adminDropdown) item.open = false;
  });

  if (handleLinkClick(event, node)) return;

  const themeToggle = find('[data-theme-toggle]');
  if (themeToggle) { toggleThemeMenu(); return; }
  const themeChoice = find('[data-theme-choice]');
  if (themeChoice) { setTheme(themeChoice.dataset.themeChoice); return; }
  const close = find('[data-close]');
  if (close) { close.closest('dialog')?.close(); return; }
  const queueItem = find('[data-queue-index]');
  if (queueItem) {
    const index = Number(queueItem.dataset.queueIndex);
    const track = state.queue[index];
    if (track) playTrack(track.id, state.queue);
    return;
  }
  const adminAction = find('[data-admin-action]');
  if (adminAction) { handleAdminAction(adminAction.dataset.adminAction); return; }
  const deleteTrackButton = find('[data-delete-track]');
  if (deleteTrackButton) { void deleteTrack(deleteTrackButton.dataset.deleteTrack); return; }
  const editTrackButton = find('[data-edit-track]');
  if (editTrackButton) { openTrackEditDialog(editTrackButton.dataset.editTrack); return; }
  const trackLyricsButton = find('[data-track-lyrics]');
  if (trackLyricsButton) { openTrackLyricsDialog(trackLyricsButton.dataset.trackLyrics); return; }
  const editPlaylistButton = find('[data-edit-playlist]');
  if (editPlaylistButton) { openPlaylistEditor(editPlaylistButton.dataset.editPlaylist); return; }
  const deletePlaylistButton = find('[data-delete-playlist]');
  if (deletePlaylistButton) { void deletePlaylist(deletePlaylistButton.dataset.deletePlaylist); return; }
  const albumTracksButton = find('[data-album-tracks]');
  if (albumTracksButton) { void openAlbumTracksDialog(albumTracksButton.dataset.albumTracks); return; }
  const deleteAlbumButton = find('[data-delete-album]');
  if (deleteAlbumButton) { void deleteAlbum(deleteAlbumButton.dataset.deleteAlbum); return; }
  const deleteArtistButton = find('[data-delete-artist]');
  if (deleteArtistButton) { void deleteArtist(deleteArtistButton.dataset.deleteArtist); return; }

  const favorite = find('[data-favorite]');
  if (favorite) {
    const id = favorite.dataset.favorite;
    const liked = toggleFavorite(id);
    const escaped = safeCssEscape(id);
    document.querySelectorAll(`[data-favorite="${escaped}"]`).forEach(button => {
      button.classList.toggle('liked', liked);
      button.setAttribute('aria-label', liked ? '取消收藏' : '收藏');
    });
    if (currentRoute().name === 'favorites') renderApp();
    return;
  }
  const playTarget = find('[data-play-track]');
  if (playTarget) {
    const list = playTarget.closest('.track-list, .mini-list');
    const rows = list ? [...list.querySelectorAll('[data-track-row]')] : [];
    const visibleQueue = rows.map(row => state.trackById.get(row.dataset.trackRow)).filter(Boolean);
    playTrack(playTarget.dataset.playTrack, visibleQueue);
    return;
  }
  const routeButton = find('[data-route]');
  if (routeButton) { navigate(routeButton.dataset.route); return; }
  const genreButton = find('[data-genre]');
  if (genreButton) {
    state.genre = genreButton.dataset.genre;
    state.listLimit = TRACK_PAGE_SIZE;
    renderApp();
    return;
  }
  const actionButton = find('[data-action]');
  if (actionButton) {
    const action = actionButton.dataset.action;
    if (action === 'back') back();
    else if (action === 'forward') forward();
    else handlePlayerAction(action);
    return;
  }
  const lyricLine = find('[data-lyric]');
  if (lyricLine) {
    const entry = getLyricsEntry(state.queue[state.queueIndex]);
    const line = entry?.lines?.[Number(lyricLine.dataset.lyric)];
    if (line?.time != null) seekTo(line.time);
  }
}

function handleGlobalInput(event) {
  const target = event.target;
  if (target.id === 'search-input') {
    if (target.value === state.query) return;
    state.query = target.value;
    state.listLimit = TRACK_PAGE_SIZE;
    const onSearch = currentRoute().name === 'search';
    navigate(searchPath(state.query), { replace: onSearch, render: false });
    if (!searchComposing) scheduleSearchRender();
    return;
  }
  if (target.id === 'admin-track-search') {
    admin.trackQuery = target.value;
    admin.trackLimit = ADMIN_PAGE_SIZE;
    scheduleAdminSearchRender();
    return;
  }
  if (target.classList.contains('progress-slider')) {
    seekTo(Number(target.value));
    return;
  }
  if (target.classList.contains('volume-slider')) setVolume(target.value);
}

export function bindEvents() {
  bindLyricsSwipe();
  document.addEventListener('click', handleGlobalClick);
  document.addEventListener('input', handleGlobalInput);

  document.addEventListener('compositionstart', event => {
    if (event.target.id === 'search-input') searchComposing = true;
  });
  document.addEventListener('compositionend', event => {
    if (event.target.id === 'search-input') {
      searchComposing = false;
      scheduleSearchRender();
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      const openAdminDropdown = document.querySelector('details.admin-nav-dropdown[open]');
      if (openAdminDropdown) {
        openAdminDropdown.open = false;
        return;
      }
    }
    if (event.key === 'Escape' && state.themeMenuOpen) {
      state.themeMenuOpen = false;
      renderApp();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && !isAdminRoute(currentRoute())) {
      event.preventDefault();
      document.querySelector('#search-input')?.focus();
    }
    if (event.code === 'Space' && !['INPUT', 'TEXTAREA', 'BUTTON'].includes(document.activeElement?.tagName) && !isAdminRoute(currentRoute())) {
      event.preventDefault();
      handlePlayerAction('toggle-play');
    }
    if (event.key === 'Escape' && state.lyricsOpen) {
      state.lyricsOpen = false;
      renderApp();
    }
  });
}
