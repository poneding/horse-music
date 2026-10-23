import { api } from '../core/api.js';
import { renderApp } from '../core/render-bus.js';
import { state, currentTrack } from '../core/state.js';

export function parseLyrics(text = '') {
  return text.split(/\r?\n/).map(line => {
    const match = line.match(/^\[(\d{2}):(\d{2}(?:\.\d+)?)\]\s*(.*)$/);
    if (!match) return line.trim() ? { time: null, text: line.trim() } : null;
    return { time: Number(match[1]) * 60 + Number(match[2]), text: match[3] };
  }).filter(Boolean);
}

export function getLyricsEntry(track) {
  return track ? state.lyricsCache.get(track.id) || { loading: false, lines: [], active: -1 } : { loading: false, lines: [], active: -1 };
}

export function ensureLyrics(track) {
  if (!track || state.lyricsCache.has(track.id)) return;
  const hasLyrics = track.hasLyrics !== false;
  const entry = { loading: hasLyrics, lines: [], active: -1 };
  state.lyricsCache.set(track.id, entry);
  if (!hasLyrics) return;
  api(`/api/tracks/${encodeURIComponent(track.id)}/lyrics`)
    .then(data => {
      const current = state.lyricsCache.get(track.id);
      if (!current) return;
      current.lines = parseLyrics(data.lyrics || '');
      current.loading = false;
      if (currentTrack()?.id === track.id && state.lyricsOpen) rerenderLyrics();
    })
    .catch(() => {
      const current = state.lyricsCache.get(track.id);
      if (!current) return;
      current.loading = false;
      if (currentTrack()?.id === track.id && state.lyricsOpen) rerenderLyrics();
    });
}

function rerenderLyrics() {
  renderApp();
  requestAnimationFrame(() => scrollActiveLyric('auto'));
}

export function activeLyricIndex(entry, time) {
  let active = -1;
  entry?.lines?.forEach((line, index) => {
    if (line.time !== null && line.time <= time) active = index;
  });
  return active;
}

export function scrollActiveLyric(behavior = 'auto') {
  const container = document.querySelector('.lyrics-panel .lyrics-lines');
  const line = container?.querySelector('.lyric-active');
  if (!container || !line) return;
  const top = line.offsetTop - container.clientHeight / 2 + line.offsetHeight / 2;
  container.scrollTo({ top: Math.max(0, top), behavior });
}

export function updateLyricsHighlight() {
  const panel = document.querySelector('.lyrics-panel');
  if (!panel || !state.lyricsOpen) return;
  const entry = getLyricsEntry(currentTrack());
  if (!entry.lines?.length) return;
  const active = activeLyricIndex(entry, state.currentTime);
  if (active === entry.active) return;
  entry.active = active;
  panel.querySelectorAll('[data-lyric]').forEach((line, index) => {
    line.classList.toggle('lyric-active', index === active);
  });
  scrollActiveLyric('smooth');
}

let swipeBound = false;

// 移动端下滑收起歌词：在列表顶部起手时接管手势，拖动超过阈值即关闭。
export function bindLyricsSwipe() {
  if (swipeBound) return;
  swipeBound = true;
  let panel = null;
  let startX = 0;
  let startY = 0;
  let offset = 0;
  let tracking = false;

  document.addEventListener('touchstart', event => {
    const target = event.target instanceof Element ? event.target.closest('.lyrics-panel') : null;
    if (!target || event.touches.length !== 1) { tracking = false; return; }
    const lines = target.querySelector('.lyrics-lines');
    if (lines && lines.contains(event.target) && lines.scrollTop > 1) { tracking = false; return; }
    panel = target;
    startX = event.touches[0].clientX;
    startY = event.touches[0].clientY;
    offset = 0;
    tracking = true;
    panel.style.transition = 'none';
  }, { passive: true });

  document.addEventListener('touchmove', event => {
    if (!tracking || !panel || event.touches.length !== 1) return;
    const touch = event.touches[0];
    offset = touch.clientY - startY;
    if (offset <= 0) {
      panel.style.transform = '';
      panel.style.opacity = '';
      return;
    }
    if (Math.abs(touch.clientX - startX) > offset) return;
    event.preventDefault();
    panel.style.transform = `translateY(${offset}px)`;
    panel.style.opacity = String(Math.max(0.4, 1 - offset / 480));
  }, { passive: false });

  const settle = () => {
    if (!tracking || !panel) return;
    tracking = false;
    const target = panel;
    panel = null;
    const shouldClose = offset > 92;
    target.style.transition = 'transform .24s cubic-bezier(.22,.8,.3,1), opacity .24s ease';
    if (shouldClose) {
      target.style.transform = 'translateY(110%)';
      target.style.opacity = '0';
      window.setTimeout(() => {
        if (!state.lyricsOpen) return;
        state.lyricsOpen = false;
        renderApp();
      }, 160);
    } else {
      target.style.transform = '';
      target.style.opacity = '';
      window.setTimeout(() => { target.style.transition = ''; }, 280);
    }
    offset = 0;
  };

  document.addEventListener('touchend', settle);
  document.addEventListener('touchcancel', settle);
}
