const fsp = require('node:fs/promises');
const path = require('node:path');
const { DATA_DIR, MEDIA_DIR } = require('../../config');
const { respond } = require('../../lib/http');
const { getDb } = require('../../store/library');

const MAX_DEPTH = 8;
const MAX_ENTRIES = 100000;

async function walk(root, onFile, { skipDirs = [] } = {}) {
  let seen = 0;
  const skipped = new Set(skipDirs.map(dir => path.resolve(dir)));
  async function visit(dir, depth) {
    if (depth > MAX_DEPTH) return;
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch (error) {
      if (['ENOENT', 'ENOTDIR', 'EACCES'].includes(error.code)) return;
      throw error;
    }
    for (const entry of entries) {
      if (seen >= MAX_ENTRIES) return;
      seen += 1;
      if (entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!skipped.has(path.resolve(full))) await visit(full, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      try {
        const stat = await fsp.lstat(full);
        if (stat.isFile()) onFile(full, stat.size);
      } catch { /* A file can disappear while the scan is running. */ }
    }
  }
  await visit(root, 0);
}

async function handle(req, res, url) {
  if (req.method !== 'GET' || url.pathname !== '/api/admin/storage') return false;

  let mediaBytes = 0;
  let mediaFiles = 0;
  await walk(MEDIA_DIR, (file, size) => {
    mediaBytes += size;
    mediaFiles += 1;
  });

  let dataBytes = 0;
  await walk(DATA_DIR, (file, size) => {
    if (file.endsWith('.json')) dataBytes += size;
  }, { skipDirs: [MEDIA_DIR] });

  const db = getDb();
  return respond(res, 200, {
    totalBytes: mediaBytes + dataBytes,
    mediaBytes,
    dataBytes,
    mediaFiles,
    tracks: db.tracks.length,
    albums: db.albums.length,
    artists: db.artists.length,
    playlists: db.playlists.length,
    generatedAt: new Date().toISOString()
  });
}

module.exports = { handle };
