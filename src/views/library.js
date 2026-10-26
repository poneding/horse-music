import { icon } from '../core/icons.js';
import { albumPath, artistPath, playlistPath } from '../core/router.js';
import { state } from '../core/state.js';
import { coverFor, escapeHtml } from '../core/util.js';
import { renderPageHeading } from '../components/page-heading.js';
import { renderFilters, renderTrackList } from '../components/track-list.js';
import { albumTracks, artistTracks, filteredTracks, searchGroups } from '../data/library.js';

function groupItem({ kind, id, title, subtitle, image }) {
  return `<button class="search-group-item ${kind}" data-route="${id}" type="button"><img loading="lazy" decoding="async" src="${escapeHtml(image)}" alt="" /><span class="search-group-copy"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(subtitle)}</small></span></button>`;
}

function renderSearchGroups(query) {
  const groups = searchGroups(query);
  const sections = [];
  if (groups.albums.length) {
    sections.push(`<section class="search-group"><div class="search-group-head"><h2>${icon('disc', 14)} 专辑</h2><span>显示 ${groups.albums.length} 个</span></div><div class="search-group-list">${groups.albums.map(album => groupItem({
      kind: 'album',
      id: albumPath(album.id),
      title: album.title,
      subtitle: `${album.artist || '未知艺人'} · ${albumTracks(album).length} 首`,
      image: coverFor(album)
    })).join('')}</div></section>`);
  }
  if (groups.artists.length) {
    sections.push(`<section class="search-group"><div class="search-group-head"><h2>${icon('user', 14)} 歌手</h2><span>显示 ${groups.artists.length} 个</span></div><div class="search-group-list">${groups.artists.map(artist => groupItem({
      kind: 'artist',
      id: artistPath(artist.id),
      title: artist.name,
      subtitle: `${artistTracks(artist).length} 首歌曲`,
      image: coverFor(artist)
    })).join('')}</div></section>`);
  }
  if (groups.playlists.length) {
    sections.push(`<section class="search-group"><div class="search-group-head"><h2>${icon('list', 14)} 歌单</h2><span>显示 ${groups.playlists.length} 个</span></div><div class="search-group-list">${groups.playlists.map(playlist => groupItem({
      kind: 'playlist',
      id: playlistPath(playlist.id),
      title: playlist.title,
      subtitle: `${playlist.trackIds?.length || 0} 首歌曲`,
      image: coverFor(playlist)
    })).join('')}</div></section>`);
  }
  return sections.length ? `<section class="search-groups" aria-label="相关的专辑、歌手和歌单">${sections.join('')}</section>` : '';
}

export function renderLibrary(route) {
  const tracks = filteredTracks();
  const searching = route.name === 'search';
  const groups = searching && state.query ? renderSearchGroups(state.query) : '';
  return `${renderPageHeading({
    eyebrow: searching ? 'SEARCH' : 'YOUR MUSIC',
    title: searching ? '搜索结果' : '全部歌曲',
    description: searching && state.query
      ? `${tracks.length} 首与「${escapeHtml(state.query)}」相关的歌曲`
      : `${tracks.length} 首歌曲，慢慢听。`,
    playAction: tracks.length ? 'play-listed' : ''
  })}<section class="track-section inner-track-section">${groups}${renderFilters(tracks.length)}${renderTrackList(tracks, false)}</section>`;
}
