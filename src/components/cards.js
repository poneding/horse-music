import { icon } from '../core/icons.js';
import { albumPath, artistPath, playlistPath } from '../core/router.js';
import { IMG_LAZY } from '../core/state.js';
import { coverFor, escapeHtml } from '../core/util.js';
import { albumTracks, artistAlbumCount, artistTracks } from '../data/library.js';

export function albumCard(album) {
  const count = albumTracks(album).length;
  return `<button class="album-card" data-route="${albumPath(album.id || album.title)}"><span class="album-art"><img ${IMG_LAZY} src="${escapeHtml(coverFor(album))}" alt="" /><span class="album-play">${icon('play', 19)}</span></span><span class="album-card-title">${escapeHtml(album.title)}</span><span class="album-card-meta">${escapeHtml(album.artist || '未知艺人')} · ${count} 首</span></button>`;
}

export function artistCard(artist) {
  const count = artistTracks(artist).length;
  return `<button class="artist-card" data-route="${artistPath(artist.id)}"><span class="artist-avatar"><img ${IMG_LAZY} src="${escapeHtml(coverFor(artist))}" alt="" /></span><span class="album-card-title">${escapeHtml(artist.name)}</span><span class="album-card-meta">${count} 首歌曲 · ${artistAlbumCount(artist)} 张专辑</span></button>`;
}

export function playlistCard(playlist) {
  const count = (playlist.trackIds || []).length;
  return `<button class="playlist-card" data-route="${playlistPath(playlist.id)}"><span class="playlist-art"><img ${IMG_LAZY} src="${escapeHtml(coverFor(playlist))}" alt="" /><span class="playlist-play">${icon('play', 19)}</span></span><span class="album-card-title">${escapeHtml(playlist.title)}</span><span class="album-card-meta">${escapeHtml(playlist.description || '一头精选')} · ${count} 首</span></button>`;
}
