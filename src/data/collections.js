import { albumTracks, artistAlbumCount, artistTracks, chartTracks, filteredTracks, recentTracks } from './library.js';
import { shareTracks } from './shares.js';
import { state } from '../core/state.js';
import { normalizeName } from '../core/util.js';

export function favoriteTracks() {
  return state.tracks.filter(track => state.favorites.has(track.id));
}

export function findAlbum(idOrTitle) {
  const key = String(idOrTitle || '');
  return state.albums.find(album => album.id === key)
    || state.albums.find(album => normalizeName(album.title) === normalizeName(key))
    || null;
}

export function findArtist(idOrName) {
  const key = String(idOrName || '');
  return state.artists.find(artist => artist.id === key)
    || state.artists.find(artist => normalizeName(artist.name) === normalizeName(key))
    || null;
}

export function collectionFor(route) {
  if (route.name === 'playlist') {
    const item = state.playlists.find(playlist => playlist.id === route.id) || null;
    const tracks = item ? item.trackIds.map(id => state.trackById.get(id)).filter(Boolean) : [];
    return item ? { kind: 'playlist', item, tracks, eyebrow: 'PLAYLIST', title: item.title, description: item.description || '你的专属音乐时光' } : null;
  }
  if (route.name === 'album') {
    const item = findAlbum(route.id);
    const tracks = albumTracks(item);
    return item ? {
      kind: 'album',
      item,
      tracks,
      eyebrow: 'ALBUM',
      title: item.title,
      description: `${item.artist || '未知艺人'} · ${tracks.length} 首歌曲`
    } : null;
  }
  if (route.name === 'artist') {
    const item = findArtist(route.id);
    const tracks = artistTracks(item);
    return item ? {
      kind: 'artist',
      item,
      tracks,
      eyebrow: 'ARTIST',
      title: item.name,
      description: `${tracks.length} 首歌曲 · ${artistAlbumCount(item)} 张专辑${item.description ? ` · ${item.description}` : ''}`
    } : null;
  }
  return null;
}

export function listedTracks(route) {
  const collection = collectionFor(route);
  if (collection) return collection.tracks;
  if (route.name === 'recent') return recentTracks(100);
  if (route.name === 'charts') return chartTracks();
  if (route.name === 'favorites') return favoriteTracks();
  if (route.name === 'share') return shareTracks(route.code);
  if (route.name === 'library' || route.name === 'search' || route.name === 'home') return filteredTracks();
  return filteredTracks();
}
