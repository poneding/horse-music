const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const HTML_ESCAPE_RE = /[&<>"']/g;
const DATE_LABEL_FORMAT = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: '2-digit' });
const RELATIVE_DATE_FORMAT = new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' });

const FALLBACK_COVER = 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=700&q=80';

export function escapeHtml(value = '') {
  return String(value).replace(HTML_ESCAPE_RE, char => HTML_ESCAPES[char]);
}

export function coverFor(item = {}) {
  return item.coverUrl || FALLBACK_COVER;
}

export function normalizeName(value) {
  return String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function formatTime(time) {
  if (!Number.isFinite(time) || time <= 0) return '0:00';
  return `${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, '0')}`;
}

export function dateLabel() {
  return DATE_LABEL_FORMAT.format(new Date()).toUpperCase().replace(',', ' ·');
}

export function relativeTime(value) {
  const time = new Date(value || '').getTime();
  if (!Number.isFinite(time)) return '';
  const diff = Math.max(0, Date.now() - time);
  if (diff < 60 * 1000) return '刚刚';
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)} 小时前`;
  if (diff < 7 * 24 * 60 * 60 * 1000) return `${Math.floor(diff / 86400000)} 天前`;
  return RELATIVE_DATE_FORMAT.format(time);
}

export function safeCssEscape(value) {
  return window.CSS && CSS.escape ? CSS.escape(value) : String(value).replace(/"/g, '\\"');
}
