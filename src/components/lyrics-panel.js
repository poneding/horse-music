import { icon } from '../core/icons.js';
import { currentTrack, IMG_VISIBLE, state } from '../core/state.js';
import { coverFor, escapeHtml } from '../core/util.js';
import { activeLyricIndex, ensureLyrics, getLyricsEntry } from '../features/lyrics.js';

export function renderLyricsPanel() {
  const track = currentTrack();
  if (!track) return '';
  ensureLyrics(track);
  const entry = getLyricsEntry(track);
  const active = activeLyricIndex(entry, state.currentTime);
  entry.active = active;
  const body = entry.lines?.length
    ? entry.lines.map((line, index) => `<p class="${index === active ? 'lyric-active' : ''}" data-lyric="${index}">${escapeHtml(line.text)}</p>`).join('')
    : entry.loading ? '<p class="lyric-empty">歌词加载中…</p>' : '<p class="lyric-empty">暂无歌词</p>';
  return `<section class="lyrics-panel" role="dialog" aria-modal="true" aria-label="歌词"><div class="lyrics-backdrop" aria-hidden="true"><img ${IMG_VISIBLE} src="${escapeHtml(coverFor(track))}" alt=""/></div><header class="lyrics-top"><span class="lyrics-eyebrow">${icon('music', 14)} 正在播放</span><button class="lyrics-close" data-action="lyrics" aria-label="收起歌词" title="收起歌词">${icon('chevronDown', 24)}</button></header><div class="lyrics-stage"><div class="lyrics-identity"><img class="lyrics-artwork" ${IMG_VISIBLE} src="${escapeHtml(coverFor(track))}" alt=""/><div class="lyrics-identity-copy"><span class="lyrics-eyebrow">NOW PLAYING</span><strong>${escapeHtml(track.title)}</strong><span>${escapeHtml(track.artist)}</span><span class="lyrics-album">${escapeHtml(track.album || '单曲')}${track.genre ? ` · ${escapeHtml(track.genre)}` : ''}</span></div></div><div class="lyrics-lines">${body}</div></div></section>`;
}
