// CRID sunucusu — bağımlılıksız Node.js (>=18).
// - Statik uygulama (dist/index.html)
// - Kullanıcı adı + şifre ile giriş (scrypt, HttpOnly çerez)
// - JSON dosyasına kalıcı depolama (DATA_DIR; Railway'de volume bağlayın)
// - Sunucu tarafı yetki: master data/kullanıcılar yalnız IT, salt okuma rolü hiçbir şey yazamaz
// - Canlı güncelleme: Server-Sent Events
// - Doküman eki yükleme (DATA_DIR/files)
import http from 'node:http';
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, createReadStream, statSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { buildSeed } from '../src/logic/seed.js';
import { defaultMaster, normalizeMaster, PERMISSIONS } from '../src/logic/defaults.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = +(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || join(ROOT, 'data');
const DB_FILE = join(DATA_DIR, 'crid-db.json');
const AUTH_FILE = join(DATA_DIR, 'crid-auth.json');
const FILES_DIR = join(DATA_DIR, 'files');
const SEED_SAMPLE = process.env.SEED_SAMPLE !== 'false';
const SESSION_DAYS = 14;
mkdirSync(FILES_DIR, { recursive: true });

/* ---------------- depolama ---------------- */
let db = {};
let auth = { users: {}, sessions: {}, secret: crypto.randomBytes(32).toString('hex') };
function loadJson(f, fallback) { try { return JSON.parse(readFileSync(f, 'utf8')); } catch (e) { return fallback; } }
function atomicWrite(f, obj) { const tmp = f + '.tmp'; writeFileSync(tmp, JSON.stringify(obj)); renameSync(tmp, f); }
let saveTimer = null;
function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(() => { atomicWrite(DB_FILE, db); }, 150); }
function saveAuth() { atomicWrite(AUTH_FILE, auth); }
function flush() { clearTimeout(saveTimer); atomicWrite(DB_FILE, db); saveAuth(); }

function hashPassword(pw, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(String(pw), salt, 64).toString('hex') };
}
function checkPassword(pw, rec) {
  if (!rec) return false;
  const h = crypto.scryptSync(String(pw), rec.salt, 64);
  const b = Buffer.from(rec.hash, 'hex');
  return h.length === b.length && crypto.timingSafeEqual(h, b);
}

function init() {
  db = loadJson(DB_FILE, null);
  auth = loadJson(AUTH_FILE, null) || auth;
  auth.users ||= {}; auth.sessions ||= {};
  if (!db) {
    db = {};
    if (SEED_SAMPLE) {
      const s = buildSeed();
      db['master/main'] = s.master;
      db['meta/counters'] = s.counters;
      for (const p of s.plans) db[`plans/${p.id}`] = strip(p);
      for (const c of s.crids) db[`crids/${c.id}`] = strip(c);
      for (const x of s.subs) db[`subs/${x.id}`] = strip(x);
      for (const i of s.ideas) db[`ideas/${i.id}`] = strip(i);
    } else {
      db['master/main'] = defaultMaster();
    }
    console.log(`[crid] yeni veritabanı oluşturuldu (${SEED_SAMPLE ? 'örnek veriyle' : 'boş'})`);
  }
  // yönetici hesabı
  const m = normalizeMaster(db['master/main']);
  const adminUser = process.env.ADMIN_USERNAME || 'admin';
  if (!m.users.some((u) => u.id === 'usr-admin')) {
    m.users.unshift({ id: 'usr-admin', name: process.env.ADMIN_NAME || 'Sistem Yöneticisi', email: '', role: 'it', teamId: '', categoryIds: [], active: true });
    db['master/main'] = m;
  }
  const existing = Object.values(auth.users).find((a) => a.userId === 'usr-admin');
  if (!existing) {
    let pw = process.env.ADMIN_PASSWORD;
    if (!pw) { pw = crypto.randomBytes(6).toString('base64url'); console.log(`[crid] ADMIN_PASSWORD tanımlı değil. Geçici yönetici şifresi: ${pw}`); }
    auth.users[adminUser.toLowerCase()] = { userId: 'usr-admin', ...hashPassword(pw) };
  } else if (process.env.ADMIN_PASSWORD && process.env.ADMIN_RESET === 'true') {
    Object.assign(existing, hashPassword(process.env.ADMIN_PASSWORD));
    console.log('[crid] yönetici şifresi ADMIN_PASSWORD ile sıfırlandı');
  }
  // örnek kullanıcılar için demo şifreleri (yalnız örnek veri yüklüyse ve şifreleri yoksa)
  const demoPw = process.env.DEMO_PASSWORD;
  if (demoPw) {
    for (const u of normalizeMaster(db['master/main']).users.filter((x) => x.sample)) {
      const uname = u.email ? u.email.split('@')[0] : u.id;
      if (!Object.values(auth.users).some((a) => a.userId === u.id)) auth.users[uname.toLowerCase()] = { userId: u.id, ...hashPassword(demoPw) };
    }
  }
  flush();
}
function strip(o) { const x = { ...o }; delete x.id; return x; }

