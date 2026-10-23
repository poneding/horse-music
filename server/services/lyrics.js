const fsp = require('node:fs/promises');
const path = require('node:path');
const {
  MEDIA_DIR,
  MAX_LYRICS,
  LRCLIB_BASE,
  LYRICS_SEARCH_TIMEOUT,
  LYRICS_SEARCH_LIMIT,
  LYRICS_SEARCH_CACHE_TTL,
  LYRICS_CLIENT
} = require('../config');
const { safeMediaPath } = require('../lib/files');
const { cleanTag, normalizeKey, splitArtistText, uniqueArtistNames } = require('./catalog');

const lyricsSearchCache = new Map();

function lyricsKey(value) {
  return normalizeKey(value).replace(/[\s_,.:;!?'"“”‘’、，。！？;；/\\|()（）[\]【】·-]+/g, '');
}

function lyricsBaseTitle(value) {
  return String(value || '').replace(/[（([【][^)）\]】]*[)）\]】]/g, ' ').trim();
}

function lyricsSimilarity(left, right) {
  const a = lyricsKey(lyricsBaseTitle(left));
  const b = lyricsKey(lyricsBaseTitle(right));
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.85;
  if (a.length < 2 || b.length < 2) return 0;
  const grams = value => {
    const map = new Map();
    for (let i = 0; i < value.length - 1; i += 1) {
      const gram = value.slice(i, i + 2);
      map.set(gram, (map.get(gram) || 0) + 1);
    }
    return map;
  };
  const leftGrams = grams(a);
  const rightGrams = grams(b);
  let overlap = 0;
  for (const [gram, count] of leftGrams) overlap += Math.min(count, rightGrams.get(gram) || 0);
  const total = Math.max(0, a.length - 1) + Math.max(0, b.length - 1);
  return total ? (2 * overlap) / total : 0;
}

function lyricsDurationScore(trackDuration, candidateDuration) {
  if (!trackDuration || !candidateDuration) return null;
  const diff = Math.abs(trackDuration - candidateDuration);
  if (diff <= 2) return 1;
  if (diff <= 5) return 0.82;
  if (diff <= 10) return 0.55;
  if (diff <= 20) return 0.3;
  if (diff <= 40) return 0.1;
  return 0;
}

// 歌名权重最高，时长用于区分现场版/翻唱版，艺人用于消歧。
function scoreLyricsCandidate(query, candidate) {
  const titleScore = lyricsSimilarity(query.title, candidate.title);
  const queryArtists = uniqueArtistNames(splitArtistText(String(query.artist || '').replace(/[,，]/g, '、')));
  const candidateArtists = uniqueArtistNames(splitArtistText(candidate.artist));
  const artistScore = queryArtists.length && candidateArtists.length
    ? Math.max(...queryArtists.flatMap(left => candidateArtists.map(right => lyricsSimilarity(left, right))))
    : null;
  const durationComponent = lyricsDurationScore(query.duration, candidate.duration);
  let weighted = 0;
  let weight = 0;
  for (const [score, share] of [[titleScore, 0.45], [artistScore, 0.25], [durationComponent, 0.3]]) {
    if (score === null) continue;
    weighted += score * share;
    weight += share;
  }
  let score = weight ? weighted / weight : 0;
  if (durationComponent === 0) score = Math.min(score, 0.55);
  return Math.round(Math.max(0, Math.min(1, score)) * 100) / 100;
}

