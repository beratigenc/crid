// claude.ai artifact çalışma zamanı ile köprü. Yetenek yoksa yerel (demo) moda düşer.
import { ClaudeBackend, LocalBackend, HttpBackend } from '../store/backends.js';
import { buildSeed } from '../logic/seed.js';
import { OfflineBackend, fileApiSupported } from '../store/offline.js';

function withTimeout(p, ms) {
  return Promise.race([p, new Promise((r) => setTimeout(() => r(null), ms))]);
}

export async function initPlatform() {
  if (typeof window !== 'undefined' && window.__CRID_SERVER__) return serverPlatform();
  if (typeof window !== 'undefined' && window.__CRID_HTML__) return htmlPlatform();
  const claude = typeof window !== 'undefined' ? window.claude : null;
  const hasRuntime = !!(claude && typeof claude.use === 'function');
  if (!hasRuntime || window.__CRID_FORCE_LOCAL__) return localPlatform('no-runtime');
  const use = (n) => withTimeout(claude.use(n).catch(() => null), 12000);
  const [db, user, assets, downloads] = await Promise.all([use('db'), use('user'), use('assets'), use('downloads')]);
  if (!db) return localPlatform('db-unavailable', { downloads });
  const viewer = { id: null, name: '', isOwner: false, canWrite: null, canEdit: false };
  if (user) {
    try { viewer.id = await user.id(); } catch (e) { /* */ }
    try { const me = await user.me(); viewer.name = me?.name || ''; if (!viewer.id) viewer.id = me?.id || null; viewer.email = me?.email || null; } catch (e) { /* */ }
    try { viewer.isOwner = await user.isOwner(); } catch (e) { /* */ }
    try { viewer.canEdit = await user.canEdit(); } catch (e) { /* */ }
    try { viewer.canWrite = await user.can('data.write'); } catch (e) { /* */ }
  }
  return {
    mode: 'claude', backend: new ClaudeBackend(db), viewer, assets, downloads,
    saveFile: (filename, data) => saveViaDownloads(downloads, filename, data),
    upload: assets ? (file) => assets.upload(file) : null,
  };
}

function localPlatform(reason, extra = {}) {
  const backend = new LocalBackend({ seed: buildSeed() });
  return {
    mode: 'local', reason, backend, viewer: null, assets: null, downloads: extra.downloads || null,
    saveFile: (filename, data) => (extra.downloads ? saveViaDownloads(extra.downloads, filename, data) : saveLocal(filename, data)),
    upload: null,
    resetDemo: () => backend.reset(buildSeed()),
  };
}

async function saveViaDownloads(downloads, filename, data) {
  if (!downloads) throw new Error('Bu görünümde dosya indirme kullanılamıyor.');
  try {
    await downloads.save({ filename, data: data instanceof Uint8Array ? new Blob([data]) : data });
    return true;
  } catch (e) {
    if (e?.code === 'declined') return false;
    throw new Error(e?.message || 'Dosya kaydedilemedi.');
  }
}

function saveLocal(filename, data) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: filename.endsWith('.csv') ? 'text/csv;charset=utf-8' : 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return Promise.resolve(true);
}

export async function fetchPublicBranding() {
  try { const r = await fetch('/api/public/branding'); return r.ok ? await r.json() : null; } catch (e) { return null; }
}

async function serverPlatform() {
  const defaultBranding = await fetchPublicBranding();
  let me;
  try {
    const r = await fetch('/api/me', { credentials: 'same-origin' });
    if (r.status === 401) return { mode: 'login', defaultBranding };
    me = (await r.json()).user;
  } catch (e) { return { mode: 'login', error: 'Sunucuya ulaşılamadı.', defaultBranding }; }
  const backend = new HttpBackend('');
  backend.onAuthLost = () => { location.reload(); };
  return {
    mode: 'server', defaultBranding, backend, viewer: { id: me.id, name: me.name, username: me.username, canWrite: me.role !== 'readonly' },
    saveFile: (filename, data) => saveLocal(filename, data),
    upload: async (file) => {
      const r = await fetch('/api/upload', { method: 'POST', body: file, headers: { 'content-type': file.type || 'application/octet-stream', 'x-file-name': encodeURIComponent(file.name) }, credentials: 'same-origin' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Yükleme başarısız');
      return j;
    },
    logout: async () => { await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' }); location.reload(); },
    changePassword: async (current, next) => {
      const r = await fetch('/api/me/password', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ current, next }), credentials: 'same-origin' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Şifre değiştirilemedi');
    },
    accounts: {
      list: async () => { const r = await fetch('/api/accounts', { credentials: 'same-origin' }); const j = await r.json(); if (!r.ok) throw new Error(j.error); return j.accounts; },
      set: async (userId, username, password) => { const r = await fetch('/api/accounts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId, username, password }), credentials: 'same-origin' }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Kaydedilemedi'); },
      remove: async (username) => { const r = await fetch('/api/accounts/' + encodeURIComponent(username), { method: 'DELETE', credentials: 'same-origin' }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Silinemedi'); },
    },
  };
}

/* ---------- tek dosya HTML (çevrimdışı) ---------- */
const HTML_USER_KEY = 'crid-html-user';
export function htmlRememberedUser() { try { return localStorage.getItem(HTML_USER_KEY) || ''; } catch (e) { return ''; } }
export function htmlRememberUser(id) { try { if (id) localStorage.setItem(HTML_USER_KEY, id); else localStorage.removeItem(HTML_USER_KEY); } catch (e) { /* */ } }

async function htmlPlatform() {
  const backend = new OfflineBackend({ seed: buildSeed() });
  await backend.ready;
  const userId = htmlRememberedUser();
  const master = backend.pack.docs['master/main'];
  const exists = master && (master.users || []).some((u) => u.id === userId && u.active !== false);
  const base = {
    backend, fileApi: fileApiSupported(), defaultBranding: { logos: (typeof window !== 'undefined' && window.__CRID_DEFAULT_LOGOS__) || [] },
    saveFile: (filename, data) => saveLocal(filename, data),
    upload: async (file) => {
      if (file.size > 3 * 1024 * 1024) throw new Error(`${file.name}: çevrimdışı sürümde dosya başına en fazla 3 MB eklenebilir. Büyük dosyalar için ortak klasördeki bağlantısını ekleyin.`);
      const url = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('Dosya okunamadı')); r.readAsDataURL(file); });
      return { id: 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), url, sizeBytes: file.size, contentType: file.type };
    },
    logout: () => { htmlRememberUser(''); try { history.replaceState(null, '', location.pathname); } catch (e) { /* */ } location.reload(); },
  };
  if (!exists) return { ...base, mode: 'html-login' };
  const u = master.users.find((x) => x.id === userId);
  return { ...base, mode: 'html', viewer: { id: u.id, name: u.name, canWrite: u.role !== 'readonly' } };
}

/** PIN özeti (SHA-256; yoksa basit yedek). */
export async function pinHash(userId, pin) {
  const text = `crid:${userId}:${pin}`;
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch (e) {
    let h = 2166136261; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
    return 'f' + (h >>> 0).toString(16);
  }
}
