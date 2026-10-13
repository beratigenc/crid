// Uygulama durumu + iş işlemleri (kaydet, numara üret, dönüştür, dondur, teyit, audit).
import { normalizeMaster, defaultMaster } from '../logic/defaults.js';
import { appendHistory, diffRecords, formatNo, formatSubNo, poolToCrid, autoAdvanceStatus, freezeSubsIfNeeded, validateFinConfirm } from '../logic/rules.js';
import { cridYearFinancials, fromBase } from '../logic/calc.js';
import { uid, clone, todayISO, yearOf, now } from '../logic/util.js';

export class Store {
  constructor(backend) {
    this.backend = backend;
    this.state = {
      ready: false, loaded: {}, master: normalizeMaster(defaultMaster()), masterExists: false,
      ideas: [], crids: [], subs: [], plans: [], people: [], counters: null, error: null,
    };
    this.listeners = new Set();
    this.unsubs = [];
    this.user = null; // { id, name, role, ... }
    this._derived = null;
  }
  subscribe(l) { this.listeners.add(l); return () => this.listeners.delete(l); }
  getState() { return this.state; }
  _set(patch) {
    this.state = { ...this.state, ...patch };
    this._derived = null;
    for (const l of this.listeners) l();
  }
  setUser(u) { this.user = u; }

  start() {
    const need = ['master', 'ideas', 'crids', 'subs', 'plans', 'people'];
    const mark = (k) => {
      const loaded = { ...this.state.loaded, [k]: true };
      this._set({ loaded, ready: need.every((n) => loaded[n]) });
    };
    const err = (e) => this._set({ error: e?.message || String(e) });
    this.unsubs.push(this.backend.listenDoc('master/main', (d) => { this._set({ master: normalizeMaster(d || defaultMaster()), masterExists: !!d }); mark('master'); }, err));
    this.unsubs.push(this.backend.listenDoc('meta/counters', (d) => this._set({ counters: d }), err));
    for (const k of ['ideas', 'crids', 'subs', 'plans', 'people']) {
      this.unsubs.push(this.backend.listenCollection(k, (docs) => { this._set({ [k]: docs }); mark(k); }, err));
    }
  }
  stop() { for (const u of this.unsubs) try { u(); } catch (e) { /* */ } this.unsubs = []; }

  /** Türetilmiş indeksler (her değişimde bir kez hesaplanır). */
  derived() {
    if (this._derived) return this._derived;
    const s = this.state;
    const plans = new Map(s.plans.map((p) => [p.id, p]));
    const subsByCrid = new Map();
    for (const x of s.subs) { if (!subsByCrid.has(x.cridId)) subsByCrid.set(x.cridId, []); subsByCrid.get(x.cridId).push(x); }
    for (const arr of subsByCrid.values()) arr.sort((a, b) => (a.seq || 0) - (b.seq || 0));
    const cridById = new Map(s.crids.map((c) => [c.id, c]));
    const ideaById = new Map(s.ideas.map((i) => [i.id, i]));
    this._derived = { plans, subsByCrid, cridById, ideaById, ctx: { master: s.master, plans, subsByCrid } };
    return this._derived;
  }

  _meta() { return { by: this.user?.id || 'anonim', at: now().toISOString() }; }

  _historyEntry(action, changes, note) {
    const m = this._meta();
    return { at: m.at, by: m.by, byName: this.user?.name || '', action, changes: (changes || []).slice(0, 40), note: note || '' };
  }

  /* -------- Numaralandırma -------- */
  async nextNumber(kind, year) {
    const m = this.state.master;
    const prefix = kind === 'pool' ? m.settings.poolPrefix || 'FH' : m.settings.cridPrefix || 'CRID';
    if (typeof this.backend.nextNumber === 'function') return this.backend.nextNumber(kind, year, prefix);
    const existing = new Set((kind === 'pool' ? this.state.ideas : this.state.crids).map((x) => x.no));
    const prev = this._numLock || Promise.resolve();
    let release;
    this._numLock = new Promise((r) => { release = r; });
    await prev.catch(() => {});
    try {
    return await this.backend.withLock('meta/counters', this.user?.id || uid('h'), async () => {
      const cur = (await this.backend.get('meta/counters')) || {};
      const bucket = { ...(cur[kind] || {}) };
      let n = (+bucket[year] || 0) + 1;
      // benzersizlik garantisi: mevcut numaralarla çakışma varsa atla
      while (existing.has(formatNo(prefix, year, n))) n++;
      bucket[year] = n;
      const next = { ...cur, [kind]: bucket };
      delete next.id;
      await this.backend.set('meta/counters', next);
      return formatNo(prefix, year, n);
    });
    } finally { release(); }
  }

