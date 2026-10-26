import { icon } from '../core/icons.js';
import { navigate, searchPath } from '../core/router.js';
import { state } from '../core/state.js';
import { escapeHtml } from '../core/util.js';
import { clearSearchHistory, recentSearches, rememberSearch } from '../data/search-history.js';

let panel = null;

function close() {
  if (panel) {
    panel.cleanup?.();
    panel.remove();
    panel = null;
  }
}

function show(input) {
  if (!(input instanceof HTMLInputElement) || input.value.trim()) return;
  const history = recentSearches();
  if (!history.length) { close(); return; }
  close();
  const rect = input.getBoundingClientRect();
  panel = document.createElement('div');
  panel.className = 'search-suggestions';
  panel.setAttribute('role', 'listbox');
  panel.setAttribute('aria-label', '最近搜索');
  panel.innerHTML = `<div class="search-suggestions-head"><span>${icon('clock', 13)} 最近搜索</span><button type="button" class="search-history-clear" data-clear-search-history>清除</button></div>${history.map(term => `<button type="button" class="search-suggestion" data-search-term="${escapeHtml(term)}" role="option">${icon('search', 14)}<span>${escapeHtml(term)}</span></button>`).join('')}`;
  const width = Math.max(rect.width, 250);
  panel.style.left = `${Math.min(rect.left, window.innerWidth - width - 10)}px`;
  panel.style.top = `${rect.bottom + 7}px`;
  panel.style.width = `${width}px`;
  document.body.append(panel);

  panel.addEventListener('pointerdown', event => {
    if (event.target.closest('[data-clear-search-history]')) {
      event.preventDefault();
      clearSearchHistory();
      close();
      return;
    }
    const item = event.target.closest('[data-search-term]');
    if (!item) return;
    event.preventDefault();
    const term = item.dataset.searchTerm;
    rememberSearch(term);
    state.query = term;
    close();
    navigate(searchPath(term));
  });

  const onOutside = event => {
    if (!(event.target instanceof Node)) return;
    if (panel?.contains(event.target) || input.contains(event.target)) return;
    close();
  };
  const timer = setTimeout(() => document.addEventListener('pointerdown', onOutside, true), 0);
  panel.cleanup = () => {
    clearTimeout(timer);
    document.removeEventListener('pointerdown', onOutside, true);
  };
}

function hide() {
  const currentPanel = panel;
  if (!currentPanel) return;
  setTimeout(() => {
    // focus 从旧输入框移到新输入框时，新面板已经替换，旧面板的延时关闭不再生效。
    if (panel === currentPanel) close();
  }, 140);
}

export function bindSearchSuggestions() {
  document.addEventListener('focusin', event => {
    if (event.target?.id === 'search-input') show(event.target);
  });
  document.addEventListener('input', event => {
    if (event.target?.id !== 'search-input') return;
    if (event.target.value.trim()) close();
    else show(event.target);
  });
  document.addEventListener('focusout', event => {
    if (event.target?.id === 'search-input') hide();
  });
  document.addEventListener('keydown', event => {
    if (event.target?.id !== 'search-input') return;
    if (event.key === 'Enter') {
      rememberSearch(event.target.value);
      close();
      event.target.blur();
    } else if (event.key === 'Escape') {
      close();
    }
  });
}
