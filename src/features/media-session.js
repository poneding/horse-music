import { currentTrack, state } from '../core/state.js';
import { coverFor } from '../core/util.js';
import { audio, handlePlayerAction, seekTo } from './player.js';

let initialized = false;
let lastMetadataId = '';
let lastPositionAt = 0;

function absoluteArtwork(track) {
  try {
    return new URL(coverFor(track), location.origin).href;
  } catch {
    return '';
  }
}

function updateMetadata(force = false) {
  if (!('mediaSession' in navigator)) return;
  const track = currentTrack();
  if (!track) {
    navigator.mediaSession.metadata = null;
    lastMetadataId = '';
    return;
  }
  if (typeof MediaMetadata !== 'function') return;
  if (!force && lastMetadataId === track.id) return;
  lastMetadataId = track.id;
  const artwork = absoluteArtwork(track);
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title || '未知歌曲',
    artist: track.artist || '未知艺人',
    album: track.album || '一头诗人',
    artwork: artwork ? [{ src: artwork, sizes: '512x512' }] : []
  });
}

function updatePlaybackState() {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.playbackState = state.playing ? 'playing' : 'paused';
}

function updatePositionState() {
  if (!('mediaSession' in navigator) || typeof navigator.mediaSession.setPositionState !== 'function') return;
  const duration = Number(audio.duration);
  if (!Number.isFinite(duration) || duration <= 0) return;
  const now = Date.now();
  if (now - lastPositionAt < 900) return;
  lastPositionAt = now;
  try {
    navigator.mediaSession.setPositionState({
      duration,
      playbackRate: audio.playbackRate || 1,
      position: Math.min(Math.max(0, audio.currentTime || 0), duration)
    });
  } catch {
    // 某些浏览器在 duration 尚不可靠时会抛错，忽略即可。
  }
}

function safeAction(action, handler) {
  try { navigator.mediaSession.setActionHandler(action, handler); }
  catch { /* 动作不受当前浏览器支持。 */ }
}

export function initMediaSession() {
  if (initialized || !('mediaSession' in navigator)) return;
  initialized = true;

  safeAction('play', () => {
    if (audio.paused) handlePlayerAction('toggle-play');
  });
  safeAction('pause', () => {
    if (!audio.paused) handlePlayerAction('toggle-play');
  });
  safeAction('previoustrack', () => handlePlayerAction('previous'));
  safeAction('nexttrack', () => handlePlayerAction('next'));
  safeAction('stop', () => {
    if (!audio.paused) handlePlayerAction('toggle-play');
  });
  safeAction('seekbackward', details => {
    seekTo(audio.currentTime - Number(details?.seekOffset || 10));
  });
  safeAction('seekforward', details => {
    seekTo(audio.currentTime + Number(details?.seekOffset || 10));
  });
  safeAction('seekto', details => {
    if (Number.isFinite(Number(details?.seekTime))) seekTo(Number(details.seekTime));
  });

  audio.addEventListener('loadedmetadata', () => {
    updateMetadata(true);
    updatePlaybackState();
    updatePositionState();
  });
  audio.addEventListener('play', () => {
    updateMetadata();
    updatePlaybackState();
  });
  audio.addEventListener('pause', updatePlaybackState);
  audio.addEventListener('timeupdate', updatePositionState);
  audio.addEventListener('emptied', () => {
    updateMetadata(true);
    updatePlaybackState();
  });
  window.addEventListener('horse:trackchange', () => updateMetadata(true));

  updateMetadata(true);
  updatePlaybackState();
}
