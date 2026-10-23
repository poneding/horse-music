import { api } from '../../core/api.js';
import { icon } from '../../core/icons.js';
import { renderApp } from '../../core/render-bus.js';
import { showToast } from '../../core/toast.js';
import { refreshLibrary } from '../../data/library.js';
import { dialogShell } from '../../components/dialog.js';

export function openAlbumDialog() {
  const dialog = dialogShell(`<form><div class="dialog-head"><div><span class="eyebrow">ORGANIZE YOUR RECORDS</span><h2>创建专辑</h2></div><button type="button" class="icon-button" data-close>${icon('close', 19)}</button></div><label class="field-label">专辑名称<input name="title" required maxlength="120" placeholder="为这张专辑取个名字"/></label><label class="field-label">艺人<input name="artist" maxlength="120" placeholder="演唱者或乐队"/></label><label class="field-label">专辑介绍<input name="description" maxlength="200" placeholder="可选，简单介绍这张专辑"/></label><label class="field-label">封面图片地址<input name="coverUrl" type="url" placeholder="https://…"/></label><div class="dialog-actions"><button type="button" class="button button-quiet" data-close>取消</button><button class="button button-dark" type="submit">创建专辑</button></div></form>`);
  dialog.querySelector('form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api('/api/admin/albums', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(form))
      });
      await refreshLibrary();
      dialog.close();
      renderApp();
      showToast('专辑已创建');
    } catch (error) {
      showToast(error.message);
    }
  });
  return dialog;
}
