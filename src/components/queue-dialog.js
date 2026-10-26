import { icon } from '../core/icons.js';
import { IMG_LAZY, state } from '../core/state.js';
import { showToast } from '../core/toast.js';
import { coverFor, escapeHtml, formatTime } from '../core/util.js';
import { enableDragSort } from '../core/drag-sort.js';
import { clearQueue, playQueueIndex, removeQueueEntry, reorderQueue } from '../features/player.js';
import { dialogShell } from './dialog.js';

function queueItem(entry, index) {
  const track = entry.track;
  const current = index === state.queueIndex;
  return `<div class="queue-item ${current ? 'queue-current' : ''}" data-sort-id="${entry.key}" data-queue-key="${entry.key}">
    <button type="button" class="queue-drag" data-drag-handle aria-label="拖动调整顺序" title="拖动排序">${icon('grip', 16)}</button>
    <button type="button" class="queue-play" data-queue-index="${index}">
      <img ${IMG_LAZY} src="${escapeHtml(coverFor(track))}" alt="" />
      <span class="queue-copy"><strong>${escapeHtml(track.title)}</strong><small>${escapeHtml(track.artist)}</small></span>
      ${current ? `<span class="queue-playing" aria-label="正在播放">${icon('volume', 14)}</span>` : ''}
    </button>
    <span class="queue-duration">${track.duration ? formatTime(track.duration) : '--:--'}</span>
    <button type="button" class="queue-remove" data-queue-remove="${entry.key}" aria-label="从队列移除 ${escapeHtml(track.title)}" title="移除">${icon('close', 15)}</button>
  </div>`;
}

export function showQueue() {
  if (!state.queue.length) {
    showToast('播放队列还是空的');
    return null;
  }

  const dialog = dialogShell('', 'queue-dialog queue-dialog-live');
  let disposeDrag = () => {};

  const render = () => {
    if (!state.queue.length) {
      dialog.close();
      return;
    }
    const current = state.queue[state.queueIndex]?.track;
    dialog.innerHTML = `<div class="dialog-head queue-head">
      <div><span class="eyebrow">UP NEXT</span><h2>播放队列 <span class="queue-count">${state.queue.length}</span></h2>${current ? `<p>正在播放 · ${escapeHtml(current.title)}</p>` : '<p>选择一首开始播放</p>'}</div>
      <div class="queue-head-actions"><button type="button" class="icon-button queue-clear" data-queue-clear title="清空队列" aria-label="清空队列">${icon('trash', 16)}</button><button type="button" class="icon-button" data-close aria-label="关闭">${icon('close', 19)}</button></div>
    </div>
    <div class="queue-items" data-queue-list>${state.queue.map(queueItem).join('')}</div>`;
    disposeDrag();
    disposeDrag = enableDragSort(dialog.querySelector('[data-queue-list]'), {
      mode: 'list',
      onEnd: keys => reorderQueue(keys)
    });
  };

  dialog.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest('[data-close]')) {
      dialog.close();
      return;
    }
    if (target.closest('[data-queue-clear]')) {
      clearQueue();
      return;
    }
    const remove = target.closest('[data-queue-remove]');
    if (remove) {
      removeQueueEntry(remove.dataset.queueRemove);
      return;
    }
    const play = target.closest('[data-queue-index]');
    if (play) {
      playQueueIndex(Number(play.dataset.queueIndex));
    }
  });

  const onChange = () => render();
  document.addEventListener('horse:queuechange', onChange);
  dialog.addEventListener('close', () => {
    disposeDrag();
    document.removeEventListener('horse:queuechange', onChange);
  });

  render();
  return dialog;
}
