// Çevrimdışı (tek HTML dosyası) depolama:
//  1) Tarayıcı içi kalıcı depo (IndexedDB) — her zaman
//  2) İsteğe bağlı bağlı veri dosyası (.json) — File System Access API (Chrome/Edge).
//     Her değişiklik dosyaya yazılır; dosyayı başka biri değiştirdiyse belge düzeyinde birleştirilir.
import { emptyPack, mergePacks, isPack, seedToPack, pruneTombstones, FORMAT } from './sync.js';

const DB_NAME = 'crid-offline';
const STORE = 'kv';

function idbOpen() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbGet(key) {
  const db = await idbOpen();
  return new Promise((res, rej) => { const t = db.transaction(STORE).objectStore(STORE).get(key); t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error); });
}
async function idbSet(key, val) {
  const db = await idbOpen();
  return new Promise((res, rej) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(val, key); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
}
async function idbDel(key) {
  const db = await idbOpen();
  return new Promise((res, rej) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete(key); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
}

function strip(d) { const o = { ...d }; delete o.id; return JSON.parse(JSON.stringify(o)); }
const clone = (v) => JSON.parse(JSON.stringify(v));

export const fileApiSupported = () => typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function';

export class OfflineBackend {
  constructor({ seed } = {}) {
    this.kind = 'html';
    this.seed = seed;
    this.pack = emptyPack();
    this.listeners = new Set();
    this.statusListeners = new Set();
    this.handle = null;
    this.file = { status: 'none', name: '', lastSync: 0, error: '' }; // none | ok | needs-permission | error
    this.lastMod = 0;
    this.lastTs = 0;
    this.dirtyFile = false;
    this._idbTimer = null; this._fileTimer = null; this._poll = null;
    this.ready = this._init();
    try { this.bc = new BroadcastChannel('crid-offline'); this.bc.onmessage = () => this._reloadFromIdb(); } catch (e) { this.bc = null; }
  }
  async _init() {
    let stored = null;
    try { stored = await idbGet('pack'); } catch (e) { /* özel pencere vb. */ }
    this.pack = isPack(stored) ? stored : this.seed ? seedToPack(this.seed) : emptyPack();
    if (!isPack(stored)) await this._saveIdb();
    try { this.handle = (await idbGet('fileHandle')) || null; } catch (e) { this.handle = null; }
    if (this.handle) {
      this.file.name = this.handle.name;
      let perm = 'prompt';
      try { perm = await this.handle.queryPermission({ mode: 'readwrite' }); } catch (e) { /* */ }
      if (perm === 'granted') { this._setStatus('ok'); await this.syncWithFile().catch((e) => this._fail(e)); this._startPoll(); }
      else this._setStatus('needs-permission');
    }
    this._emit();
  }
  async _reloadFromIdb() {
    try { const p = await idbGet('pack'); if (isPack(p)) { this.pack = p; this._emit(); } } catch (e) { /* */ }
  }
  _now() { const t = Math.max(Date.now(), this.lastTs + 1); this.lastTs = t; return t; }
  _emit() { for (const l of this.listeners) l(); }
  _setStatus(status, extra = {}) { Object.assign(this.file, { status, ...extra }); for (const l of this.statusListeners) l({ ...this.file }); }
  onStatus(l) { this.statusListeners.add(l); l({ ...this.file }); return () => this.statusListeners.delete(l); }
  _fail(e) { this._setStatus('error', { error: e?.message || String(e) }); }

  async _saveIdb() { try { await idbSet('pack', this.pack); this.bc?.postMessage('changed'); } catch (e) { /* kota */ } }
  _persist() {
    clearTimeout(this._idbTimer);
    this._idbTimer = setTimeout(() => this._saveIdb(), 120);
    if (this.handle && this.file.status === 'ok') {
      this.dirtyFile = true;
      clearTimeout(this._fileTimer);
      this._fileTimer = setTimeout(() => this.syncWithFile().catch((e) => this._fail(e)), 700);
    }
  }
  async flush() { clearTimeout(this._idbTimer); await this._saveIdb(); if (this.handle && this.file.status === 'ok') { clearTimeout(this._fileTimer); await this.syncWithFile(); } }

  /* ---------- belge arayüzü (Store ile uyumlu) ---------- */
  _docs(name) {
    const pre = name + '/';
    return Object.entries(this.pack.docs).filter(([k]) => k.startsWith(pre) && !k.slice(pre.length).includes('/'))
      .map(([k, v]) => ({ ...clone(v), id: k.slice(pre.length) })).sort((a, b) => (a.id < b.id ? -1 : 1));
  }
  listenCollection(name, cb) { const f = () => cb(this._docs(name)); this.listeners.add(f); this.ready.then(f); return () => this.listeners.delete(f); }
  listenDoc(path, cb) {
    const f = () => { const v = this.pack.docs[path]; cb(v ? { ...clone(v), id: path.split('/').pop() } : null); };
    this.listeners.add(f); this.ready.then(f); return () => this.listeners.delete(f);
  }
  async get(path) { await this.ready; const v = this.pack.docs[path]; return v ? { ...clone(v), id: path.split('/').pop() } : null; }
  async set(path, data) { await this.ready; this.pack.docs[path] = strip(data); this.pack.mt[path] = this._now(); delete this.pack.del[path]; this._persist(); queueMicrotask(() => this._emit()); }
  async update(path, data) { await this.ready; const cur = this.pack.docs[path]; if (!cur) { const e = new Error('Belge bulunamadı'); e.code = 'invalid_argument'; throw e; } return this.set(path, { ...cur, ...data }); }
  async remove(path) { await this.ready; delete this.pack.docs[path]; delete this.pack.mt[path]; this.pack.del[path] = this._now(); this._persist(); queueMicrotask(() => this._emit()); }
  async withLock(path, holder, fn) {
    const prev = this._lock || Promise.resolve(); let rel; this._lock = new Promise((r) => { rel = r; });
    await prev; try { return await fn(); } finally { rel(); }
  }
  /** Numara üretmeden önce dosyadaki son durumu alır (ortak dosyada çakışmayı azaltır). */
  async nextNumber(kind, year, prefix) {
    return this.withLock('meta/counters', 'local', async () => {
      if (this.handle && this.file.status === 'ok') await this.syncWithFile().catch(() => {});
      const col = kind === 'pool' ? 'ideas/' : 'crids/';
      const existing = new Set(Object.entries(this.pack.docs).filter(([k]) => k.startsWith(col)).map(([, v]) => v.no));
      const c = this.pack.docs['meta/counters'] || {};
      const bucket = { ...(c[kind] || {}) };
      let n = (+bucket[year] || 0) + 1;
      const fmt = (k) => `${prefix}-${year}-${String(k).padStart(4, '0')}`;
      while (existing.has(fmt(n))) n++;
      bucket[year] = n;
      this.pack.docs['meta/counters'] = { ...c, [kind]: bucket };
      this.pack.mt['meta/counters'] = this._now();
      this._persist();
      if (this.handle && this.file.status === 'ok') { clearTimeout(this._fileTimer); await this.syncWithFile().catch(() => {}); }
      return fmt(n);
    });
  }

  /* ---------- veri dosyası ---------- */
  async _readFile() {
    const f = await this.handle.getFile();
    const text = await f.text();
    let pack = emptyPack();
    if (text.trim()) {
      const j = JSON.parse(text);
      if (!isPack(j)) throw new Error('Seçilen dosya bir CRID veri dosyası değil.');
      pack = j;
    }
    return { pack, mod: f.lastModified };
  }
  async _writeFile(pack) {
    const w = await this.handle.createWritable();
    await w.write(JSON.stringify(pack));
    await w.close();
    const f = await this.handle.getFile();
    this.lastMod = f.lastModified;
  }
  /** Bellekteki veriyi dosyayla birleştirir ve dosyaya yazar. */
  async syncWithFile() {
    if (!this.handle) return;
    const { pack: filePack, mod } = await this._readFile();
    const merged = pruneTombstones(mergePacks(this.pack, filePack));
    const changedFromFile = JSON.stringify(merged.docs) !== JSON.stringify(this.pack.docs);
    const needWrite = this.dirtyFile || JSON.stringify(merged.docs) !== JSON.stringify(filePack.docs) || JSON.stringify(merged.del) !== JSON.stringify(filePack.del || {});
    merged.savedAt = needWrite ? Date.now() : filePack.savedAt || merged.savedAt;
    this.pack = merged;
    if (needWrite) await this._writeFile(merged); else this.lastMod = mod;
    this.dirtyFile = false;
    this._setStatus('ok', { lastSync: Date.now(), error: '' });
    if (changedFromFile) { this._emit(); await this._saveIdb(); }
  }
  _startPoll() {
    clearInterval(this._poll);
    this._poll = setInterval(async () => {
      if (!this.handle || this.file.status !== 'ok' || this.dirtyFile) return;
      try {
        const f = await this.handle.getFile();
        if (f.lastModified !== this.lastMod) await this.syncWithFile();
      } catch (e) { this._fail(e); }
    }, 6000);
  }
  /**
   * Veri dosyası bağlar.
   * mode 'create': bu bilgisayardaki veriyi yeni dosyaya yazar.
   * mode 'open-replace': dosyadaki veriyi kullanır (bu bilgisayardaki veri dosyayla değiştirilir).
   * mode 'open-merge': iki tarafı birleştirir.
   */
  async connect(handle, mode) {
    const perm = await handle.requestPermission?.({ mode: 'readwrite' }) ?? 'granted';
    if (perm !== 'granted') throw new Error('Dosyaya yazma izni verilmedi.');
    this.handle = handle;
    this.file.name = handle.name;
    if (mode === 'create') {
      this.pack.savedAt = Date.now();
      await this._writeFile(this.pack);
    } else {
      const { pack } = await this._readFile();
      if (mode === 'open-replace') { this.pack = pack.docs && Object.keys(pack.docs).length ? pack : this.pack; }
      this.dirtyFile = mode === 'open-merge';
      await this.syncWithFile();
    }
    try { await idbSet('fileHandle', handle); } catch (e) { /* bazı tarayıcılar tutamaz */ }
    this._setStatus('ok', { lastSync: Date.now(), error: '' });
    this._startPoll();
    await this._saveIdb();
    this._emit();
  }
  /** Sayfa yeniden açıldıktan sonra kullanıcı tıklamasıyla dosya iznini yeniler. */
  async reauthorize() {
    if (!this.handle) return;
    const perm = await this.handle.requestPermission({ mode: 'readwrite' });
    if (perm !== 'granted') throw new Error('Dosyaya erişim izni verilmedi.');
    this._setStatus('ok');
    await this.syncWithFile();
    this._startPoll();
  }
  async disconnect() {
    clearInterval(this._poll);
    if (this.handle && this.file.status === 'ok') await this.syncWithFile().catch(() => {});
    this.handle = null;
    try { await idbDel('fileHandle'); } catch (e) { /* */ }
    this._setStatus('none', { name: '', error: '' });
  }

  /* ---------- yedek ---------- */
  exportPack() { return JSON.stringify({ ...this.pack, savedAt: Date.now() }, null, 0); }
  async importPack(text, mode) {
    const j = JSON.parse(text);
    if (!isPack(j)) throw new Error('Dosya bir CRID yedeği değil.');
    if (mode === 'replace') {
      // dosyadaki her belgeyi şimdiki zamanla işaretle ki ortak dosyada da kazansın
      const now = this._now();
      const next = emptyPack();
      for (const [p, d] of Object.entries(j.docs)) { next.docs[p] = d; next.mt[p] = now; }
      for (const p of Object.keys(this.pack.docs)) if (!(p in next.docs)) next.del[p] = now;
      this.pack = next;
    } else {
      this.pack = mergePacks(this.pack, j);
    }
    this.dirtyFile = true;
    this._persist();
    this._emit();
  }
  /** Tüm yerel veriyi siler ve isteğe bağlı olarak örnek veriyle yeniden başlar. */
  async reset(withSample) {
    const now = this._now();
    const next = withSample && this.seed ? seedToPack(this.seed, now) : emptyPack();
    for (const p of Object.keys(this.pack.docs)) if (!(p in next.docs)) next.del[p] = now;
    this.pack = next;
    this.dirtyFile = true;
    this._persist();
    this._emit();
  }
  stats() {
    const json = JSON.stringify(this.pack);
    return { docs: Object.keys(this.pack.docs).length, bytes: json.length, format: FORMAT };
  }
}
