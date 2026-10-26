import { api } from '../../core/api.js';
import { icon } from '../../core/icons.js';
import { renderApp } from '../../core/render-bus.js';
import { genres, state } from '../../core/state.js';
import { showToast } from '../../core/toast.js';
import { coverFor, escapeHtml } from '../../core/util.js';
import { refreshLibrary } from '../../data/library.js';
import { dialogShell } from '../../components/dialog.js';

export function openTrackEditDialog(id) {
  const track = state.trackById.get(id);
  if (!track) return;
  const currentGenre = track.genre || '未分类';
  const genreOptions = [...new Set([currentGenre, '未分类', ...genres.slice(1), '独立摇滚', '古典', '其他'])];
  const dialog = dialogShell(`<form enctype="multipart/form-data"><div class="dialog-head"><div><span class="eyebrow">EDIT TRACK</span><h2>编辑歌曲</h2><p>${escapeHtml(track.artist || '未知艺人')}${track.album ? ` · ${escapeHtml(track.album)}` : ''}</p></div><button type="button" class="icon-button" data-close>${icon('close', 19)}</button></div><div class="track-edit-cover-row"><img class="track-edit-cover" src="${escapeHtml(coverFor(track))}" alt=""/><div><strong>封面</strong><small>选择新图片会替换当前封面</small><label class="cover-picker">${icon('upload', 14)} 选择图片<input name="cover" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"/></label></div></div><div class="upload-fields"><label class="field-label full-field">歌曲名<input name="title" required maxlength="200" value="${escapeHtml(track.title)}"/></label><label class="field-label">演唱者<input name="artist" maxlength="120" value="${escapeHtml(track.artistNames?.join('、') || track.artist || '')}"/><small>多位艺人用「、」或「 / 」分隔</small></label><label class="field-label">专辑<input name="album" maxlength="120" value="${escapeHtml(track.album || '')}" placeholder="留空表示单曲"/></label><label class="field-label">风格<select name="genre">${genreOptions.map(value => `<option value="${escapeHtml(value)}" ${value === currentGenre ? 'selected' : ''}>${escapeHtml(value)}</option>`).join('')}</select></label><label class="field-label">时长（秒）<input name="duration" type="number" min="0" step="1" value="${Number(track.duration) || 0}"/><small>用于在线歌词匹配，通常自动读取</small></label><label class="field-label full-field">封面地址<span class="optional-label">可选</span><input name="coverUrl" type="text" placeholder="https://…（留空则保留当前封面）"/></label></div><div class="dialog-actions"><button type="button" class="button button-quiet" data-close>取消</button><button type="submit" class="button button-dark">保存修改</button></div></form>`, 'form-dialog track-edit-dialog');
  const formEl = dialog.querySelector('form');
  const coverInput = formEl.querySelector('input[name="cover"]');
  const coverPreview = formEl.querySelector('.track-edit-cover');
  coverInput.addEventListener('change', () => {
    const file = coverInput.files?.[0];
    if (file) coverPreview.src = URL.createObjectURL(file);
  });
  formEl.addEventListener('submit', async event => {
    event.preventDefault();
    const submit = formEl.querySelector('[type="submit"]');
    const data = new FormData(formEl);
    if (!data.get('cover')?.size) data.delete('cover');
    if (!String(data.get('coverUrl') || '').trim()) data.delete('coverUrl');
    submit.disabled = true;
    try {
      await api(`/api/admin/tracks/${encodeURIComponent(id)}`, { method: 'PUT', body: data });
      await refreshLibrary();
      dialog.close();
      renderApp();
      showToast('歌曲信息已更新');
    } catch (error) {
      showToast(error.message);
      submit.disabled = false;
    }
  });
  return dialog;
}
