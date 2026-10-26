import { api } from '../core/api.js';
import { navigate } from '../core/router.js';
import { renderApp } from '../core/render-bus.js';
import { ADMIN_PAGE_SIZE, state } from '../core/state.js';
import { showToast } from '../core/toast.js';
import { refreshLibrary } from '../data/library.js';
import { openPlaylistCreateDialog } from '../components/playlist-create-dialog.js';
import { logoutAdmin } from './auth.js';
import { admin } from './state.js';
import { openAlbumDialog } from './dialogs/album.js';
import { openAlbumTracksDialog } from './dialogs/album-tracks.js';
import { openPlaylistEditor } from './dialogs/playlist.js';
import { openTrackEditDialog } from './dialogs/track-edit.js';
import { openTrackLyricsDialog } from './dialogs/lyrics.js';
import { openUploadDialog } from './dialogs/upload.js';
import { filteredAdminTracks } from './views/tracks.js';

export { openAlbumTracksDialog, openPlaylistEditor, openTrackEditDialog, openTrackLyricsDialog, openAlbumDialog };

export function handleAdminAction(action) {
  if (action === 'logout') {
    admin.trackSelection.clear();
    admin.trackBatchBusy = false;
    void logoutAdmin().then(() => navigate('/admin', { replace: true }));
  }
  if (action === 'upload') openUploadDialog();
  if (action === 'new-album') openAlbumDialog();
  if (action === 'new-playlist') {
    openPlaylistCreateDialog({ onCreated: renderApp });
  }
  if (action === 'clear-plays') void clearPlayHistory();
  if (action === 'load-more-tracks') {
    admin.trackLimit += ADMIN_PAGE_SIZE;
    renderApp();
  }
  if (action === 'select-all-tracks') selectAllTracks();
  if (action === 'clear-track-selection') clearTrackSelection();
  if (action === 'bulk-delete-tracks') void bulkDeleteTracks();
  if (action === 'bulk-add-to-playlist') void bulkAddTracksToPlaylist();
}

export function selectAllTracks() {
  if (admin.trackBatchBusy) return;
  for (const track of filteredAdminTracks()) admin.trackSelection.add(track.id);
  renderApp();
}

export function clearTrackSelection() {
  if (admin.trackBatchBusy) return;
  admin.trackSelection.clear();
  renderApp();
}

function selectedTrackIds() {
  const existing = new Set(state.tracks.map(track => track.id));
  return [...admin.trackSelection].filter(id => existing.has(id));
}

export async function bulkDeleteTracks() {
  if (admin.trackBatchBusy) return;
  const ids = selectedTrackIds();
  if (!ids.length) {
    admin.trackSelection.clear();
    renderApp();
    return;
  }
  if (!confirm(`确定删除选中的 ${ids.length} 首歌曲吗？播放记录与歌单中的对应条目会一并移除，且不可撤销。`)) return;
  admin.trackBatchBusy = true;
  renderApp();
  let deleted = 0;
  let missing = 0;
  let failed = 0;
  try {
    // 服务端单次上限 500 首，这里按 500 分批，避免全选大曲库时永远失败。
    for (let offset = 0; offset < ids.length; offset += 500) {
      const chunk = ids.slice(offset, offset + 500);
      try {
        const result = await api('/api/admin/tracks/bulk-delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: chunk })
        });
        deleted += Number(result.deleted) || 0;
        missing += Number(result.missing) || 0;
        for (const id of chunk) admin.trackSelection.delete(id);
      } catch {
        failed += chunk.length;
      }
    }
    await refreshLibrary();
    const parts = [`已删除 ${deleted} 首`];
    if (missing) parts.push(`${missing} 首未找到`);
    if (failed) parts.push(`${failed} 首删除失败，仍保留在选择中`);
    showToast(parts.join('，'));
  } catch (error) {
    showToast(error.message);
    try { await refreshLibrary(); } catch { /* 保留当前界面 */ }
  } finally {
    admin.trackBatchBusy = false;
    renderApp();
  }
}

export async function bulkAddTracksToPlaylist() {
  if (admin.trackBatchBusy) return;
  const playlistId = admin.bulkPlaylistId || document.querySelector('[data-bulk-playlist]')?.value;
  const playlist = state.playlists.find(item => item.id === playlistId);
  if (!playlist) return showToast('请选择要加入的歌单');
  const ids = selectedTrackIds();
  if (!ids.length) {
    admin.trackSelection.clear();
    renderApp();
    return;
  }
  const existing = new Set(playlist.trackIds);
  const newIds = ids.filter(id => !existing.has(id));
  if (!newIds.length) {
    showToast(`所选歌曲已在「${playlist.title}」中`);
    return;
  }
  const merged = [...playlist.trackIds, ...newIds];
  admin.trackBatchBusy = true;
  renderApp();
  try {
    await api(`/api/admin/playlists/${encodeURIComponent(playlist.id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trackIds: merged })
    });
    admin.trackSelection.clear();
    await refreshLibrary();
    showToast(`已将 ${newIds.length} 首歌曲加入「${playlist.title}」`);
  } catch (error) {
    showToast(error.message);
  } finally {
    admin.trackBatchBusy = false;
    renderApp();
  }
}

export async function deleteTrack(id) {
  const track = state.tracks.find(item => item.id === id);
  if (!track || !confirm(`确定从曲库删除「${track.title}」吗？`)) return;
  try {
    await api(`/api/admin/tracks/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await refreshLibrary();
    renderApp();
    showToast('歌曲已删除');
  } catch (error) {
    showToast(error.message);
  }
}

export async function deletePlaylist(id) {
  const playlist = state.playlists.find(item => item.id === id);
  if (!playlist || !confirm(`确定删除歌单「${playlist.title}」吗？`)) return;
  try {
    await api(`/api/admin/playlists/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await refreshLibrary();
    renderApp();
    showToast('歌单已删除');
  } catch (error) {
    showToast(error.message);
  }
}

export async function deleteAlbum(id) {
  const album = state.albums.find(item => item.id === id);
  if (!album || !confirm(`确定删除专辑「${album.title}」吗？歌曲会保留在曲库中。`)) return;
  try {
    await api(`/api/admin/albums/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await refreshLibrary();
    renderApp();
    showToast('专辑已删除，歌曲仍保留在曲库');
  } catch (error) {
    showToast(error.message);
  }
}

export async function deleteArtist(id) {
  const artist = state.artists.find(item => item.id === id);
  if (!artist || !confirm(`确定删除歌手档案「${artist.name}」吗？歌曲与专辑会保留，再次上传同名歌手时会重新创建。`)) return;
  try {
    await api(`/api/admin/artists/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await refreshLibrary();
    renderApp();
    showToast('歌手档案已删除，歌曲仍保留在曲库');
  } catch (error) {
    showToast(error.message);
  }
}

export async function clearPlayHistory() {
  if (!confirm('确定清空所有播放记录和播放次数吗？此操作不可撤销。')) return;
  try {
    await api('/api/admin/plays', { method: 'DELETE' });
    await refreshLibrary();
    renderApp();
    showToast('播放记录已清空');
  } catch (error) {
    showToast(error.message);
  }
}
