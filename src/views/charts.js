import { renderPageHeading } from '../components/page-heading.js';
import { renderArtistCharts, renderChartList } from '../components/track-list.js';
import { rankedTracks, totalPlays } from '../data/library.js';

export function renderCharts() {
  const tracks = rankedTracks();
  return `${renderPageHeading({
    eyebrow: 'PLAY CHARTS',
    title: '播放排行',
    description: `${totalPlays()} 次播放 · 按累计播放次数排序`,
    playAction: tracks.length ? 'play-listed' : ''
  })}<section class="track-section inner-track-section">${renderChartList(tracks)}${renderArtistCharts()}</section>`;
}
