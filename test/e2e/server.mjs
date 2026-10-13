// Railway sunucu modu testleri: giriş, sunucu tarafı yetki, canlı eşitleme, yükleme, kalıcılık.
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DATA = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'crid-srv-'));
const PORT = 3911;
const URL = `http://localhost:${PORT}`;
let proc;
function start() {
  return new Promise((resolve, reject) => {
    proc = spawn('node', ['server/server.mjs'], { env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA, ADMIN_PASSWORD: 'Yonetici123!', DEMO_PASSWORD: 'Demo1234!', NODE_ENV: 'production' }, stdio: ['ignore', 'pipe', 'pipe'] });
    proc.stdout.on('data', (d) => { if (String(d).includes('http://localhost')) resolve(); });
    proc.stderr.on('data', (d) => process.stderr.write(d));
    setTimeout(() => reject(new Error('sunucu açılmadı')), 8000);
  });
}
function stop() { return new Promise((r) => { proc.once('exit', r); proc.kill('SIGTERM'); }); }

await start();
const browser = await chromium.launch();
let passed = 0, failed = 0;
const errors = [];
async function step(name, fn) {
  try { await fn(); passed++; console.log('  ✓', name); } catch (e) { failed++; console.log('  ✗', name, '\n     ', String(e.message).split('\n').slice(0, 4).join('\n      ')); }
}
async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.setDefaultTimeout(7000);
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  return page;
}
async function login(page, u, p) {
  await page.goto(URL);
  await page.fill('#lg-u', u);
  await page.fill('#lg-p', p);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await page.waitForSelector('h1:has-text("Ana Dashboard")');
}
const api = (page, method, path, body) => page.evaluate(async ({ method, path, body }) => { const r = await fetch(path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, json: await r.json().catch(() => ({})) }; }, { method, path, body });