  /* -------- Master data -------- */
  async saveMaster(next, note) {
    const before = this.state.master;
    const changes = diffRecords({ ...before, history: undefined }, { ...next, history: undefined }).map((c) => ({ ...c, from: short(c.from), to: short(c.to) }));
    const rec = { ...clone(next), history: appendHistory(before, this._historyEntry('master', changes, note), 200) };
    await this.backend.set('master/main', rec);
    this._set({ master: normalizeMaster(rec), masterExists: true });
  }

  async ensureMaster() {
    if (!this.state.masterExists) await this.backend.set('master/main', defaultMaster());
  }

  /* -------- Kişiler (claude.ai kullanıcı kaydı) -------- */
  async registerPerson(id, name) {
    if (!id) return;
    const ex = this.state.people.find((p) => p.id === id);
    const today = todayISO();
    if (ex && ex.name === name && ex.lastSeen === today) return;
    await this.backend.set(`people/${id}`, { name: name || ex?.name || '', firstSeen: ex?.firstSeen || today, lastSeen: today });
  }

  /* -------- Fikir Havuzu -------- */
  async saveIdea(idea) {
    const m = this._meta();
    if (!idea.id) {
      const year = now().getFullYear();
      const no = await this.nextNumber('pool', year);
      const rec = { ...clone(idea), id: uid('idea-'), no, createdAt: m.at, createdBy: m.by, updatedAt: m.at, updatedBy: m.by };
      rec.history = [this._historyEntry('create', [], 'Fikir havuzuna eklendi')];
      await this.backend.set(`ideas/${rec.id}`, rec);
      return rec;
    }
    const before = this.state.ideas.find((i) => i.id === idea.id);
    const changes = diffRecords(before, idea);
    if (!changes.length) return before;
    const rec = { ...clone(idea), updatedAt: m.at, updatedBy: m.by };
    rec.history = appendHistory(before || {}, this._historyEntry('update', changes));
    await this.backend.set(`ideas/${rec.id}`, rec);
    return rec;
  }
  async deleteIdea(id) { await this.backend.remove(`ideas/${id}`); }

  /** "CRID'e Dönüştür": benzersiz numara üretir, havuz bilgisini aktarır, kaynak ilişkisini korur. */
  async convertIdea(ideaId) {
    const idea = this.state.ideas.find((i) => i.id === ideaId);
    if (!idea) throw new Error('Fikir bulunamadı.');
    if (idea.maturity === 'converted' && idea.convertedCridId) throw new Error('Bu fikir zaten CRID\'e dönüştürülmüş.');
    const m = this._meta();
    const year = idea.estSop ? +idea.estSop.slice(0, 4) : now().getFullYear();
    const no = await this.nextNumber('crid', year);
    const id = uid('crid-');
    const crid = poolToCrid(idea, { no, id, userId: this.user?.id, master: this.state.master });
    crid.createdAt = m.at; crid.createdBy = m.by; crid.updatedAt = m.at; crid.updatedBy = m.by;
    crid.history = [this._historyEntry('convert', [], `${idea.no} numaralı havuz fikrinden dönüştürüldü`)];
    await this.backend.set(`crids/${id}`, crid);
    const upd = { ...clone(idea), maturity: 'converted', convertedCridId: id, convertedCridNo: no, updatedAt: m.at, updatedBy: m.by };
    upd.history = appendHistory(idea, this._historyEntry('convert', [{ field: 'maturity', label: 'Olgunluk', from: idea.maturity, to: 'converted' }], `${no} oluşturuldu`));
    await this.backend.set(`ideas/${idea.id}`, upd);
    return crid;
  }

