/**
 * 在浏览器里直接读取音频内嵌标签与封面，避免为了看一眼标签就把整首歌上传到服务器。
 *
 * 这里只负责「预填」：真正入库时服务端仍会用 music-metadata 重新解析一遍，
 * 所以本模块解析不到的字段不会丢失，只会在表单里留空。
 * 遇到不认识的容器时抛出错误，由调用方决定是否回退到服务端解析。
 */

const MAX_TAG_BYTES = 24 * 1024 * 1024;
const MAX_COVER_BYTES = 8 * 1024 * 1024;

const IMAGE_SIGNATURES = [
  { mime: 'image/jpeg', test: bytes => bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff },
  { mime: 'image/png', test: bytes => bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 },
  { mime: 'image/gif', test: bytes => bytes.length >= 6 && ascii(bytes, 0, 3) === 'GIF' },
  { mime: 'image/webp', test: bytes => bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP' },
  { mime: 'image/bmp', test: bytes => bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d }
];

function ascii(bytes, offset, length) {
  let text = '';
  for (let index = 0; index < length && offset + index < bytes.length; index += 1) text += String.fromCharCode(bytes[offset + index]);
  return text;
}

function u16be(bytes, offset) {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function u32be(bytes, offset) {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function u24be(bytes, offset) {
  return (bytes[offset] << 16) | (bytes[offset + 1] << 8) | bytes[offset + 2];
}

function u32le(bytes, offset) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function u64be(bytes, offset) {
  return u32be(bytes, offset) * 0x100000000 + u32be(bytes, offset + 4);
}

/** ID3v2 的尺寸字段每个字节只用低 7 位，高位用于兼容同步。 */
function syncSafe(bytes, offset) {
  return ((bytes[offset] & 0x7f) << 21) | ((bytes[offset + 1] & 0x7f) << 14) | ((bytes[offset + 2] & 0x7f) << 7) | (bytes[offset + 3] & 0x7f);
}

const decoders = new Map();

function decoderFor(label) {
  if (!decoders.has(label)) {
    try { decoders.set(label, new TextDecoder(label)); }
    catch { decoders.set(label, new TextDecoder('utf-8')); }
  }
  return decoders.get(label);
}

function decode(bytes, label = 'utf-8') {
  return decoderFor(label).decode(bytes);
}

/** ID3 文本帧的编码字节：0=ISO-8859-1，1=UTF-16(BOM)，2=UTF-16BE，3=UTF-8。 */
function decodeId3Text(bytes, encoding) {
  const label = encoding === 0 ? 'iso-8859-1' : encoding === 1 ? 'utf-16' : encoding === 2 ? 'utf-16be' : 'utf-8';
  return cleanText(decode(bytes, label));
}

function cleanText(value) {
  return String(value || '')
    .replace(/\u0000+$/g, '')
    .replace(/^\uFEFF/, '')
    .replace(/\u0000/g, '')
    .trim();
}

/**
 * WAV 的 INFO 块和 ID3v1 都标称使用 ISO-8859-1，但很多工具（含 ffmpeg）会直接写 UTF-8。
 * 先尝试严格的 UTF-8 解码，失败再回退到 Latin-1：纯 ASCII 两种结果一致，不会误判。
 */
function decodeLoose(bytes) {
  try { return cleanText(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { return cleanText(decode(bytes, 'iso-8859-1')); }
}

function imageFrom(bytes) {
  if (!bytes?.length || bytes.length > MAX_COVER_BYTES) return null;
  const match = IMAGE_SIGNATURES.find(signature => signature.test(bytes));
  if (!match) return null;
  return { data: bytes, mime: match.mime };
}

function emptyTags() {
  return { title: '', artist: '', album: '', genre: '', cover: null };
}

function hasAnyValue(tags) {
  return Boolean(tags.title || tags.artist || tags.album || tags.genre || tags.cover);
}

function findBytes(haystack, needle, from = 0) {
  outer: for (let index = from; index <= haystack.length - needle.length; index += 1) {
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (haystack[index + offset] !== needle[offset]) continue outer;
    }
    return index;
  }
  return -1;
}

/** 按需切片读取文件，避免把 60 MB 的音频整个读进内存。 */
class Slicer {
  constructor(file) {
    this.file = file;
    this.size = file.size;
  }

  async bytes(start, length) {
    const from = Math.max(0, Math.min(this.size, start));
    const to = Math.max(from, Math.min(this.size, from + length));
    if (to <= from) return new Uint8Array(0);
    return new Uint8Array(await this.file.slice(from, to).arrayBuffer());
  }
}

/* ---------------------------------- ID3 ---------------------------------- */

const ID3_TEXT_FRAMES = {
  2: { title: 'TT2', artist: 'TP1', album: 'TAL', genre: 'TCO' },
  3: { title: 'TIT2', artist: 'TPE1', album: 'TALB', genre: 'TCON' },
  4: { title: 'TIT2', artist: 'TPE1', album: 'TALB', genre: 'TCON' }
};

/** 反向还原 ID3v2.3 的整体去同步：把 0xFF 0x00 变回 0xFF。 */
function resynchronise(bytes) {
  const out = new Uint8Array(bytes.length);
  let write = 0;
  for (let read = 0; read < bytes.length; read += 1) {
    out[write++] = bytes[read];
    if (bytes[read] === 0xff && bytes[read + 1] === 0x00) read += 1;
  }
  return out.subarray(0, write);
}

function skipTerminated(bytes, offset, wide) {
  if (wide) {
    while (offset + 1 < bytes.length && !(bytes[offset] === 0 && bytes[offset + 1] === 0)) offset += 2;
    return Math.min(offset + 2, bytes.length);
  }
  while (offset < bytes.length && bytes[offset] !== 0) offset += 1;
  return Math.min(offset + 1, bytes.length);
}

function parseAttachedPicture(frame, version) {
  const encoding = frame[0];
  const wide = encoding === 1 || encoding === 2;
  let offset = 1;
  // v2.2 的 PIC 帧用 3 字节图片格式代替 MIME；两种写法都不采信声明值，统一按文件签名识别。
  offset = version === 2 ? 4 : skipTerminated(frame, offset, false);
  offset += 1; // 图片类型（正片/背面等，这里不区分）
  offset = skipTerminated(frame, offset, wide);
  return imageFrom(frame.subarray(offset));
}

function readId3Frames(body, version) {
  const tags = emptyTags();
  const ids = ID3_TEXT_FRAMES[version];
  const idLength = version === 2 ? 3 : 4;
  const headerLength = version === 2 ? 6 : 10;
  let offset = 0;
  while (offset + headerLength <= body.length) {
    if (body[offset] === 0) break; // 填充区
    const id = ascii(body, offset, idLength);
    if (!/^[A-Z0-9]+$/.test(id)) break;
    const size = version === 2
      ? u24be(body, offset + 3)
      : version === 4 ? syncSafe(body, offset + 4) : u32be(body, offset + 4);
    const flags = version === 2 ? 0 : u16be(body, offset + 8);
    if (size <= 0 || offset + headerLength + size > body.length) break;
    let frame = body.subarray(offset + headerLength, offset + headerLength + size);
    offset += headerLength + size;
    if (version === 4) {
      if (flags & 0x000c) continue; // 压缩/加密帧不处理
      if (flags & 0x0002) frame = resynchronise(frame);
      if (flags & 0x0001) frame = frame.subarray(4); // 数据长度指示器
    }
    if (id === ids.title) tags.title ||= decodeId3Text(frame.subarray(1), frame[0]);
    else if (id === ids.artist) tags.artist ||= decodeId3Text(frame.subarray(1), frame[0]);
    else if (id === ids.album) tags.album ||= decodeId3Text(frame.subarray(1), frame[0]);
    else if (id === ids.genre) tags.genre ||= cleanText(stripGenreReference(decodeId3Text(frame.subarray(1), frame[0])));
    else if (!tags.cover && id === (version === 2 ? 'PIC' : 'APIC')) tags.cover = parseAttachedPicture(frame, version);
  }
  return tags;
}

/** ID3v2.3 允许写成 "(17)Rock"，直接把数字引用剥掉，剩下的就是风格名。 */
function stripGenreReference(value) {
  return value.replace(/^\(\d+\)/, '').replace(/^(?:\d+)$/, '');
}

async function readId3v2(slicer) {
  const header = await slicer.bytes(0, 10);
  if (ascii(header, 0, 3) !== 'ID3') return null;
  const version = header[3];
  if (version < 2 || version > 4) return null;
  const flags = header[5];
  const declared = syncSafe(header, 6);
  const bodySize = Math.min(declared, Math.max(0, slicer.size - 10), MAX_TAG_BYTES);
  let body = await slicer.bytes(10, bodySize);
  if (!body.length) return emptyTags();
  if (flags & 0x80) body = resynchronise(body);
  let start = 0;
  if (flags & 0x40) {
    // 扩展头：v2.3 的尺寸不含自身 4 字节，v2.4 的含自身。
    if (version === 3) start = 4 + u32be(body, 0);
    else if (version === 4) start = syncSafe(body, 0);
    if (!(start > 0 && start < body.length)) start = 0;
  }
  return readId3Frames(body.subarray(start), version);
}

async function readId3v1(slicer) {
  if (slicer.size < 128) return null;
  const tail = await slicer.bytes(slicer.size - 128, 128);
  if (ascii(tail, 0, 3) !== 'TAG') return null;
  const field = (offset, length) => decodeLoose(tail.subarray(offset, offset + length));
  return { title: field(3, 30), artist: field(33, 30), album: field(63, 30), genre: '' };
}

/* ---------------------------------- FLAC --------------------------------- */

function parseVorbisComment(bytes, tags) {
  if (bytes.length < 8) return tags;
  const vendorLength = u32le(bytes, 0);
  let offset = 4 + vendorLength;
  if (offset + 4 > bytes.length) return tags;
  const count = u32le(bytes, offset);
  offset += 4;
  for (let index = 0; index < count && offset + 4 <= bytes.length; index += 1) {
    const length = u32le(bytes, offset);
    offset += 4;
    if (length <= 0 || offset + length > bytes.length) break;
    const entry = decode(bytes.subarray(offset, offset + length), 'utf-8');
    offset += length;
    const split = entry.indexOf('=');
    if (split <= 0) continue;
    const key = entry.slice(0, split).toUpperCase();
    const value = cleanText(entry.slice(split + 1));
    if (!value) continue;
    if (key === 'TITLE') tags.title ||= value;
    else if (key === 'ARTIST') tags.artist ||= value;
    else if (key === 'ALBUM') tags.album ||= value;
    else if (key === 'GENRE') tags.genre ||= value;
  }
  return tags;
}

function parseFlacPicture(bytes, tags) {
  if (bytes.length < 32) return;
  const type = u32be(bytes, 0);
  let offset = 4;
  const mimeLength = u32be(bytes, offset);
  offset += 4 + mimeLength;
  const descriptionLength = u32be(bytes, offset);
  offset += 4 + descriptionLength;
  offset += 16; // 宽、高、色深、颜色数
  if (offset + 4 > bytes.length) return;
  const dataLength = u32be(bytes, offset);
  offset += 4;
  if (offset + dataLength > bytes.length) return;
  const image = imageFrom(bytes.subarray(offset, offset + dataLength));
  if (!image) return;
  // 优先使用「封面（正片）」类型（type 3），否则保留先读到的图片。
  if (!tags.cover || type === 3) tags.cover = image;
}

async function readFlac(slicer) {
  const tags = emptyTags();
  let offset = 4;
  let guard = 0;
  while (offset + 4 <= slicer.size && guard < 128) {
    guard += 1;
    const header = await slicer.bytes(offset, 4);
    if (header.length < 4) break;
    const isLast = (header[0] & 0x80) !== 0;
    const type = header[0] & 0x7f;
    const length = u24be(header, 1);
    offset += 4;
    if (length < 0 || offset + length > slicer.size) break;
    if (type === 4 && length <= MAX_TAG_BYTES) parseVorbisComment(await slicer.bytes(offset, length), tags);
    else if (type === 6 && length <= MAX_COVER_BYTES + 4096) parseFlacPicture(await slicer.bytes(offset, length), tags);
    offset += length;
    if (isLast) break;
  }
  return tags;
}

/* ---------------------------------- Ogg ---------------------------------- */

async function readOgg(slicer) {
  const window = await slicer.bytes(0, Math.min(slicer.size, 256 * 1024));
  const tags = emptyTags();
  const vorbisMarker = findBytes(window, [0x03, ...'vorbis'].map(char => (typeof char === 'string' ? char.charCodeAt(0) : char)));
  const opusMarker = findBytes(window, [...'OpusTags'].map(char => char.charCodeAt(0)));
  if (vorbisMarker >= 0) parseVorbisComment(window.subarray(vorbisMarker + 7), tags);
  else if (opusMarker >= 0) parseVorbisComment(window.subarray(opusMarker + 8), tags);
  return hasAnyValue(tags) ? tags : null;
}

/* ---------------------------------- MP4 ---------------------------------- */

const MP4_CONTAINERS = new Set(['moov', 'udta', 'meta', 'ilst']);
const MP4_TAG_ATOMS = {
  '\u00a9nam': 'title',
  '\u00a9ART': 'artist',
  '\u00a9alb': 'album',
  '\u00a9gen': 'genre'
};

async function eachMp4Box(slicer, start, end, visit) {
  let offset = start;
  let guard = 0;
  while (offset + 8 <= end && guard < 4096) {
    guard += 1;
    const header = await slicer.bytes(offset, 16);
    if (header.length < 8) break;
    let size = u32be(header, 0);
    const type = ascii(header, 4, 4);
    let headerLength = 8;
    if (size === 1) {
      if (header.length < 16) break;
      size = u64be(header, 8);
      headerLength = 16;
    } else if (size === 0) {
      size = end - offset;
    }
    if (size < headerLength || offset + size > end) break;
    await visit(type, offset + headerLength, offset + size);
    offset += size;
  }
}

async function readMp4Item(slicer, start, end, field, tags) {
  await eachMp4Box(slicer, start, end, async (type, bodyStart, bodyEnd) => {
    if (type !== 'data') return;
    const header = await slicer.bytes(bodyStart, 8);
    if (header.length < 8) return;
    const kind = u32be(header, 0) & 0xffffff; // 1=UTF-8 文本，13=JPEG，14=PNG
    const payloadStart = bodyStart + 8;
    const length = Math.min(bodyEnd - payloadStart, field === 'cover' ? MAX_COVER_BYTES : 64 * 1024);
    if (length <= 0) return;
    const payload = await slicer.bytes(payloadStart, length);
    if (field === 'cover') {
      if (!tags.cover) tags.cover = imageFrom(payload);
      return;
    }
    const value = cleanText(decode(payload, kind === 2 ? 'utf-16be' : 'utf-8'));
    if (value) tags[field] ||= value;
  });
}

async function readMp4(slicer) {
  const tags = emptyTags();
  const scan = async (start, end, depth, parent) => {
    if (depth > 6) return;
    await eachMp4Box(slicer, start, end, async (type, bodyStart, bodyEnd) => {
      if (parent === 'ilst') {
        if (type === 'covr') await readMp4Item(slicer, bodyStart, bodyEnd, 'cover', tags);
        else if (MP4_TAG_ATOMS[type]) await readMp4Item(slicer, bodyStart, bodyEnd, MP4_TAG_ATOMS[type], tags);
        return;
      }
      if (!MP4_CONTAINERS.has(type)) return;
      // meta 是「全容器」box，子 box 前多 4 字节版本与标志位。
      await scan(bodyStart + (type === 'meta' ? 4 : 0), bodyEnd, depth + 1, type);
    });
  };
  await scan(0, slicer.size, 0, '');
  return tags;
}

/* ---------------------------------- WAV ---------------------------------- */

const WAV_INFO_FIELDS = { INAM: 'title', IART: 'artist', IPRD: 'album', IGNR: 'genre' };

async function readWav(slicer) {
  const tags = emptyTags();
  let offset = 12;
  let guard = 0;
  while (offset + 8 <= slicer.size && guard < 256) {
    guard += 1;
    const header = await slicer.bytes(offset, 8);
    if (header.length < 8) break;
    const id = ascii(header, 0, 4);
    const size = u32le(header, 4);
    const bodyStart = offset + 8;
    if (id === 'data') break;
    if (bodyStart + size > slicer.size) break;
    if (id === 'LIST' && size <= 1024 * 1024) {
      const list = await slicer.bytes(bodyStart, size);
      if (ascii(list, 0, 4) === 'INFO') {
        let cursor = 4;
        while (cursor + 8 <= list.length) {
          const field = WAV_INFO_FIELDS[ascii(list, cursor, 4)];
          const length = u32le(list, cursor + 4);
          const valueStart = cursor + 8;
          if (valueStart + length > list.length) break;
          if (field) tags[field] ||= decodeLoose(list.subarray(valueStart, valueStart + length));
          cursor = valueStart + length + (length & 1); // 子块按偶数字节对齐
        }
      }
      return tags;
    }
    offset = bodyStart + size + (size & 1);
  }
  return tags;
}

/* -------------------------------- 分发入口 -------------------------------- */

const MP4_FIRST_BOXES = new Set(['ftyp', 'moov', 'moof', 'free', 'skip', 'wide', 'mdat']);

/**
 * 读取音频标签。返回 { title, artist, album, genre, cover: { data, mime } | null }。
 * 无法识别的容器会抛错，调用方可以回退到服务端解析。
 */
export async function readAudioTags(file) {
  if (!file || !file.size) throw new Error('无法读取空文件');
  const slicer = new Slicer(file);
  const head = await slicer.bytes(0, 12);
  const magic = ascii(head, 0, 4);
  if (magic === 'fLaC') return readFlac(slicer);
  if (magic === 'OggS') {
    const tags = await readOgg(slicer);
    if (tags) return tags;
  }
  if (magic === 'RIFF' && ascii(head, 8, 4) === 'WAVE') return readWav(slicer);
  if (ascii(head, 0, 3) === 'ID3') {
    const tags = (await readId3v2(slicer)) || emptyTags();
    // ID3v2 里缺的字段再用文件末尾的 ID3v1 补齐。
    if (!hasAnyValue(tags)) return { ...tags, ...pickFilled(await readId3v1(slicer)) };
    return tags;
  }
  if (MP4_FIRST_BOXES.has(ascii(head, 4, 4))) return readMp4(slicer);
  // 没有 ID3 头的裸 MP3 常见于流式工具导出的文件，末尾可能仍带 ID3v1。
  const fallback = await readId3v1(slicer);
  if (fallback && hasAnyValue(fallback)) return { ...emptyTags(), ...fallback };
  throw new Error('无法在浏览器里识别该文件的标签');
}

function pickFilled(tags) {
  if (!tags) return {};
  return Object.fromEntries(Object.entries(tags).filter(([, value]) => Boolean(value)));
}
