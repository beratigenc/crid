// İki depolama arka ucu, aynı arayüz:
//  - ClaudeBackend: claude.ai artifact `db` yeteneği (paylaşılan, kalıcı, canlı)
//  - LocalBackend : tarayıcı içi (demo/önizleme/test) — localStorage'a yazar
//
// Arayüz:
//   listenCollection(name, cb(docs[]), onError) -> unsubscribe
//   listenDoc(path, cb(doc|null), onError) -> unsubscribe
//   set(path, data)  update(path, data)  remove(path)  get(path)
//   withLock(path, holder, fn)  — kısa kilit (sıra numarası üretimi için)

export class ClaudeBackend {
  constructor(db) { this.db = db; this.kind = 'claude'; }
  listenCollection(name, cb, onError) {
    return this.db.collection(name).onSnapshot(
      (snap) => cb(snap.docs.filter((d) => d.exists).map((d) => ({ ...d.data(), id: d.id }))),
      (e) => onError && onError(e),
    );
  }
  listenDoc(path, cb, onError) {
    return this.db.doc(path).onSnapshot((d) => cb(d.exists ? { ...d.data(), id: d.id } : null), (e) => onError && onError(e));
  }
  async get(path) { const d = await this.db.doc(path).get(); return d.exists ? { ...d.data(), id: d.id } : null; }
  async set(path, data) { return retryOnce(() => this.db.doc(path).set(strip(data))); }
  async update(path, data) { return retryOnce(() => this.db.doc(path).update(strip(data))); }
  async remove(path) { return retryOnce(() => this.db.doc(path).delete()); }
  async withLock(path, holder, fn) {
    const ref = this.db.doc(path);
    for (let attempt = 0; attempt < 12; attempt++) {
      let res;
      try { res = await ref.acquire({ holder, ttlMs: 5000 }); } catch (e) { res = { acquired: true, noLease: true }; }
      if (res.acquired) return fn();
      await sleep(250 + Math.random() * 400);
    }
    throw new Error('Numara üretimi için kilit alınamadı. Lütfen tekrar deneyin.');
  }
}

