const fsp = require('node:fs/promises');
const path = require('node:path');
const { MEDIA_DIR } = require('../config');

let tempCounter = 0;

async function atomicWrite(file, data, mode) {
  const tempFile = `${file}.${process.pid}.${++tempCounter}.tmp`;
  try {
    await fsp.writeFile(tempFile, data, mode === undefined ? undefined : { mode });
    await fsp.rename(tempFile, file);
  } catch (error) {
    await fsp.unlink(tempFile).catch(() => {});
    throw error;
  }
}

function extension(filename, fallback) {
  const ext = path.extname(filename || '').toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : fallback;
}

function audioMimeType(ext) {
  return ({
    '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac',
    '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.flac': 'audio/flac',
    '.webm': 'audio/webm'
  })[ext] || 'application/octet-stream';
}

function mediaMimeType(ext) {
  return ({
    '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.wav': 'audio/wav',
    '.ogg': 'audio/ogg', '.flac': 'audio/flac', '.webm': 'audio/webm',
    '.lrc': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
    '.gif': 'image/gif', '.bmp': 'image/bmp'
  })[ext] || 'application/octet-stream';
}

function imageExtension(data) {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return '.jpg';
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return '.png';
  if (data.length >= 6 && ['GIF87a', 'GIF89a'].includes(data.toString('ascii', 0, 6))) return '.gif';
  if (data.length >= 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') return '.webp';
  if (data.length >= 2 && data[0] === 0x42 && data[1] === 0x4d) return '.bmp';
  return '';
}

function safeMediaPath(urlPath) {
  let raw;
  try { raw = decodeURIComponent(urlPath.slice('/media/'.length)); }
  catch { return null; }
  const name = path.basename(raw);
  if (!name || name !== raw) return null;
  return path.join(MEDIA_DIR, name);
}

module.exports = { atomicWrite, extension, audioMimeType, mediaMimeType, imageExtension, safeMediaPath };