const admin = await newPage();
await step('Oturum yokken giriş ekranı açılır; API 401 döner', async () => {
  await admin.goto(URL);
  await admin.waitForSelector('#lg-u');
  const r = await admin.evaluate(() => fetch('/api/data').then((x) => x.status));
  assert.equal(r, 401);
});
await step('Hatalı şifre reddedilir', async () => {
  await admin.fill('#lg-u', 'admin'); await admin.fill('#lg-p', 'yanlis');
  await admin.getByRole('button', { name: 'Giriş yap' }).click();
  assert.match(await admin.getByRole('alert').textContent(), /hatalı/);
});
await step('Yönetici girer, canlı mod ve IT rolü', async () => {
  await login(admin, 'admin', 'Yonetici123!');
  assert.match(await admin.getByTestId('user-chip').textContent(), /IT \/ Sistem Yöneticisi/);
  assert.equal(await admin.locator('.banner', { hasText: 'Demo modu' }).count(), 0);
  assert.match(await admin.locator('.side-foot').textContent(), /Canlı veritabanı/);
});
await step('IT yeni kişi ekler ve giriş hesabı tanımlar', async () => {
  await admin.getByRole('navigation').getByRole('button', { name: 'Master Data' }).click();
  await admin.getByRole('tab', { name: /Kullanıcılar/ }).click();
  await admin.getByTestId('accounts-table').waitFor();
  const row = admin.getByTestId('accounts-table').locator('tr', { hasText: 'Ayşe Kaya' });
  await row.getByRole('button', { name: /Giriş tanımla|Şifre sıfırla/ }).click();
  await admin.fill('#ac-u', 'ayse');
  await admin.fill('#ac-p', 'Ayse12345');
  await admin.getByRole('dialog').getByRole('button', { name: 'Kaydet' }).click();
  await admin.waitForTimeout(300);
  assert.match(await row.textContent(), /ayse/);
});
const ayse = await newPage();
await step('CRID Sorumlusu girer; fikir ekler, yönetici ekranında canlı görünür', async () => {
  await login(ayse, 'ayse', 'Ayse12345');
  assert.match(await ayse.getByTestId('user-chip').textContent(), /CRID Sorumlusu/);
  await admin.getByRole('navigation').getByRole('button', { name: 'Fikir Havuzu' }).click();
  await ayse.getByRole('navigation').getByRole('button', { name: 'Fikir Havuzu' }).click();
  await ayse.getByRole('button', { name: 'Yeni fikir' }).click();
  await ayse.fill('#i-title', 'Sunucu canlı test fikri');
  await ayse.selectOption('#i-cat', { label: 'Ar-Ge' });
  await ayse.getByRole('dialog').getByRole('button', { name: 'Kaydet' }).click();
  assert.match(await ayse.locator('.toast').last().textContent(), /FH-2026-0011 havuza eklendi/);
  await admin.getByTestId('pool-table').getByText('Sunucu canlı test fikri').waitFor({ timeout: 5000 });
});
await step('CRIDe dönüştürme sunucuda benzersiz numara üretir', async () => {
  await ayse.getByTestId('pool-table').getByText('Sunucu canlı test fikri').click();
  await ayse.getByRole('dialog').getByRole('button', { name: "CRID'e Dönüştür" }).click();
  await ayse.getByRole('dialog').filter({ hasText: 'benzersiz bir CRID' }).getByRole('button', { name: 'Dönüştür', exact: true }).click();
  await ayse.waitForSelector('.rec-title');
  assert.match(await ayse.locator('.rec-no').textContent(), /CRID-2026-0044/);
  const nums = await Promise.all([1, 2, 3].map(() => api(ayse, 'POST', '/api/next-number', { kind: 'crid', year: 2030, prefix: 'CRID' })));
  assert.equal(new Set(nums.map((n) => n.json.no)).size, 3);
});
await step('Sunucu tarafı yetki: CRID Sorumlusu master data/kullanıcı değiştiremez', async () => {
  const m = (await api(ayse, 'GET', '/api/doc/master/main')).json.doc;
  const users = m.users.map((u) => (u.id === 'usr-ayse' ? { ...u, role: 'it' } : u));
  const r = await api(ayse, 'PUT', '/api/doc/master/main', { ...m, users });
  assert.equal(r.status, 403);
  const r2 = await api(ayse, 'PUT', '/api/doc/master/main', { ...m, vehicles: [] });
  assert.equal(r2.status, 403);
  const r3 = await api(ayse, 'GET', '/api/accounts');
  assert.equal(r3.status, 403);
});
const selin = await newPage();
await step('Salt okuma kullanıcısı hiçbir şey yazamaz (sunucu reddeder)', async () => {
  await login(selin, 'selin.aydin', 'Demo1234!');
  const r = await api(selin, 'PUT', '/api/doc/ideas/x1', { title: 'hack' });
  assert.equal(r.status, 403);
  const r2 = await api(selin, 'POST', '/api/next-number', { kind: 'crid', year: 2026, prefix: 'CRID' });
  assert.equal(r2.status, 403);
});
await step('Doküman yükleme ve yetkili indirme', async () => {
  writeFileSync(join(DATA, 'ek.txt'), 'teknik resim');
  await ayse.getByRole('tab', { name: /Dokümanlar/ }).click();
  await ayse.locator('input[type=file]').setInputFiles(join(DATA, 'ek.txt'));
  await ayse.getByRole('link', { name: /ek\.txt/ }).waitFor();
  const href = await ayse.getByRole('link', { name: /ek\.txt/ }).getAttribute('href');
  const body = await ayse.evaluate((h) => fetch(h).then((r) => r.text()), href);
  assert.equal(body, 'teknik resim');
  const anon = await browser.newContext();
  const st = await (await anon.request.get(URL + href)).status();
  assert.equal(st, 401);
  await anon.close();
});
await step('Şifre değiştirme', async () => {
  const r = await api(ayse, 'POST', '/api/me/password', { current: 'Ayse12345', next: 'YeniSifre99' });
  assert.equal(r.status, 200);
});
await step('Sunucu yeniden başlasa da veri ve oturum korunur', async () => {
  await stop();
  await start();
  await admin.reload();
  await admin.waitForSelector('h1');
  const d = (await api(admin, 'GET', '/api/data')).json.docs;
  assert.ok(Object.values(d).some((v) => v.title === 'Sunucu canlı test fikri'));
  assert.ok(Object.values(d).some((v) => v.no === 'CRID-2026-0044'));
});
await step('Çıkış yapınca giriş ekranına döner; eski şifre artık çalışmaz', async () => {
  await ayse.reload();
  await ayse.waitForSelector('h1');
  await ayse.getByTestId('user-chip').click();
  await ayse.getByRole('menuitem', { name: 'Çıkış yap' }).click();
  await ayse.waitForSelector('#lg-u');
  await ayse.fill('#lg-u', 'ayse'); await ayse.fill('#lg-p', 'Ayse12345');
  await ayse.getByRole('button', { name: 'Giriş yap' }).click();
  assert.match(await ayse.getByRole('alert').textContent(), /hatalı/);
  await login(ayse, 'ayse', 'YeniSifre99');
});

console.log(`\n${passed} geçti, ${failed} başarısız; sayfa hataları: ${errors.length ? errors : 'yok'}`);
await browser.close();
await stop();
process.exit(failed || errors.length ? 1 : 0);
