import { icon } from '../core/icons.js';
import { currentRoute, navigate } from '../core/router.js';
import { hasPlayerSession, state } from '../core/state.js';
import { renderApp } from '../core/render-bus.js';
import { renderLyricsPanel } from '../components/lyrics-panel.js';
import { renderPlayerBar } from '../components/player-bar.js';
import { scrollActiveLyric } from '../features/lyrics.js';
import { themeControl } from '../core/theme.js';
import { loginAdmin } from './auth.js';

export function renderLogin() {
  const showPlayer = hasPlayerSession();
  document.querySelector('#app').innerHTML = `<main class="login-screen${showPlayer ? ' has-player' : ''}"><div class="login-visual"><div class="login-visual-top"><a class="brand" href="/" data-link><span class="brand-mark">诗</span><span class="brand-name">一头诗人</span></a><span class="visual-note">A HOME FOR<br/>GOOD MUSIC</span></div><div class="login-visual-copy"><span class="eyebrow">THE SOUND OF YOUR OWN</span><h1>每首歌，<br/><em>都有自己的位置。</em></h1><p>整理音乐，编织歌单，让喜欢的声音被好好收藏。</p></div><div class="login-artwork"><img loading="eager" decoding="async" src="https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=1100&q=88" alt="录音棚中的歌手" /><span>MAKE ROOM FOR MUSIC</span></div></div><section class="login-side"><a class="login-mobile-brand brand" href="/" data-link><span class="brand-mark">诗</span><span class="brand-name">一头诗人</span></a><form class="login-card"><span class="eyebrow">一头诗人 · STUDIO</span><h2>欢迎回来</h2><p class="login-description">登录你的管理空间，继续整理音乐。</p><label class="field-label">管理员账号<input name="username" autocomplete="username" required placeholder="输入账号" /></label><label class="field-label">登录密码<input name="password" autocomplete="current-password" required type="password" placeholder="输入密码" /></label><div class="login-error" aria-live="polite"></div><button class="button button-dark login-submit" type="submit">进入管理端 ${icon('arrow', 16)}</button><a class="login-back" href="/" data-link>${icon('arrow', 14)} 返回音乐播放器</a></form><div class="login-footer">© 2026 一头诗人</div></section></main>${showPlayer ? renderPlayerBar(true) : ''}${showPlayer && state.lyricsOpen ? renderLyricsPanel() : ''}`;
  document.querySelector('.login-side')?.insertAdjacentHTML('afterbegin', themeControl('login-theme-control'));
  if (showPlayer && state.lyricsOpen) requestAnimationFrame(() => scrollActiveLyric('auto'));
  document.querySelector('.login-card').addEventListener('submit', async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const submit = event.currentTarget.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      await loginAdmin(form.get('username'), form.get('password'));
      if (currentRoute().path === '/admin') navigate('/admin/overview', { replace: true });
      else renderApp();
    } catch (error) {
      document.querySelector('.login-error').textContent = error.message;
      submit.disabled = false;
    }
  });
}
