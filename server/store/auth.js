const crypto = require('node:crypto');
const fsp = require('node:fs/promises');
const { promisify } = require('node:util');
const { AUTH_FILE, SESSION_TTL_SECONDS } = require('../config');
const { atomicWrite } = require('../lib/files');
const { json, parseCookies } = require('../lib/http');

const scrypt = promisify(crypto.scrypt);
let authStore;
let authWritePromise = Promise.resolve();

async function passwordHash(password, salt) {
  return (await scrypt(password, salt, 64)).toString('hex');
}

function adminCredentialsFromEnv() {
  return {
    username: (process.env.ADMIN_USER || 'admin').trim() || 'admin',
    password: process.env.ADMIN_PASSWORD || 'admin123'
  };
}

function credentialsFingerprint(username, password) {
  return crypto.createHash('sha256').update(`${username}\0${password}`).digest('hex');
}

async function createAdminRecord(username, password, updatedAt = new Date().toISOString()) {
  const salt = crypto.randomBytes(16).toString('hex');
  return { username, salt, passwordHash: await passwordHash(password, salt), updatedAt };
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function writeAuthStore() {
  pruneSessions();
  const persist = () => atomicWrite(AUTH_FILE, JSON.stringify(authStore, null, 2), 0o600);
  authWritePromise = authWritePromise.then(persist, persist);
  return authWritePromise;
}

async function initAuth() {
  const { username, password } = adminCredentialsFromEnv();
  const fingerprint = credentialsFingerprint(username, password);
  try {
    authStore = JSON.parse(await fsp.readFile(AUTH_FILE, 'utf8'));
    if (!authStore.admin?.username || !authStore.admin?.salt || !authStore.admin?.passwordHash || typeof authStore.sessions !== 'object') {
      throw new Error('Invalid admin auth store');
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    authStore = { admin: await createAdminRecord(username, password), sessions: {}, envFingerprint: fingerprint };
    await writeAuthStore();
    return;
  }

  // Environment credentials only reset the store when their values change.
  // This keeps account changes made in the admin UI across restarts while
  // keeping the documented behavior of rotating ADMIN_USER / ADMIN_PASSWORD.
  if (authStore.envFingerprint !== fingerprint) {
    const legacyMatches = !authStore.envFingerprint
      && authStore.admin.username === username
      && safeEqual(await passwordHash(password, authStore.admin.salt), authStore.admin.passwordHash);
    if (!legacyMatches) {
      authStore.admin = await createAdminRecord(username, password);
      authStore.sessions = {};
    }
    authStore.envFingerprint = fingerprint;
  }
  pruneSessions();
  await writeAuthStore();
}

function pruneSessions() {
  const now = Date.now();
  for (const [tokenHash, session] of Object.entries(authStore.sessions)) {
    if (!session?.expiresAt || session.expiresAt <= now) delete authStore.sessions[tokenHash];
  }
}

function sessionKey(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function createSession() {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  authStore.sessions[sessionKey(token)] = { createdAt: now, expiresAt: now + SESSION_TTL_SECONDS * 1000 };
  return token;
}

function sessionCookie(req, token) {
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  return `luma_admin=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_SECONDS}${secure}`;
}

function getSession(req) {
  const token = parseCookies(req.headers.cookie).luma_admin;
  const session = token && authStore.sessions[sessionKey(token)];
  return session && session.expiresAt > Date.now() ? { token, session } : null;
}

function isAuthenticated(req) {
  return Boolean(getSession(req));
}

function getAdminUsername() {
  return authStore.admin.username;
}

async function verifyAdminPassword(password) {
  return safeEqual(await passwordHash(String(password || ''), authStore.admin.salt), authStore.admin.passwordHash);
}

async function authenticate(username, password) {
  const userOk = safeEqual(String(username || '').trim(), authStore.admin.username);
  const passOk = await verifyAdminPassword(password);
  if (!userOk || !passOk) return null;
  const token = createSession();
  await writeAuthStore();
  return token;
}

async function logout(req) {
  const token = parseCookies(req.headers.cookie).luma_admin;
  if (token) delete authStore.sessions[sessionKey(token)];
  await writeAuthStore();
}

// Rotating credentials invalidates sessions on every other device.
async function rotateCredentials(username, password) {
  authStore.admin = await createAdminRecord(username, password);
  authStore.sessions = {};
  const token = createSession();
  await writeAuthStore();
  return token;
}

function requireAdmin(req, res) {
  if (isAuthenticated(req)) return true;
  json(res, 401, { error: '请先登录管理端' });
  return false;
}

module.exports = {
  initAuth,
  isAuthenticated,
  getAdminUsername,
  verifyAdminPassword,
  authenticate,
  logout,
  rotateCredentials,
  sessionCookie,
  requireAdmin
};
