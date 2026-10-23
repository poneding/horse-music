import { api } from '../../core/api.js';
import { icon } from '../../core/icons.js';
import { renderApp } from '../../core/render-bus.js';
import { state } from '../../core/state.js';
import { showToast } from '../../core/toast.js';
import { escapeHtml, formatTime } from '../../core/util.js';
import { refreshLibrary } from '../../data/library.js';
import { dialogShell } from '../../components/dialog.js';

export function openTrackLyricsDialog(id) {
  const track = state.trackById.get(id);
  if (!track) return;
  const source = track.lyricsSource || null;
  const providerLabel = source?.provider === 'lrclib' ? 'LRCLIB' : source?.provider === 'manual' ? '手动填写' : '';
  const currentLabel = source
    ? `当前歌词：${escapeHtml(providerLabel || source.provider)}${source.title ? ` · ${escapeHtml(source.title)}${source.artist ? ` — ${escapeHtml(source.artist)}` : ''}` : ''}`
    : track.hasLyrics ? '当前歌词来自本地上传或手动填写' : '当前还没有歌词';
  let results = [];
  let selected = -1;
  let loading = false;

  const artistQuery = track.artistNames?.[0] || track.artist || '';
  const dialog = dialogShell(`<div class="dialog-head"><div><span class="eyebrow">LYRICS</span><h2>歌词匹配</h2><p>${escapeHtml(track.title)} · ${escapeHtml(track.artist || '未知艺人')}</p></div><button type="button" class="icon-button" data-close>${icon('close', 19)}</button></div><div class="lyrics-current"><span data-lyric-current>${currentLabel}</span>${track.hasLyrics ? '<button type="button" class="text-link" data-lyric-clear>清除歌词</button>' : ''}</div><form class="lyrics-query" data-lyric-search-form><label>歌名<input name="title" required maxlength="200" value="${escapeHtml(track.title)}"/></label><label>艺人<input name="artist" maxlength="200" value="${escapeHtml(artistQuery)}" placeholder="可选"/></label><label>时长（秒）<input name="duration" type="number" min="0" step="1" value="${Number(track.duration) || 0}"/></label><button type="submit" class="button button-dark">${icon('search', 15)} 搜索</button></form><div class="lyrics-body"><div class="lyrics-results" data-lyric-results><div class="lyrics-hint">正在按歌名与时长搜索…</div></div><pre class="lyric-preview" data-lyric-preview></pre></div><details class="lyrics-manual"><summary>手动填写或修改歌词文本</summary><textarea data-lyric-manual rows="5" placeholder="支持 LRC 时间戳，例如 [00:12.00] 歌词"></textarea><div class="lyrics-manual-actions"><button type="button" class="button button-outline" data-lyric-manual-save>保存文本</button></div></details><div class="dialog-actions"><button type="button" class="button button-quiet" data-close>取消</button><button type="button" class="button button-dark" data-lyric-apply disabled>使用选中歌词</button></div>`, 'form-dialog lyrics-dialog');

  const form = dialog.querySelector('[data-lyric-search-form]');
  const resultsEl = dialog.querySelector('[data-lyric-results]');
  const previewEl = dialog.querySelector('[data-lyric-preview]');
  const applyButton = dialog.querySelector('[data-lyric-apply]');
  const manualEl = dialog.querySelector('[data-lyric-manual]');

  const showPreview = item => {
    previewEl.textContent = item ? item.lyrics : '';
    previewEl.scrollTop = 0;
  };

  const renderResults = () => {
    if (!results.length) {
      resultsEl.innerHTML = `<div class="lyrics-hint">${loading ? '正在搜索歌词…' : '没有找到匹配的歌词，可以修改歌名或清空艺人后重试'}</div>`;
      applyButton.disabled = true;
      showPreview(null);
      return;
    }
    resultsEl.innerHTML = results.map((item, index) => `<button type="button" class="lyric-result ${index === selected ? 'selected' : ''}" data-lyric-pick="${index}"><span class="lyric-result-head"><strong>${escapeHtml(item.title || '未命名')}</strong><span class="lyric-result-badges">${source && String(source.externalId || '') === String(item.id) && (!source.provider || source.provider === item.provider) ? '<span class="lyric-tag current">当前</span>' : ''}<span class="lyric-score">${Math.round((Number(item.score) || 0) * 100)}%</span></span></span><span class="lyric-result-meta"><small>${escapeHtml(item.artist || '未知艺人')}${item.album ? ` · ${escapeHtml(item.album)}` : ''}</small></span><span class="lyric-result-meta"><span class="lyric-tag ${item.hasSynced ? '' : 'plain'}">${item.hasSynced ? '逐行同步' : '纯文本'}</span><small>${formatTime(Number(item.duration) || 0)}${item.durationDiff === null || item.durationDiff === undefined ? '' : ` · 差 ${item.durationDiff}s`}</small></span></button>`).join('');
    applyButton.disabled = selected < 0;
    showPreview(results[selected]);
  };

  const runSearch = async () => {
    const title = form.elements.title.value.trim();
    if (!title) { form.elements.title.focus(); showToast('请先填写歌名'); return; }
    const submit = form.querySelector('[type="submit"]');
    loading = true;
    submit.disabled = true;
    resultsEl.innerHTML = '<div class="lyrics-hint">正在搜索歌词…</div>';
    try {
      const params = new URLSearchParams({
        title,
        artist: form.elements.artist.value.trim(),
        duration: form.elements.duration.value.trim()
      });
      const data = await api(`/api/admin/lyrics/search?${params}`);
      results = data.results || [];
      selected = results.length ? 0 : -1;
      renderResults();
    } catch (error) {
      results = [];
      selected = -1;
      resultsEl.innerHTML = `<div class="lyrics-hint is-error">${escapeHtml(error.message)}</div>`;
      applyButton.disabled = true;
      showPreview(null);
    } finally {
      loading = false;
      submit.disabled = false;
    }
  };

  const saveLyrics = async payload => {
    await api(`/api/admin/tracks/${encodeURIComponent(id)}/lyrics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    await refreshLibrary();
    state.lyricsCache.delete(id);
    dialog.close();
    renderApp();
  };

  form.addEventListener('submit', event => {
    event.preventDefault();
    void runSearch();
  });

  resultsEl.addEventListener('click', event => {
    const pick = event.target.closest('[data-lyric-pick]');
    if (!pick) return;
    selected = Number(pick.dataset.lyricPick);
    resultsEl.querySelectorAll('.lyric-result').forEach((node, index) => { node.classList.toggle('selected', index === selected); });
    applyButton.disabled = false;
    showPreview(results[selected]);
  });

  applyButton.addEventListener('click', async () => {
    const item = results[selected];
    if (!item) return;
    applyButton.disabled = true;
    try {
      await saveLyrics({
        lyrics: item.lyrics,
        provider: item.provider,
        externalId: item.id,
        matchedTitle: item.title,
        matchedArtist: item.artist,
        matchedAlbum: item.album,
        matchedDuration: item.duration
      });
      showToast('歌词已更新');
    } catch (error) {
      showToast(error.message);
      applyButton.disabled = false;
    }
  });

  dialog.querySelector('[data-lyric-clear]')?.addEventListener('click', async event => {
    if (!confirm('确定清除这首歌的歌词吗？')) return;
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await saveLyrics({ lyrics: '' });
      showToast('歌词已清除');
    } catch (error) {
      showToast(error.message);
      button.disabled = false;
    }
  });

  dialog.querySelector('[data-lyric-manual-save]').addEventListener('click', async () => {
    const lyrics = manualEl.value.trim();
    if (!lyrics) { showToast('歌词内容为空，如需删除请使用「清除歌词」'); return; }
    try {
      await saveLyrics({ lyrics, provider: 'manual' });
      showToast('歌词文本已保存');
    } catch (error) {
      showToast(error.message);
    }
  });

  if (track.hasLyrics) {
    api(`/api/tracks/${encodeURIComponent(id)}/lyrics`, { cache: 'no-store' })
      .then(data => { if (!manualEl.value) manualEl.value = data.lyrics || ''; })
      .catch(() => { /* 文本编辑框留空即可。 */ });
  }
  void runSearch();
  return dialog;
}
