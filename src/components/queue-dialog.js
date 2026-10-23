import { icon } from '../core/icons.js';
import { state } from '../core/state.js';
import { showToast } from '../core/toast.js';
import { coverFor, escapeHtml } from '../core/util.js';
import { IMG_LAZY } from '../core/state.js';
import { dialogShell } from './dialog.js';

export function showQueue() {
  if (!state.queue.length) {
    showToast('播放队列还是空的');
    return;
  }
  const dialog = dialogShell(`<div class="dialog-head"><div><span class="eyebrow">UP NEXT</span><h2>播放队列</h2></div><button type="button" class="icon-button" data-close>${icon('close', 19)}</button></div><div class="queue-items">${state.queue.map((track, index) => `<button class="queue-item ${index === state.queueIndex ? 'queue-current' : ''}" data-queue-index="${index}"><img ${IMG_LAZY} src="${escapeHtml(coverFor(track))}" alt=""/><span><strong>${escapeHtml(track.title)}</strong><small>${escapeHtml(track.artist)}</small></span>${index === state.queueIndex ? icon('volume', 16) : ''}</button>`).join('')}</div>`, 'queue-dialog');
  return dialog;
}
