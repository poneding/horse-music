const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { pipeline } = require('node:stream/promises');
const Busboy = require('busboy');
const {
  UPLOAD_TMP_DIR,
  MAX_UPLOAD,
  MAX_COVER,
  MAX_LYRICS,
  STAGED_UPLOAD_TTL,
  MAX_STAGED_UPLOADS
} = require('../config');
const { cleanTag, namesFromTag } = require('./catalog');

const stagedUploads = new Map();

function getStagedUpload(token) {
  const entry = stagedUploads.get(token);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    void discardStagedUpload(token);
    return null;
  }
  return entry;
}

async function discardStagedUpload(token) {
  const entry = stagedUploads.get(token);
  if (!entry) return;
  stagedUploads.delete(token);
  await fsp.rm(entry.dir, { recursive: true, force: true }).catch(() => {});
}

setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of stagedUploads) {
    if (entry.expiresAt <= now) void discardStagedUpload(token);
  }
}, 60_000).unref();

function describeAudioTags(tags) {
  const artistNames = namesFromTag(tags?.common?.artists, tags?.common?.artist);
  const albumArtistNames = namesFromTag(tags?.common?.albumartists, tags?.common?.albumartist);
  const rawGenre = tags?.common?.genre;
  return {
    title: cleanTag(tags?.common?.title),
    artist: artistNames.join(' / '),
    album: cleanTag(tags?.common?.album),
    albumArtist: albumArtistNames.join(' / '),
    genre: cleanTag(Array.isArray(rawGenre) ? rawGenre[0] : rawGenre),
    duration: Number.isFinite(tags?.format?.duration) ? Math.round(tags.format.duration) : 0
  };
}

async function readUpload(req) {
  // 上传先落在本地临时盘，数据盘只承担最终入库的文件。
  await fsp.mkdir(UPLOAD_TMP_DIR, { recursive: true }).catch(() => {});
  const tempDir = await fsp.mkdtemp(path.join(UPLOAD_TMP_DIR, 'horse-upload-'));
  const fields = {};
  const files = {};
  const writes = [];
  let totalBytes = 0;
  const cleanup = () => fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  try {
    await new Promise((resolve, reject) => {
      let busboy;
      let settled = false;
      const fail = error => {
        if (settled) return;
        settled = true;
        try { req.unpipe(busboy); } catch {}
        req.resume();
        reject(error);
      };
      try {
        busboy = Busboy({ headers: req.headers, limits: { fileSize: MAX_UPLOAD, files: 3, fields: 24, fieldSize: 128 * 1024 } });
      } catch {
        fail(Object.assign(new Error('无效的上传请求'), { status: 400 }));
        return;
      }
      busboy.on('file', (name, stream, info) => {
        if (!['audio', 'cover', 'lyrics'].includes(name)) { stream.resume(); return; }
        const original = path.basename(info.filename || '');
        const target = path.join(tempDir, `${name}-${crypto.randomUUID()}`);
        stream.on('data', chunk => {
          totalBytes += chunk.length;
          if (totalBytes > MAX_UPLOAD + MAX_COVER + MAX_LYRICS) fail(Object.assign(new Error('上传内容过大'), { status: 413 }));
        });
        stream.on('limit', () => fail(Object.assign(new Error('单次上传上限为 60 MB'), { status: 413 })));
        const write = pipeline(stream, fs.createWriteStream(target, { mode: 0o600 }))
          .then(() => fsp.stat(target))
          .then(stat => { files[name] = { filename: original, path: target, size: stat.size }; })
          .catch(fail);
        writes.push(write);
      });
      busboy.on('field', (name, value) => { fields[name] = value; });
      busboy.on('filesLimit', () => fail(Object.assign(new Error('上传文件过多'), { status: 400 })));
      busboy.on('fieldsLimit', () => fail(Object.assign(new Error('上传字段过多'), { status: 400 })));
      busboy.on('partsLimit', () => fail(Object.assign(new Error('上传内容过多'), { status: 400 })));
      busboy.on('error', error => fail(Object.assign(new Error(`上传解析失败：${error.message}`), { status: 400 })));
      busboy.on('close', async () => {
        try {
          await Promise.all(writes);
          if (!settled) { settled = true; resolve(); }
        } catch (error) { fail(error); }
      });
      req.on('aborted', () => fail(Object.assign(new Error('上传已中断'), { status: 400 })));
      req.pipe(busboy);
    });
    if (files.cover && files.cover.size > MAX_COVER) throw Object.assign(new Error('封面图片不能超过 8 MB'), { status: 413 });
    if (files.lyrics && files.lyrics.size > MAX_LYRICS) throw Object.assign(new Error('歌词文件不能超过 500 KB'), { status: 413 });
    return { fields, files, tempDir };
  } catch (error) {
    await Promise.allSettled(writes);
    await cleanup();
    throw error;
  }
}

module.exports = {
  stagedUploads,
  MAX_STAGED_UPLOADS,
  STAGED_UPLOAD_TTL,
  getStagedUpload,
  discardStagedUpload,
  describeAudioTags,
  readUpload
};