function strip(data) {
  const o = { ...data };
  delete o.id;
  return JSON.parse(JSON.stringify(o));
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function retryOnce(fn) {
  try { return await fn(); } catch (e) {
    if (e && e.code === 'unavailable') { await sleep(300 + Math.random() * 500); return fn(); }
    throw e;
  }
}

const LS_KEY = 'crid-local-db-v1';

export class LocalBackend {
  constructor({ seed, persist = true, storageKey = LS_KEY } = {}) {
    this.kind = 'local';
    this.persist = persist;
    this.key = storageKey;
    this.data = null;
    this.listeners = new Set();
    try { const raw = persist ? localStorage.getItem(this.key) : null; if (raw) this.data = JSON.parse(raw); } catch (e) { this.data = null; }
    if (!this.data) {
      this.data = {};
      if (seed) this.loadSeed(seed);
    }
  }
  loadSeed(seed) {
    const d = {};
    d['master/main'] = seed.master;
    d['meta/counters'] = seed.counters;
    for (const p of seed.plans) d[`plans/${p.id}`] = p;
    for (const c of seed.crids) d[`crids/${c.id}`] = c;
    for (const s of seed.subs) d[`subs/${s.id}`] = s;
    for (const i of seed.ideas) d[`ideas/${i.id}`] = i;
    this.data = d;
    this._save();
  }
  reset(seed) { this.data = {}; if (seed) this.loadSeed(seed); else this._save(); this._emit(); }
  _save() { if (!this.persist) return; try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch (e) { /* kota */ } }
  _emit() { for (const l of this.listeners) l(); }
  _docs(name) {
    const pre = name + '/';
    return Object.entries(this.data).filter(([k]) => k.startsWith(pre) && !k.slice(pre.length).includes('/')).map(([k, v]) => ({ ...JSON.parse(JSON.stringify(v)), id: k.slice(pre.length) }))
      .sort((a, b) => (a.id < b.id ? -1 : 1));
  }
  listenCollection(name, cb) {
    const fire = () => cb(this._docs(name));
    this.listeners.add(fire);
    setTimeout(fire, 0);
    return () => this.listeners.delete(fire);
  }
  listenDoc(path, cb) {
    const fire = () => { const v = this.data[path]; cb(v ? { ...JSON.parse(JSON.stringify(v)), id: path.split('/').pop() } : null); };
    this.listeners.add(fire);
    setTimeout(fire, 0);
    return () => this.listeners.delete(fire);
  }
  async get(path) { const v = this.data[path]; return v ? { ...JSON.parse(JSON.stringify(v)), id: path.split('/').pop() } : null; }
  async set(path, data) { this.data[path] = strip(data); this._save(); queueMicrotask(() => this._emit()); }
  async update(path, data) {
    if (!this.data[path]) { const e = new Error('Belge bulunamadı'); e.code = 'invalid_argument'; throw e; }
    this.data[path] = { ...this.data[path], ...strip(data) }; this._save(); queueMicrotask(() => this._emit());
  }
  async remove(path) { delete this.data[path]; this._save(); queueMicrotask(() => this._emit()); }
  async withLock(path, holder, fn) {
    const prev = this._lock || Promise.resolve();
    let release;
    this._lock = new Promise((r) => { release = r; });
    await prev;
    try { return await fn(); } finally { release(); }
  }
}

/**
 * Railway / kendi sunucunuz: REST + Server-Sent Events.
 * Tüm veriyi açılışta çeker, değişiklikleri canlı dinler.
 */
export class HttpBackend {
  constructor(base = '') {
    this.kind = 'server';
    this.base = base;
    this.data = {};
    this.listeners = new Set();
    this.ready = this._load();
    this.onAuthLost = null;
  }
  async _req(method, path, body) {
    const r = await fetch(this.base + path, { method, headers: body !== undefined ? { 'content-type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
    let j = {};
    try { j = await r.json(); } catch (e) { /* */ }
    if (r.status === 401 && this.onAuthLost) this.onAuthLost();
    if (!r.ok) { const e = new Error(j.error || `Sunucu hatası (${r.status})`); e.code = r.status === 403 ? 'forbidden' : r.status === 401 ? 'unauthenticated' : 'server'; e.status = r.status; throw e; }
    return j;
  }
  async _load() {
    const j = await this._req('GET', '/api/data');
    this.data = j.docs || {};
    this._emit();
    this._connect();
  }
  _connect() {
    try {
      this.es = new EventSource(this.base + '/api/stream');
      this.es.onmessage = (ev) => {
        try { const { path, data } = JSON.parse(ev.data); if (data === null) delete this.data[path]; else this.data[path] = data; this._emit(); } catch (e) { /* */ }
      };
      this.es.onerror = () => {
        // bağlantı koptuysa tüm veriyi yeniden çek
        if (this.es.readyState === 2) setTimeout(() => this._load().catch(() => {}), 3000);
      };
    } catch (e) { /* */ }
  }
  _emit() { for (const l of this.listeners) l(); }
  _docs(name) {
    const pre = name + '/';
    return Object.entries(this.data).filter(([k]) => k.startsWith(pre) && !k.slice(pre.length).includes('/')).map(([k, v]) => ({ ...JSON.parse(JSON.stringify(v)), id: k.slice(pre.length) })).sort((a, b) => (a.id < b.id ? -1 : 1));
  }
  listenCollection(name, cb) {
    const fire = () => cb(this._docs(name));
    this.listeners.add(fire);
    this.ready.then(fire, () => {});
    return () => this.listeners.delete(fire);
  }
  listenDoc(path, cb) {
    const fire = () => { const v = this.data[path]; cb(v ? { ...JSON.parse(JSON.stringify(v)), id: path.split('/').pop() } : null); };
    this.listeners.add(fire);
    this.ready.then(fire, () => {});
    return () => this.listeners.delete(fire);
  }
  async get(path) { const v = this.data[path]; return v ? { ...JSON.parse(JSON.stringify(v)), id: path.split('/').pop() } : null; }
  async set(path, data) {
    const [col, id] = path.split('/');
    const body = strip(data);
    await this._req('PUT', `/api/doc/${encodeURIComponent(col)}/${encodeURIComponent(id)}`, body);
    this.data[path] = body; this._emit();
  }
  async update(path, data) { const cur = this.data[path]; if (!cur) { const e = new Error('Belge bulunamadı'); e.code = 'invalid_argument'; throw e; } return this.set(path, { ...cur, ...data }); }
  async remove(path) {
    const [col, id] = path.split('/');
    await this._req('DELETE', `/api/doc/${encodeURIComponent(col)}/${encodeURIComponent(id)}`);
    delete this.data[path]; this._emit();
  }
  async withLock(path, holder, fn) { return fn(); }
  async nextNumber(kind, year, prefix) { return (await this._req('POST', '/api/next-number', { kind, year, prefix })).no; }
}
