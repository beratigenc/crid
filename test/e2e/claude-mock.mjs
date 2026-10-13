// claude.ai çalışma zamanı taklidi: db (dondurulmuş anlık görüntüler, acquire), user, downloads.
// Canlı moddaki kimlik çözümleme, sahip kaydı, kişi kaydı, salt-okuma ve yazma reddi senaryolarını dener.
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import http from 'node:http';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSeed } from '../../src/logic/seed.js';

const html = readFileSync('dist/test.html');
const srv = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html); }).listen(0);
const URL = `http://localhost:${srv.address().port}/`;
const seed = buildSeed();
const docs = {};
docs['master/main'] = seed.master; docs['meta/counters'] = seed.counters;
for (const p of seed.plans) docs[`plans/${p.id}`] = p;
for (const c of seed.crids) docs[`crids/${c.id}`] = c;
for (const s of seed.subs) docs[`subs/${s.id}`] = s;
for (const i of seed.ideas) docs[`ideas/${i.id}`] = i;

function mockScript({ docs, viewer }) {
  const store = new Map(Object.entries(docs));
  const listeners = new Set();
  const deepFreeze = (o) => { if (o && typeof o === 'object') { Object.freeze(o); Object.values(o).forEach(deepFreeze); } return o; };
  const snap = (path) => { const v = store.get(path); return { id: path.split('/').pop(), exists: !!v, data: () => (v ? deepFreeze(JSON.parse(JSON.stringify(v))) : undefined), metadata: { fromCache: false, hasPendingWrites: false } }; };
  const emit = () => setTimeout(() => listeners.forEach((l) => l()), 5);
  const canWrite = (path) => {
    if (viewer.level === 'view') return false;
    if (path.startsWith('master/') && !['admin', 'owner'].includes(viewer.level)) return false;
    return true;
  };
  const reject = () => Promise.reject({ code: 'invalid_argument', message: 'write denied' });
  window.__dbWrites = [];
  const doc = (path) => ({
    id: path.split('/').pop(), path,
    get: async () => snap(path),
    set: async (d) => { if (!canWrite(path)) return reject(); JSON.stringify(d); store.set(path, JSON.parse(JSON.stringify(d))); window.__dbWrites.push(path); emit(); },
    update: async (d) => { if (!canWrite(path)) return reject(); if (!store.has(path)) return reject(); store.set(path, { ...store.get(path), ...d }); emit(); },
    delete: async () => { if (!canWrite(path)) return reject(); store.delete(path); emit(); },
    acquire: async () => ({ acquired: true, version: 1 }),
    onSnapshot: (next) => { const f = () => next(snap(path)); listeners.add(f); setTimeout(f, 10); return () => listeners.delete(f); },
  });
  const collection = (name) => ({
    path: name,
    doc: (id) => doc(`${name}/${id}`),
    onSnapshot: (next) => {
      const f = () => { const ds = [...store.keys()].filter((k) => k.startsWith(name + '/') && k.split('/').length === name.split('/').length + 1).sort().map(snap); next({ docs: ds, size: ds.length, empty: !ds.length, docChanges: () => [], metadata: {} }); };
      listeners.add(f); setTimeout(f, 10); return () => listeners.delete(f);
    },
  });
  const db = Object.freeze({ doc, collection });
  const user = Object.freeze({
    id: async () => viewer.id, me: async () => ({ id: viewer.id, name: viewer.name, email: null, isOwner: viewer.level === 'owner', canEdit: ['admin', 'owner'].includes(viewer.level) }),
    isOwner: async () => viewer.level === 'owner', canEdit: async () => ['admin', 'owner'].includes(viewer.level), can: async () => viewer.level !== 'view',
    profiles: async () => ({}),
  });
  const downloads = Object.freeze({ save: async ({ filename }) => { window.__saved = filename; return { status: 'saved' }; } });
  window.claude = Object.freeze({ use: async (n) => { await new Promise((r) => setTimeout(r, 20)); return { db, user, downloads }[n] || null; } });
  window.__mockStore = store;
}

