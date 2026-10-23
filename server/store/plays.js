const fsp = require('node:fs/promises');
const { PLAYS_FILE, RECENT_PLAY_LIMIT } = require('../config');
const { atomicWrite } = require('../lib/files');
const { getDb, touchDb } = require('./library');

let playStore = { counts: {}, recent: [] };
let playWriteTimer = null;
let playDirty = false;
let playWritePromise = Promise.resolve();

function schedulePlayStoreWrite() {
  playDirty = true;
  if (playWriteTimer) return;
  playWriteTimer = setTimeout(() => {
    playWriteTimer = null;
    flushPlayStore().catch(error => console.error(`Could not write play store: ${error.message}`));
  }, 750);
  if (playWriteTimer.unref) playWriteTimer.unref();
}

function flushPlayStore(immediate = false) {
  if (immediate) {
    playDirty = true;
    if (playWriteTimer) { clearTimeout(playWriteTimer); playWriteTimer = null; }
  }
  const write = async () => {
    if (!playDirty) return;
    playDirty = false;
    await atomicWrite(PLAYS_FILE, JSON.stringify(playStore));
  };
  playWritePromise = playWritePromise.then(write, write);
  return playWritePromise;
}

async function initPlays() {
  const db = getDb();
  let store = null;
  let created = false;
  try {
    store = JSON.parse(await fsp.readFile(PLAYS_FILE, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') created = true;
    else console.warn(`Could not read play store, rebuilding: ${error.message}`);
    created = true;
  }
  if (!store || typeof store !== 'object' || typeof store.counts !== 'object' || !Array.isArray(store.recent)) {
    store = { counts: {}, recent: [] };
    created = true;
  }
  const trackIds = new Set(db.tracks.map(track => track.id));
  const counts = {};
  let changed = created;
  for (const [trackId, value] of Object.entries(store.counts)) {
    if (!trackIds.has(trackId) || !value || typeof value !== 'object') { changed = true; continue; }
    const count = Number(value.count) || 0;
    const lastPlayedAt = typeof value.lastPlayedAt === 'string' ? value.lastPlayedAt : '';
    counts[trackId] = { count, lastPlayedAt };
    if (count !== value.count || lastPlayedAt !== value.lastPlayedAt) changed = true;
  }
  const recent = [];
  for (const entry of store.recent) {
    if (!entry || !trackIds.has(entry.trackId) || typeof entry.playedAt !== 'string') { changed = true; continue; }
    recent.push({ trackId: entry.trackId, playedAt: entry.playedAt });
    if (recent.length >= RECENT_PLAY_LIMIT) { changed = true; break; }
  }
  store = { counts, recent };
  if (created) {
    for (const track of db.tracks) {
      const count = Number(track.playCount) || 0;
      if (count > 0 || track.lastPlayedAt) store.counts[track.id] = { count, lastPlayedAt: track.lastPlayedAt || '' };
    }
    const seen = new Set();
    const legacyRecent = Array.isArray(db.recentPlays) ? db.recentPlays : [];
    for (const entry of legacyRecent) {
      if (!entry || !trackIds.has(entry.trackId) || typeof entry.playedAt !== 'string' || seen.has(entry.trackId)) continue;
      seen.add(entry.trackId);
      store.recent.push({ trackId: entry.trackId, playedAt: entry.playedAt });
      if (store.recent.length >= RECENT_PLAY_LIMIT) break;
    }
  }
  playStore = store;
  for (const track of db.tracks) {
    const stats = store.counts[track.id];
    if (!stats) continue;
    track.playCount = stats.count;
    track.lastPlayedAt = stats.lastPlayedAt;
  }
  db.recentPlays = playStore.recent;
  if (changed) await flushPlayStore(true);
}

function getPlayStore() {
  return playStore;
}

function getRecentPlays() {
  return playStore?.recent || [];
}

// 同一首歌 10 秒内的重复上报只计一次，避免快速刷新放大播放次数。
function recordPlay(trackId) {
  const db = getDb();
  const track = db.tracks.find(item => item.id === trackId);
  if (!track) return { found: false };
  const now = Date.now();
  const last = playStore.recent[0];
  const lastAt = last ? new Date(last.playedAt).getTime() : 0;
  if (last && last.trackId === trackId && now - lastAt < 10000) {
    return {
      found: true,
      counted: false,
      trackId,
      playCount: Number(track.playCount) || 0,
      lastPlayedAt: track.lastPlayedAt || ''
    };
  }
  track.playCount = (Number(track.playCount) || 0) + 1;
  track.lastPlayedAt = new Date(now).toISOString();
  playStore.counts[trackId] = { count: track.playCount, lastPlayedAt: track.lastPlayedAt };
  playStore.recent.unshift({ trackId, playedAt: track.lastPlayedAt });
  if (playStore.recent.length > RECENT_PLAY_LIMIT) playStore.recent.length = RECENT_PLAY_LIMIT;
  db.recentPlays = playStore.recent;
  touchDb();
  schedulePlayStoreWrite();
  return { found: true, counted: true, trackId, playCount: track.playCount, lastPlayedAt: track.lastPlayedAt };
}

function removeTrackStats(trackId) {
  delete playStore.counts[trackId];
  playStore.recent = playStore.recent.filter(entry => entry.trackId !== trackId);
  getDb().recentPlays = playStore.recent;
}

async function clearPlayHistory() {
  const db = getDb();
  playStore.counts = {};
  playStore.recent = [];
  db.recentPlays = playStore.recent;
  for (const track of db.tracks) {
    track.playCount = 0;
    track.lastPlayedAt = '';
  }
  touchDb();
  await flushPlayStore(true);
}

module.exports = { initPlays, getPlayStore, getRecentPlays, recordPlay, removeTrackStats, clearPlayHistory, schedulePlayStoreWrite, flushPlayStore };
