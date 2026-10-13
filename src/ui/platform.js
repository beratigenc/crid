// claude.ai artifact çalışma zamanı ile köprü. Yetenek yoksa yerel (demo) moda düşer.
import { ClaudeBackend, LocalBackend, HttpBackend } from '../store/backends.js';
import { buildSeed } from '../logic/seed.js';

function withTimeout(p, ms) {
  return Promise.race([p, new Promise((r) => setTimeout(() => r(null), ms))]);
}

export async function initPlatform() {
  if (typeof window !== 'undefined' && window.__CRID_SERVER__) return serverPlatform();
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

async function serverPlatform() {
  let me;
  try {
    const r = await fetch('/api/me', { credentials: 'same-origin' });
    if (r.status === 401) return { mode: 'login' };
    me = (await r.json()).user;
  } catch (e) { return { mode: 'login', error: 'Sunucuya ulaşılamadı.' }; }
  const backend = new HttpBackend('');
  backend.onAuthLost = () => { location.reload(); };
  return {
    mode: 'server', backend, viewer: { id: me.id, name: me.name, username: me.username, canWrite: me.role !== 'readonly' },
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
