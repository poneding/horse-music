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

const SESSION_KEY = 'horse-playback-v1';
const SAVE_INTERVAL = 1200;

// 每次切换音源/暂停都会递增，用于忽略被后续操作打断的 play() Promise。
let playbackRequest = 0;
let queueSeq = 0;
let saveTimer = null;
let pendingSeek = null;
let restoring = false;

function makeEntry(track) {
  queueSeq += 1;
  return { key: `q${Date.now().toString(36)}-${queueSeq.toString(36)}`, track };
}

function toTracks(list) {
  return (Array.isArray(list) ? list : []).map(item => item?.track || item).filter(Boolean);
}

function currentEntry() {
  return state.queue[state.queueIndex] || null;
}

function clampVolume(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 1;
  return Math.min(1, Math.max(0, number));
}

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

function notifyQueueChange() {
  document.dispatchEvent(new CustomEvent('horse:queuechange'));
}

function beginTrack({ record = true, autoplay = true } = {}) {
  const track = currentTrack();
  if (!track) return;
  state.pendingRecord = record ? track.id : null;
  state.recordedForCurrent = false;
  state.currentTime = 0;
  state.duration = Number(track.duration) || 0;
  pendingSeek = null;
  ensureLyrics(track);
  audio.src = track.src;
  window.dispatchEvent(new CustomEvent('horse:trackchange'));
  state.playing = autoplay;
  renderApp();
  notifyQueueChange();
  if (autoplay) requestPlayback();
  else {
    playbackRequest += 1;
    audio.pause();
  }
  persistNow();
}

function shuffled(keys) {
  const list = [...keys];
  for (let index = list.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [list[index], list[swap]] = [list[swap], list[index]];
  }
  return list;
}

export function rebuildShufflePool() {
  if (!state.shuffle) {
    state.shufflePool = [];
    return state.shufflePool;
  }
  const currentKey = currentEntry()?.key;
  const history = new Set(state.shuffleHistory);
  state.shufflePool = shuffled(
    state.queue
      .filter(entry => entry.key !== currentKey && !history.has(entry.key))
      .map(entry => entry.key)
  );
  return state.shufflePool;
}

function pruneShuffleKeys() {
  const keys = new Set(state.queue.map(entry => entry.key));
  state.shufflePool = state.shufflePool.filter(key => keys.has(key));
  state.shuffleHistory = state.shuffleHistory.filter(key => keys.has(key));
}

function indexOfKey(key) {
  return state.queue.findIndex(entry => entry.key === key);
}

function takeShuffleKey() {
  const currentKey = currentEntry()?.key;
  while (state.shufflePool.length) {
    const key = state.shufflePool.pop();
    if (key === currentKey) continue;
    if (indexOfKey(key) >= 0) return key;
  }
  return null;
}

function stopAtEnd() {
  playbackRequest += 1;
  audio.pause();
  state.playing = false;
  state.currentTime = 0;
  state.pendingRecord = null;
  state.recordedForCurrent = false;
  try { audio.currentTime = 0; } catch {}
  renderApp();
  persistNow();
}

function stepToIndex(index, { record = true, remember = true, autoplay = true } = {}) {
  const previousEntry = currentEntry();
  const targetEntry = state.queue[index];
  if (!targetEntry) return;
  if (remember && state.shuffle && previousEntry && index !== state.queueIndex) {
    state.shuffleHistory.push(previousEntry.key);
    state.shufflePool = state.shufflePool.filter(key => key !== targetEntry.key);
  }
  state.queueIndex = index;
  beginTrack({ record, autoplay });
}

export function playQueueIndex(index) {
  if (!Number.isInteger(index) || index < 0 || index >= state.queue.length) return;
  if (index === state.queueIndex) {
    seekTo(0);
    if (audio.paused) {
      state.playing = true;
      if (!state.recordedForCurrent) state.pendingRecord = currentTrack()?.id || null;
      renderApp();
      requestPlayback();
    }
    return;
  }
  stepToIndex(index);
}

export function playTrack(id, queue = state.tracks) {
  const track = state.trackById.get(id) || toTracks(queue).find(item => item.id === id);
  if (!track) return;
  const sourceQueue = toTracks(queue).length ? toTracks(queue) : state.tracks;
  const entries = sourceQueue.map(makeEntry);
  let index = entries.findIndex(entry => entry.track.id === id);
  if (index < 0) {
    entries.unshift(makeEntry(track));
    index = 0;
  }
  state.queue = entries;
  state.queueIndex = index;
  state.shuffleHistory = [];
  rebuildShufflePool();
  beginTrack({ record: true });
}

