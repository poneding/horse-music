import { icon } from '../core/icons.js';
import { IMG_LAZY } from '../core/state.js';
import { coverFor, escapeHtml, relativeTime } from '../core/util.js';
import { rankedTracks, recentTracks } from '../data/library.js';

export function renderHomeActivity() {
  const recentList = recentTracks(5);
  const topTracks = rankedTracks().slice(0, 5);
  if (!recentList.length && !topTracks.length) return '';
  const recentRows = recentList.map(track => `<button class="mini-track-row" data-track-row="${escapeHtml(track.id)}" data-play-track="${escapeHtml(track.id)}"><img ${IMG_LAZY} src="${escapeHtml(coverFor(track))}" alt="" /><span class="mini-track-copy"><strong>${escapeHtml(track.title)}</strong><span>${escapeHtml(track.artist)}</span></span><span class="mini-track-meta">${escapeHtml(relativeTime(track.lastPlayedAt))}</span></button>`).join('');
  const chartRows = topTracks.map((track, index) => `<button class="mini-track-row has-rank" data-track-row="${escapeHtml(track.id)}" data-play-track="${escapeHtml(track.id)}"><span class="mini-rank ${index < 3 ? 'top' : ''}">${String(index + 1).padStart(2, '0')}</span><img ${IMG_LAZY} src="${escapeHtml(coverFor(track))}" alt="" /><span class="mini-track-copy"><strong>${escapeHtml(track.title)}</strong><span>${escapeHtml(track.artist)}</span></span><span class="mini-track-meta">${Number(track.playCount) || 0} 次</span></button>`).join('');
  return `<section class="featured-section activity-section"><div class="activity-grid"><div class="activity-card"><div class="section-heading"><div><span class="eyebrow">RECENTLY PLAYED</span><h2>最近播放</h2></div><button class="text-link" data-route="/recent">查看全部 ${icon('arrow', 15)}</button></div><div class="mini-list">${recentRows || '<p class="empty-hint">还没有播放记录</p>'}</div></div><div class="activity-card"><div class="section-heading"><div><span class="eyebrow">MOST PLAYED</span><h2>播放排行</h2></div><button class="text-link" data-route="/charts">查看全部 ${icon('arrow', 15)}</button></div><div class="mini-list">${chartRows || '<p class="empty-hint">播放歌曲后会生成排行</p>'}</div></div></div></section>`;
}
