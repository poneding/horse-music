const fsp = require('node:fs/promises');
const path = require('node:path');
const { DATA_DIR, DB_FILE, MEDIA_DIR } = require('../config');
const { atomicWrite } = require('../lib/files');
const { migrateDb } = require('./migrations');
const seed = require('./seed');

let db;
let dbVersion = 1;
let dbDirty = false;
let dbWritePromise = null;

async function loadLibrary() {
  try {
    return { db: JSON.parse(await fsp.readFile(DB_FILE, 'utf8')), created: false };
  } catch (error) {
    if (error.code === 'ENOENT') return { db: structuredClone(seed), created: true };
    const backup = `${DB_FILE}.corrupt-${Date.now()}`;
    await fsp.rename(DB_FILE, backup).catch(() => {});
    throw new Error(`library.json 无法解析，已备份到 ${backup}。请恢复备份后重启。原始错误：${error.message}`);
  }
}

async function initLibrary() {
  await fsp.mkdir(MEDIA_DIR, { recursive: true });
  for (const name of await fsp.readdir(DATA_DIR)) {
    if (name.startsWith('.upload-')) await fsp.rm(path.join(DATA_DIR, name), { recursive: true, force: true }).catch(() => {});
    // 进程异常退出可能留下 atomicWrite 的临时文件，启动时清理。
    else if (name.endsWith('.tmp')) await fsp.unlink(path.join(DATA_DIR, name)).catch(() => {});
  }
  const loaded = await loadLibrary();
  db = loaded.db;
  let shouldWrite = loaded.created;
  if (migrateDb(db)) shouldWrite = true;
  if (shouldWrite) await writeDb();
}

function getDb() {
  return db;
}

function getDbVersion() {
  return dbVersion;
}

function touchDb() {
  dbVersion += 1;
}

function writeDb() {
  dbDirty = true;
  if (!dbWritePromise) {
    dbWritePromise = (async () => {
      do {
        dbDirty = false;
        await atomicWrite(DB_FILE, JSON.stringify(db, null, 2));
      } while (dbDirty);
    })().finally(() => {
      dbWritePromise = null;
      if (dbDirty) writeDb().catch(error => console.error(`Could not write library store: ${error.message}`));
    });
  }
  return dbWritePromise;
}

function flushDb() {
  return dbDirty && !dbWritePromise ? writeDb() : (dbWritePromise || Promise.resolve());
}

function buildStatePayload(recentPlays) {
  return {
    ...db,
    // 客户端用它判断其他标签页/设备的改动是否需要重新拉取曲库。
    version: dbVersion,
    tracks: db.tracks.map(track => {
      const { lyrics, ...rest } = track;
      return { ...rest, hasLyrics: Boolean(lyrics || track.lyricsUrl) };
    }),
    recentPlays: recentPlays || []
  };
}

module.exports = { initLibrary, getDb, getDbVersion, touchDb, writeDb, flushDb, buildStatePayload };
