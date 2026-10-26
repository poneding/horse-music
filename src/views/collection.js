import { icon } from '../core/icons.js';
import { coverFor, escapeHtml } from '../core/util.js';
import { renderPageHeading } from '../components/page-heading.js';
import { albumCard } from '../components/cards.js';
import { renderTrackList } from '../components/track-list.js';
import { playlistCover } from '../data/library.js';
import { collectionFor } from '../data/collections.js';

function renderArtistTracks(tracks) {
  const heading = `<div class="section-heading"><div><span class="eyebrow">SONGS</span><h2>歌曲</h2></div><span class="subtle-count">${tracks.length} 首歌曲</span></div>`;
  if (!tracks.length) {
    return `<section class="track-section inner-track-section"><div class="empty-state">${icon('music', 30)}<strong>这位歌手还没有歌曲</strong><span>这位歌手暂时还没有可播放的歌曲</span></div></section>`;
  }
  return `<section class="track-section inner-track-section">${heading}${renderTrackList(tracks, true)}</section>`;
}

function renderArtistAlbums(albums) {
  if (!albums.length) return '';
  return `<section class="track-section artist-albums-section"><div class="section-heading"><div><span class="eyebrow">DISCOGRAPHY</span><h2>专辑</h2></div><span class="subtle-count">${albums.length} 张专辑</span></div><div class="album-grid">${albums.map(albumCard).join('')}</div></section>`;
}

export function renderCollection(route) {
  const collection = collectionFor(route);
  if (!collection) {
    return `${renderPageHeading({
      eyebrow: 'NOT FOUND',
      title: '没有找到这份收藏',
      description: '它可能已经被删除，或链接已经不完整。'
    })}<div class="empty-state">${icon('music', 30)}<strong>内容不存在</strong><span>返回曲库继续听歌吧</span><a href="/library" data-link class="button button-dark">回到全部歌曲</a></div>`;
  }
  const { item, tracks, albums = [], eyebrow, title, description, kind } = collection;
  const shareable = kind === 'album' || kind === 'playlist';
  const image = kind === 'playlist' ? playlistCover(item) : coverFor(item);
  const sections = kind === 'artist'
    ? `${renderArtistTracks(tracks)}${renderArtistAlbums(albums)}`
    : `<section class="track-section inner-track-section">${renderTrackList(tracks, true)}</section>`;
  return `${renderPageHeading({
    eyebrow,
    title: escapeHtml(title),
    description: escapeHtml(description),
    image: escapeHtml(image),
    imageClass: kind === 'artist' ? 'artist-heading-avatar' : '',
    playAction: tracks.length ? 'play-listed' : '',
    shareAction: shareable && tracks.length ? `data-share-${kind}="${escapeHtml(item.id)}"` : '',
    shareLabel: kind === 'playlist' ? '分享歌单' : '分享专辑'
  })}${sections}`;
}
