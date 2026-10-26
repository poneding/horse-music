import { currentRoute, back, forward, isAdminRoute, navigate, searchPath } from '../core/router.js';
import { renderApp } from '../core/render-bus.js';
import { ADMIN_PAGE_SIZE, currentTrack, state, TRACK_PAGE_SIZE } from '../core/state.js';
import { setTheme, toggleThemeMenu } from '../core/theme.js';
import { showToast } from '../core/toast.js';
import { safeCssEscape } from '../core/util.js';
import { toggleFavorite } from '../data/favorites.js';
import { retryShare } from '../data/shares.js';
import { shareAlbum, sharePlaylist, shareTrack } from '../features/share.js';
import { handlePlayerAction, playTrack, seekTo, setVolume } from '../features/player.js';
import { bindLyricsSwipe, getLyricsEntry } from '../features/lyrics.js';
import { openTrackMenu } from '../components/track-menu.js';
import { bindSearchSuggestions } from '../components/search-suggestions.js';
import { rememberSearch } from '../data/search-history.js';
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

function syncFavoriteButtons(id, liked) {
  const escaped = safeCssEscape(id);
  document.querySelectorAll(`[data-favorite="${escaped}"]`).forEach(button => {
    button.classList.toggle('liked', liked);
    button.setAttribute('aria-label', liked ? '取消收藏' : '收藏');
  });
}

function toggleFavoriteAndSync(id) {
  const liked = toggleFavorite(id);
  syncFavoriteButtons(id, liked);
  if (currentRoute().name === 'favorites') renderApp();
  return liked;
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

  if (handleLinkClick(event, node)) {
    if (currentRoute().name === 'search' && state.query) rememberSearch(state.query);
    return;
  }

  const themeToggle = find('[data-theme-toggle]');
  if (themeToggle) { toggleThemeMenu(); return; }
  const themeChoice = find('[data-theme-choice]');
  if (themeChoice) { setTheme(themeChoice.dataset.themeChoice); return; }
  const close = find('[data-close]');
  if (close) { close.closest('dialog')?.close(); return; }
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

  const shareTrackButton = find('[data-share-track]');
  if (shareTrackButton) {
    const track = state.trackById.get(shareTrackButton.dataset.shareTrack);
    if (track) shareTrack(track);
    return;
  }
  const shareAlbumButton = find('[data-share-album]');
  if (shareAlbumButton) {
    const id = shareAlbumButton.dataset.shareAlbum;
    const album = state.albums.find(item => item.id === id) || null;
    if (album) shareAlbum(album);
    return;
  }
  const sharePlaylistButton = find('[data-share-playlist]');
  if (sharePlaylistButton) {
    const id = sharePlaylistButton.dataset.sharePlaylist;
    const playlist = state.playlists.find(item => item.id === id) || null;
    if (playlist) sharePlaylist(playlist);
    return;
  }
  if (find('[data-share-current]')) {
    const track = currentTrack();
    if (track) shareTrack(track);
    return;
  }
  const shareRetryButton = find('[data-share-page-retry]');
  if (shareRetryButton) { void retryShare(shareRetryButton.dataset.sharePageRetry); return; }

  const favorite = find('[data-favorite]');
  if (favorite) {
    toggleFavoriteAndSync(favorite.dataset.favorite);
    return;
  }
  const playTarget = find('[data-play-track]');
  if (playTarget) {
    const list = playTarget.closest('.track-list, .mini-list');
    const rows = list ? [...list.querySelectorAll('[data-track-row]')] : [];
    const visibleQueue = rows.map(row => state.trackById.get(row.dataset.trackRow)).filter(Boolean);
    if (currentRoute().name === 'search' && state.query) rememberSearch(state.query);
    playTrack(playTarget.dataset.playTrack, visibleQueue);
    return;
  }
  const trackMenuButton = find('[data-track-menu]');
  if (trackMenuButton) {
    const list = trackMenuButton.closest('.track-list, .mini-list');
    const rows = list ? [...list.querySelectorAll('[data-track-row]')] : [];
    const contextTracks = rows.map(row => state.trackById.get(row.dataset.trackRow)).filter(Boolean);
    openTrackMenu(trackMenuButton.dataset.trackMenu, trackMenuButton, contextTracks);
    return;
  }
  const routeButton = find('[data-route]');
  if (routeButton) {
    if (currentRoute().name === 'search' && state.query) rememberSearch(state.query);
    navigate(routeButton.dataset.route);
    return;
  }
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
    const entry = getLyricsEntry(currentTrack());
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
  if (target.matches('[data-sort]')) {
    state.sort = target.value;
    state.listLimit = TRACK_PAGE_SIZE;
    renderApp();
    // 重新渲染会替换 select，恢复焦点以便继续用键盘切换排序。
    document.querySelector('[data-sort]')?.focus({ preventScroll: true });
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
  bindSearchSuggestions();
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
    // 弹窗和曲目菜单自己处理 Esc，避免同时关闭全屏歌词或触发页面快捷键。
    if (document.querySelector('dialog[open]') || document.querySelector('.track-menu')) return;
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
      return;
    }
    if (event.key === 'Escape' && state.lyricsOpen) {
      state.lyricsOpen = false;
      renderApp();
      return;
    }

    const active = document.activeElement;
    const typing = active && (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(active.tagName) || active.isContentEditable);
    if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
    // 管理端有自己的表单和滚动操作，播放快捷键只在播放器页面生效；底部播放条仍可直接点击。
    if (isAdminRoute(currentRoute())) return;

    if (event.code === 'Space') {
      event.preventDefault();
      handlePlayerAction('toggle-play');
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const step = (event.shiftKey ? 30 : 5) * (event.key === 'ArrowLeft' ? -1 : 1);
      seekTo(state.currentTime + step);
      return;
    }
    const key = event.key.toLowerCase();
    if (key === 'm') { handlePlayerAction('mute'); return; }
    if (key === 's') { handlePlayerAction('shuffle'); return; }
    if (key === 'r') { handlePlayerAction('repeat'); return; }
    if (key === 'l') {
      const track = currentTrack();
      if (!track) return;
      const liked = toggleFavoriteAndSync(track.id);
      showToast(liked ? '已收藏这首歌' : '已取消收藏');
    }
  });
}
