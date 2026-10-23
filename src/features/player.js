import { icon } from '../core/icons.js';
import { showToast } from '../core/toast.js';
import { currentRoute, navigate } from '../core/router.js';
import { renderApp } from '../core/render-bus.js';
import { currentTrack, state, TRACK_PAGE_SIZE } from '../core/state.js';
import { formatTime } from '../core/util.js';
import { listedTracks } from '../data/collections.js';
import { filteredTracks, recordPlay } from '../data/library.js';
import { ensureLyrics, scrollActiveLyric, updateLyricsHighlight } from './lyrics.js';
import { openPlaylistCreateDialog } from '../components/playlist-create-dialog.js';
import { showQueue } from '../components/queue-dialog.js';

export const audio = new Audio();
audio.preload = 'metadata';

// 每次切换音源/暂停都会递增，用于忽略被后续操作打断的 play() Promise。
let playbackRequest = 0;

export function updatePlaybackUi() {
  document.querySelectorAll('.main-play').forEach(button => {
    button.innerHTML = icon(state.playing ? 'pause' : 'play', 18);
    button.setAttribute('aria-label', state.playing ? '暂停' : '播放');
  });
  document.querySelectorAll('.player-cover-button').forEach(button => {
    button.classList.toggle('is-playing', state.playing);
  });
}

export function requestPlayback() {
  const request = ++playbackRequest;
  const promise = audio.play();
  if (!promise || typeof promise.catch !== 'function') return;
  promise.catch(error => {
    // 切歌或暂停会中断上一次 play()，这属于正常现象，不提示错误。
    if (request !== playbackRequest || error?.name === 'AbortError') return;
    state.playing = false;
    state.pendingRecord = null;
    renderApp();
    showToast(error?.name === 'NotAllowedError' ? '浏览器阻止了播放，请再点一次播放' : '音频无法播放，请检查文件格式或媒体链接');
  });
}

export function playTrack(id, queue = state.tracks) {
  const track = state.trackById.get(id) || state.tracks.find(item => item.id === id);
  if (!track) return;
  const sourceQueue = queue.length ? queue : state.tracks;
  state.queue = [...sourceQueue];
  state.queueIndex = state.queue.findIndex(item => item.id === id);
  if (state.queueIndex < 0) { state.queue.unshift(track); state.queueIndex = 0; }
  state.pendingRecord = track.id;
  state.currentTime = 0;
  state.duration = 0;
  ensureLyrics(track);
  audio.src = track.src;
  state.playing = true;
  renderApp();
  requestPlayback();
}

export function playFromList(tracks) {
  if (!tracks.length) return;
  state.queue = [...tracks];
  state.queueIndex = 0;
  state.pendingRecord = tracks[0].id;
  state.currentTime = 0;
  state.duration = 0;
  ensureLyrics(tracks[0]);
  audio.src = tracks[0].src;
  state.playing = true;
  renderApp();
  requestPlayback();
}

export function seekTo(seconds) {
  if (Number.isFinite(seconds)) audio.currentTime = seconds;
}

export function setVolume(value) {
  audio.volume = Number(value);
}

export function handlePlayerAction(action) {
  if (action === 'toggle-play') {
    if (!currentTrack()) {
      const list = listedTracks(currentRoute());
      playFromList(list.length ? list : state.tracks);
      return;
    }
    if (audio.paused) {
      state.playing = true;
      renderApp();
      requestPlayback();
    } else {
      playbackRequest += 1;
      audio.pause();
      state.playing = false;
      renderApp();
    }
  } else if (action === 'next' || action === 'previous') moveQueue(action === 'next' ? 1 : -1);
  else if (action === 'play-filtered') playFromList(filteredTracks());
  else if (action === 'load-more') { state.listLimit += TRACK_PAGE_SIZE; renderApp(); }
  else if (action === 'play-listed') playFromList(listedTracks(currentRoute()));
  else if (action === 'lyrics') {
    state.lyricsOpen = !state.lyricsOpen;
    renderApp();
    if (state.lyricsOpen) requestAnimationFrame(() => scrollActiveLyric('auto'));
  } else if (action === 'shuffle') { state.shuffle = !state.shuffle; renderApp(); }
  else if (action === 'repeat') {
    state.repeatMode = ((state.repeatMode || 0) + 1) % 3;
    state.repeat = state.repeatMode === 1;
    state.repeatOne = state.repeatMode === 2;
    showToast(['关闭循环', '列表循环', '单曲循环'][state.repeatMode]);
    renderApp();
  } else if (action === 'queue') showQueue();
  else if (action === 'new-playlist') {
    openPlaylistCreateDialog({
      onCreated: renderApp,
      onError: () => {
        showToast('请先在管理端登录后创建歌单');
        navigate('/admin');
      }
    });
  }
}

function moveQueue(direction) {
  if (!state.queue.length) return;
  if (direction === 1 && state.repeatOne) {
    state.pendingRecord = currentTrack()?.id || null;
    ensureLyrics(currentTrack());
    audio.currentTime = 0;
    requestPlayback();
    return;
  }
  if (direction === 1 && state.queueIndex === state.queue.length - 1 && !state.repeat) {
    audio.pause();
    state.playing = false;
    state.currentTime = 0;
    renderApp();
    return;
  }
  if (state.shuffle && direction === 1) state.queueIndex = Math.floor(Math.random() * state.queue.length);
  else state.queueIndex = (state.queueIndex + direction + state.queue.length) % state.queue.length;
  const track = currentTrack();
  state.pendingRecord = track.id;
  state.currentTime = 0;
  state.duration = 0;
  ensureLyrics(track);
  audio.src = track.src;
  state.playing = true;
  renderApp();
  requestPlayback();
}

audio.addEventListener('play', () => {
  state.playing = true;
  updatePlaybackUi();
});

audio.addEventListener('playing', () => {
  if (!state.pendingRecord) return;
  const trackId = state.pendingRecord;
  state.pendingRecord = null;
  recordPlay(trackId);
});

audio.addEventListener('pause', () => {
  state.playing = false;
  updatePlaybackUi();
});

audio.addEventListener('timeupdate', () => {
  state.currentTime = audio.currentTime || 0;
  const progress = state.duration ? state.currentTime / state.duration * 100 : 0;
  document.querySelectorAll('.progress-slider').forEach(slider => {
    slider.value = state.currentTime;
    slider.style.setProperty('--progress', `${progress}%`);
  });
  document.querySelectorAll('[data-time-current]').forEach(label => {
    label.textContent = formatTime(state.currentTime);
  });
  updateLyricsHighlight();
});

audio.addEventListener('loadedmetadata', () => {
  state.duration = Number.isFinite(audio.duration) ? audio.duration : 0;
  document.querySelectorAll('.progress-slider').forEach(slider => {
    slider.max = state.duration || 100;
  });
  document.querySelectorAll('[data-time-total]').forEach(label => {
    label.textContent = formatTime(state.duration);
  });
});

audio.addEventListener('ended', () => {
  if (state.repeatOne) {
    state.pendingRecord = currentTrack()?.id || null;
    audio.currentTime = 0;
    requestPlayback();
  } else {
    moveQueue(1);
  }
});

audio.addEventListener('error', () => {
  // MEDIA_ERR_ABORTED 是切换音源时主动中断，不代表文件损坏。
  if (!audio.error || audio.error.code === 1) return;
  state.playing = false;
  state.pendingRecord = null;
  if (currentTrack()) showToast('这首歌暂时无法播放');
  renderApp();
});

