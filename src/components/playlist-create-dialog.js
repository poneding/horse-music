import { api } from '../core/api.js';
import { icon } from '../core/icons.js';
import { showToast } from '../core/toast.js';
import { refreshLibrary } from '../data/library.js';
import { dialogShell } from './dialog.js';

export function openPlaylistCreateDialog({ withCover = false, onCreated = null, onError = null } = {}) {
  const dialog = dialogShell(`<form><div class="dialog-head"><div><span class="eyebrow">${withCover ? 'MAKE A MIX' : 'YOUR COLLECTION'}</span><h2>新建歌单</h2></div><button type="button" class="icon-button" data-close>${icon('close', 19)}</button></div><label class="field-label">歌单名称<input name="title" required maxlength="120" placeholder="${withCover ? '给歌单起个名字' : '比如：日落时分'}"/></label><label class="field-label">一句描述<input name="description" maxlength="200" placeholder="${withCover ? '这份歌单适合什么时候听？' : '给这份歌单留句话'}"/></label>${withCover ? '<label class="field-label">封面图片地址<input name="coverUrl" type="url" placeholder="https://…"/></label>' : ''}<div class="dialog-actions"><button type="button" class="button button-quiet" data-close>取消</button><button type="submit" class="button button-dark">创建歌单</button></div></form>`);
  dialog.querySelector('form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api('/api/admin/playlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.get('title'),
          description: form.get('description'),
          coverUrl: form.get('coverUrl') || '',
          trackIds: []
        })
      });
      await refreshLibrary();
      dialog.close();
      showToast('歌单已创建');
      onCreated?.();
    } catch (error) {
      if (onError) { dialog.close(); onError(error); }
      else showToast(error.message);
    }
  });
  return dialog;
}
