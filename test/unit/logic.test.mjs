import test from 'node:test';
import assert from 'node:assert/strict';
import { setNow, num, fmtMoney, monthKey } from '../../src/logic/util.js';
import * as C from '../../src/logic/calc.js';
import * as R from '../../src/logic/rules.js';
import * as F from '../../src/logic/filters.js';
import { defaultMaster, normalizeMaster, DEFAULT_PERMISSION_MATRIX } from '../../src/logic/defaults.js';
import { buildSeed } from '../../src/logic/seed.js';
import { buildXlsx, buildCsv, parseCsv, excelDateToISO } from '../../src/logic/xlsx.js';
import { LocalBackend } from '../../src/store/backends.js';
import { Store } from '../../src/store/store.js';

setNow('2026-10-13T10:00:00');

function master() {
  const m = defaultMaster();
  m.vehicles = [{ id: 'v1', name: 'A', cost: 100000 }, { id: 'v2', name: 'B', cost: 50000 }];
  return normalizeMaster(m);
}
function plans() {
  return new Map([
    ['2026_v1', { id: '2026_v1', year: 2026, vehicleId: 'v1', planned: new Array(12).fill(100), actual: [90, 90, 90, 90, 90, 90, 90, 90, 90, null, null, null], targetPerUnit: 500 }],
    ['2026_v2', { id: '2026_v2', year: 2026, vehicleId: 'v2', planned: new Array(12).fill(10), actual: [], targetPerUnit: 100 }],
  ]);
}

test('sayı ayrıştırma TR/EN biçimleri', () => {
  assert.equal(num('1.234,56'), 1234.56);
  assert.equal(num('1,234.56'), 1234.56);
  assert.equal(num('12,5'), 12.5);
  assert.equal(num(''), 0);
  assert.equal(num('abc'), 0);
  assert.equal(monthKey('2027-09-15'), '2027-09');
  assert.match(fmtMoney(1500, 'EUR'), /€ 1\.500/);
});

test('kur dönüşümü ve iptal/ilave satır değeri', () => {
  const m = master();
  assert.equal(C.toBase(100, 'USD', m), 85.1);
  assert.equal(C.toBase(100, 'EUR', m), 100);
  // referans görsel 5: 2237,6 € iptal, 1070,5 USD ilave → ~1326 €
  const sub = { del: { qty: 1, price: 2237.6, currency: 'EUR', ratio: 1 }, add: { qty: 1, price: 1070.5, currency: 'USD', ratio: 1 }, impactMode: 'lines' };
  assert.ok(Math.abs(C.subLiveImpactBase(sub, m) - (2237.6 - 1070.5 * 0.851)) < 1e-9);
  // oran ve adet
  const s2 = { del: { qty: 4, price: 330, currency: 'EUR', ratio: 0.02 }, add: { qty: 4, price: 200, currency: 'EUR', ratio: 0.02 } };
  assert.ok(Math.abs(C.subLiveImpactBase(s2, m) - 10.4) < 1e-9);
  // manuel etki
  assert.equal(C.subLiveImpactBase({ impactMode: 'manual', manualImpact: 1000, manualCurrency: 'TRY' }, m), 21.5);
});

test('dondurulmuş alt detay fiyat/kur değişiminden etkilenmez', () => {
  const m = master();
  const sub = { del: { qty: 1, price: 100, currency: 'USD' }, add: { qty: 1, price: 50, currency: 'USD' }, status: 'open' };
  const fz = C.freezeSub(sub, m, '2026-05-01', 'u1');
  assert.ok(Math.abs(fz.frozen.unitImpactBase - 42.55) < 1e-9);
  const m2 = normalizeMaster({ ...m, currencies: [{ code: 'EUR', rate: 1 }, { code: 'USD', rate: 2 }] });
  assert.equal(C.subLiveImpactBase(fz, m2), 100);
  assert.ok(Math.abs(C.subUnitImpactBase(fz, m2) - 42.55) < 1e-9);
  fz.del.price = 999;
  assert.ok(Math.abs(C.subUnitImpactBase(fz, m2) - 42.55) < 1e-9);
});

