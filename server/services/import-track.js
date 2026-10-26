const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { parseFile } = require('music-metadata');
const {
  MEDIA_DIR,
  DEFAULT_TRACK_COVER,
  MAX_COVER,
  MAX_LYRICS,
  ALLOWED_AUDIO,
  AUDIO_FORMATS_HINT
} = require('../config');
const { moveFile, extension, audioMimeType } = require('../lib/files');
const { getDb, touchDb, writeDb } = require('../store/library');
const { cleanTag, normalizeKey, splitArtistText, uniqueArtistNames, namesFromTag, ensureArtist, findAlbum, nextAlbumOrder } = require('./catalog');
const { embeddedCover, removeTrackCover } = require('./artwork');
const {
  stagedUploads,
  MAX_STAGED_UPLOADS,
  STAGED_UPLOAD_TTL,
  getStagedUpload,
  discardStagedUpload,
  describeAudioTags,
  readUpload
} = require('./uploads');

function httpError(message, status) {
  return Object.assign(new Error(message), { status });
}

async function readTags(audio, ext) {
  try {
    return await parseFile(audio.path, { mimeType: audioMimeType(ext) });
  } catch (error) {
    console.warn(`Could not read audio tags from ${audio.filename}: ${error.message}`);
    return null;
  }
}

