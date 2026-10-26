const fsp = require('node:fs/promises');
const { FAVORITES_FILE, MAX_FAVORITES } = require('../config');
const { atomicWrite } = require('../lib/files');
const { getDb, touchDb } = require('./library');

let favoriteIds = new Set();
let dirty = false;
let writePromise = Promise.resolve();

function validTrackIds() {
  return new Set(getDb().tracks.map(track => track.id));
}

function persist() {
  dirty = true;
  writePromise = writePromise.catch(() => {}).then(async () => {
    if (!dirty) return;
    dirty = false;
    try {
      await atomicWrite(FAVORITES_FILE, JSON.stringify({ version: 1, favorites: [...favoriteIds] }));
    } catch (error) {
      dirty = true;
      console.error(`Could not write favorites store: ${error.message}`);
    }
  });
  return writePromise;
}

async function initFavorites() {
  let raw = null;
  let changed = false;
  try {
    raw = JSON.parse(await fsp.readFile(FAVORITES_FILE, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      const backup = `${FAVORITES_FILE}.corrupt-${Date.now()}`;
      await fsp.rename(FAVORITES_FILE, backup).catch(() => {});
      console.warn(`Could not read favorites store, backed up to ${backup} and rebuilding: ${error.message}`);
    }
    changed = true;
  }
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.favorites) ? raw.favorites : [];
  const valid = validTrackIds();
  const next = new Set();
  for (const value of list) {
    if (typeof value !== 'string' || !valid.has(value) || next.has(value)) continue;
    next.add(value);
    if (next.size >= MAX_FAVORITES) break;
  }
  if (!raw || list.length !== next.size) changed = true;
  favoriteIds = next;
  if (changed) await persist();
}

function getFavoriteIds() {
  const valid = validTrackIds();
  return [...favoriteIds].filter(id => valid.has(id));
}

function favoritePayload() {
  return { favorites: getFavoriteIds() };
}

async function setFavorite(trackId, favorite) {
  const id = String(trackId || '');
  if (!validTrackIds().has(id)) return { found: false, favorites: getFavoriteIds() };
  const changed = favoriteIds.has(id) !== favorite;
  if (!changed) return { found: true, favorite, favorites: getFavoriteIds() };
  if (favorite && favoriteIds.size >= MAX_FAVORITES) {
    const error = new Error(`收藏数量不能超过 ${MAX_FAVORITES} 首`);
    error.status = 413;
    throw error;
  }
  if (favorite) favoriteIds.add(id);
  else favoriteIds.delete(id);
  touchDb();
  await persist();
  return { found: true, favorite, favorites: getFavoriteIds() };
}

async function mergeFavorites(values) {
  const valid = validTrackIds();
  let added = 0;
  for (const value of Array.isArray(values) ? values : []) {
    const id = String(value || '');
    if (!id || !valid.has(id) || favoriteIds.has(id)) continue;
    favoriteIds.add(id);
    added += 1;
    if (favoriteIds.size >= MAX_FAVORITES) break;
  }
  if (added) {
    touchDb();
    await persist();
  }
  return { added, favorites: getFavoriteIds() };
}

function removeTrackFavorite(trackId) {
  if (!favoriteIds.delete(String(trackId || ''))) return false;
  touchDb();
  persist().catch(() => {});
  return true;
}

function flushFavorites() {
  if (!dirty) return writePromise;
  return persist();
}

module.exports = {
  initFavorites,
  getFavoriteIds,
  favoritePayload,
  setFavorite,
  mergeFavorites,
  removeTrackFavorite,
  flushFavorites
};