test('CRID birim faydası: manuel ve alt detaylardan, araç bazında', () => {
  const m = master();
  const crid = { id: 'c', targetVehicleIds: ['v1', 'v2'], unitMode: 'manual', unitBenefit: 100, currency: 'USD' };
  assert.deepEqual(C.cridUnitByVehicle(crid, [], m), { v1: 85.1, v2: 85.1 });
  crid.unitMode = 'subs';
  const subs = [
    { status: 'open', impactMode: 'manual', manualImpact: 10, manualCurrency: 'EUR', vehicleIds: [] },
    { status: 'open', impactMode: 'manual', manualImpact: 5, manualCurrency: 'EUR', vehicleIds: ['v2'] },
    { status: 'cancel', impactMode: 'manual', manualImpact: 1000, manualCurrency: 'EUR', vehicleIds: [] },
  ];
  assert.deepEqual(C.cridUnitByVehicle(crid, subs, m), { v1: 10, v2: 15 });
});

test('yıllık hedef/gerçekleşen fayda hacimle ilişkilendirilir, ayrı tutulur', () => {
  const m = master();
  const ctx = { master: m, plans: plans(), subsByCrid: new Map() };
  const crid = { id: 'c', status: 'live', targetVehicleIds: ['v1'], unitMode: 'manual', unitBenefit: 10, currency: 'EUR', ms: { sopTarget: '2026-07-01', sopActual: '2026-08-15' } };
  const f = C.cridYearFinancials(crid, ctx, 2026);
  assert.equal(f.plannedBase, 10 * 600); // Tem–Ara plan
  assert.equal(f.forecastBase, 10 * 500); // Ağu–Ara
  // gerçekleşen: Ağu 90 + Eyl 90 + Eki (içinde bulunulan ay, plan geri dönüşü) 100
  assert.equal(f.realizedBase, 10 * 280);
  assert.equal(f.potentialBase, 10 * 1200);
  // başka yıl için fayda yok
  assert.equal(C.cridYearFinancials(crid, ctx, 2027).plannedBase, 0);
  // geri dönüş kapalıyken yalnız girilen gerçekleşen hacim
  const m2 = normalizeMaster({ ...m, settings: { ...m.settings, realizedUsePlanFallback: false } });
  assert.equal(C.cridYearFinancials(crid, { ...ctx, master: m2 }, 2026).realizedBase, 10 * 180);
  // manuel düzeltmeler
  const ov = { ...crid, annualTargetOverride: 5000, realizedOverride: 1234 };
  const f2 = C.cridYearFinancials(ov, ctx, 2026);
  assert.equal(f2.plannedBase, 5000);
  assert.equal(f2.realizedBase, 1234);
  assert.ok(f2.plannedOverride && f2.realizedOverride);
  // iptal kayıt faydasız
  assert.equal(C.cridYearFinancials({ ...crid, status: 'cancelled' }, ctx, 2026).realizedBase, 0);
  // teyit
  const fc = C.cridYearFinancials({ ...crid, fin: { status: 'confirmed', confirmedAmount: 2000 } }, ctx, 2026);
  assert.equal(fc.confirmedBase, 2000);
});

test('ağırlıklı fayda olasılıkla çarpılır, devreye girmişse tam', () => {
  const ctx = { master: master(), plans: plans(), subsByCrid: new Map() };
  const c = { id: 'c', status: 'progress', targetVehicleIds: ['v1'], unitMode: 'manual', unitBenefit: 10, currency: 'EUR', probability: 25, ms: { sopTarget: '2026-11-01' } };
  const f = C.cridYearFinancials(c, ctx, 2026);
  assert.equal(f.forecastBase, 2000);
  assert.equal(f.weightedBase, 500);
});

test('milestone otomatik On-time / Gecikmiş', () => {
  assert.equal(C.msStatus('2026-10-01', '2026-09-30', false, '2026-10-13'), 'done_ontime');
  assert.equal(C.msStatus('2026-10-01', '2026-10-05', false, '2026-10-13'), 'done_late');
  assert.equal(C.msStatus('2026-10-01', '', false, '2026-10-13'), 'overdue');
  assert.equal(C.msStatus('2026-10-20', '', false, '2026-10-13', 14), 'upcoming');
  assert.equal(C.msStatus('2026-12-20', '', false, '2026-10-13', 14), 'planned');
  assert.equal(C.msStatus('', '', false), 'none');
  assert.equal(C.msStatus('2026-01-01', '', true), 'na');
  assert.equal(C.msDelayDays('2026-10-01', '', '2026-10-13'), 12);
  const crid = { status: 'progress', ms: { releaseTarget: '2026-09-01', sopTarget: '2026-12-01' } };
  assert.equal(C.effectiveStatus(crid, '2026-10-13'), 'delayed');
  assert.equal(C.effectiveStatus({ ...crid, ms: { ...crid.ms, releaseActual: '2026-09-05' } }, '2026-10-13'), 'progress');
  assert.equal(C.effectiveStatus({ ...crid, status: 'cancelled' }, '2026-10-13'), 'cancelled');
});

