import { setRenderer } from './core/render-bus.js';
import { currentRoute, isAdminRoute, navigate, startRouter } from './core/router.js';
import { initTheme } from './core/theme.js';
import { ADMIN_PAGE_SIZE, state, TRACK_PAGE_SIZE } from './core/state.js';
import { admin } from './admin/state.js';
import { ensureAdminSession } from './admin/auth.js';
import { refreshLibrary, refreshLibraryIfStale } from './data/library.js';
import { initFavorites } from './data/favorites.js';
import { restorePlaybackSession } from './features/player.js';
import { initMediaSession } from './features/media-session.js';
import { bindEvents } from './app/events.js';
import { render } from './app/render.js';

function handleRouteChange(route) {
  if (route.name === 'not-found') {
    navigate('/', { replace: true });
    return;
  }
  state.query = route.name === 'search' ? route.query : '';
  state.genre = '全部';
  state.lyricsOpen = false;
  state.listLimit = TRACK_PAGE_SIZE;
  if (route.name === 'admin-tracks') admin.trackLimit = ADMIN_PAGE_SIZE;
  render();
  window.scrollTo({ top: 0, behavior: 'auto' });
}

async function bootstrap() {
  initTheme();
  try {
    await refreshLibrary();
    await initFavorites();
    restorePlaybackSession();
    initMediaSession();
    if (isAdminRoute(currentRoute())) await ensureAdminSession();
    setRenderer(render);
    bindEvents();
    startRouter(handleRouteChange);
    // 在另一个标签页或手机上改过曲库时，切回本页要把歌手的歌曲数量等统计刷新过来。
    const syncLibraryFromServer = () => {
      refreshLibraryIfStale()
        .then(changed => { if (changed) render(); })
        .catch(() => { /* 离线或接口异常时保持当前界面。 */ });
    };
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') syncLibraryFromServer();
    });
    // 移动端从 bfcache 恢复时不一定触发 visibilitychange。
    window.addEventListener('pageshow', event => { if (event.persisted) syncLibraryFromServer(); });
  } catch (error) {
    document.querySelector('#app').innerHTML = `<div class="boot-error">音乐库暂时无法加载：${String(error.message || error)}</div>`;
  }
}

window.addEventListener('DOMContentLoaded', bootstrap, { once: true });
