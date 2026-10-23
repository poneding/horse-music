import { renderPageHeading } from '../components/page-heading.js';
import { renderTrackList } from '../components/track-list.js';
import { favoriteTracks } from '../data/collections.js';

export function renderFavorites() {
  const tracks = favoriteTracks();
  return `${renderPageHeading({
    eyebrow: 'SAVED TRACKS',
    title: '我的收藏',
    description: `${tracks.length} 首收藏歌曲`,
    playAction: tracks.length ? 'play-listed' : ''
  })}<section class="track-section inner-track-section">${renderTrackList(tracks, true)}</section>`;
}
