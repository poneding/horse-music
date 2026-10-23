import { icon } from '../core/icons.js';
import { renderPageHeading } from '../components/page-heading.js';
import { renderTrackList } from '../components/track-list.js';
import { recentTracks } from '../data/library.js';
import { relativeTime } from '../core/util.js';

export function renderRecent() {
  const tracks = recentTracks(100);
  const empty = `<div class="empty-state">${icon('clock', 30)}<strong>还没有播放记录</strong><span>播放一首歌，最近听过的音乐就会出现在这里</span></div>`;
  return `${renderPageHeading({
    eyebrow: 'LISTENING HISTORY',
    title: '最近播放',
    description: `${tracks.length} 首歌曲 · 按最近播放时间排序`,
    playAction: tracks.length ? 'play-listed' : ''
  })}<section class="track-section inner-track-section">${tracks.length ? renderTrackList(tracks, true, track => relativeTime(track.lastPlayedAt), '最近播放') : empty}</section>`;
}
