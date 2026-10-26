import { icon } from '../core/icons.js';
import { sharePath } from '../core/router.js';
import { state } from '../core/state.js';
import { showToast } from '../core/toast.js';
import { coverFor, escapeHtml } from '../core/util.js';
import { albumTracks, playlistCover } from '../data/library.js';
import { createShare } from '../data/shares.js';
import { dialogShell } from '../components/dialog.js';

const SHARE_META = {
  track: { eyebrow: 'SHARE A TRACK', heading: '分享歌曲' },
  album: { eyebrow: 'SHARE AN ALBUM', heading: '分享专辑' },
  playlist: { eyebrow: 'SHARE A PLAYLIST', heading: '分享歌单' }
};

function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      return navigator.clipboard.writeText(text).then(() => true, () => false);
    }
  } catch { /* Fall back to a temporary textarea. */ }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.top = '0';
  area.style.left = '0';
  area.style.opacity = '0';
  document.body.append(area);
  area.select();
  area.setSelectionRange(0, area.value.length);
  let copied = false;
  try { copied = document.execCommand('copy'); }
  catch { copied = false; }
  area.remove();
  return Promise.resolve(copied);
}

export function openShareDialog({ kind, request, title, subtitle, coverUrl }) {
  const meta = SHARE_META[kind] || SHARE_META.track;
  const nativeButton = typeof navigator.share === 'function'
    ? `<button type="button" class="button button-quiet" data-share-native>${icon('share', 15)} 系统分享</button>`
    : '';
  const dialog = dialogShell(`<div class="dialog-head"><div><span class="eyebrow">${meta.eyebrow}</span><h2>${meta.heading}</h2><p>生成一个可以随时打开的播放列表链接</p></div><button type="button" class="icon-button" data-close aria-label="关闭">${icon('close', 19)}</button></div>
    <div class="share-preview"><img src="${escapeHtml(coverFor({ coverUrl }))}" alt="" /><div class="share-preview-copy"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(subtitle)}</span></div></div>
    <div data-share-body><div class="share-status">正在生成分享链接…</div></div>
    <p class="share-hint">任何拿到链接的人都可以打开，把这份内容作为播放列表收听。</p>
    <div class="dialog-actions"><button type="button" class="button button-quiet" data-close>完成</button>${nativeButton}<button type="button" class="button button-dark" data-share-copy disabled>复制链接</button></div>`, 'form-dialog share-dialog');

  const body = dialog.querySelector('[data-share-body]');
  let link = '';

  function setCopyEnabled(enabled) {
    dialog.querySelectorAll('[data-share-copy]').forEach(button => { button.disabled = !enabled; });
    dialog.querySelector('[data-share-native]')?.toggleAttribute('disabled', !enabled);
  }

  function setLoading() {
    setCopyEnabled(false);
    body.innerHTML = '<div class="share-status">正在生成分享链接…</div>';
  }

  function setLink(url) {
    link = url;
    body.innerHTML = `<div class="share-link-row"><input class="share-link-input" data-share-link readonly value="${escapeHtml(url)}" aria-label="分享链接" /><button type="button" class="button button-outline" data-share-copy>复制</button></div>`;
    setCopyEnabled(true);
  }

  function setError(message) {
    setCopyEnabled(false);
    body.innerHTML = `<div class="share-status is-error"><strong>${escapeHtml(message)}</strong><button type="button" class="text-link" data-share-retry>重新生成</button></div>`;
  }

  async function generate() {
    setLoading();
    try {
      const share = await createShare(request);
      if (!dialog.isConnected) return;
      setLink(new URL(sharePath(share.code), location.origin).href);
    } catch (error) {
      if (!dialog.isConnected) return;
      setError(error.message || '分享链接生成失败');
    }
  }

  async function copyLink() {
    if (!link) return;
    const buttons = [...dialog.querySelectorAll('[data-share-copy]')];
    const copied = await copyText(link);
    if (!copied) {
      dialog.querySelector('[data-share-link]')?.select();
      showToast('无法自动复制，请手动复制选中的链接');
      return;
    }
    showToast('分享链接已复制');
    buttons.forEach(button => { button.textContent = '已复制'; });
    setTimeout(() => {
      buttons.forEach(button => { button.textContent = button.closest('.dialog-actions') ? '复制链接' : '复制'; });
    }, 1600);
  }

  async function nativeShare() {
    if (!link) return;
    try {
      await navigator.share({ title: `${title} · 一头诗人`, text: `${title} · 一头诗人`, url: link });
    } catch (error) {
      if (error?.name !== 'AbortError') showToast('系统分享不可用，请复制链接');
    }
  }

  dialog.addEventListener('click', event => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const copy = target.closest('[data-share-copy]');
    if (copy) { void copyLink(); return; }
    if (target.closest('[data-share-native]')) { void nativeShare(); return; }
    if (target.closest('[data-share-retry]')) { void generate(); return; }
    const input = target.closest('[data-share-link]');
    if (input) input.select();
  });

  void generate();
  return dialog;
}

export function shareTrack(track) {
  if (!track) return;
  openShareDialog({
    kind: 'track',
    request: { kind: 'track', trackId: track.id },
    title: track.title,
    subtitle: [track.artist, track.album].filter(Boolean).join(' · ') || '单曲',
    coverUrl: coverFor(track)
  });
}

export function shareAlbum(album) {
  if (!album) return;
  const tracks = albumTracks(album);
  openShareDialog({
    kind: 'album',
    request: { kind: 'album', albumId: album.id },
    title: album.title,
    subtitle: `${album.artist || '未知艺人'} · ${tracks.length} 首歌曲`,
    coverUrl: coverFor(album)
  });
}

export function sharePlaylist(playlist) {
  if (!playlist) return;
  const tracks = (playlist.trackIds || []).map(id => state.trackById.get(id)).filter(Boolean);
  if (!tracks.length) {
    showToast('这个歌单还没有歌曲');
    return;
  }
  openShareDialog({
    kind: 'playlist',
    request: { kind: 'playlist', playlistId: playlist.id },
    title: playlist.title,
    subtitle: `${tracks.length} 首歌曲`,
    coverUrl: playlistCover(playlist)
  });
}
