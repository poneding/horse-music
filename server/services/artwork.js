const fsp = require('node:fs/promises');
const path = require('node:path');
const { MEDIA_DIR } = require('../config');
const { imageExtension } = require('../lib/files');

function embeddedCover(tags) {
  const pictures = tags?.common?.picture || [];
  const ordered = [...pictures].sort((left, right) => Number(right.type === 'Cover (front)') - Number(left.type === 'Cover (front)'));
  for (const picture of ordered) {
    const data = Buffer.from(picture.data || []);
    if (!data.length || data.length > 8 * 1024 * 1024) continue;
    const ext = imageExtension(data);
    if (ext) return { data, ext };
  }
  return null;
}

async function removeTrackCover(track, coverUrl, db) {
  if (!coverUrl?.startsWith('/media/')) return;
  const name = path.basename(coverUrl);
  if (!name.startsWith(`${track.id}-cover`)) return;
  // 专辑或歌手档案可能仍在使用旧封面。
  const stillUsed = [...db.albums, ...db.artists, ...db.tracks].some(item => item !== track && item.coverUrl === coverUrl);
  if (stillUsed) return;
  await fsp.unlink(path.join(MEDIA_DIR, name)).catch(() => {});
}

module.exports = { embeddedCover, removeTrackCover };