test('iş kuralları: statü geçişleri', () => {
  const base = { ms: {}, fin: { status: 'pending' } };
  assert.match(R.validateStatusChange(base, 'live'), /Devreye Giriş Gerçekleşme/);
  assert.match(R.validateStatusChange(base, 'closed'), /Finansal teyit verilmeden/);
  assert.match(R.validateStatusChange({ ...base, fin: { status: 'confirmed' }, ms: { sopActual: '2026-01-01' } }, 'closed'), /Yayın, İlk Numune/);
  assert.equal(R.validateStatusChange({ fin: { status: 'confirmed' }, ms: { releaseActual: 'x', sampleNa: true, sopActual: 'y' } }, 'closed'), null);
  assert.match(R.validateStatusChange(base, 'cancelled'), /gerekçe/);
  assert.equal(R.validateStatusChange({ ...base, cancelReason: 'x' }, 'cancelled'), null);
  assert.match(R.validateStatusChange(base, 'finconf'), /teyit/);
  assert.match(R.validateFinConfirm({ ms: {} }), /devreye giriş/);
});

test('otomatik statü ilerletme', () => {
  assert.equal(R.autoAdvanceStatus({ status: 'progress', ms: { sopActual: '2026-01-01' }, fin: {} }), 'live');
  assert.equal(R.autoAdvanceStatus({ status: 'live', ms: { sopActual: '2026-01-01' }, fin: { status: 'confirmed' } }), 'finconf');
  assert.equal(R.autoAdvanceStatus({ status: 'finconf', ms: { sopActual: '2026-01-01' }, fin: { status: 'revision' } }), 'live');
  assert.equal(R.autoAdvanceStatus({ status: 'closed', ms: {}, fin: {} }), 'closed');
  assert.equal(R.autoAdvanceStatus({ status: 'live', ms: {}, fin: {} }), 'progress');
});

test('rol bazlı yetki ve kategori kapsamı', () => {
  const m = master();
  const creator = { id: 'u1', role: 'creator' };
  assert.equal(R.can(creator, 'pool.create', m), true);
  assert.equal(R.can(creator, 'crid.edit', m), false);
  assert.equal(R.can(creator, 'pool.edit', m, { createdBy: 'u1' }), true);
  assert.equal(R.can(creator, 'pool.edit', m, { createdBy: 'u2' }), false);
  const cat = { id: 'u3', role: 'catmgr', categoryIds: ['cat-arge'] };
  assert.equal(R.can(cat, 'crid.edit', m, { categoryId: 'cat-arge' }), true);
  assert.equal(R.can(cat, 'crid.edit', m, { categoryId: 'cat-tz' }), false);
  assert.equal(R.can({ role: 'readonly' }, 'export', m), false);
  assert.equal(R.can({ role: 'finance' }, 'finance.confirm', m), true);
  assert.equal(R.can({ role: 'crid' }, 'finance.confirm', m), false);
  assert.equal(R.can({ role: 'it', readOnlyAccess: true }, 'master.edit', m), false);
  assert.equal(DEFAULT_PERMISSION_MATRIX.it.length > 15, true);
  // matris master'dan okunur (sabit değil)
  const m2 = normalizeMaster({ ...m, permissions: { ...m.permissions, readonly: ['export'] } });
  assert.equal(R.can({ role: 'readonly' }, 'export', m2), true);
});