async function fetchLrclib(pathAndQuery) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LYRICS_SEARCH_TIMEOUT);
  try {
    const response = await fetch(`${LRCLIB_BASE}${pathAndQuery}`, {
      headers: { Accept: 'application/json', 'User-Agent': LYRICS_CLIENT, 'Lrclib-Client': LYRICS_CLIENT },
      signal: controller.signal
    });
    if (!response.ok) throw Object.assign(new Error(`歌词服务返回 ${response.status}`), { status: 502 });
    return await response.json();
  } catch (error) {
    if (error.name === 'AbortError') throw Object.assign(new Error('歌词服务响应超时，请稍后重试'), { status: 504 });
    if (error.status) throw error;
    throw Object.assign(new Error(`无法连接歌词服务：${error.message}`), { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}

async function searchLyricsOnline(query) {
  const cacheKey = [lyricsKey(query.title), lyricsKey(query.artist), query.duration].join('|');
  const cached = lyricsSearchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return { ...cached.payload, cached: true };

  // 查询时只用主艺人，避免「A, B」这种多艺人写法降低命中率。
  const primaryArtist = cleanTag(String(query.artist || '').split(/\s*[,，、;；]\s*|\s+\/\s+/)[0]) || cleanTag(query.artist);
  const requests = [`/api/search?${new URLSearchParams({ track_name: query.title, ...(primaryArtist ? { artist_name: primaryArtist } : {}) })}`];
  if (primaryArtist) requests.push(`/api/search?${new URLSearchParams({ q: `${query.title} ${primaryArtist}` })}`);
  const settled = await Promise.allSettled(requests.map(item => fetchLrclib(item)));
  let raw = settled.flatMap(result => (result.status === 'fulfilled' && Array.isArray(result.value) ? result.value : []));
  // 艺人写错或曲库标注不一致时，退回只用歌名搜索。
  if (!raw.length && primaryArtist) {
    const fallback = await fetchLrclib(`/api/search?${new URLSearchParams({ track_name: query.title })}`).catch(() => []);
    if (Array.isArray(fallback)) raw = fallback;
  }
  if (!raw.length && settled.every(result => result.status === 'rejected')) {
    throw settled.find(result => result.status === 'rejected').reason;
  }

  const seen = new Set();
  const candidates = [];
  for (const item of raw) {
    if (!item || item.instrumental) continue;
    const synced = String(item.syncedLyrics || '').trim();
    const lyrics = synced || String(item.plainLyrics || '').trim();
    if (!lyrics) continue;
    const dedupeKey = String(item.id ?? `${normalizeKey(item.trackName)}|${normalizeKey(item.artistName)}`);
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    const candidate = {
      provider: 'lrclib',
      id: item.id ?? 0,
      title: cleanTag(item.trackName || item.name),
      artist: cleanTag(item.artistName),
      album: cleanTag(item.albumName),
      duration: Math.round(Number(item.duration) || 0),
      hasSynced: Boolean(synced),
      lyrics
    };
    candidate.score = scoreLyricsCandidate(query, candidate);
    candidate.durationDiff = query.duration && candidate.duration ? Math.abs(query.duration - candidate.duration) : null;
    candidates.push(candidate);
  }
  candidates.sort((left, right) => right.score - left.score || (left.durationDiff ?? 999) - (right.durationDiff ?? 999) || Number(right.hasSynced) - Number(left.hasSynced));
  const payload = { query, total: candidates.length, providers: ['lrclib'], results: candidates.slice(0, LYRICS_SEARCH_LIMIT) };

  const now = Date.now();
  for (const [key, entry] of lyricsSearchCache) if (entry.expiresAt <= now) lyricsSearchCache.delete(key);
  while (lyricsSearchCache.size >= 80) lyricsSearchCache.delete(lyricsSearchCache.keys().next().value);
  lyricsSearchCache.set(cacheKey, { expiresAt: now + LYRICS_SEARCH_CACHE_TTL, payload });
  return payload;
}

function normalizeLyricsText(value) {
  return String(value ?? '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
}

// 歌词同时写入媒体目录与曲库，保持与管理端上传的歌词一致。
async function saveTrackLyrics(track, text, source = null) {
  const lyrics = normalizeLyricsText(text);
  if (lyrics.length > MAX_LYRICS) throw Object.assign(new Error('歌词内容不能超过 500 KB'), { status: 413 });
  const previous = track.lyricsUrl;
  track.lyrics = lyrics;
  track.lyricsSource = lyrics ? source : null;
  if (!lyrics) {
    track.lyricsUrl = '';
    if (previous?.startsWith('/media/')) {
      const file = safeMediaPath(previous);
      if (file) await fsp.unlink(file).catch(() => {});
    }
    return;
  }
  const filename = `${track.id}.lrc`;
  await fsp.writeFile(path.join(MEDIA_DIR, filename), lyrics, { encoding: 'utf8', mode: 0o600 });
  track.lyricsUrl = `/media/${filename}`;
  if (previous?.startsWith('/media/')) {
    const previousFile = safeMediaPath(previous);
    if (previousFile && path.basename(previousFile) !== filename) await fsp.unlink(previousFile).catch(() => {});
  }
}

module.exports = { searchLyricsOnline, normalizeLyricsText, saveTrackLyrics };
