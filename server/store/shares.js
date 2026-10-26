const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { MAX_SHARES, MAX_SHARE_IDS, MAX_SHARE_TRACKS, SHARES_FILE } = require('../config');
const { atomicWrite } = require('../lib/files');

const SHARE_KINDS = new Set(['track', 'album', 'playlist']);
const CODE_RE = /^[A-Za-z0-9_-]{6,16}$/;

let shares = new Map();
let dirty = false;
let writeChain = Promise.resolve();

function cleanText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function sanitizeRecord(value) {
  if (!value || typeof value !== 'object') return null;
  const code = cleanText(value.code, 16);
  const kind = cleanText(value.kind, 16);
  if (!CODE_RE.test(code) || !SHARE_KINDS.has(kind)) return null;
  const skipped = new Set();
  const trackIds = [];
  if (Array.isArray(value.trackIds)) {
    for (const item of value.trackIds) {
      const id = cleanText(item, 200);
      if (!id || skipped.has(id)) continue;
      skipped.add(id);
      trackIds.push(id);
      if (trackIds.length >= MAX_SHARE_TRACKS) break;
    }
  }
  if (!trackIds.length) return null;
  const createdAt = typeof value.createdAt === 'string' && !Number.isNaN(Date.parse(value.createdAt))
    ? new Date(value.createdAt).toISOString()
    : new Date().toISOString();
  return {
    code,
    kind,
    title: cleanText(value.title, 200) || '分享的播放列表',
    description: cleanText(value.description, 300),
    coverUrl: cleanText(value.coverUrl, 2000),
    trackIds,
    createdAt
  };
}

function sortByCreatedAt(records) {
  return records.sort((left, right) => (Date.parse(left.createdAt) || 0) - (Date.parse(right.createdAt) || 0));
}

function totalTrackRefs() {
  let total = 0;
  for (const record of shares.values()) total += record.trackIds.length;
  return total;
}

function pruneShares() {
  const allowed = Math.max(1, MAX_SHARES);
  while (shares.size > allowed) {
    const oldest = shares.keys().next().value;
    if (!oldest) break;
    shares.delete(oldest);
  }
  // 曲目引用总量同样受限，避免少量超长分享把文件撑大。
  let refs = totalTrackRefs();
  while (refs > MAX_SHARE_IDS && shares.size > 1) {
    const oldest = shares.keys().next().value;
    if (!oldest) break;
    refs -= shares.get(oldest).trackIds.length;
    shares.delete(oldest);
  }
}

function persist() {
  dirty = true;
  const run = writeChain.catch(() => {}).then(async () => {
    if (!dirty) return;
    dirty = false;
    const snapshot = JSON.stringify([...shares.values()]);
    try {
      await atomicWrite(SHARES_FILE, snapshot);
    } catch (error) {
      dirty = true;
      throw error;
    }
  });
  writeChain = run;
  return run;
}

function flushShares() {
  if (!dirty) return writeChain;
  return persist();
}

async function initShares() {
  shares = new Map();
  await fsp.mkdir(path.dirname(SHARES_FILE), { recursive: true });
  let raw;
  try {
    raw = JSON.parse(await fsp.readFile(SHARES_FILE, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      const backup = `${SHARES_FILE}.corrupt-${Date.now()}`;
      await fsp.rename(SHARES_FILE, backup).catch(() => {});
      console.warn(`shares.json 无法解析，已备份到 ${backup}，将重新建立分享记录。原始错误：${error.message}`);
    }
    return;
  }
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.shares) ? raw.shares : [];
  const records = list.map(sanitizeRecord).filter(Boolean);
  sortByCreatedAt(records);
  for (const record of records) shares.set(record.code, record);
  const beforeCount = shares.size;
  const beforeRefs = totalTrackRefs();
  pruneShares();
  if (shares.size !== beforeCount || totalTrackRefs() !== beforeRefs) {
    try { await persist(); }
    catch (error) { console.error(`Could not write share store: ${error.message}`); }
  }
}

function getShare(code) {
  return shares.get(String(code || '')) || null;
}

function findShare(kind, ids) {
  for (const record of shares.values()) {
    if (record.kind !== kind || record.trackIds.length !== ids.length) continue;
    let same = true;
    for (let index = 0; index < ids.length; index += 1) {
      if (record.trackIds[index] !== ids[index]) { same = false; break; }
    }
    if (same) return record;
  }
  return null;
}

async function createShare({ kind, title, description, coverUrl, trackIds }) {
  if (!SHARE_KINDS.has(kind)) throw Object.assign(new Error('不支持的分享类型'), { status: 400 });
  const ids = [...new Set((Array.isArray(trackIds) ? trackIds : []).map(id => String(id)).filter(Boolean))].slice(0, MAX_SHARE_TRACKS);
  if (!ids.length) throw Object.assign(new Error('没有可以分享的歌曲'), { status: 400 });
  // 同一份内容重复分享时复用已有链接，避免弹窗每次打开都新增记录。
  const existing = findShare(kind, ids);
  if (existing) return existing;
  let code;
  do { code = crypto.randomBytes(6).toString('base64url'); } while (shares.has(code));
  const record = {
    code,
    kind,
    title: cleanText(title, 200) || '分享的播放列表',
    description: cleanText(description, 300),
    coverUrl: cleanText(coverUrl, 2000),
    trackIds: ids,
    createdAt: new Date().toISOString()
  };
  shares.set(code, record);
  pruneShares();
  await persist();
  return record;
}

module.exports = { initShares, getShare, createShare, flushShares, SHARE_KINDS };