  /* -------- CRID -------- */
  async saveCrid(crid, { note } = {}) {
    const m = this._meta();
    const master = this.state.master;
    let rec = clone(crid);
    if (master.settings.autoStatus !== false) rec.status = autoAdvanceStatus(rec);
    if (!rec.id) {
      const year = rec.ms?.sopTarget ? yearOf(rec.ms.sopTarget) : now().getFullYear();
      rec.no = await this.nextNumber('crid', year);
      rec.id = uid('crid-');
      rec.createdAt = m.at; rec.createdBy = m.by; rec.updatedAt = m.at; rec.updatedBy = m.by;
      rec.history = [this._historyEntry('create', [], note || 'CRID oluşturuldu')];
      await this.backend.set(`crids/${rec.id}`, rec);
      return rec;
    }
    const before = this.state.crids.find((c) => c.id === rec.id);
    const changes = diffRecords(before, rec);
    if (!changes.length) return before;
    rec.updatedAt = m.at; rec.updatedBy = m.by;
    rec.history = appendHistory(before || {}, this._historyEntry('update', changes, note));
    await this.backend.set(`crids/${rec.id}`, rec);
    // Devreye giriş gerçekleştiyse Add/Delete listesini finansal olarak dondur
    const subs = this.derived().subsByCrid.get(rec.id) || [];
    const frozen = freezeSubsIfNeeded(rec, subs, master, m.by);
    for (const s of frozen) {
      s.history = appendHistory(s, this._historyEntry('freeze', [], `Devreye giriş (${rec.ms.sopActual}) ile finansal olarak donduruldu`));
      await this.backend.set(`subs/${s.id}`, s);
    }
    return rec;
  }

  async confirmFinance(crid, { status, amount, note, date }) {
    const rec = clone(crid);
    if (status === 'confirmed') {
      const err = validateFinConfirm(rec);
      if (err) throw new Error(err);
    }
    rec.fin = { ...(rec.fin || {}), status, note: note ?? rec.fin?.note ?? '' };
    if (status === 'confirmed') {
      rec.fin.date = date || todayISO();
      rec.fin.by = this.user?.id || '';
      rec.fin.confirmedAmount = amount;
    } else if (status === 'checked') {
      rec.fin.checkedDate = date || todayISO();
      rec.fin.checkedBy = this.user?.id || '';
    } else if (status === 'revision' || status === 'pending') {
      rec.fin.date = ''; rec.fin.by = ''; rec.fin.confirmedAmount = '';
    }
    return this.saveCrid(rec, { note: `Finansal kontrol: ${status}` });
  }

  /** Hesaplanan gerçekleşen faydayı varsayılan teyit tutarı olarak verir (CRID para biriminde). */
  suggestedConfirmAmount(crid) {
    const { ctx } = this.derived();
    const y = crid.ms?.sopActual ? yearOf(crid.ms.sopActual) : this.state.master.settings.reportYear;
    const f = cridYearFinancials(crid, ctx, y);
    return Math.round(fromBase(f.realizedBase, crid.currency || this.state.master.baseCurrency, this.state.master) * 100) / 100;
  }

