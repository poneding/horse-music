import { icon } from './icons.js';
import { state } from './state.js';
import { renderApp } from './render-bus.js';

const systemColorScheme = window.matchMedia('(prefers-color-scheme: dark)');

export function applyTheme() {
  const dark = state.theme === 'dark' || (state.theme === 'system' && systemColorScheme.matches);
  document.documentElement.dataset.theme = state.theme;
  document.documentElement.classList.toggle('dark-theme', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#171815' : '#e45b3f');
}

export function themeControl(className = '') {
  const labels = { system: '跟随系统', light: '浅色', dark: '深色' };
  const symbols = { system: 'monitor', light: 'sun', dark: 'moon' };
  const label = labels[state.theme];
  return `<div class="theme-control ${className}"><button class="icon-button theme-toggle" type="button" data-theme-toggle aria-label="外观主题：${label}" title="外观主题：${label}" aria-expanded="${state.themeMenuOpen}">${icon(symbols[state.theme], 17)}</button>${state.themeMenuOpen ? `<div class="theme-menu" role="group" aria-label="外观主题">${Object.entries(labels).map(([value, text]) => `<button class="theme-option ${state.theme === value ? 'selected' : ''}" type="button" aria-pressed="${state.theme === value}" data-theme-choice="${value}">${icon(symbols[value], 16)}<span>${text}</span>${state.theme === value ? '<span class="theme-check">✓</span>' : ''}</button>`).join('')}</div>` : ''}</div>`;
}

export function setTheme(theme) {
  state.theme = theme;
  state.themeMenuOpen = false;
  localStorage.setItem('horse-music-theme', theme);
  applyTheme();
  renderApp();
}

export function toggleThemeMenu() {
  state.themeMenuOpen = !state.themeMenuOpen;
  renderApp();
}

export function initTheme() {
  applyTheme();
  systemColorScheme.addEventListener?.('change', () => {
    if (state.theme === 'system') applyTheme();
  });
}
