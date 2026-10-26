import { icon } from '../core/icons.js';
import { playlistPath } from '../core/router.js';
import { state } from '../core/state.js';
import { escapeHtml } from '../core/util.js';

function navItem(path, label, symbol, active = false) {
  return `<button class="nav-item ${active ? 'active' : ''}" data-route="${path}">${icon(symbol, 18)}<span>${label}</span></button>`;
}

export function renderSidebar(route) {
  const playlist = route.name === 'playlist' ? state.playlists.find(item => item.id === route.id) : null;
  return `<aside class="sidebar">
    <button class="brand" data-route="/"><span class="brand-mark">诗</span><span class="brand-name">一头诗人</span></button>
    <div class="sidebar-label">探索</div>
    <nav class="primary-nav">${navItem('/', '为你推荐', 'home', route.name === 'home')}${navItem('/discover', '发现音乐', 'search', route.name === 'discover')}${navItem('/recent', '最近播放', 'clock', route.name === 'recent')}${navItem('/charts', '播放排行', 'chart', route.name === 'charts')}${navItem('/library', '全部歌曲', 'library', route.name === 'library')}${navItem('/favorites', '我的收藏', 'heart', route.name === 'favorites')}</nav>
    <div class="sidebar-rule"></div>
    <div class="sidebar-heading"><span class="sidebar-label">我的歌单</span><button class="icon-button tiny" data-action="new-playlist" aria-label="新建歌单">${icon('plus', 17)}</button></div>
    <nav class="playlist-nav">${state.playlists.slice(0, 7).map(item => `<button class="playlist-nav-item ${playlist?.id === item.id ? 'active' : ''}" data-route="${playlistPath(item.id)}"><span class="playlist-dot"></span>${escapeHtml(item.title)}</button>`).join('')}</nav>
    <div class="sidebar-bottom"><a class="admin-link" href="/admin" data-link>${icon('disc', 15)} 管理音乐库</a></div>
  </aside>`;
}

export function renderMobileNav(route) {
  return `<nav class="mobile-nav">${navItem('/', '推荐', 'home', route.name === 'home')}${navItem('/recent', '最近', 'clock', route.name === 'recent')}${navItem('/charts', '排行', 'chart', route.name === 'charts')}${navItem('/library', '曲库', 'library', route.name === 'library')}${navItem('/favorites', '收藏', 'heart', route.name === 'favorites')}</nav>`;
}
