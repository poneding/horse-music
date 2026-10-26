import { icon } from '../../core/icons.js';
import { api } from '../../core/api.js';
import { IMG_LAZY, state } from '../../core/state.js';
import { coverFor, escapeHtml, relativeTime } from '../../core/util.js';
import { albumTracks, rankedTracks, recentTracks, totalPlays } from '../../data/library.js';

function adminStat(label, value, detail, symbol) {
  return `<div class="stat-block"><span class="stat-icon">${icon(symbol, 18)}</span><span class="stat-label">${label}</span><strong>${value}</strong><span class="stat-detail">${detail}</span></div>`;
}

function renderAdminPlayColumns() {
  const recentRows = recentTracks(5).map(track => `<div class="admin-play-row"><img ${IMG_LAZY} src="${escapeHtml(coverFor(track))}" alt=""/><span class="admin-track-copy"><strong>${escapeHtml(track.title)}</strong><small>${escapeHtml(track.artist)}</small></span><span class="admin-play-meta">${escapeHtml(relativeTime(track.lastPlayedAt))}</span></div>`).join('');
  const rankedRows = rankedTracks().slice(0, 5).map((track, index) => `<div class="admin-play-row"><span class="admin-row-no">${String(index + 1).padStart(2, '0')}</span><span class="admin-track-copy"><strong>${escapeHtml(track.title)}</strong><small>${escapeHtml(track.artist)}</small></span><span class="admin-play-meta">${Number(track.playCount) || 0} 次</span></div>`).join('');
  return `<div class="admin-plays-column"><h3>最近播放</h3>${recentRows || '<div class="admin-empty">还没有播放记录</div>'}</div><div class="admin-plays-column"><h3>播放排行</h3>${rankedRows || '<div class="admin-empty">还没有播放记录</div>'}</div>`;
}

function formatBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value < 0) return '—';
  if (value < 1024) return `${Math.round(value)} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = value / 1024;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit += 1; }
  return `${size >= 100 ? size.toFixed(0) : size.toFixed(1)} ${units[unit]}`;
}

function renderStorageCard() {
  return `<section class="admin-section-card storage-card" data-storage-card data-storage-state="loading"><div class="admin-section-heading"><div><h2>存储占用</h2><span data-storage-total>正在读取…</span></div></div><div class="storage-metrics"><div class="storage-metric"><span>媒体总大小</span><strong data-storage-media>—</strong><small data-storage-files>正在读取…</small></div><div class="storage-metric"><span>数据 JSON</span><strong data-storage-data>—</strong><small>曲库 · 播放记录 · 登录凭证 · 分享 · 收藏</small></div><div class="storage-metric"><span>曲库内容</span><strong data-storage-counts>—</strong><small>歌曲 · 专辑 · 歌手 · 歌单</small></div></div></section>`;
}

export async function mountStorageUsage() {
  const card = document.querySelector('[data-storage-card]');
  if (!card) return;
  let data;
  try {
    data = await api('/api/admin/storage');
  } catch {
    if (document.querySelector('[data-storage-card]') !== card) return;
    card.dataset.storageState = 'error';
    card.querySelector('[data-storage-total]').textContent = '—';
    card.querySelector('[data-storage-media]').textContent = '—';
    card.querySelector('[data-storage-files]').textContent = '暂时无法读取';
    card.querySelector('[data-storage-data]').textContent = '—';
    card.querySelector('[data-storage-counts]').textContent = '—';
    return;
  }
  if (document.querySelector('[data-storage-card]') !== card) return;
  card.dataset.storageState = 'ready';
  card.querySelector('[data-storage-total]').textContent = `总计 ${formatBytes(data.totalBytes)}`;
  card.querySelector('[data-storage-media]').textContent = formatBytes(data.mediaBytes);
  card.querySelector('[data-storage-files]').textContent = `${Number(data.mediaFiles) || 0} 个媒体文件`;
  card.querySelector('[data-storage-data]').textContent = formatBytes(data.dataBytes);
  card.querySelector('[data-storage-counts]').textContent = `${data.tracks} / ${data.albums} / ${data.artists} / ${data.playlists}`;
}

export function renderOverview() {
  return `<div class="admin-page-heading"><div><span class="eyebrow">LIBRARY OVERVIEW</span><h1>音乐库总览</h1><p>看看你的音乐空间最近都发生了什么。</p></div><button class="button button-dark" data-admin-action="upload">${icon('upload', 16)} 上传音乐</button></div><div class="stat-grid">${adminStat('歌曲总数', state.tracks.length, '首音乐已入库', 'music')}${adminStat('专辑', state.albums.length, '张专辑与作品集', 'disc')}${adminStat('歌手', state.artists.length, '位歌手档案', 'heart')}${adminStat('歌单', state.playlists.length, '份精选收藏', 'list')}${adminStat('已关联歌词', state.tracks.filter(track => track.hasLyrics).length, '首带有歌词', 'queue')}</div><div class="admin-content-grid"><section class="admin-section-card recent-tracks"><div class="admin-section-heading"><div><h2>最近添加</h2><span>曲库中最近添加的音乐</span></div><button class="text-link" data-route="/admin/tracks">查看全部 ${icon('arrow', 15)}</button></div>${state.tracks.slice(0, 5).map((track, index) => `<div class="admin-track-row"><span class="admin-row-no">${String(index + 1).padStart(2, '0')}</span><img ${IMG_LAZY} src="${escapeHtml(coverFor(track))}" alt=""/><span class="admin-track-copy"><strong>${escapeHtml(track.title)}</strong><small>${escapeHtml(track.artist)}</small></span><span class="admin-row-album">${escapeHtml(track.album || '单曲')}</span><span class="admin-row-genre">${escapeHtml(track.genre || '未分类')}</span></div>`).join('') || '<div class="admin-empty">曲库还没有歌曲</div>'}</section><section class="admin-section-card quick-actions"><div class="admin-section-heading"><div><h2>快捷操作</h2><span>整理音乐库</span></div></div><button class="quick-action" data-admin-action="upload"><span class="quick-action-icon">${icon('upload', 18)}</span><span><strong>上传新音乐</strong><small>添加歌曲和同步歌词</small></span>${icon('arrow', 16)}</button><button class="quick-action" data-admin-action="new-album"><span class="quick-action-icon alt">${icon('disc', 18)}</span><span><strong>创建专辑</strong><small>把歌曲组织成专辑</small></span>${icon('arrow', 16)}</button><button class="quick-action" data-admin-action="new-playlist"><span class="quick-action-icon green">${icon('list', 18)}</span><span><strong>新建歌单</strong><small>挑选歌曲编成歌单</small></span>${icon('arrow', 16)}</button></section></div>${renderStorageCard()}<section class="admin-section-card albums-overview"><div class="admin-section-heading"><div><h2>专辑与作品集</h2><span>管理你的音乐作品</span></div><button class="text-link" data-route="/admin/albums">管理专辑 ${icon('arrow', 15)}</button></div><div class="admin-album-grid">${state.albums.slice(0, 4).map(album => `<div class="admin-album-item"><img ${IMG_LAZY} src="${escapeHtml(coverFor(album))}" alt=""/><strong>${escapeHtml(album.title)}</strong><span>${escapeHtml(album.artist)} · ${albumTracks(album).length} 首</span></div>`).join('')}</div></section><section class="admin-section-card admin-plays-card"><div class="admin-section-heading"><div><h2>播放统计</h2><span>累计播放 ${totalPlays()} 次 · 最近播放与热门歌曲</span></div><button class="text-link" data-admin-action="clear-plays">清空记录 ${icon('trash', 13)}</button></div><div class="admin-plays-grid">${renderAdminPlayColumns()}</div></section>`;
}