async function inspectUpload(req) {
  const { files, tempDir } = await readUpload(req);
  let staged = false;
  try {
    const audio = files.audio;
    if (!audio?.size) throw httpError('请选择音乐文件', 400);
    const audioExt = extension(audio.filename, '.mp3');
    if (!ALLOWED_AUDIO.has(audioExt)) throw httpError(AUDIO_FORMATS_HINT, 400);
    const tags = await readTags(audio, audioExt);
    let cover = '';
    const picture = embeddedCover(tags);
    if (picture) {
      cover = `cover${picture.ext}`;
      await fsp.writeFile(path.join(tempDir, cover), picture.data);
    }
    const token = crypto.randomUUID();
    // 超出上限时丢弃最早的暂存上传；提交时会回退为重新上传音频。
    while (stagedUploads.size >= MAX_STAGED_UPLOADS) {
      await discardStagedUpload(stagedUploads.keys().next().value);
    }
    stagedUploads.set(token, {
      dir: tempDir,
      audio: { filename: audio.filename, path: audio.path, size: audio.size },
      cover,
      expiresAt: Date.now() + STAGED_UPLOAD_TTL
    });
    staged = true;
    return {
      token,
      filename: audio.filename,
      fields: describeAudioTags(tags),
      coverUrl: cover ? `/api/admin/upload/preview/${token}` : ''
    };
  } finally {
    if (!staged) await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function commitUpload(req) {
  const { fields, files, tempDir } = await readUpload(req);
  const stagedToken = cleanTag(String(fields.token || ''));
  let staged = null;
  let committed = false;
  try {
    staged = stagedToken ? getStagedUpload(stagedToken) : null;
    if (stagedToken && !staged) throw httpError('文件已过期，请重新选择音乐文件', 410);
    const audio = staged ? staged.audio : files.audio;
    if (!audio?.size) throw httpError('请选择音乐文件', 400);
    const audioExt = extension(audio.filename, '.mp3');
    if (!ALLOWED_AUDIO.has(audioExt)) throw httpError(AUDIO_FORMATS_HINT, 400);
    if (files.cover && files.cover.size > MAX_COVER) throw httpError('封面图片不能超过 8 MB', 413);
    if (files.lyrics && files.lyrics.size > MAX_LYRICS) throw httpError('歌词文件不能超过 500 KB', 413);
    const tags = await readTags(audio, audioExt);

    const id = crypto.randomUUID();
    const audioName = `${id}${audioExt}`;
    try {
      await moveFile(audio.path, path.join(MEDIA_DIR, audioName));
    } catch (error) {
      // 暂存文件可能被其他批量预览挤掉或已过期，让客户端改走直接上传。
      if (staged && error.code === 'ENOENT') throw httpError('文件已过期，请重新上传', 410);
      throw error;
    }

    let lyrics = '';
    let lyricsUrl = '';
    if (files.lyrics?.size) {
      const lyricsName = `${id}${extension(files.lyrics.filename, '.lrc')}`;
      lyrics = await fsp.readFile(files.lyrics.path, 'utf8');
      await moveFile(files.lyrics.path, path.join(MEDIA_DIR, lyricsName));
      lyricsUrl = `/media/${lyricsName}`;
    }

    let coverUrl = String(fields.coverUrl || '').trim();
    const hasManualCover = Boolean(files.cover?.size);
    if (hasManualCover) {
      const coverName = `${id}${extension(files.cover.filename, '.jpg')}`;
      await moveFile(files.cover.path, path.join(MEDIA_DIR, coverName));
      coverUrl = `/media/${coverName}`;
    } else if (!coverUrl) {
      if (staged?.cover) {
        const coverName = `${id}-cover${path.extname(staged.cover)}`;
        await moveFile(path.join(staged.dir, staged.cover), path.join(MEDIA_DIR, coverName));
        coverUrl = `/media/${coverName}`;
      } else {
        const picture = embeddedCover(tags);
        if (picture) {
          const coverName = `${id}-cover${picture.ext}`;
          await fsp.writeFile(path.join(MEDIA_DIR, coverName), picture.data);
          coverUrl = `/media/${coverName}`;
        }
      }
    }

    const db = getDb();
    const taggedArtistNames = namesFromTag(tags?.common?.artists, tags?.common?.artist);
    const taggedAlbumArtistNames = namesFromTag(tags?.common?.albumartists, tags?.common?.albumartist);
    const manualArtist = cleanTag(fields.artist);
    const artistNames = uniqueArtistNames(manualArtist ? splitArtistText(manualArtist) : taggedArtistNames);
    if (!artistNames.length) artistNames.push('未知艺人');
    const artist = artistNames.join(', ');
    const title = cleanTag(fields.title) || cleanTag(tags?.common?.title) || path.basename(audio.filename, path.extname(audio.filename));
    const albumTitle = cleanTag(fields.album) || cleanTag(tags?.common?.album);
    const albumArtistNames = uniqueArtistNames(
      manualArtist ? artistNames : (taggedAlbumArtistNames.length ? taggedAlbumArtistNames : artistNames)
    );
    const albumArtist = albumArtistNames.join(' / ') || artist;
    const hasTaggedAlbumArtist = !manualArtist && taggedAlbumArtistNames.length > 0;
    const duration = Number.isFinite(tags?.format?.duration) ? Math.round(tags.format.duration) : 0;

    let album = null;
    let albumCreated = false;
    if (albumTitle) {
      album = findAlbum(db, albumTitle, albumArtist, hasTaggedAlbumArtist);
      if (!album) {
        album = {
          id: crypto.randomUUID(),
          title: albumTitle,
          artist: albumArtist,
          artistNames: albumArtistNames,
          description: '',
          coverUrl,
          createdAt: new Date().toISOString()
        };
        db.albums.unshift(album);
        albumCreated = true;
      } else {
        if (!album.artist) album.artist = albumArtist;
        if (!Array.isArray(album.artistNames) || !album.artistNames.length) album.artistNames = albumArtistNames;
        if (!album.coverUrl && coverUrl) album.coverUrl = coverUrl;
      }
    }

    const artistResults = [];
    const seenArtistKeys = new Set();
    for (const name of [...artistNames, ...albumArtistNames]) {
      const key = normalizeKey(name);
      if (!key || seenArtistKeys.has(key)) continue;
      seenArtistKeys.add(key);
      const result = ensureArtist(db, name, coverUrl);
      if (result.artist) artistResults.push(result);
    }

    const track = {
      id,
      title,
      artist,
      artistNames,
      album: albumTitle,
      albumId: album?.id || '',
      albumOrder: nextAlbumOrder(db, album?.id || ''),
      genre: String(fields.genre || '未分类'),
      duration,
      coverUrl: coverUrl || DEFAULT_TRACK_COVER,
      src: `/media/${audioName}`,
      lyrics,
      lyricsUrl,
      playCount: 0,
      lastPlayedAt: '',
      createdAt: new Date().toISOString()
    };
    db.tracks.unshift(track);
    touchDb();
    await writeDb();
    committed = true;
    return {
      status: 201,
      body: {
        track,
        metadata: {
          title: Boolean(cleanTag(tags?.common?.title)),
          artist: Boolean(taggedArtistNames.length),
          album: Boolean(cleanTag(tags?.common?.album)),
          albumArtist: Boolean(taggedAlbumArtistNames.length),
          cover: !hasManualCover && Boolean(coverUrl.startsWith('/media/'))
        },
        created: {
          album: albumCreated,
          artists: artistResults.filter(item => item.created).map(item => item.artist.name)
        },
        library: {
          album: album ? { id: album.id, title: album.title, artist: album.artist } : null,
          artists: artistResults.map(item => ({ id: item.artist.id, name: item.artist.name, created: item.created }))
        }
      }
    };
  } finally {
    if (committed && stagedToken) await discardStagedUpload(stagedToken);
    await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function editTrack(req, id) {
  const db = getDb();
  const track = db.tracks.find(item => item.id === id);
  if (!track) throw httpError('找不到这首歌', 404);
  const { fields, files, tempDir } = await readUpload(req);
  try {
    if (files.cover && files.cover.size > MAX_COVER) throw httpError('封面图片不能超过 8 MB', 413);
    const title = cleanTag(fields.title);
    if (!title) throw httpError('歌曲名不能为空', 400);
    if (title.length > 200) throw httpError('歌曲名不能超过 200 个字符', 400);
    const artistNames = uniqueArtistNames(splitArtistText(fields.artist));
    if (!artistNames.length) artistNames.push('未知艺人');
    const artist = artistNames.join(', ');
    const albumTitle = cleanTag(fields.album);

    let coverUrl = track.coverUrl;
    if (files.cover?.size) {
      const coverName = `${id}-cover${extension(files.cover.filename, '.jpg')}`;
      const nextCoverUrl = `/media/${coverName}`;
      await moveFile(files.cover.path, path.join(MEDIA_DIR, coverName));
      if (track.coverUrl !== nextCoverUrl) await removeTrackCover(track, track.coverUrl, db);
      coverUrl = nextCoverUrl;
    } else if (cleanTag(fields.coverUrl)) {
      const next = cleanTag(fields.coverUrl);
      if (next !== track.coverUrl) {
        await removeTrackCover(track, track.coverUrl, db);
        coverUrl = next;
      }
    } else if (String(fields.removeCover || '') === '1') {
      await removeTrackCover(track, track.coverUrl, db);
      coverUrl = DEFAULT_TRACK_COVER;
    }
    coverUrl = coverUrl || DEFAULT_TRACK_COVER;

    const albumArtist = artistNames.join(' / ');
    let album = null;
    if (albumTitle) {
      album = findAlbum(db, albumTitle, albumArtist);
      if (!album) {
        album = {
          id: crypto.randomUUID(),
          title: albumTitle,
          artist: albumArtist,
          artistNames,
          description: '',
          coverUrl,
          createdAt: new Date().toISOString()
        };
        db.albums.unshift(album);
      } else {
        if (!album.artist) album.artist = albumArtist;
        if (!Array.isArray(album.artistNames) || !album.artistNames.length) album.artistNames = artistNames;
        if (!album.coverUrl && coverUrl) album.coverUrl = coverUrl;
      }
    }
    for (const name of artistNames) ensureArtist(db, name, coverUrl);

    track.title = title;
    track.artist = artist;
    track.artistNames = artistNames;
    const previousAlbumId = track.albumId || '';
    const nextAlbumId = album?.id || '';
    track.album = albumTitle;
    track.albumId = nextAlbumId;
    if (nextAlbumId !== previousAlbumId) track.albumOrder = nextAlbumOrder(db, nextAlbumId);
    if (fields.genre !== undefined) track.genre = cleanTag(fields.genre) || '未分类';
    if (fields.duration !== undefined && String(fields.duration).trim() !== '') {
      const duration = Number(fields.duration);
      if (Number.isFinite(duration) && duration >= 0) track.duration = Math.round(duration);
    }
    track.coverUrl = coverUrl;
    touchDb();
    await writeDb();
    return {
      id: track.id,
      title: track.title,
      artist: track.artist,
      artistNames: track.artistNames,
      album: track.album,
      albumId: track.albumId,
      genre: track.genre,
      duration: track.duration,
      coverUrl: track.coverUrl,
      hasLyrics: Boolean(track.lyrics || track.lyricsUrl),
      lyricsSource: track.lyricsSource || null
    };
  } finally {
    await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = { inspectUpload, commitUpload, editTrack };