/* ---------------- oturum ---------------- */
function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) { const i = part.indexOf('='); if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); }
  return out;
}
function sessionUser(req) {
  const tok = parseCookies(req).crid_session;
  if (!tok) return null;
  const s = auth.sessions[crypto.createHash('sha256').update(tok).digest('hex')];
  if (!s || s.exp < Date.now()) return null;
  const m = normalizeMaster(db['master/main']);
  const u = m.users.find((x) => x.id === s.userId);
  if (!u || u.active === false) return null;
  return { ...u, username: s.username };
}
function perms(user) {
  const m = normalizeMaster(db['master/main']);
  return new Set((m.permissions || {})[user.role] || []);
}
function canWrite(user, path) {
  if (!user || user.role === 'readonly') return false;
  const p = perms(user);
  if (path.startsWith('master/')) return p.has('master.edit') || p.has('users.edit') || p.has('integration.edit') || p.has('plan.edit') || p.has('pool.convert');
  if (path.startsWith('plans/')) return p.has('plan.edit') || p.has('budget.edit') || p.has('integration.edit');
  if (path.startsWith('meta/')) return true;
  return p.size > 0;
}
/** Master data değişikliğinde hangi alanların değiştiğine göre yetki: kullanıcı/yetki matrisi → users.edit, diğer listeler → master.edit */
function masterChangeAllowed(user, before, after) {
  const p = perms(user);
  const changed = new Set();
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  for (const k of keys) if (k !== 'history' && JSON.stringify((before || {})[k]) !== JSON.stringify((after || {})[k])) changed.add(k);
  for (const k of changed) {
    if (['users', 'permissions'].includes(k) && !p.has('users.edit')) return `Kullanıcı ve rol değişikliği için yetkiniz yok.`;
    if (k === 'sap' && !(p.has('integration.edit') || p.has('plan.edit'))) return 'Entegrasyon ayarları için yetkiniz yok.';
    if (k === 'settings' && !p.has('master.edit') && !p.has('users.edit')) return 'Sistem parametreleri için yetkiniz yok.';
    if (!['users', 'permissions', 'sap', 'settings'].includes(k) && !p.has('master.edit')) return 'Master data değişikliği için yetkiniz yok.';
  }
  return null;
}

/* ---------------- SSE ---------------- */
const clients = new Set();
function broadcast(path, data) {
  const msg = `data: ${JSON.stringify({ path, data })}\n\n`;
  for (const c of clients) c.res.write(msg);
}
setInterval(() => { for (const c of clients) c.res.write(': ping\n\n'); }, 25000).unref();