export function playFromList(tracks) {
  const list = toTracks(tracks);
  if (!list.length) return;
  state.queue = list.map(makeEntry);
  state.queueIndex = 0;
  state.shuffleHistory = [];
  rebuildShufflePool();
  beginTrack({ record: true });
}

export function enqueueTrack(id, mode = 'end') {
  const track = state.trackById.get(id);
  if (!track) return false;
  if (!currentTrack()) {
    playTrack(id, [track]);
    return true;
  }
  const entry = makeEntry(track);
  if (mode === 'next') {
    const insertAt = state.queueIndex + 1;
    state.queue.splice(insertAt, 0, entry);
  } else {
    state.queue.push(entry);
  }
  if (state.shuffle) {
    if (mode === 'next') {
      // 随机模式下「下一首播放」仍要立即播放：放在池尾，下一次 takeShuffleKey 会先取到它。
      state.shufflePool.push(entry.key);
    } else {
      const insertAt = Math.floor(Math.random() * (state.shufflePool.length + 1));
      state.shufflePool.splice(insertAt, 0, entry.key);
    }
  }
  renderApp();
  notifyQueueChange();
  persistNow();
  showToast(mode === 'next' ? '已设为下一首播放' : '已加入播放队列');
  return true;
}

export function removeQueueEntry(key) {
  const index = indexOfKey(key);
  if (index < 0) return false;
  const currentKey = currentEntry()?.key;
  const wasCurrent = key === currentKey;
  const wasPlaying = state.playing;
  const position = index < state.queueIndex ? 1 : 0;
  state.queue.splice(index, 1);
  pruneShuffleKeys();
  if (!state.queue.length) {
    clearQueue({ silent: true });
    return true;
  }
  if (wasCurrent) {
    const nextIndex = Math.min(index, state.queue.length - 1);
    state.queueIndex = nextIndex;
    const promotedKey = currentEntry()?.key;
    if (promotedKey) {
      state.shufflePool = state.shufflePool.filter(key => key !== promotedKey);
      state.shuffleHistory = state.shuffleHistory.filter(key => key !== promotedKey);
    }
    beginTrack({ record: wasPlaying, autoplay: wasPlaying });
  } else {
    state.queueIndex = Math.max(0, state.queueIndex - position);
    renderApp();
    notifyQueueChange();
    persistNow();
  }
  return true;
}

export function reorderQueue(keys) {
  if (!Array.isArray(keys) || keys.length !== state.queue.length) return false;
  const byKey = new Map(state.queue.map(entry => [entry.key, entry]));
  if (keys.some(key => !byKey.has(key))) return false;
  const currentKey = currentEntry()?.key;
  state.queue = keys.map(key => byKey.get(key));
  state.queueIndex = currentKey ? indexOfKey(currentKey) : -1;
  renderApp();
  notifyQueueChange();
  persistNow();
  return true;
}

export function clearQueue({ silent = false } = {}) {
  playbackRequest += 1;
  audio.pause();
  audio.removeAttribute('src');
  try { audio.load(); } catch {}
  state.queue = [];
  state.queueIndex = -1;
  state.playing = false;
  state.currentTime = 0;
  state.duration = 0;
  state.pendingRecord = null;
  state.recordedForCurrent = false;
  state.shufflePool = [];
  state.shuffleHistory = [];
  pendingSeek = null;
  renderApp();
  notifyQueueChange();
  persistNow();
  if (!silent) showToast('播放队列已清空');
}

export function toggleShuffle() {
  state.shuffle = !state.shuffle;
  if (state.shuffle) {
    state.shuffleHistory = [];
    rebuildShufflePool();
  } else {
    state.shufflePool = [];
    state.shuffleHistory = [];
  }
  showToast(state.shuffle ? '随机播放已开启' : '随机播放已关闭');
  renderApp();
  persistNow();
}

export function seekTo(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value)) return;
  const target = Math.max(0, value);
  try { audio.currentTime = target; } catch {}
  state.currentTime = target;
  // 元数据尚未就绪时同步更新待跳转位置，避免随后被恢复的旧位置覆盖。
  if (pendingSeek != null) pendingSeek = target;
  scheduleSave();
}

export function setVolume(value, { persist = true } = {}) {
  const volume = clampVolume(value);
  audio.muted = false;
  audio.volume = volume;
  state.volume = volume;
  state.muted = false;
  if (persist) scheduleSave();
}

export function toggleMute() {
  state.muted = !state.muted;
  audio.muted = state.muted;
  if (!state.muted && state.volume === 0) {
    state.volume = 0.6;
    audio.volume = state.volume;
  }
  showToast(state.muted ? '已静音' : '已取消静音');
  renderApp();
  persistNow();
}

