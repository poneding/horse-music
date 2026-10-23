import { icon } from '../core/icons.js';
import { currentTrack, IMG_VISIBLE, state } from '../core/state.js';
import { coverFor, escapeHtml, formatTime } from '../core/util.js';
import { audio } from '../features/player.js';

export function renderPlayerBar(standalone = false) {
  const current = currentTrack();
  const liked = current ? state.favorites.has(current.id) : false;
  const progress = state.duration ? state.currentTime / state.duration * 100 : 0;
  return `<footer class="player-bar${standalone ? ' standalone' : ''}">
    <div class="player-track">${current ? `<button class="player-cover-button${state.playing ? ' is-playing' : ''}" data-action="lyrics" aria-label="全屏显示歌词" title="全屏歌词"><img class="player-cover" ${IMG_VISIBLE} src="${escapeHtml(coverFor(current))}" alt="" /><span class="playing-bars cover-equalizer" aria-hidden="true"><i></i><i></i><i></i></span></button><div class="player-meta"><strong>${escapeHtml(current.title)}</strong><span>${escapeHtml(current.artist)}</span></div><button class="icon-button player-fav ${liked ? 'liked' : ''}" data-favorite="${escapeHtml(current.id)}" aria-label="收藏">${icon('heart', 17)}</button>` : `<span class="player-placeholder">${icon('music', 23)}<span>选择一首喜欢的歌</span></span>`}</div>
    <div class="player-center"><div class="player-controls"><button class="icon-button control-secondary ${state.shuffle ? 'control-active' : ''}" data-action="shuffle" aria-label="随机播放">${icon('shuffle', 17)}</button><button class="icon-button" data-action="previous" aria-label="上一首">${icon('prev', 18)}</button><button class="main-play" data-action="toggle-play" aria-label="${state.playing ? '暂停' : '播放'}">${icon(state.playing ? 'pause' : 'play', 18)}</button><button class="icon-button" data-action="next" aria-label="下一首">${icon('next', 18)}</button><button class="icon-button control-secondary ${state.repeat ? 'control-active' : ''}" data-action="repeat" aria-label="${state.repeatOne ? '单曲循环' : state.repeat ? '列表循环' : '关闭循环'}">${icon('queue', 17)}${state.repeatOne ? '<span class="repeat-one-mark">1</span>' : ''}</button></div><div class="progress-row"><span data-time-current>${formatTime(state.currentTime)}</span><input class="progress-slider" type="range" min="0" max="${state.duration || 100}" value="${state.currentTime}" aria-label="播放进度" style="--progress:${progress}%" /><span data-time-total>${formatTime(state.duration)}</span></div></div>
    <div class="player-extra"><button class="icon-button lyric-toggle ${state.lyricsOpen ? 'control-active' : ''}" data-action="lyrics" aria-label="显示歌词">詞</button><div class="volume-control">${icon('volume', 17)}<input class="volume-slider" aria-label="音量" type="range" min="0" max="1" step="0.01" value="${audio.volume}" /></div><button class="icon-button" data-action="queue" aria-label="播放队列">${icon('list', 18)}</button></div>
  </footer>`;
}