/* ---------------- yardımcılar ---------------- */
function send(res, code, obj, headers = {}) {
  const body = typeof obj === 'string' ? obj : JSON.stringify(obj);
  res.writeHead(code, { 'content-type': typeof obj === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(body);
}
function readBody(req, limit = 5 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', (c) => { n += c.length; if (n > limit) { reject(Object.assign(new Error('İstek çok büyük'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function readJson(req) { const b = await readBody(req); try { return JSON.parse(b.toString('utf8') || '{}'); } catch (e) { throw Object.assign(new Error('Geçersiz JSON'), { status: 400 }); } }
const PATH_RE = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;
const loginAttempts = new Map();

let indexHtml = null;
function getIndex() {
  if (!indexHtml || process.env.NODE_ENV !== 'production') {
    indexHtml = readFileSync(join(ROOT, 'dist', 'index.html'), 'utf8').replace('<head>', '<head><script>window.__CRID_SERVER__=true</script>');
  }
  return indexHtml;
}

/* ---------------- yönlendirme ---------------- */
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'same-origin');

    if (p === '/healthz') return send(res, 200, { ok: true });

    if (p === '/api/login' && req.method === 'POST') {
      const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
      const a = loginAttempts.get(ip) || { n: 0, t: Date.now() };
      if (Date.now() - a.t > 15 * 60000) { a.n = 0; a.t = Date.now(); }
      if (a.n >= 10) return send(res, 429, { error: 'Çok fazla deneme. 15 dakika sonra tekrar deneyin.' });
      const { username, password } = await readJson(req);
      const rec = auth.users[String(username || '').trim().toLowerCase()];
      if (!rec || !checkPassword(password, rec)) { a.n++; loginAttempts.set(ip, a); return send(res, 401, { error: 'Kullanıcı adı veya şifre hatalı.' }); }
      const m = normalizeMaster(db['master/main']);
      const u = m.users.find((x) => x.id === rec.userId);
      if (!u || u.active === false) return send(res, 403, { error: 'Hesabınız pasif. IT yöneticisine başvurun.' });
      loginAttempts.delete(ip);
      const tok = crypto.randomBytes(32).toString('base64url');
      auth.sessions[crypto.createHash('sha256').update(tok).digest('hex')] = { userId: u.id, username: String(username).trim().toLowerCase(), exp: Date.now() + SESSION_DAYS * 86400000 };
      for (const [k, s] of Object.entries(auth.sessions)) if (s.exp < Date.now()) delete auth.sessions[k];
      saveAuth();
      const secure = (req.headers['x-forwarded-proto'] || '').includes('https') ? '; Secure' : '';
      return send(res, 200, { ok: true, user: { id: u.id, name: u.name, role: u.role } }, { 'set-cookie': `crid_session=${tok}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}` });
    }
    if (p === '/api/logout' && req.method === 'POST') {
      const tok = parseCookies(req).crid_session;
      if (tok) { delete auth.sessions[crypto.createHash('sha256').update(tok).digest('hex')]; saveAuth(); }
      return send(res, 200, { ok: true }, { 'set-cookie': 'crid_session=; HttpOnly; Path=/; Max-Age=0' });
    }

    if (p.startsWith('/api/')) {
      const user = sessionUser(req);
      if (!user) return send(res, 401, { error: 'Oturum açmanız gerekiyor.' });

      if (p === '/api/me') return send(res, 200, { user: { id: user.id, name: user.name, role: user.role, username: user.username } });

      if (p === '/api/data' && req.method === 'GET') return send(res, 200, { docs: db });

      if (p === '/api/stream') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
        res.write(': ok\n\n');
        const c = { res, user };
        clients.add(c);
        req.on('close', () => clients.delete(c));
        return;
      }

      const m = /^\/api\/doc\/([^/]+)\/([^/]+)$/.exec(p);
      if (m) {
        const [, col, id] = m.map(decodeURIComponent);
        if (!PATH_RE.test(col) || !PATH_RE.test(id)) return send(res, 400, { error: 'Geçersiz yol' });
        const path = `${col}/${id}`;
        if (req.method === 'GET') return send(res, 200, { doc: db[path] ?? null });
        if (!canWrite(user, path)) return send(res, 403, { error: 'Bu işlem için yetkiniz yok.' });
        if (req.method === 'PUT') {
          const data = await readJson(req);
          if (!data || typeof data !== 'object' || Array.isArray(data)) return send(res, 400, { error: 'Geçersiz belge' });
          if (path === 'master/main') {
            const err = masterChangeAllowed(user, db[path], data);
            if (err) return send(res, 403, { error: err });
          }
          delete data.id;
          db[path] = data; scheduleSave(); broadcast(path, data);
          return send(res, 200, { ok: true });
        }
        if (req.method === 'DELETE') {
          if (path === 'master/main') return send(res, 403, { error: 'Master data silinemez.' });
          delete db[path]; scheduleSave(); broadcast(path, null);
          return send(res, 200, { ok: true });
        }
      }

      if (p === '/api/next-number' && req.method === 'POST') {
        if (user.role === 'readonly') return send(res, 403, { error: 'Bu işlem için yetkiniz yok.' });
        const { kind, year, prefix } = await readJson(req);
        if (!['crid', 'pool'].includes(kind) || !(+year > 1999)) return send(res, 400, { error: 'Geçersiz istek' });
        const col = kind === 'pool' ? 'ideas/' : 'crids/';
        const existing = new Set(Object.entries(db).filter(([k]) => k.startsWith(col)).map(([, v]) => v.no));
        const c = db['meta/counters'] || {};
        const bucket = { ...(c[kind] || {}) };
        let n = (+bucket[year] || 0) + 1;
        const fmt = (k) => `${prefix}-${year}-${String(k).padStart(4, '0')}`;
        while (existing.has(fmt(n))) n++;
        bucket[year] = n;
        db['meta/counters'] = { ...c, [kind]: bucket }; scheduleSave(); broadcast('meta/counters', db['meta/counters']);
        return send(res, 200, { no: fmt(n) });
      }

      if (p === '/api/me/password' && req.method === 'POST') {
        const { current, next } = await readJson(req);
        const rec = auth.users[user.username];
        if (!checkPassword(current, rec)) return send(res, 400, { error: 'Mevcut şifre hatalı.' });
        if (String(next || '').length < 8) return send(res, 400, { error: 'Yeni şifre en az 8 karakter olmalı.' });
        Object.assign(rec, hashPassword(next)); saveAuth();
        return send(res, 200, { ok: true });
      }

      if (p === '/api/accounts' && req.method === 'GET') {
        if (!perms(user).has('users.edit')) return send(res, 403, { error: 'Yetkiniz yok.' });
        return send(res, 200, { accounts: Object.entries(auth.users).map(([username, a]) => ({ username, userId: a.userId })) });
      }
      if (p === '/api/accounts' && req.method === 'POST') {
        if (!perms(user).has('users.edit')) return send(res, 403, { error: 'Yetkiniz yok.' });
        const { userId, username, password } = await readJson(req);
        const uname = String(username || '').trim().toLowerCase();
        if (!/^[a-z0-9._@-]{3,64}$/.test(uname)) return send(res, 400, { error: 'Kullanıcı adı 3–64 karakter olmalı (harf, rakam, . _ - @).' });
        if (String(password || '').length < 8) return send(res, 400, { error: 'Şifre en az 8 karakter olmalı.' });
        const mm = normalizeMaster(db['master/main']);
        if (!mm.users.some((u) => u.id === userId)) return send(res, 400, { error: 'Kullanıcı bulunamadı.' });
        const owner = auth.users[uname];
        if (owner && owner.userId !== userId) return send(res, 409, { error: 'Bu kullanıcı adı başka bir kişiye ait.' });
        for (const [k, a] of Object.entries(auth.users)) if (a.userId === userId && k !== uname) delete auth.users[k];
        auth.users[uname] = { userId, ...hashPassword(password) };
        for (const [k, s] of Object.entries(auth.sessions)) if (s.userId === userId && s.username !== uname) delete auth.sessions[k];
        saveAuth();
        return send(res, 200, { ok: true });
      }
      const del = /^\/api\/accounts\/([^/]+)$/.exec(p);
      if (del && req.method === 'DELETE') {
        if (!perms(user).has('users.edit')) return send(res, 403, { error: 'Yetkiniz yok.' });
        const uname = decodeURIComponent(del[1]);
        if (auth.users[uname]?.userId === user.id) return send(res, 400, { error: 'Kendi girişinizi silemezsiniz.' });
        const uid = auth.users[uname]?.userId;
        delete auth.users[uname];
        for (const [k, s] of Object.entries(auth.sessions)) if (s.userId === uid) delete auth.sessions[k];
        saveAuth();
        return send(res, 200, { ok: true });
      }

      if (p === '/api/upload' && req.method === 'POST') {
        if (user.role === 'readonly') return send(res, 403, { error: 'Bu işlem için yetkiniz yok.' });
        const buf = await readBody(req, 20 * 1024 * 1024);
        const id = crypto.randomBytes(16).toString('hex');
        writeFileSync(join(FILES_DIR, id), buf);
        const meta = { name: decodeURIComponent(String(req.headers['x-file-name'] || 'dosya')), type: String(req.headers['content-type'] || 'application/octet-stream'), size: buf.length };
        writeFileSync(join(FILES_DIR, id + '.json'), JSON.stringify(meta));
        return send(res, 200, { id, url: `/files/${id}`, sizeBytes: buf.length, contentType: meta.type });
      }
      return send(res, 404, { error: 'Bulunamadı' });
    }

    const fm = /^\/files\/([a-f0-9]{32})$/.exec(p);
    if (fm) {
      if (!sessionUser(req)) return send(res, 401, 'Oturum açmanız gerekiyor.');
      const f = join(FILES_DIR, fm[1]);
      if (!existsSync(f)) return send(res, 404, 'Bulunamadı');
      const meta = loadJson(f + '.json', { name: 'dosya', type: 'application/octet-stream' });
      res.writeHead(200, { 'content-type': meta.type, 'content-length': statSync(f).size, 'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(meta.name)}`, 'cache-control': 'private, max-age=3600' });
      return createReadStream(f).pipe(res);
    }

    if (req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' });
      return res.end(getIndex());
    }
    send(res, 405, 'İzin verilmeyen yöntem');
  } catch (e) {
    console.error('[crid] hata', e);
    if (!res.headersSent) send(res, e.status || 500, { error: e.status ? e.message : 'Sunucu hatası' });
  }
});

init();
server.listen(PORT, () => console.log(`[crid] http://localhost:${PORT} (veri: ${DATA_DIR})`));
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { try { flush(); } catch (e) { /* */ } process.exit(0); });
export { PERMISSIONS };
