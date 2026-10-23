import { state } from '../core/state.js';
import { escapeHtml } from '../core/util.js';
import { renderPageHeading } from '../components/page-heading.js';
import { renderFilters, renderTrackList } from '../components/track-list.js';
import { filteredTracks } from '../data/library.js';

export function renderLibrary(route) {
  const tracks = filteredTracks();
  const searching = route.name === 'search';
  return `${renderPageHeading({
    eyebrow: searching ? 'SEARCH' : 'YOUR MUSIC',
    title: searching ? '搜索结果' : '全部歌曲',
    description: searching && state.query
      ? `${tracks.length} 首与「${escapeHtml(state.query)}」相关的歌曲`
      : `${tracks.length} 首歌曲，慢慢听。`,
    playAction: tracks.length ? 'play-listed' : ''
  })}<section class="track-section inner-track-section">${renderFilters(tracks.length)}${renderTrackList(tracks, false)}</section>`;
}
