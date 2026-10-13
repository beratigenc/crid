// Kurumsal görünüm testleri (sunucu modu): logo yükleme, menü/giriş/filigran gösterimi,
// yetki, boyut sınırı, repo varsayılan logoları ve kalıcılık.
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { spawn, execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';
import { join } from 'node:path';

const TMP = mkdtempSync(join(process.env.TMPDIR, 'crid-brand-'));
const SHOTS = process.env.TMPDIR;
// Test için genel (marka içermeyen) iki görsel
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="80" viewBox="0 0 300 80"><rect width="300" height="80" rx="10" fill="#1f55b8"/><text x="150" y="52" font-size="34" font-family="Arial" fill="#fff" text-anchor="middle">TEST A</text></svg>`;
writeFileSync(join(TMP, 'test-a.svg'), svg);
execFileSync('python3', ['-c', `
import zlib,struct,sys
w,h=240,60
raw=b''.join(b'\\x00'+bytes([200,16,46,255]*w) for _ in range(h))
def ch(t,d): return struct.pack('>I',len(d))+t+d+struct.pack('>I',zlib.crc32(t+d)&0xffffffff)
open(sys.argv[1],'wb').write(b'\\x89PNG\\r\\n\\x1a\\n'+ch(b'IHDR',struct.pack('>IIBBBBB',w,h,8,6,0,0,0))+ch(b'IDAT',zlib.compress(raw))+ch(b'IEND',b''))
`, join(TMP, 'test-b.png')]);
writeFileSync(join(TMP, 'big.png'), Buffer.alloc(700 * 1024, 1));

// repo varsayılanı senaryosu için branding/ klasörlü kopya
const APP2 = join(TMP, 'app2');
mkdirSync(join(APP2, 'src'), { recursive: true }); mkdirSync(join(APP2, 'dist'), { recursive: true }); mkdirSync(join(APP2, 'branding'), { recursive: true });
cpSync('server', join(APP2, 'server'), { recursive: true });
cpSync('src/logic', join(APP2, 'src/logic'), { recursive: true });
cpSync('dist/index.html', join(APP2, 'dist/index.html'));
cpSync('package.json', join(APP2, 'package.json'));
cpSync(join(TMP, 'test-a.svg'), join(APP2, 'branding/01-test-a.svg'));

const procs = [];
function start(cwd, port, data) {
  return new Promise((resolve, reject) => {
    const p = spawn('node', ['server/server.mjs'], { cwd, env: { ...process.env, PORT: String(port), DATA_DIR: data, ADMIN_PASSWORD: 'Yonetici123!', DEMO_PASSWORD: 'Demo1234!', NODE_ENV: 'production' }, stdio: ['ignore', 'pipe', 'pipe'] });
    procs.push(p);
    p.stdout.on('data', (d) => { if (String(d).includes('http://localhost')) resolve(p); });
    p.stderr.on('data', (d) => process.stderr.write(d));
    setTimeout(() => reject(new Error('sunucu açılmadı')), 8000);
  });
}
const A = 'http://localhost:3941', B = 'http://localhost:3942';
let srvA = await start(process.cwd(), 3941, join(TMP, 'dA'));
await start(APP2, 3942, join(TMP, 'dB'));

const browser = await chromium.launch();
let passed = 0, failed = 0; const errors = [];
async function step(name, fn) { try { await fn(); passed++; console.log('  ✓', name); } catch (e) { failed++; console.log('  ✗', name, '\n     ', String(e.message).split('\n').slice(0, 4).join('\n      ')); } }
async function newPage(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, ...opts });
  const page = await ctx.newPage(); page.setDefaultTimeout(7000);
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  return page;
}
async function login(page, base, u, p) {
  await page.goto(base); await page.fill('#lg-u', u); await page.fill('#lg-p', p);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await page.waitForSelector('h1:has-text("Ana Dashboard")');
}

const admin = await newPage();
await step('Logo yokken menü ve filigran gösterilmez', async () => {
  await login(admin, A, 'admin', 'Yonetici123!');
  assert.equal(await admin.getByTestId('logo-strip').count(), 0);
  assert.equal(await admin.locator('.main [data-testid=watermark]').count(), 0);
});
await step('IT logoları yükler (SVG + PNG), çok büyük dosya reddedilir', async () => {
  await admin.getByRole('navigation').getByRole('button', { name: 'Master Data' }).click();
  await admin.getByRole('tab', { name: 'Kurumsal görünüm' }).click();
  await admin.getByLabel('Logo dosyası').setInputFiles(join(TMP, 'big.png'));
  assert.match(await admin.locator('.toast').last().textContent(), /sınırını aşıyor/);
  await admin.getByLabel('Logo dosyası').setInputFiles([join(TMP, 'test-a.svg'), join(TMP, 'test-b.png')]);
  await admin.getByTestId('logo-table').waitFor();
  assert.equal(await admin.getByTestId('logo-table').locator('tbody tr').count(), 2);
  await admin.getByRole('button', { name: 'Değişiklikleri kaydet' }).click();
  await admin.locator('.toast', { hasText: 'Master data kaydedildi' }).waitFor();
});
await step('Logolar menüde ve arka planda filigran olarak görünür', async () => {
  await admin.getByRole('navigation').getByRole('button', { name: 'Ana Dashboard' }).click();
  assert.equal(await admin.locator('.side [data-testid=logo-strip] img').count(), 2);
  const wm = admin.locator('.main [data-testid=watermark]');
  assert.ok(await wm.locator('img').count() >= 2);
  const st = await wm.evaluate((el) => ({ pe: getComputedStyle(el).pointerEvents, op: getComputedStyle(el.firstChild).opacity }));
  assert.equal(st.pe, 'none');
  assert.ok(+st.op > 0 && +st.op < 0.2, `opaklık ${st.op}`);
  // filigran tıklamaları engellemez
  await admin.getByRole('navigation').getByRole('button', { name: 'CRID Listesi' }).click();
  await admin.getByTestId('crid-table').locator('tbody tr.click').first().click();
  await admin.waitForSelector('.rec-title');
  const loaded = await admin.locator('.side [data-testid=logo-strip] img').first().evaluate((i) => i.complete && i.naturalWidth > 0);
  assert.ok(loaded, 'logo görseli yüklenmedi');
  await admin.screenshot({ path: join(SHOTS, 'brand-light.png') });
});
await step('Filigran yoğunluğu değiştirilir ve uygulanır', async () => {
  await admin.getByRole('navigation').getByRole('button', { name: 'Master Data' }).click();
  await admin.getByRole('tab', { name: 'Kurumsal görünüm' }).click();
  await admin.locator('#wm-op').fill('0.15');
  await admin.getByRole('button', { name: 'Değişiklikleri kaydet' }).click();
  await admin.waitForTimeout(200);
  const op = await admin.locator('.main > [data-testid=watermark] .wm-inner').evaluate((el) => getComputedStyle(el).opacity);
  assert.equal(+op, 0.15);
});
await step('Giriş ekranında logolar görünür (oturum açmadan)', async () => {
  const anon = await newPage();
  await anon.goto(A);
  await anon.waitForSelector('#lg-u');
  assert.equal(await anon.locator('.login-brand [data-testid=logo-strip] img').count(), 2);
  assert.ok(await anon.locator('[data-testid=watermark] img').count() >= 2);
  await anon.screenshot({ path: join(SHOTS, 'brand-login.png') });
  const pub = await anon.evaluate(() => fetch('/api/public/branding').then((r) => r.json()));
  assert.equal(pub.logos.length, 2);
  assert.equal(Object.keys(pub).includes('users'), false);
});
await step('IT olmayan kullanıcı logoları değiştiremez (sunucu reddeder)', async () => {
  const ayse = await newPage();
  await login(ayse, A, 'ayse.kaya', 'Demo1234!');
  assert.equal(await ayse.locator('.side [data-testid=logo-strip] img').count(), 2);
  const r = await ayse.evaluate(async () => {
    const m = (await (await fetch('/api/doc/master/main')).json()).doc;
    const res = await fetch('/api/doc/master/main', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...m, branding: { ...m.branding, logos: [] } }) });
    return res.status;
  });
  assert.equal(r, 403);
});
await step('Karanlık temada filigran görünür kalır', async () => {
  const dark = await newPage({ colorScheme: 'dark' });
  await login(dark, A, 'admin', 'Yonetici123!');
  const f = await dark.locator('.main [data-testid=watermark] .wm-inner').evaluate((el) => getComputedStyle(el).filter);
  assert.match(f, /invert/);
  await dark.screenshot({ path: join(SHOTS, 'brand-dark.png') });
});
await step('Telefonda yatay taşma yok', async () => {
  const m = await newPage({ viewport: { width: 390, height: 844 } });
  await login(m, A, 'admin', 'Yonetici123!');
  const over = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(over <= 1, `taşma ${over}`);
});
await step('Sunucu yeniden başlayınca logolar korunur', async () => {
  await new Promise((r) => { srvA.once('exit', r); srvA.kill('SIGTERM'); });
  srvA = await start(process.cwd(), 3941, join(TMP, 'dA'));
  const pub = await (await fetch(A + '/api/public/branding')).json();
  assert.equal(pub.logos.length, 2);
});
await step('Repodaki branding/ klasörü varsayılan logo olur', async () => {
  const pub = await (await fetch(B + '/api/public/branding')).json();
  assert.equal(pub.logos.length, 1);
  assert.equal(pub.fromRepo, true);
  const p = await newPage();
  await login(p, B, 'admin', 'Yonetici123!');
  assert.equal(await p.locator('.side [data-testid=logo-strip] img').count(), 1);
  await p.getByRole('navigation').getByRole('button', { name: 'Master Data' }).click();
  await p.getByRole('tab', { name: 'Kurumsal görünüm' }).click();
  assert.ok(await p.getByText('sunucuda tanımlı varsayılan logolar').isVisible());
});

console.log(`\n${passed} geçti, ${failed} başarısız; sayfa hataları: ${errors.length ? errors : 'yok'}`);
await browser.close();
for (const p of procs) try { p.kill('SIGTERM'); } catch (e) { /* */ }
process.exit(failed || errors.length ? 1 : 0);
