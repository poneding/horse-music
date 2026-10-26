const ADMIN_TABS = new Set(['overview', 'tracks', 'albums', 'artists', 'playlists', 'account']);

let current = parseLocation();
let navIndex = 0;
let maxIndex = 0;
let onChange = () => {};

function normalizePath(pathname) {
  if (!pathname) return '/';
  if (pathname.length > 1) return pathname.replace(/\/+$/, '') || '/';
  return pathname;
}

function decodeSegment(value) {
  try { return decodeURIComponent(value); }
  catch { return value; }
}

export function parseLocation() {
  const pathname = normalizePath(location.pathname);
  const query = new URLSearchParams(location.search).get('q') || '';

  if (pathname === '/' || pathname === '/index.html') return { name: 'home', path: '/' };
  if (pathname === '/discover') return { name: 'discover', path: pathname };
  if (pathname === '/library') return { name: 'library', path: pathname };
  if (pathname === '/recent') return { name: 'recent', path: pathname };
  if (pathname === '/charts') return { name: 'charts', path: pathname };
  if (pathname === '/favorites') return { name: 'favorites', path: pathname };
  if (pathname === '/search') return { name: 'search', path: pathname, query };

  const shareMatch = pathname.match(/^\/s\/([^/]+)$/);
  if (shareMatch) return { name: 'share', path: pathname, code: decodeSegment(shareMatch[1]) };

  const playlistMatch = pathname.match(/^\/playlists\/([^/]+)$/);
  if (playlistMatch) return { name: 'playlist', path: pathname, id: decodeSegment(playlistMatch[1]) };

  if (pathname === '/albums') return { name: 'albums', path: pathname };

  const albumMatch = pathname.match(/^\/albums\/([^/]+)$/);
  if (albumMatch) return { name: 'album', path: pathname, id: decodeSegment(albumMatch[1]) };

  const artistMatch = pathname.match(/^\/artists\/([^/]+)$/);
  if (artistMatch) return { name: 'artist', path: pathname, id: decodeSegment(artistMatch[1]) };

  const adminMatch = pathname.match(/^\/admin(?:\/([^/]+))?$/);
  if (adminMatch) {
    if (adminMatch[1] && !ADMIN_TABS.has(adminMatch[1])) return { name: 'not-found', path: pathname };
    const tab = adminMatch[1] || 'overview';
    return { name: `admin-${tab}`, path: pathname, tab };
  }

  return { name: 'not-found', path: pathname };
}

export function currentRoute() {
  return current;
}

export function isAdminRoute(route = current) {
  return route.name.startsWith('admin-');
}

export function navigate(url, { replace = false, render = true } = {}) {
  const next = new URL(url, location.origin);
  const target = `${next.pathname}${next.search}`;
  const here = `${location.pathname}${location.search}`;
  if (target === here) {
    current = parseLocation();
    if (render) onChange(current);
    return;
  }
  if (replace) {
    history.replaceState({ ...history.state, navIndex, maxIndex }, '', target);
  } else {
    navIndex += 1;
    maxIndex = navIndex;
    sessionStorage.setItem('horse-nav-max', String(maxIndex));
    history.pushState({ navIndex, maxIndex }, '', target);
  }
  current = parseLocation();
  if (render) onChange(current);
}

export function back() {
  if (canGoBack()) history.back();
}

export function forward() {
  if (canGoForward()) history.forward();
}

export function canGoBack() {
  return navIndex > 0;
}

export function canGoForward() {
  return navIndex < maxIndex;
}

export function startRouter(callback) {
  onChange = callback;
  const initialState = history.state;
  const rememberedMax = Number(sessionStorage.getItem('horse-nav-max'));
  if (Number.isInteger(initialState?.navIndex)) {
    navIndex = initialState.navIndex;
    maxIndex = Math.max(navIndex, Number(initialState.maxIndex) || navIndex, Number.isFinite(rememberedMax) ? rememberedMax : 0);
  } else {
    navIndex = 0;
    maxIndex = Number.isFinite(rememberedMax) ? rememberedMax : 0;
    history.replaceState({ ...initialState, navIndex, maxIndex }, '', `${location.pathname}${location.search}`);
  }
  current = parseLocation();
  window.addEventListener('popstate', event => {
    if (Number.isInteger(event.state?.navIndex)) {
      navIndex = event.state.navIndex;
      maxIndex = Math.max(maxIndex, Number(event.state.maxIndex) || navIndex);
    } else {
      navIndex = 0;
    }
    sessionStorage.setItem('horse-nav-max', String(maxIndex));
    current = parseLocation();
    onChange(current);
  });
  onChange(current);
}

export function searchPath(query) {
  const value = String(query || '');
  return value.trim() ? `/search?q=${encodeURIComponent(value)}` : '/library';
}

export function playlistPath(id) {
  return `/playlists/${encodeURIComponent(id)}`;
}

export function albumPath(idOrTitle) {
  return idOrTitle ? `/albums/${encodeURIComponent(idOrTitle)}` : '/library';
}

export function artistPath(id) {
  return `/artists/${encodeURIComponent(id)}`;
}

export function sharePath(code) {
  return `/s/${encodeURIComponent(code)}`;
}

export function adminPath(tab = 'overview') {
  return tab === 'overview' ? '/admin/overview' : `/admin/${tab}`;
}