const browser = await chromium.launch();
let passed = 0, failed = 0;
async function scenario(name, viewer, fn, docsOverride) {
  const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
  page.setDefaultTimeout(6000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_FAILED|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.addInitScript(mockScript, { docs: docsOverride || docs, viewer });
  await page.goto(URL);
  await page.waitForSelector('h1');
  try { await fn(page); assert.deepEqual(errors, []); passed++; console.log('  ✓', name); }
  catch (e) { failed++; console.log('  ✗', name, '\n     ', String(e.message).split('\n').slice(0, 5).join('\n      ')); }
  await page.close();
}

await scenario('Sahip: canlı mod, IT rolü, master kullanıcılarına otomatik eklenir', { id: 'u_owner', name: 'Berat Işığ', level: 'owner' }, async (page) => {
  assert.equal(await page.locator('.banner', { hasText: 'Demo modu' }).count(), 0);
  assert.match(await page.getByTestId('user-chip').textContent(), /IT \/ Sistem Yöneticisi/);
  await page.waitForTimeout(300);
  const master = await page.evaluate(() => window.__mockStore.get('master/main'));
  assert.ok(master.users.some((u) => u.claudeId === 'u_owner' && u.role === 'it'));
  const person = await page.evaluate(() => window.__mockStore.get('people/u_owner'));
  assert.equal(person.name, 'Berat Işığ');
  assert.match(await page.locator('.side-foot').textContent(), /Canlı veritabanı/);
});

await scenario('Sahip: dondurulmuş anlık görüntülerle kayıt düzenleme ve numara üretimi', { id: 'u_owner', name: 'Berat Işığ', level: 'owner' }, async (page) => {
  await page.getByRole('navigation').getByRole('button', { name: 'Fikir Havuzu' }).click();
  await page.getByRole('button', { name: 'Yeni fikir' }).click();
  await page.fill('#i-title', 'Canlı mod fikri');
  await page.selectOption('#i-cat', { label: 'Ar-Ge' });
  await page.getByRole('dialog').getByRole('button', { name: 'Kaydet' }).click();
  await page.waitForTimeout(200);
  const ideas = await page.evaluate(() => [...window.__mockStore.entries()].filter(([k]) => k.startsWith('ideas/')).map(([, v]) => v));
  const mine = ideas.find((i) => i.title === 'Canlı mod fikri');
  assert.equal(mine.no, 'FH-2026-0011');
  assert.equal(mine.createdBy, 'u_owner');
  await page.getByTestId('pool-table').getByText('Canlı mod fikri').click();
  await page.getByRole('dialog').getByRole('button', { name: "CRID'e Dönüştür" }).click();
  await page.getByRole('dialog').filter({ hasText: 'benzersiz bir CRID' }).getByRole('button', { name: 'Dönüştür', exact: true }).click();
  await page.waitForSelector('.rec-title');
  assert.match(await page.locator('.rec-no').textContent(), /CRID-\d{4}-\d{4}/);
  await page.getByRole('button', { name: 'Düzenle' }).click();
  await page.locator('#c-target').getByRole('button', { name: 'Navigo' }).click();
  await page.getByRole('button', { name: 'Kaydet' }).click();
  await page.waitForTimeout(200);
  assert.match(await page.locator('.toast').last().textContent(), /kaydedildi/);
  // sahibi olarak master data kaydı
  await page.getByRole('navigation').getByRole('button', { name: 'Master Data' }).click();
  await page.getByRole('tab', { name: 'Sistem parametreleri' }).click();
  await page.fill('#s-nd', '21');
  await page.getByRole('button', { name: 'Değişiklikleri kaydet' }).click();
  await page.waitForTimeout(200);
  assert.equal((await page.evaluate(() => window.__mockStore.get('master/main'))).settings.notifyDaysBefore, 21);
  // dışa aktarım downloads yeteneği ile
  await page.getByRole('navigation').getByRole('button', { name: 'CRID Listesi' }).click();
  await page.getByRole('button', { name: 'Dışa aktar' }).click();
  await page.getByRole('menuitem', { name: /Excel/ }).click();
  await page.waitForTimeout(200);
  assert.match(await page.evaluate(() => window.__saved), /CRID_Listesi_2026\.xlsx/);
});

await scenario('Katkıda bulunan, rolü atanmamış: varsayılan rol + bekleyen listesine kayıt', { id: 'u_new', name: 'Ali Veli', level: 'interact' }, async (page) => {
  assert.ok(await page.getByText('Rolünüz henüz atanmadı').isVisible());
  assert.match(await page.getByTestId('user-chip').textContent(), /Fikir Oluşturucu/);
  await page.waitForTimeout(200);
  assert.equal((await page.evaluate(() => window.__mockStore.get('people/u_new'))).name, 'Ali Veli');
  await page.getByRole('navigation').getByRole('button', { name: 'CRID Listesi' }).click();
  assert.equal(await page.getByRole('button', { name: 'Yeni CRID' }).count(), 0);
  // master data yazımı sunucuda reddedilir → anlaşılır mesaj
  const r = await page.evaluate(async () => { try { await window.__crid.store.saveMaster({ ...window.__crid.store.state.master }); return 'ok'; } catch (e) { return e.code; } });
  assert.equal(r, 'invalid_argument');
});

const linked = JSON.parse(JSON.stringify(docs));
linked['master/main'].users.find((u) => u.id === 'usr-ayse').claudeId = 'u_ayse';
await scenario('Rol atanmış kullanıcı kendi rolüyle açılır (CRID Sorumlusu)', { id: 'u_ayse', name: 'Ayşe K.', level: 'interact' }, async (page) => {
  assert.match(await page.getByTestId('user-chip').textContent(), /CRID Sorumlusu/);
  assert.equal(await page.getByText('Rolünüz henüz atanmadı').count(), 0);
  await page.getByRole('navigation').getByRole('button', { name: 'CRID Listesi' }).click();
  assert.equal(await page.getByRole('button', { name: 'Yeni CRID' }).count(), 1);
  // rol önizleme yalnız IT'ye açık
  await page.getByTestId('user-chip').click();
  assert.equal(await page.getByRole('menuitem').count(), 0);
}, linked);

await scenario('Görüntüleyici (view): salt okuma bandı, giriş kapalı', { id: 'u_view', name: 'İzleyici', level: 'view' }, async (page) => {
  assert.ok(await page.getByText('yalnızca görüntüleme yetkisiyle').isVisible());
  await page.getByRole('navigation').getByRole('button', { name: 'Fikir Havuzu' }).click();
  assert.equal(await page.getByRole('button', { name: 'Yeni fikir' }).count(), 0);
  assert.equal(await page.evaluate(() => window.__mockStore.has('people/u_view')), false);
});

console.log(`\n${passed} geçti, ${failed} başarısız`);
await browser.close(); srv.close();
process.exit(failed ? 1 : 0);