test('audit farkı ve havuz → CRID dönüşümünde veri kaybı yok', () => {
  const d = R.diffRecords({ title: 'a', ms: { sopTarget: '2026-01-01' }, history: [1] }, { title: 'b', ms: { sopTarget: '2026-02-01' }, history: [2] });
  assert.deepEqual(d.map((x) => x.field).sort(), ['ms.sopTarget', 'title']);
  const idea = { id: 'i1', no: 'FH-2026-0001', title: 'T', problem: 'P', description: 'D', categoryId: 'cat-tz', vehicleIds: ['v1'], potential: 50, potentialBasis: 'unit', potentialCurrency: 'EUR', ownerId: 'u9', estSop: '2027-09', notes: 'N', evaluation: { potential: 4 }, history: [{}] };
  const c = R.poolToCrid(idea, { no: 'CRID-2027-0001', id: 'c1', master: master() });
  assert.equal(c.unitBenefit, 50);
  assert.equal(c.ms.sopTarget, '2027-09-01');
  assert.deepEqual(c.targetVehicleIds, ['v1']);
  assert.equal(c.sourcePoolNo, 'FH-2026-0001');
  assert.equal(c.source.evaluation.potential, 4);
  assert.equal(c.source.history, undefined);
  assert.match(c.description, /Problem\/Fırsat: P/);
  assert.equal(c.responsibleId, 'u9');
});

test('filtreler: 2027 Eylül devreye girecek CRIDler tek filtreyle', () => {
  const seed = buildSeed();
  const res = F.applyCridFilters(seed.crids, { ...F.EMPTY_FILTERS, year: '2027', month: '9' }, '2026-10-13');
  assert.equal(res.length, 2);
  assert.ok(res.every((c) => c.ms.sopTarget.startsWith('2027-09')));
  const delayed = F.applyCridFilters(seed.crids, { ...F.EMPTY_FILTERS, status: 'delayed' }, '2026-10-13');
  assert.ok(delayed.length >= 3);
  const cat = F.applyCridFilters(seed.crids, { ...F.EMPTY_FILTERS, category: 'cat-um' });
  assert.ok(cat.every((c) => c.categoryId === 'cat-um') && cat.length === 3);
});

test('arama: CRID no, parça kodu, araç', () => {
  const seed = buildSeed();
  const m = normalizeMaster(seed.master);
  const subsByCrid = new Map();
  for (const s of seed.subs) { if (!subsByCrid.has(s.cridId)) subsByCrid.set(s.cridId, []); subsByCrid.get(s.cridId).push(s); }
  assert.equal(F.searchCrids(seed.crids, 'CRID-2026-0003', m, subsByCrid).length, 1);
  assert.equal(F.searchCrids(seed.crids, '12L51-36856', m, subsByCrid)[0].title, 'Geri Görüş Kamera Değişikliği');
  assert.ok(F.searchCrids(seed.crids, 'navigo', m, subsByCrid).length >= 5);
  assert.ok(F.searchCrids(seed.crids, 'ELİF', m, subsByCrid).length === 0);
});

test('bildirimler: rol bazlı', () => {
  const seed = buildSeed();
  const m = normalizeMaster(seed.master);
  const plansM = new Map(seed.plans.map((p) => [p.id, p]));
  const fin = F.buildNotifications({ crids: seed.crids, ideas: seed.ideas, plans: plansM, master: m, user: { id: 'usr-elif', role: 'finance' }, today: '2026-10-13', year: 2026 });
  assert.ok(fin.some((n) => n.type === 'finance'));
  assert.ok(!fin.some((n) => n.type === 'budget'));
  const mgr = F.buildNotifications({ crids: seed.crids, ideas: seed.ideas, plans: plansM, master: m, user: { id: 'usr-can', role: 'manager' }, today: '2026-10-13', year: 2026 });
  assert.ok(mgr.some((n) => n.type === 'overdue'));
  assert.ok(mgr.some((n) => n.type === 'poolIdle'));
  assert.ok(mgr.some((n) => n.type === 'budget'));
  const ro = F.buildNotifications({ crids: seed.crids, ideas: seed.ideas, plans: plansM, master: m, user: { id: 'x', role: 'readonly' }, today: '2026-10-13', year: 2026 });
  assert.equal(ro.length, 0);
});

test('araç özeti ve kümülatif eğri (referans görsel 1 ve 4)', () => {
  const seed = buildSeed();
  const m = normalizeMaster(seed.master);
  const plansM = new Map(seed.plans.map((p) => [p.id, p]));
  const subsByCrid = new Map();
  for (const s of seed.subs) { if (!subsByCrid.has(s.cridId)) subsByCrid.set(s.cridId, []); subsByCrid.get(s.cridId).push(s); }
  const ctx = { master: m, plans: plansM, subsByCrid };
  const sc = m.vehicles.find((v) => v.id === 'veh-sc');
  const r = C.vehicleSummary(sc, 2026, seed.crids, ctx);
  assert.ok(r.potentialUnit > r.realizedUnit && r.realizedUnit > 0);
  assert.equal(r.annualPlanned, 1043);
  assert.equal(r.targetPerUnit, 4984);
  assert.equal(r.currentTargetUnit, 4925); // Ekim hedefi
  const curve = C.cumulativeUnitCurve('veh-sc', 2026, seed.crids, ctx, 'realized');
  assert.equal(curve[11], null);
  assert.ok(curve[9] >= curve[0]);
  const fc = C.cumulativeUnitCurve('veh-sc', 2026, seed.crids, ctx, 'forecast');
  assert.ok(Math.abs(fc[11] - r.potentialUnit) < 1e-6);
});

