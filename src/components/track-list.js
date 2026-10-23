import { icon } from '../core/icons.js';
import { artistPath, currentRoute } from '../core/router.js';
import { currentTrack, genres, IMG_LAZY, state } from '../core/state.js';
import { coverFor, escapeHtml, formatTime, normalizeName } from '../core/util.js';
import { artistPlayRanking } from '../data/library.js';
import { trackRow } from './track-row.js';

export function renderFilters(total) {
  return `<div class="filter-row">${genres.map(genre => `<button class="filter-chip ${state.genre === genre ? 'selected' : ''}" data-genre="${genre}">${genre}</button>`).join('')}<span class="filter-result">${total} 首歌曲</span></div>`;
}

export function renderTrackList(tracks, compact = false, metaFor = null, metaLabel = '风格') {
  if (!tracks.length) {
    const routeName = currentRoute().name;
    const favoriteEmpty = routeName === 'favorites';
    return `<div class="empty-state">${icon('music', 30)}<strong>${favoriteEmpty ? '这里还没有收藏' : state.query ? '没有找到相关歌曲' : '曲库暂时是空的'}</strong><span>${favoriteEmpty ? '点击歌曲右侧的爱心，把喜欢的音乐收藏起来' : state.query ? '换个关键词试试' : '从管理端上传音乐，开始构建你的音乐空间'}</span>${!state.query && !favoriteEmpty ? '<a href="/admin" data-link class="button button-dark">打开管理端</a>' : ''}</div>`;
  }
  const visible = tracks.slice(0, state.listLimit);
  const remaining = tracks.length - visible.length;
  return `<div class="track-list ${compact ? 'compact-list' : ''}"><div class="track-list-head"><span>#</span><span>歌曲</span><span>专辑</span><span>${metaLabel}</span><span>${icon('clock', 14)}</span></div>${visible.map((track, index) => trackRow(track, index, true, metaFor ? metaFor(track) : '')).join('')}</div>${remaining > 0 ? `<div class="load-more-row"><button class="button button-outline" data-action="load-more">加载更多（剩余 ${remaining} 首）</button></div>` : ''}`;
}

function chartRow(track, index, max) {
  const current = currentTrack()?.id === track.id;
  const liked = state.favorites.has(track.id);
  const count = Number(track.playCount) || 0;
  return `<div class="chart-row ${current ? 'is-current' : ''}" data-track-row="${escapeHtml(track.id)}">
    <span class="chart-rank ${index < 3 ? 'chart-rank-top' : ''}">${String(index + 1).padStart(2, '0')}</span>
    <button class="track-main" data-play-track="${escapeHtml(track.id)}"><img class="track-cover" ${IMG_LAZY} src="${escapeHtml(coverFor(track))}" alt="" /><span class="track-copy"><strong>${escapeHtml(track.title)}</strong><span>${escapeHtml(track.artist)}</span></span></button>
    <span class="chart-track-album">${escapeHtml(track.album || '单曲')}</span>
    <span class="chart-bar" aria-hidden="true"><i style="width:${Math.max(6, Math.round(count / max * 100))}%"></i></span>
    <span class="chart-count">${count} 次</span>
    <button class="icon-button track-like ${liked ? 'liked' : ''}" data-favorite="${escapeHtml(track.id)}" aria-label="${liked ? '取消收藏' : '收藏'}">${icon('heart', 17)}</button>
    <span class="track-duration">${track.duration ? formatTime(track.duration) : '--:--'}</span>
  </div>`;
}

export function renderChartList(tracks) {
  if (!tracks.length) return `<div class="empty-state">${icon('chart', 30)}<strong>还没有播放记录</strong><span>开始播放歌曲，这里会按播放次数生成排行</span></div>`;
  const max = Math.max(1, Number(tracks[0].playCount) || 1);
  const visible = tracks.slice(0, state.listLimit);
  const remaining = tracks.length - visible.length;
  return `<div class="track-list chart-list">${visible.map((track, index) => chartRow(track, index, max)).join('')}</div>${remaining > 0 ? `<div class="load-more-row"><button class="button button-outline" data-action="load-more">加载更多（剩余 ${remaining} 首）</button></div>` : ''}`;
}

export function renderArtistCharts() {
  const ranking = artistPlayRanking();
  if (!ranking.length) return '';
  return `<section class="artist-chart-section"><div class="section-heading"><div><span class="eyebrow">MOST PLAYED ARTISTS</span><h2>歌手播放排行</h2></div><span class="subtle-count">按累计播放次数</span></div><div class="artist-chart-grid">${ranking.map((entry, index) => {
    const profile = state.artistByName.get(normalizeName(entry.name));
    return `<button class="artist-chart-card" ${profile ? `data-route="${artistPath(profile.id)}"` : ''}><span class="artist-chart-rank">${String(index + 1).padStart(2, '0')}</span><img ${IMG_LAZY} src="${escapeHtml(coverFor(profile || {}))}" alt="" /><span class="artist-chart-copy"><strong>${escapeHtml(entry.name)}</strong><span>${entry.plays} 次播放 · ${entry.tracks} 首歌曲</span></span></button>`;
  }).join('')}</div></section>`;
}
