const KEY = 'horse-search-history';
const LIMIT = 8;

export function recentSearches() {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (!Array.isArray(value)) return [];
    return value.filter(item => typeof item === 'string' && item.trim()).slice(0, LIMIT);
  } catch {
    return [];
  }
}

export function rememberSearch(value) {
  const query = String(value || '').trim();
  if (!query) return recentSearches();
  const list = recentSearches().filter(item => item.toLowerCase() !== query.toLowerCase());
  list.unshift(query);
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, LIMIT))); } catch { /* 存储不可用时忽略 */ }
  return list.slice(0, LIMIT);
}

export function clearSearchHistory() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
