export const ADMIN_TABS = [
  { tab: 'overview', label: '总览', symbol: 'home', path: '/admin/overview' },
  { tab: 'tracks', label: '歌曲管理', symbol: 'music', path: '/admin/tracks' },
  { tab: 'albums', label: '专辑管理', symbol: 'disc', path: '/admin/albums' },
  { tab: 'artists', label: '歌手管理', symbol: 'heart', path: '/admin/artists' },
  { tab: 'playlists', label: '歌单管理', symbol: 'list', path: '/admin/playlists' },
  { tab: 'account', label: '账号设置', symbol: 'user', path: '/admin/account' }
];

export function adminLabel(route) {
  return ADMIN_TABS.find(item => item.tab === route.tab)?.label || '总览';
}
