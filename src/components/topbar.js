import { icon } from '../core/icons.js';
import { canGoBack, canGoForward } from '../core/router.js';
import { state } from '../core/state.js';
import { themeControl } from '../core/theme.js';
import { escapeHtml } from '../core/util.js';

export function renderTopbar() {
  const backDisabled = canGoBack() ? '' : ' disabled';
  const forwardDisabled = canGoForward() ? '' : ' disabled';
  return `<header class="topbar">
    <button class="mobile-brand brand" data-route="/"><span class="brand-mark">诗</span><span class="brand-name">一头诗人</span></button>
    <div class="topbar-arrows"><button class="icon-button" data-action="back" aria-label="返回"${backDisabled}>‹</button><button class="icon-button" data-action="forward" aria-label="前进"${forwardDisabled}>›</button></div>
    <label class="search-box">${icon('search', 17)}<input id="search-input" type="search" placeholder="搜索歌曲、艺人或专辑" value="${escapeHtml(state.query)}" /><kbd>⌘ K</kbd></label>
    ${themeControl()}
    <a class="avatar-button" href="/admin" data-link title="管理音乐库" aria-label="管理音乐库">诗</a>
  </header>`;
}

