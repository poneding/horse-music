/* 一头诗人的离线外壳：缓存应用外壳与静态资源，音频和接口始终走网络。 */
const CACHE_PREFIX = 'horse-music-';
const CACHE_NAME = `${CACHE_PREFIX}shell-v4`;
const SHELL_URLS = [
  '/',
  '/index.html',
  '/styles.css',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-512-maskable.png',
  '/apple-touch-icon.png',
  '/bojack-mark.jpg',
  '/favicon.png',
  '/fonts/dm-sans.woff2',
  '/fonts/manrope.woff2'
];
const SHELL_ASSET_RE = /^\/(?:styles\.css|bojack-mark\.jpg|favicon\.png|icon-192\.png|icon-512\.png|icon-512-maskable\.png|apple-touch-icon\.png|manifest\.webmanifest|fonts\/[a-z0-9-]+\.woff2|src\/[a-zA-Z0-9_./-]+\.js)$/;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const urls = new Set(SHELL_URLS);
    // 首次安装时由服务端列出全部前端模块，确保第一次在线访问后即可离线打开外壳。
    try {
      const response = await fetch('/api/assets', { cache: 'reload' });
      if (response.ok) {
        const data = await response.json();
        for (const asset of Array.isArray(data.assets) ? data.assets : []) {
          if (typeof asset === 'string' && asset.startsWith('/src/')) urls.add(asset);
        }
      }
    } catch { /* 离线安装时退回固定外壳列表。 */ }
    // 单个资源缺失（例如自定义图标未部署）不应中断整个安装流程。
    await Promise.allSettled([...urls].map(url => cache.add(new Request(url, { cache: 'reload' }))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.allSettled(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

function isCacheable(response) {
  return Boolean(response) && response.ok && response.type === 'basic';
}

async function networkFirstDocument(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (isCacheable(response)) await cache.put('/index.html', response.clone());
    return response;
  } catch {
    const cached = await cache.match('/index.html');
    if (cached) return cached;
    return new Response('<!doctype html><meta charset="utf-8"><title>一头诗人</title><p>当前处于离线状态，暂时无法打开页面。</p>', {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const network = fetch(request).then(response => {
    if (isCacheable(response)) return cache.put(request, response.clone()).then(() => response, () => response);
    return response;
  }).catch(() => null);
  if (cached) {
    network.catch(() => {});
    return cached;
  }
  const fresh = await network;
  if (fresh) return fresh;
  return new Response('', { status: 504, statusText: 'Offline' });
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // 音频与接口必须直连网络：绝不缓存播放进度、Range 响应或用户数据。
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/media/')) return;
  if (request.headers.has('range')) return;
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstDocument(request));
    return;
  }
  if (SHELL_ASSET_RE.test(url.pathname)) event.respondWith(staleWhileRevalidate(request));
});
