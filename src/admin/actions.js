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

export { openAlbumTracksDialog, openPlaylistEditor, openTrackEditDialog, openTrackLyricsDialog, openAlbumDialog };

export function handleAdminAction(action) {
  if (action === 'logout') {
    void logoutAdmin().then(() => navigate('/admin', { replace: true }));
  }
  if (action === 'upload') openUploadDialog();
  if (action === 'new-album') openAlbumDialog();
  if (action === 'new-playlist') {
    openPlaylistCreateDialog({ withCover: true, onCreated: renderApp });
  }
  if (action === 'clear-plays') void clearPlayHistory();
  if (action === 'load-more-tracks') {
    admin.trackLimit += ADMIN_PAGE_SIZE;
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