  /* -------- Alt detay -------- */
  async saveSub(sub, crid) {
    const m = this._meta();
    const rec = clone(sub);
    if (!rec.id) {
      const existing = this.derived().subsByCrid.get(crid.id) || [];
      const seq = existing.reduce((a, s) => Math.max(a, s.seq || 0), 0) + 1;
      rec.id = `${crid.id}-s${seq}-${uid().slice(-4)}`;
      rec.seq = seq; rec.no = formatSubNo(crid.no, seq); rec.cridId = crid.id;
      rec.createdAt = m.at; rec.createdBy = m.by; rec.updatedAt = m.at; rec.updatedBy = m.by;
      rec.history = [this._historyEntry('create', [], 'Alt detay eklendi (Add)')];
    } else {
      const before = this.state.subs.find((s) => s.id === rec.id);
      const changes = diffRecords(before, rec);
      if (!changes.length) return before;
      rec.updatedAt = m.at; rec.updatedBy = m.by;
      rec.history = appendHistory(before || {}, this._historyEntry('update', changes));
    }
    await this.backend.set(`subs/${rec.id}`, rec);
    await this._touchCrid(crid.id, rec.history[rec.history.length - 1].action === 'create' ? `Alt detay eklendi: ${rec.no}` : `Alt detay güncellendi: ${rec.no}`);
    return rec;
  }
  async deleteSub(sub) {
    await this.backend.remove(`subs/${sub.id}`);
    await this._touchCrid(sub.cridId, `Alt detay silindi (Delete): ${sub.no} ${sub.partNo || ''}`.trim());
  }
  async unfreezeSub(sub) {
    const rec = clone(sub);
    const was = rec.frozen;
    rec.frozen = null;
    rec.history = appendHistory(sub, this._historyEntry('unfreeze', [{ field: 'frozen', label: 'Finansal Dondurma', from: was?.at || '', to: '' }], 'Dondurma kaldırıldı'));
    await this.backend.set(`subs/${rec.id}`, rec);
    await this._touchCrid(sub.cridId, `Alt detay dondurması kaldırıldı: ${sub.no}`);
  }
  async _touchCrid(cridId, note) {
    const c = this.state.crids.find((x) => x.id === cridId);
    if (!c) return;
    const m = this._meta();
    const rec = { ...clone(c), updatedAt: m.at, updatedBy: m.by, history: appendHistory(c, this._historyEntry('sub', [], note)) };
    await this.backend.set(`crids/${c.id}`, rec);
  }

  /* -------- Üretim planı / bütçe -------- */
  async savePlan(plan, note) {
    const m = this._meta();
    const before = this.state.plans.find((p) => p.id === plan.id);
    const changes = diffRecords(before || {}, plan).filter((c) => !['year', 'vehicleId'].includes(c.field)).map((c) => ({ ...c, from: short(c.from), to: short(c.to) }));
    const rec = { ...clone(plan), updatedAt: m.at, updatedBy: m.by };
    rec.history = appendHistory(before || {}, this._historyEntry(before ? 'update' : 'create', changes, note), 100);
    await this.backend.set(`plans/${rec.id}`, rec);
    return rec;
  }

  /* -------- Toplu içe aktarma (SAP yerine şablon) -------- */
  async bulkSet(collection, docs) {
    for (const d of docs) await this.backend.set(`${collection}/${d.id}`, d);
  }

  /** Örnek veriyi temizler (sample: true olan kayıtlar). */
  async removeSampleData() {
    for (const c of this.state.crids.filter((x) => x.sample)) await this.backend.remove(`crids/${c.id}`);
    for (const s of this.state.subs.filter((x) => x.sample)) await this.backend.remove(`subs/${s.id}`);
    for (const i of this.state.ideas.filter((x) => x.sample)) await this.backend.remove(`ideas/${i.id}`);
    for (const p of this.state.plans.filter((x) => x.sample)) await this.backend.remove(`plans/${p.id}`);
    const m = clone(this.state.master);
    m.users = m.users.filter((u) => !u.sample);
    await this.saveMaster(m, 'Örnek kullanıcılar kaldırıldı');
  }

  /** Boş bir veritabanına örnek veriyi yükler. */
  async loadSeed(seed) {
    await this.backend.set('master/main', { ...seed.master, users: [...(this.state.master.users || []).filter((u) => !u.sample), ...seed.master.users] });
    await this.backend.set('meta/counters', seed.counters);
    for (const p of seed.plans) await this.backend.set(`plans/${p.id}`, p);
    for (const c of seed.crids) await this.backend.set(`crids/${c.id}`, c);
    for (const s of seed.subs) await this.backend.set(`subs/${s.id}`, s);
    for (const i of seed.ideas) await this.backend.set(`ideas/${i.id}`, i);
  }
}

function short(v) {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return s.length > 140 ? s.slice(0, 137) + '…' : s;
}
