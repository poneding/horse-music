import { icon } from '../core/icons.js';
import { coverFor, escapeHtml, relativeTime } from '../core/util.js';
import { renderPageHeading } from '../components/page-heading.js';
import { renderTrackList } from '../components/track-list.js';
import { loadShare, shareTracks } from '../data/shares.js';

const SHARE_KIND_LABELS = {
  track: { eyebrow: 'SHARED TRACK', label: '分享歌曲' },
  album: { eyebrow: 'SHARED ALBUM', label: '分享专辑' },
  playlist: { eyebrow: 'SHARED PLAYLIST', label: '分享歌单' }
};

function renderState({ title, description, message, detail, retry = '' }) {
  return `${renderPageHeading({
    eyebrow: 'SHARED PLAYLIST',
    title,
    description
  })}<div class="empty-state share-page-state">${icon('share', 30)}<strong>${message}</strong><span>${detail}</span><div class="share-state-actions">${retry}<a href="/library" data-link class="button button-dark">浏览曲库</a></div></div>`;
}

export function renderShare(route) {
  const entry = loadShare(route.code);
  if (!entry || entry.status === 'loading') {
    return renderState({
      title: '正在打开分享…',
      description: '正在读取这份分享的歌曲',
      message: '正在打开分享链接',
      detail: '稍等片刻，这份播放列表马上就好'
    });
  }

  if (entry.status === 'error') {
    return renderState({
      title: '分享链接不可用',
      description: '这份分享可能已经被删除，或者链接不完整',
      message: '无法打开这份分享',
      detail: escapeHtml(entry.error || '请稍后再试'),
      retry: `<button type="button" class="button button-outline" data-share-page-retry="${escapeHtml(route.code)}">重新加载</button>`
    });
  }

  const share = entry.data;
  const tracks = shareTracks(route.code);
  const meta = SHARE_KIND_LABELS[share.kind] || SHARE_KIND_LABELS.track;
  const missing = Math.max(0, Number(share.totalCount || share.trackIds.length) - tracks.length);
  const created = share.createdAt ? relativeTime(share.createdAt) : '';
  const description = `${meta.label} · ${tracks.length} 首歌曲${created ? ` · ${created}` : ''}${missing ? ` · ${missing} 首已下架` : ''}`;

  if (!tracks.length) {
    return renderState({
      title: escapeHtml(share.title),
      description: `${meta.label} · 这份分享里的歌曲都已下架`,
      message: '这份分享里暂时没有歌曲',
      detail: '歌曲可能已经从曲库中删除，去看看别的音乐吧'
    });
  }

  return `${renderPageHeading({
    eyebrow: meta.eyebrow,
    title: escapeHtml(share.title),
    description: escapeHtml(description),
    image: escapeHtml(share.kind === 'album' || share.kind === 'playlist' ? share.coverUrl || coverFor(tracks[0]) : coverFor(tracks[0])),
    playAction: 'play-listed'
  })}<section class="track-section inner-track-section">${renderTrackList(tracks, true)}</section>`;
}
