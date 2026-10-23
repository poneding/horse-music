import { icon } from '../core/icons.js';
import { coverFor, escapeHtml } from '../core/util.js';
import { renderPageHeading } from '../components/page-heading.js';
import { renderTrackList } from '../components/track-list.js';
import { collectionFor } from '../data/collections.js';

export function renderCollection(route) {
  const collection = collectionFor(route);
  if (!collection) {
    return `${renderPageHeading({
      eyebrow: 'NOT FOUND',
      title: '没有找到这份收藏',
      description: '它可能已经被删除，或链接已经不完整。'
    })}<div class="empty-state">${icon('music', 30)}<strong>内容不存在</strong><span>返回曲库继续听歌吧</span><a href="/library" data-link class="button button-dark">回到全部歌曲</a></div>`;
  }
  const { item, tracks, eyebrow, title, description, kind } = collection;
  return `${renderPageHeading({
    eyebrow,
    title: escapeHtml(title),
    description: escapeHtml(description),
    image: escapeHtml(coverFor(item)),
    imageClass: kind === 'artist' ? 'artist-heading-avatar' : '',
    playAction: tracks.length ? 'play-listed' : ''
  })}<section class="track-section inner-track-section">${renderTrackList(tracks, true)}</section>`;
}
