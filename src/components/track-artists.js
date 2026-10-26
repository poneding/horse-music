import { artistPath } from '../core/router.js';
import { state } from '../core/state.js';
import { artistNamesFor, escapeHtml, normalizeName } from '../core/util.js';

export function trackArtistNames(track) {
  return artistNamesFor(track || {});
}

/**
 * 歌曲行里的歌手名：每位歌手单独渲染，有档案的可以点进歌手的歌曲/专辑页。
 * 歌曲本身仍然由封面和歌名按钮负责播放。
 */
export function trackArtistLinks(track) {
  const names = trackArtistNames(track);
  if (!names.length) return '<span class="track-artist">未知艺人</span>';
  const parts = names.map(name => {
    const label = escapeHtml(name);
    const profile = state.artistByName.get(normalizeName(name));
    if (!profile) return `<span class="artist-name">${label}</span>`;
    return `<a class="artist-name artist-link" href="${escapeHtml(artistPath(profile.id))}" data-link title="查看 ${label} 的歌曲与专辑">${label}</a>`;
  });
  // 分隔符不进入可点击区域，点歌手名才会跳转。
  return `<span class="track-artist">${parts.join('<span class="artist-sep" aria-hidden="true"> / </span>')}</span>`;
}