test('CSV ve XLSX üretimi', () => {
  const csv = buildCsv([['a', 'b;c'], [1.5, 'x"y']]);
  assert.ok(csv.startsWith('﻿'));
  assert.deepEqual(parseCsv(csv), [['a', 'b;c'], ['1,5', 'x"y']]);
  const x = buildXlsx([{ name: 'Liste', rows: [['A', 'B'], [1, 'ç']] }]);
  assert.equal(x[0], 0x50); assert.equal(x[1], 0x4b);
  assert.equal(excelDateToISO(46023), '2026-01-01');
  assert.equal(excelDateToISO('05.01.2026'), '2026-01-05');
});

test('Store: numara üretimi benzersiz, dönüşüm, dondurma, audit', async () => {
  const be = new LocalBackend({ seed: buildSeed(), persist: false });
  const st = new Store(be);
  st.setUser({ id: 'usr-ayse', name: 'Ayşe', role: 'crid' });
  st.start();
  await new Promise((r) => setTimeout(r, 10));
  assert.ok(st.state.ready);
  const before = st.state.crids.length;
  // havuz fikri
  const idea = await st.saveIdea({ title: 'Yeni fikir', vehicleIds: ['veh-sc'], potential: 30, potentialBasis: 'unit', estSop: '2026-12', maturity: 'raw' });
  assert.match(idea.no, /^FH-2026-0011$/);
  await new Promise((r) => setTimeout(r, 5));
  const crid = await st.convertIdea(idea.id);
  assert.match(crid.no, /^CRID-2026-0044$/);
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(st.state.crids.length, before + 1);
  assert.equal(st.state.ideas.find((i) => i.id === idea.id).maturity, 'converted');
  await assert.rejects(() => st.convertIdea(idea.id), /zaten/);
  // eşzamanlı numara üretimi çakışmaz
  const nos = await Promise.all([st.nextNumber('crid', 2028), st.nextNumber('crid', 2028), st.nextNumber('crid', 2028)]);
  assert.equal(new Set(nos).size, 3);
  // alt detay + devreye giriş → dondurma
  const c = st.state.crids.find((x) => x.id === crid.id);
  await st.saveSub({ ...R.emptySub(c, st.state.master), del: { qty: 1, price: 100, currency: 'USD', ratio: 1 }, add: { qty: 1, price: 40, currency: 'USD', ratio: 1 } }, c);
  await new Promise((r) => setTimeout(r, 5));
  const c2 = st.state.crids.find((x) => x.id === crid.id);
  await st.saveCrid({ ...c2, unitMode: 'subs', ms: { ...c2.ms, sopActual: '2026-10-05' } });
  await new Promise((r) => setTimeout(r, 5));
  const c3 = st.state.crids.find((x) => x.id === crid.id);
  assert.equal(c3.status, 'live');
  const sub = st.state.subs.find((s) => s.cridId === crid.id);
  assert.ok(sub.frozen);
  assert.ok(Math.abs(sub.frozen.unitImpactBase - 60 * 0.851) < 1e-9);
  assert.ok(c3.history.some((h) => h.changes.some((ch) => ch.field === 'ms.sopActual')));
  // finansal teyit
  await st.confirmFinance(c3, { status: 'confirmed', amount: 500 });
  await new Promise((r) => setTimeout(r, 5));
  const c4 = st.state.crids.find((x) => x.id === crid.id);
  assert.equal(c4.status, 'finconf');
  assert.equal(c4.fin.by, 'usr-ayse');
  assert.equal(c4.fin.date, '2026-10-13');
  // teyit için devreye giriş şartı
  const fresh = st.state.crids.find((x) => !x.ms?.sopActual && x.status !== 'cancelled');
  await assert.rejects(() => st.confirmFinance(fresh, { status: 'confirmed', amount: 1 }), /devreye giriş/);
});