function syncRepeatFlags() {
  state.repeat = state.repeatMode === 1;
  state.repeatOne = state.repeatMode === 2;
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
      if (!state.recordedForCurrent) state.pendingRecord = currentTrack()?.id || null;
      renderApp();
      requestPlayback();
    } else {
      playbackRequest += 1;
      audio.pause();
      state.playing = false;
      renderApp();
      persistNow();
    }
  } else if (action === 'next' || action === 'previous') moveQueue(action === 'next' ? 1 : -1);
  else if (action === 'play-filtered') playFromList(filteredTracks());
  else if (action === 'load-more') { state.listLimit += TRACK_PAGE_SIZE; renderApp(); }
  else if (action === 'play-listed') playFromList(listedTracks(currentRoute()));
  else if (action === 'lyrics') {
    state.lyricsOpen = !state.lyricsOpen;
    renderApp();
    if (state.lyricsOpen) requestAnimationFrame(() => scrollActiveLyric('auto'));
  } else if (action === 'shuffle') toggleShuffle();
  else if (action === 'repeat') {
    state.repeatMode = ((state.repeatMode || 0) + 1) % 3;
    syncRepeatFlags();
    showToast(['关闭循环', '列表循环', '单曲循环'][state.repeatMode]);
    if (state.shuffle) {
      state.shuffleHistory = [];
      rebuildShufflePool();
    }
    renderApp();
    persistNow();
  } else if (action === 'mute') toggleMute();
  else if (action === 'queue') showQueue();
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
  // 上一首：播放超过 3 秒时先回到本曲开头，符合主流播放器习惯。
  if (direction < 0 && audio.currentTime > 3) {
    seekTo(0);
    return;
  }

  if (direction === 1) {
    if (state.shuffle) {
      let key = takeShuffleKey();
      if (!key && state.repeatMode === 1) {
        state.shuffleHistory = [];
        rebuildShufflePool();
        key = takeShuffleKey();
      }
      if (!key) { stopAtEnd(); return; }
      const index = indexOfKey(key);
      if (index < 0) { moveQueue(1); return; }
      stepToIndex(index);
      return;
    }
    if (state.queueIndex >= state.queue.length - 1) {
      if (state.repeatMode === 0) { stopAtEnd(); return; }
      stepToIndex(0);
      return;
    }
    stepToIndex(state.queueIndex + 1);
    return;
  }

  if (state.shuffle) {
    if (state.shuffleHistory.length) {
      let key = state.shuffleHistory.pop();
      while (key && indexOfKey(key) < 0) key = state.shuffleHistory.pop();
      if (key) {
        const index = indexOfKey(key);
        const currentKey = currentEntry()?.key;
        stepToIndex(index, { remember: false });
        if (currentKey) state.shufflePool.push(currentKey);
        return;
      }
    }
    // 没有历史时回到本曲开头，避免顺序跳转把当前曲目留在随机池里造成重复。
    seekTo(0);
    return;
  }
  const nextIndex = (state.queueIndex - 1 + state.queue.length) % state.queue.length;
  stepToIndex(nextIndex, { remember: false });
}

// ---- 播放会话持久化 -------------------------------------------------------

function readSession() {
  try {
    const value = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

export function persistNow() {
  if (restoring) return;
  try {
    if (!state.queue.length) {
      localStorage.removeItem(SESSION_KEY);
      return;
    }
    const payload = {
      version: 1,
      ids: state.queue.map(entry => entry.track.id),
      index: state.queueIndex,
      currentId: currentTrack()?.id || '',
      position: Math.max(0, Number(audio.currentTime) || state.currentTime || 0),
      volume: state.volume,
      muted: state.muted,
      shuffle: state.shuffle,
      repeatMode: state.repeatMode,
      updatedAt: Date.now()
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
  } catch {
    // 隐私模式下存储可能不可用，播放本身不应受影响。
  }
}

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    persistNow();
  }, SAVE_INTERVAL);
}

