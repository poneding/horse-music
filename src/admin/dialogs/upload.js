import { api } from '../../core/api.js';
import { icon } from '../../core/icons.js';
import { currentRoute, navigate } from '../../core/router.js';
import { renderApp } from '../../core/render-bus.js';
import { genres } from '../../core/state.js';
import { showToast } from '../../core/toast.js';
import { escapeHtml } from '../../core/util.js';
import { refreshLibrary } from '../../data/library.js';
import { dialogShell } from '../../components/dialog.js';

const UPLOAD_AUDIO_EXTENSIONS = new Set(['mp3', 'm4a', 'aac', 'wav', 'ogg', 'flac', 'webm']);
const UPLOAD_MAX_BYTES = 60 * 1024 * 1024;
const UPLOAD_MAX_BATCH = 20;
const UPLOAD_GENRE_OPTIONS = [...new Set(['未分类', ...genres.slice(1), '独立摇滚', '古典', '其他'])];

function uploadFileSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function uploadBaseName(filename) {
  return String(filename || '').replace(/\.[^.]+$/, '') || String(filename || '');
}

export function openUploadDialog() {
  const dialog = dialogShell(`<form class="upload-form batch-upload-form">
    <div class="dialog-head"><div><span class="eyebrow">ADD TO YOUR LIBRARY</span><h2>批量上传音乐</h2><p>一次选择多首，读取标签后统一入库；可逐首修改歌曲信息。</p></div><button type="button" class="icon-button" data-close>${icon('close', 19)}</button></div>
    <label class="upload-dropzone" for="audio-file"><span class="upload-symbol">${icon('upload', 23)}</span><strong>选择或拖入音频文件</strong><small>支持多选 · 自动读取内嵌标签并预填 · MP3、M4A、AAC、WAV、OGG、FLAC · 单首最大 60 MB，单批最多 ${UPLOAD_MAX_BATCH} 首</small><span class="selected-file" data-audio-name>尚未选择文件</span><input id="audio-file" name="audio" type="file" accept="audio/*,.flac" multiple /></label>
    <div class="upload-batch-bar" data-batch-bar hidden><span data-batch-summary></span><button type="button" class="text-link" data-batch-clear>清空列表</button></div>
    <div class="upload-queue" data-upload-queue hidden></div>
    <div class="upload-progress" aria-live="polite"><span class="upload-progress-track"><i data-progress-bar></i></span><span data-progress-text></span></div>
    <div class="dialog-actions"><button class="button button-quiet" type="button" data-close data-cancel-button>取消</button><button class="button button-dark" type="submit" disabled>${icon('upload', 16)}<span data-submit-label>上传到曲库</span></button></div>
  </form>`, 'form-dialog upload-dialog');
  const form = dialog.querySelector('form');
  const input = dialog.querySelector('#audio-file');
  const dropzone = dialog.querySelector('.upload-dropzone');
  const queueEl = dialog.querySelector('[data-upload-queue]');
  const batchBar = dialog.querySelector('[data-batch-bar]');
  const summaryEl = dialog.querySelector('[data-batch-summary]');
  const clearButton = dialog.querySelector('[data-batch-clear]');
  const cancelButton = dialog.querySelector('[data-cancel-button]');
  const progressBar = dialog.querySelector('[data-progress-bar]');
  const progressText = dialog.querySelector('[data-progress-text]');
  const submit = form.querySelector('[type="submit"]');
  const submitLabel = dialog.querySelector('[data-submit-label]');
  const selectedLabel = dialog.querySelector('[data-audio-name]');
  const items = [];
  let itemSeq = 0;
  let closed = false;
  let uploading = false;
  let pumping = false;
  let anyUploaded = false;

  const setProgress = (percent, text) => {
    progressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
    progressText.textContent = text || '';
  };

  const pendingCount = () => items.filter(item => !['done', 'invalid'].includes(item.status)).length;

  const syncItemDisplay = item => {
    const resultTrack = item.result?.track;
    const title = resultTrack?.title || item.fields.title.trim() || uploadBaseName(item.file.name);
    const artist = resultTrack?.artist || item.fields.artist.trim() || (['ready', 'uploading', 'done', 'failed'].includes(item.status) ? '未知艺人' : '等待识别艺人');
    const album = resultTrack?.album || item.fields.album.trim();
    const parts = [artist, album || (resultTrack ? '单曲' : ''), uploadFileSize(item.file.size)].filter(Boolean);
    item.refs.title.textContent = title;
    item.refs.meta.textContent = parts.join(' · ');
  };

  const statusLabel = item => {
    if (item.status === 'queued') return '等待读取标签…';
    if (item.status === 'inspecting') return '正在读取文件标签和封面…';
    if (item.status === 'ready') {
      if (item.inspectError) return `未能读取标签：${item.inspectError}；可直接编辑后上传。`;
      return item.found.length ? `已识别${item.found.join('、')}；未改动的字段按标签入库。` : '没有内嵌标签，将使用文件名作为歌曲名。';
    }
    if (item.status === 'uploading') return '正在上传并保存…';
    if (item.status === 'done') {
      const created = item.result?.created;
      if (created?.album || created?.artists?.length) return '已添加到曲库，并自动新建了专辑或歌手档案。';
      return '已添加到曲库。';
    }
    if (item.status === 'failed') return `上传失败：${item.error || '请重试'}`;
    if (item.status === 'invalid') return `已忽略：${item.error}`;
    return '';
  };

  const showItemCover = item => {
    const url = item.coverObjectUrl || item.result?.track?.coverUrl || item.coverUrl;
    if (!url) {
      item.refs.cover.dataset.src = '';
      item.refs.cover.innerHTML = icon('music', 17);
      return;
    }
    if (item.refs.cover.dataset.src === url) return;
    item.refs.cover.dataset.src = url;
    const img = document.createElement('img');
    img.alt = '';
    img.src = url;
    img.addEventListener('error', () => {
      if (item.refs.cover.dataset.src !== url) return;
      item.refs.cover.dataset.src = '';
      item.refs.cover.innerHTML = icon('music', 17);
    }, { once: true });
    item.refs.cover.replaceChildren(img);
  };

  const updateItem = item => {
    item.refs.el.className = `upload-item is-${item.status}${item.expanded ? ' is-expanded' : ''}`;
    const statusText = statusLabel(item);
    item.refs.status.textContent = statusText;
    item.refs.status.title = statusText;
    syncItemDisplay(item);
    item.refs.editor.hidden = !item.expanded;
    item.refs.edit.textContent = item.expanded ? '收起' : '编辑';
    const locked = uploading || ['uploading', 'done', 'invalid'].includes(item.status);
    for (const field of Object.values(item.refs.fields)) field.disabled = locked;
    item.refs.edit.disabled = uploading || ['uploading', 'done', 'invalid'].includes(item.status);
    item.refs.remove.disabled = uploading || item.status === 'done';
    item.refs.remove.hidden = item.status === 'done';
    showItemCover(item);
  };

  const updateOverallUi = () => {
    const total = items.length;
    const inspecting = items.filter(item => ['queued', 'inspecting'].includes(item.status)).length;
    const ready = items.filter(item => item.status === 'ready').length;
    const done = items.filter(item => item.status === 'done').length;
    const failed = items.filter(item => item.status === 'failed').length;
    const invalid = items.filter(item => item.status === 'invalid').length;
    const pending = pendingCount();
    batchBar.hidden = total === 0;
    queueEl.hidden = total === 0;
    summaryEl.textContent = total
      ? `共 ${total} 首 · 待上传 ${pending} 首${done ? ` · 已完成 ${done} 首` : ''}${failed ? ` · 失败 ${failed} 首` : ''}${invalid ? ` · 已忽略 ${invalid} 首` : ''}`
      : '';
    selectedLabel.textContent = total ? `已选择 ${total} 首 · 可继续添加文件` : '尚未选择文件';
    submit.disabled = uploading || total === 0 || inspecting > 0;
    if (uploading) submitLabel.textContent = '正在上传…';
    else if (pending > 0) submitLabel.textContent = done ? `上传剩余 ${pending} 首` : `上传 ${pending} 首到曲库`;
    else submitLabel.textContent = '完成';
    clearButton.disabled = uploading;
    input.disabled = uploading;
    dropzone.classList.toggle('is-disabled', uploading);
    dialog.querySelectorAll('[data-close]').forEach(button => { button.disabled = uploading; });
    if (anyUploaded) cancelButton.textContent = '关闭';
    for (const item of items) updateItem(item);
    if (uploading) return;
    if (inspecting > 0) {
      const inspected = total - inspecting;
      setProgress(total ? (inspected / total) * 100 : 0, `正在读取标签 ${Math.min(inspected + 1, total)}/${total}…`);
    } else if (total && done === total) {
      setProgress(100, `全部 ${total} 首已添加到曲库`);
    } else if (total) {
      setProgress(0, failed ? `有 ${failed} 首上传失败，可再次点击上传重试` : `已读取 ${ready} 首标签，点击上传开始入库`);
    } else {
      setProgress(0, '');
    }
  };

  const setItemGenre = (item, value) => {
    const select = item.refs.fields.genre;
    let option = [...select.options].find(candidate => candidate.value.toLowerCase() === value.toLowerCase());
    if (!option) {
      option = new Option(value, value);
      option.dataset.tagAdded = '1';
      select.add(option);
    }
    select.value = option.value;
    item.fields.genre = option.value;
  };

  const renderUploadItem = item => {
    const el = document.createElement('article');
    el.classList.add('upload-item');
    el.dataset.uploadId = item.id;
    el.innerHTML = `<div class="upload-item-head">
      <span class="upload-item-cover"></span>
      <div class="upload-item-copy"><strong data-item-title></strong><span data-item-meta></span><small data-item-status></small></div>
      <div class="upload-item-actions"><button type="button" class="text-link upload-edit-button" data-item-edit>编辑</button><button type="button" class="icon-button tiny" data-item-remove title="移出列表" aria-label="移出列表">${icon('close', 15)}</button></div>
    </div>
    <div class="upload-item-editor" hidden>
      <div class="upload-fields">
        <label class="field-label">歌曲名称<input data-upload-field="title" maxlength="120" placeholder="默认读取文件标签，无标签时使用文件名" /></label>
        <label class="field-label">演唱者<input data-upload-field="artist" maxlength="120" placeholder="默认读取文件标签，多个用 / 分隔" /></label>
        <label class="field-label">所属专辑<input data-upload-field="album" maxlength="120" placeholder="默认读取文件标签" /></label>
        <label class="field-label">音乐风格<select data-upload-field="genre">${UPLOAD_GENRE_OPTIONS.map(value => `<option>${escapeHtml(value)}</option>`).join('')}</select></label>
        <label class="field-label">封面图片<input data-upload-field="cover" type="file" accept="image/jpeg,image/png,image/webp" /><small>可选，手动选择的封面优先</small></label>
        <label class="field-label">同步歌词 <span class="optional-label">可选</span><input data-upload-field="lyrics" type="file" accept=".lrc,.txt,text/plain" /><small>支持 LRC / TXT 文本歌词</small></label>
        <label class="field-label full-field">歌词文本<textarea data-upload-field="lyricsText" rows="2" placeholder="也可以直接粘贴歌词，支持 [00:12.00] 时间戳格式"></textarea></label>
      </div>
      <p class="upload-item-file">${escapeHtml(item.file.name)} · ${uploadFileSize(item.file.size)}</p>
    </div>`;
    const refs = {
      el,
      cover: el.querySelector('.upload-item-cover'),
      title: el.querySelector('[data-item-title]'),
      meta: el.querySelector('[data-item-meta]'),
      status: el.querySelector('[data-item-status]'),
      editor: el.querySelector('.upload-item-editor'),
      edit: el.querySelector('[data-item-edit]'),
      remove: el.querySelector('[data-item-remove]'),
      fields: {}
    };
    for (const name of ['title', 'artist', 'album', 'genre', 'cover', 'lyrics', 'lyricsText']) {
      refs.fields[name] = el.querySelector(`[data-upload-field="${name}"]`);
    }
    refs.fields.genre.value = item.fields.genre;
    for (const name of ['title', 'artist', 'album']) {
      refs.fields[name].addEventListener('input', () => {
        item.fields[name] = refs.fields[name].value;
        item.touched[name] = true;
        syncItemDisplay(item);
      });
    }
    refs.fields.genre.addEventListener('change', () => {
      item.fields.genre = refs.fields.genre.value;
      item.touched.genre = true;
    });
    refs.fields.cover.addEventListener('change', () => {
      item.coverFile = refs.fields.cover.files?.[0] || null;
      if (item.coverObjectUrl) URL.revokeObjectURL(item.coverObjectUrl);
      item.coverObjectUrl = item.coverFile ? URL.createObjectURL(item.coverFile) : '';
      showItemCover(item);
    });
    refs.fields.lyrics.addEventListener('change', () => { item.lyricsFile = refs.fields.lyrics.files?.[0] || null; });
    refs.fields.lyricsText.addEventListener('input', () => { item.lyricsText = refs.fields.lyricsText.value; });
    refs.edit.addEventListener('click', () => {
      if (refs.edit.disabled) return;
      item.expanded = !item.expanded;
      updateItem(item);
      if (item.expanded) refs.fields.title.focus();
    });
    refs.remove.addEventListener('click', () => removeItem(item));
    item.refs = refs;
    return refs;
  };

  const createItem = (file, key) => {
    const ext = String(file.name.split('.').pop() || '').toLowerCase();
    let error = '';
    if (ext && !UPLOAD_AUDIO_EXTENSIONS.has(ext)) error = '不支持这种音频格式';
    else if (file.size > UPLOAD_MAX_BYTES) error = '文件超过 60 MB';
    const item = {
      id: `upload-item-${++itemSeq}`,
      key,
      file,
      status: error ? 'invalid' : 'queued',
      error,
      inspectError: '',
      token: '',
      coverUrl: '',
      coverObjectUrl: '',
      recognized: { title: '', artist: '', album: '', genre: '' },
      fields: { title: '', artist: '', album: '', genre: '未分类' },
      touched: {},
      found: [],
      expanded: false,
      result: null,
      coverFile: null,
      lyricsFile: null,
      lyricsText: '',
      inspectSeq: 0,
      inspectPromise: null,
      removed: false,
      refs: null
    };
    renderUploadItem(item);
    queueEl.append(item.refs.el);
    items.push(item);
    return item;
  };

  const removeItem = (item, force = false) => {
    if (uploading || (!force && item.status === 'done')) return;
    item.removed = true;
    item.inspectSeq += 1;
    if (item.token) {
      const token = item.token;
      item.token = '';
      api(`/api/admin/upload/${encodeURIComponent(token)}`, { method: 'DELETE' }).catch(() => {});
    }
    if (item.coverObjectUrl) URL.revokeObjectURL(item.coverObjectUrl);
    item.refs.el.remove();
    const index = items.indexOf(item);
    if (index >= 0) items.splice(index, 1);
    updateOverallUi();
  };

  const clearItems = () => {
    if (uploading) return;
    for (const item of [...items]) removeItem(item, true);
    input.value = '';
    setProgress(0, '');
    updateOverallUi();
  };

  const inspectItem = item => {
    const seq = ++item.inspectSeq;
    item.status = 'inspecting';
    item.inspectError = '';
    updateItem(item);
    updateOverallUi();
    const promise = (async () => {
      try {
        const data = new FormData();
        data.append('audio', item.file);
        const result = await api('/api/admin/upload/inspect', { method: 'POST', body: data });
        if (item.removed || closed || seq !== item.inspectSeq) {
          api(`/api/admin/upload/${encodeURIComponent(result.token)}`, { method: 'DELETE' }).catch(() => {});
          return;
        }
        item.token = result.token;
        item.coverUrl = result.coverUrl || '';
        const tags = result.fields || {};
        item.recognized = {
          title: String(tags.title || '').trim(),
          artist: String(tags.artist || '').trim(),
          album: String(tags.album || '').trim(),
          genre: String(tags.genre || '').trim()
        };
        const found = [];
        for (const [name, label] of [['title', '歌曲名'], ['artist', '演唱者'], ['album', '专辑']]) {
          const value = item.recognized[name];
          if (!item.touched[name]) {
            item.fields[name] = value;
            item.refs.fields[name].value = value;
          }
          if (value) found.push(label);
        }
        if (item.recognized.genre && !item.touched.genre) setItemGenre(item, item.recognized.genre);
        if (item.recognized.genre) found.push('风格');
        if (item.coverUrl) found.push('封面');
        item.found = found;
        item.status = 'ready';
      } catch (error) {
        if (item.removed || closed || seq !== item.inspectSeq) return;
        item.recognized = { title: '', artist: '', album: '', genre: '' };
        item.inspectError = error.message;
        item.status = 'ready';
      } finally {
        if (!item.removed && !closed) {
          updateItem(item);
          updateOverallUi();
        }
      }
    })();
    item.inspectPromise = promise;
    return promise;
  };

  const pumpInspections = async () => {
    if (pumping || closed) return;
    pumping = true;
    try {
      while (!closed) {
        const next = items.find(candidate => candidate.status === 'queued' && !candidate.removed);
        if (!next) break;
        await inspectItem(next);
      }
    } finally {
      pumping = false;
      if (!closed) updateOverallUi();
    }
  };

  const addFiles = fileList => {
    if (uploading || closed) return;
    const files = [...fileList];
    let added = 0;
    let duplicates = 0;
    let skipped = 0;
    for (const file of files) {
      if (!file?.size) { skipped += 1; continue; }
      const key = `${file.name}|${file.size}|${file.lastModified}`;
      if (items.some(item => item.key === key)) { duplicates += 1; continue; }
      const queueCount = items.filter(item => !['done', 'invalid'].includes(item.status)).length;
      if (queueCount >= UPLOAD_MAX_BATCH) { skipped += 1; continue; }
      createItem(file, key);
      added += 1;
    }
    if (added && items.filter(item => item.status !== 'invalid').length === 1) {
      const only = items.find(item => item.status !== 'invalid');
      if (only) only.expanded = true;
    }
    const notices = [];
    if (duplicates) notices.push(`跳过 ${duplicates} 个重复文件`);
    if (skipped) notices.push(`忽略 ${skipped} 个不支持或超出 ${UPLOAD_MAX_BATCH} 首上限的文件`);
    if (notices.length) showToast(notices.join('；'));
    updateOverallUi();
    void pumpInspections();
  };

  const commitUploadItem = async (item, forceAudio = false) => {
    const data = new FormData();
    if (forceAudio || !item.token) data.set('audio', item.file);
    else data.set('token', item.token);
    const title = item.fields.title.trim();
    const artist = item.fields.artist.trim();
    const album = item.fields.album.trim();
    if (title && title !== item.recognized.title) data.set('title', title);
    if (artist && artist !== item.recognized.artist) data.set('artist', artist);
    if (album && album !== item.recognized.album) data.set('album', album);
    data.set('genre', item.fields.genre || '未分类');
    if (item.coverFile) data.set('cover', item.coverFile);
    if (item.lyricsFile) data.set('lyrics', item.lyricsFile);
    else {
      const lyricsText = (item.lyricsText || '').trim();
      if (lyricsText) data.set('lyrics', new File([lyricsText], 'lyrics.lrc', { type: 'text/plain' }));
    }
    return api('/api/admin/upload', { method: 'POST', body: data });
  };

  const uploadItems = async () => {
    if (uploading) return;
    const targets = items.filter(item => !['done', 'invalid', 'queued', 'inspecting'].includes(item.status));
    if (!targets.length) {
      dialog.close();
      return;
    }
    uploading = true;
    updateOverallUi();
    let success = 0;
    let failure = 0;
    for (let index = 0; index < targets.length; index += 1) {
      const item = targets[index];
      if (closed) break;
      item.status = 'uploading';
      item.error = '';
      updateItem(item);
      setProgress((index / targets.length) * 100, `正在上传 ${index + 1}/${targets.length}：${item.fields.title.trim() || uploadBaseName(item.file.name)}`);
      try {
        let result;
        try {
          result = await commitUploadItem(item);
        } catch (error) {
          if (!item.token || !/过期|凭证/.test(error.message)) throw error;
          const staleToken = item.token;
          item.token = '';
          api(`/api/admin/upload/${encodeURIComponent(staleToken)}`, { method: 'DELETE' }).catch(() => {});
          result = await commitUploadItem(item, true);
        }
        item.token = '';
        item.result = result;
        item.status = 'done';
        success += 1;
      } catch (error) {
        if (!closed) {
          item.status = 'failed';
          item.error = error.message;
          failure += 1;
        }
      }
      if (!closed) {
        updateItem(item);
        setProgress(((index + 1) / targets.length) * 100, '');
      }
    }
    uploading = false;
    anyUploaded = anyUploaded || success > 0;
    let refreshFailed = false;
    if (success) {
      try {
        await refreshLibrary();
        if (currentRoute().name === 'admin-tracks') renderApp();
        else navigate('/admin/tracks');
      } catch {
        refreshFailed = true;
      }
    }
    updateOverallUi();
    if (success + failure) setProgress(100, success === success + failure ? `已成功上传 ${success} 首歌曲` : `已上传 ${success} 首，${failure} 首失败`);
    const notices = [];
    if (success) notices.push(`成功上传 ${success} 首`);
    if (failure) notices.push(`${failure} 首失败，可再次点击上传重试`);
    if (refreshFailed) notices.push('曲库刷新失败，请手动刷新页面');
    if (notices.length) showToast(notices.join('，'));
  };

  input.addEventListener('change', () => {
    addFiles(input.files || []);
    input.value = '';
  });
  dropzone.addEventListener('dragover', event => {
    event.preventDefault();
    if (!uploading) dropzone.classList.add('dragging');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragging'));
  dropzone.addEventListener('drop', event => {
    event.preventDefault();
    dropzone.classList.remove('dragging');
    if (uploading) return;
    addFiles(event.dataTransfer.files || []);
  });
  clearButton.addEventListener('click', clearItems);
  form.addEventListener('keydown', event => {
    if (event.key === 'Enter' && event.target.matches('input:not([type="submit"]), select')) event.preventDefault();
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (uploading) return;
    if (!pendingCount()) {
      dialog.close();
      return;
    }
    void uploadItems();
  });
  dialog.addEventListener('cancel', event => {
    if (uploading) event.preventDefault();
  });
  dialog.addEventListener('close', () => {
    closed = true;
    for (const item of items) {
      item.removed = true;
      item.inspectSeq += 1;
      if (item.token) {
        const token = item.token;
        item.token = '';
        api(`/api/admin/upload/${encodeURIComponent(token)}`, { method: 'DELETE' }).catch(() => {});
      }
      if (item.coverObjectUrl) URL.revokeObjectURL(item.coverObjectUrl);
    }
    items.length = 0;
  });
  updateOverallUi();
}
