import { currentRoute, isAdminRoute } from '../core/router.js';
import { currentTrack, state } from '../core/state.js';
import { collectionFor } from '../data/collections.js';
import { adminLabel } from '../admin/routes.js';
import { ensureLyrics, scrollActiveLyric } from '../features/lyrics.js';
import { renderLyricsPanel } from '../components/lyrics-panel.js';
import { renderMobileNav, renderSidebar } from '../components/sidebar.js';
import { renderPlayerBar } from '../components/player-bar.js';
import { renderTopbar } from '../components/topbar.js';
import { renderAdmin } from '../admin/layout.js';
import { renderHome } from '../views/home.js';
import { renderDiscover } from '../views/discover.js';
import { renderLibrary } from '../views/library.js';
import { renderFavorites } from '../views/favorites.js';
import { renderRecent } from '../views/recent.js';
import { renderCharts } from '../views/charts.js';
import { renderCollection } from '../views/collection.js';

const app = document.querySelector('#app');
const PAGE_TITLES = {
  home: '一头诗人',
  discover: '发现音乐 · 一头诗人',
  library: '全部歌曲 · 一头诗人',
  search: '搜索结果 · 一头诗人',
  favorites: '我的收藏 · 一头诗人',
  recent: '最近播放 · 一头诗人',
  charts: '播放排行 · 一头诗人'
};

function setDocumentTitle(route) {
  if (route.name.startsWith('admin-')) {
    document.title = `${adminLabel(route)} · 一头诗人`;
    return;
  }
  const collection = collectionFor(route);
  document.title = collection ? `${collection.title} · 一头诗人` : PAGE_TITLES[route.name] || '一头诗人';
}

function renderRouteContent(route) {
  if (route.name === 'home') return renderHome();
  if (route.name === 'discover') return renderDiscover();
  if (route.name === 'library' || route.name === 'search') return renderLibrary(route);
  if (route.name === 'favorites') return renderFavorites();
  if (route.name === 'recent') return renderRecent();
  if (route.name === 'charts') return renderCharts();
  if (route.name === 'playlist' || route.name === 'album' || route.name === 'artist') return renderCollection(route);
  return renderHome();
}

function renderPlayerApp(route) {
  const current = currentTrack();
  if (current) ensureLyrics(current);
  app.innerHTML = `<div class="app-shell">
    ${renderSidebar(route)}
    <main class="main-panel">
      ${renderTopbar()}
      <div class="page-content">${renderRouteContent(route)}</div>
    </main>
    ${renderPlayerBar()}
    ${renderMobileNav(route)}
    ${state.lyricsOpen ? renderLyricsPanel() : ''}<div class="toast-host"></div>
  </div>`;
  if (state.lyricsOpen) requestAnimationFrame(() => scrollActiveLyric('auto'));
}

export function render() {
  const route = currentRoute();
  setDocumentTitle(route);
  const admin = isAdminRoute(route);
  document.documentElement.classList.toggle('admin-route', admin);
  document.body.classList.toggle('lyrics-open', Boolean(state.lyricsOpen && currentTrack()));
  if (admin) return renderAdmin(route);
  renderPlayerApp(route);
}