export function restorePlaybackSession() {
  const saved = readSession();
  if (!saved) return false;
  restoring = true;
  try {
    state.volume = clampVolume(saved.volume ?? 1);
    state.muted = Boolean(saved.muted);
    audio.volume = state.volume;
    audio.muted = state.muted;
    state.shuffle = Boolean(saved.shuffle);
    state.repeatMode = [0, 1, 2].includes(Number(saved.repeatMode)) ? Number(saved.repeatMode) : 0;
    syncRepeatFlags();

    const ids = Array.isArray(saved.ids) ? saved.ids.slice(0, 5000) : [];
    const entries = [];
    for (const id of ids) {
      const track = state.trackById.get(id);
      if (track) entries.push(makeEntry(track));
    }
    if (!entries.length) return true;

    let index = Number(saved.index);
    if (!Number.isInteger(index) || index < 0 || index >= entries.length) index = 0;
    // 队列允许重复歌曲，优先保留保存时命中的那一条；只有索引失效时才按歌曲 ID 回退。
    if (saved.currentId && entries[index]?.track.id !== saved.currentId) {
      const found = entries.findIndex(entry => entry.track.id === saved.currentId);
      if (found >= 0) index = found;
    }
    state.queue = entries;
    state.queueIndex = index;
    const track = currentTrack();
    state.duration = Number(track.duration) || 0;
    const position = Math.max(0, Number(saved.position) || 0);
    state.currentTime = position;
    pendingSeek = position > 0.5 ? position : null;
    state.playing = false;
    state.pendingRecord = null;
    state.recordedForCurrent = false;
    ensureLyrics(track);
    audio.src = track.src;
    rebuildShufflePool();
    return true;
  } finally {
    restoring = false;
  }
}

// ---- 音频事件 -------------------------------------------------------------

audio.addEventListener('play', () => {
  state.playing = true;
  updatePlaybackUi();
  persistNow();
});

audio.addEventListener('playing', () => {
  if (!state.pendingRecord) return;
  const trackId = state.pendingRecord;
  state.pendingRecord = null;
  state.recordedForCurrent = true;
  recordPlay(trackId);
});

audio.addEventListener('pause', () => {
  state.playing = false;
  updatePlaybackUi();
  persistNow();
});

audio.addEventListener('timeupdate', () => {
  if (pendingSeek != null) return;
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
  scheduleSave();
});

audio.addEventListener('loadedmetadata', () => {
  state.duration = Number.isFinite(audio.duration) ? audio.duration : (Number(currentTrack()?.duration) || 0);
  if (pendingSeek != null) {
    const target = Math.min(pendingSeek, Math.max(0, state.duration - 0.25));
    try { audio.currentTime = target; } catch {}
    state.currentTime = target;
    pendingSeek = null;
  }
  document.querySelectorAll('.progress-slider').forEach(slider => {
    slider.max = state.duration || 100;
    slider.value = state.currentTime;
    slider.style.setProperty('--progress', state.duration ? state.currentTime / state.duration * 100 : 0);
  });
  document.querySelectorAll('[data-time-total]').forEach(label => {
    label.textContent = formatTime(state.duration);
  });
  document.querySelectorAll('[data-time-current]').forEach(label => {
    label.textContent = formatTime(state.currentTime);
  });
  persistNow();
});

audio.addEventListener('ended', () => {
  persistNow();
  if (state.repeatMode === 2) {
    state.recordedForCurrent = false;
    state.pendingRecord = currentTrack()?.id || null;
    try { audio.currentTime = 0; } catch {}
    requestPlayback();
  } else {
    moveQueue(1);
  }
});

audio.addEventListener('error', () => {
  // MEDIA_ERR_ABORTED 是切换音源时主动中断，不代表文件损坏。
  if (!audio.error || audio.error.code === 1) return;
  // 恢复播放的曲目加载失败时清空待跳转，避免进度与歌词永久冻结。
  pendingSeek = null;
  if (!state.queue.length) return;
  state.playing = false;
  state.pendingRecord = null;
  if (currentTrack()) showToast('这首歌暂时无法播放');
  renderApp();
});

function updateMuteUi() {
  document.querySelectorAll('.mute-toggle').forEach(button => {
    button.setAttribute('aria-pressed', String(state.muted));
    button.innerHTML = icon(state.muted ? 'volumeMute' : 'volume', 17);
    button.setAttribute('aria-label', state.muted ? '取消静音' : '静音');
  });
}

audio.addEventListener('volumechange', () => {
  state.volume = audio.volume;
  state.muted = audio.muted;
  document.querySelectorAll('.volume-slider').forEach(slider => {
    if (document.activeElement !== slider) slider.value = audio.volume;
  });
  updateMuteUi();
  scheduleSave();
});

window.addEventListener('pagehide', persistNow);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') persistNow();
});

// 曲库刷新（管理端编辑/其他设备改动）后让队列条目指向最新的曲目对象，
// 避免播放条和歌词继续显示旧标题、封面。
window.addEventListener('horse:librarychange', () => {
  let changed = false;
  for (const entry of state.queue) {
    const fresh = state.trackById.get(entry.track.id);
    if (fresh && fresh !== entry.track) {
      entry.track = fresh;
      changed = true;
    }
  }
  if (changed) {
    updatePlaybackUi();
    notifyQueueChange();
  }
});
