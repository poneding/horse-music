const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const MEDIA_DIR = path.join(DATA_DIR, 'media');
const DB_FILE = path.join(DATA_DIR, 'library.json');
const PLAYS_FILE = path.join(DATA_DIR, 'plays.json');
const AUTH_FILE = path.join(DATA_DIR, 'auth.json');
const SRC_DIR = path.join(ROOT, 'src');
const PORT = Number(process.env.PORT || 4173);

const MAX_UPLOAD = 60 * 1024 * 1024;
const STAGED_UPLOAD_TTL = 30 * 60 * 1000;
// 批量上传最多 20 首，预留少量余量给其他管理端标签预览。
const MAX_STAGED_UPLOADS = 24;
const MAX_COVER = 8 * 1024 * 1024;
const MAX_LYRICS = 500 * 1024;
const MAX_JSON = 1024 * 1024;
const RECENT_PLAY_LIMIT = 200;
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

const ALLOWED_AUDIO = new Set(['.mp3', '.m4a', '.aac', '.wav', '.ogg', '.flac', '.webm']);
const AUDIO_FORMATS_HINT = '音乐格式支持 MP3、M4A、AAC、WAV、OGG、FLAC、WebM';

const DEFAULT_TRACK_COVER = 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=720&q=85';
const PUBLIC_CACHE = 'public, max-age=31536000, immutable';
const INSTANCE_ID = crypto.randomBytes(6).toString('hex');

const LRCLIB_BASE = (process.env.LRCLIB_BASE_URL || 'https://lrclib.net').replace(/\/+$/, '');
const LYRICS_SEARCH_TIMEOUT = 9000;
const LYRICS_SEARCH_LIMIT = 20;
const LYRICS_SEARCH_CACHE_TTL = 5 * 60 * 1000;
const LYRICS_CLIENT = 'HorseMusic/1.0 (self-hosted music library)';

module.exports = {
  ROOT,
  DATA_DIR,
  MEDIA_DIR,
  DB_FILE,
  PLAYS_FILE,
  AUTH_FILE,
  SRC_DIR,
  PORT,
  MAX_UPLOAD,
  STAGED_UPLOAD_TTL,
  MAX_STAGED_UPLOADS,
  MAX_COVER,
  MAX_LYRICS,
  MAX_JSON,
  RECENT_PLAY_LIMIT,
  SESSION_TTL_SECONDS,
  ALLOWED_AUDIO,
  AUDIO_FORMATS_HINT,
  DEFAULT_TRACK_COVER,
  PUBLIC_CACHE,
  INSTANCE_ID,
  LRCLIB_BASE,
  LYRICS_SEARCH_TIMEOUT,
  LYRICS_SEARCH_LIMIT,
  LYRICS_SEARCH_CACHE_TTL,
  LYRICS_CLIENT
};
