import { icon } from '../core/icons.js';
import { renderApp } from '../core/render-bus.js';
import { hasPlayerSession, state } from '../core/state.js';
import { themeControl } from '../core/theme.js';
import { escapeHtml } from '../core/util.js';
import { renderLyricsPanel } from '../components/lyrics-panel.js';
import { renderPlayerBar } from '../components/player-bar.js';
import { scrollActiveLyric } from '../features/lyrics.js';
import { ensureAdminSession } from './auth.js';
import { mountAdminSort } from './sort.js';
import { renderLogin } from './login.js';
import { ADMIN_TABS, adminLabel } from './routes.js';
import { admin } from './state.js';
import { renderOverview, mountStorageUsage } from './views/overview.js';
import { renderTracks, mountTrackSelection } from './views/tracks.js';
import { renderAlbums } from './views/albums.js';
import { renderArtists } from './views/artists.js';
import { renderPlaylists } from './views/playlists.js';
import { mountAccountForm, renderAccount } from './views/account.js';

function renderView(route) {
  if (route.tab === 'tracks') return renderTracks();
  if (route.tab === 'albums') return renderAlbums();
  if (route.tab === 'artists') return renderArtists();
  if (route.tab === 'playlists') return renderPlaylists();
  if (route.tab === 'account') return renderAccount();
  return renderOverview();
}


function adminTabCount(tab) {
  if (tab === 'tracks') return state.tracks.length;
  if (tab === 'albums') return state.albums.length;
  if (tab === 'artists') return state.artists.length;
  if (tab === 'playlists') return state.playlists.length;
  return null;
}

function adminNavButton(tab, activeTab) {
  const count = adminTabCount(tab.tab);
  const active = activeTab === tab.tab;
  return `<button class="admin-nav ${active ? 'active' : ''}" data-route="${tab.path}"${active ? ' aria-current="page"' : ''}>${icon(tab.symbol, 17)}${tab.label}${count === null ? '' : `<span>${count}</span>`}</button>`;
}

export function renderAdmin(route) {
  if (!admin.sessionChecked) {
    ensureAdminSession().then(renderApp);
    document.querySelector('#app').innerHTML = `<main class="boot-screen"><span class="brand-mark" aria-label="一头诗人"></span><span>正在检查登录状态…</span></main>${hasPlayerSession() ? renderPlayerBar(true) : ''}`;
    return;
  }
  if (!admin.authenticated) return renderLogin();

  if (admin.activeTab !== route.tab) {
    if (admin.activeTab === 'tracks' || route.tab === 'tracks') admin.trackSelection.clear();
    admin.activeTab = route.tab;
  }

  const accountName = admin.username || '管理员';
  const accountInitial = Array.from(accountName)[0]?.toUpperCase() || 'A';
  const showPlayer = hasPlayerSession();
  const activeTab = ADMIN_TABS.find(tab => tab.tab === route.tab) || ADMIN_TABS[0];
  const navButtons = ADMIN_TABS.map(tab => adminNavButton(tab, route.tab)).join('');
  document.querySelector('#app').innerHTML = `<div class="admin-shell${showPlayer ? ' has-player' : ''}"><aside class="admin-sidebar"><a class="brand" href="/" data-link><span class="brand-mark">诗</span><span class="brand-name">一头诗人<span>管理</span></span></a><div class="admin-side-caption">工作空间</div><nav class="admin-nav-list" aria-label="管理页面">${navButtons}</nav><details class="admin-nav-dropdown"><summary aria-label="切换管理页面" title="切换管理页面"><span class="admin-dropdown-current">${icon(activeTab.symbol, 16)}<span>${activeTab.label}</span></span>${icon('chevronDown', 14, 'admin-dropdown-chevron')}</summary><nav class="admin-dropdown-menu" aria-label="管理页面">${navButtons}</nav></details><div class="admin-sidebar-bottom"><a class="back-to-player" href="/" data-link>${icon('arrow', 16)} 返回播放器</a><button class="admin-logout" data-admin-action="logout">${icon('logout', 16)} 退出登录</button></div></aside><main class="admin-main"><header class="admin-topbar"><span class="admin-breadcrumb">音乐管理 <span>/</span> ${adminLabel(route)}</span><div class="admin-user" title="当前登录账号"><span class="admin-avatar">${escapeHtml(accountInitial)}</span><span>${escapeHtml(accountName)}</span></div></header><div class="admin-content">${renderView(route)}</div></main>${showPlayer ? renderPlayerBar(true) : ''}${showPlayer && state.lyricsOpen ? renderLyricsPanel() : ''}</div>`;
  document.querySelector('.admin-user')?.insertAdjacentHTML('afterbegin', themeControl());
  if (route.tab === 'account') mountAccountForm();
  if (route.tab === 'tracks') mountTrackSelection();
  if (route.tab === 'overview') void mountStorageUsage();
  if (['albums', 'artists', 'playlists'].includes(route.tab)) mountAdminSort(route.tab);
  if (showPlayer && state.lyricsOpen) requestAnimationFrame(() => scrollActiveLyric('auto'));
}
