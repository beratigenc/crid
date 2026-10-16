// Çevrimdışı tek dosya HTML sürümü: file:// ile açılış, kullanıcı seçimi/PIN, kalıcılık,
// harici istek olmaması, yedek/geri yükleme, veri dosyası bağlama ve başka kullanıcının değişikliğini birleştirme.
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const URL = 'file://' + process.cwd() + '/dist/crid-offline.html';
const SCR = process.env.TMPDIR;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true });
// Dosya seçicileri, tarayıcının kendi özel dosya sistemiyle (OPFS) taklit edilir
// Dosya seçicileri sahte bir dosya tutamacıyla taklit edilir (içerik localStorage'da durur)
await ctx.addInitScript(() => {
  const K = '__fakefile';
  const mk = () => ({
    kind: 'file', name: 'crid-veri.json',
    async getFile() { return new File([localStorage.getItem(K) || ''], 'crid-veri.json', { lastModified: +(localStorage.getItem(K + ':m') || 0) }); },
    async createWritable() { let buf = ''; return { async write(d) { buf += typeof d === 'string' ? d : await new Response(d).text(); }, async close() { localStorage.setItem(K, buf); localStorage.setItem(K + ':m', String(Date.now())); } }; },
    async queryPermission() { return 'granted'; }, async requestPermission() { return 'granted'; },
  });
  window.showSaveFilePicker = async () => mk();
  window.showOpenFilePicker = async () => [mk()];
  window.__fakeRead = () => localStorage.getItem(K) || '';
  window.__fakeWrite = (t) => { localStorage.setItem(K, t); localStorage.setItem(K + ':m', String(Date.now() + 1)); };
});
const page = await ctx.newPage();
page.setDefaultTimeout(7000);
const errors = [], external = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('request', (r) => { if (!/^(file|data|blob):/.test(r.url())) external.push(r.url()); });

let passed = 0, failed = 0;
async function step(name, fn) {
  try { await fn(); passed++; console.log('  ✓', name); }
  catch (e) { failed++; console.log('  ✗', name, '\n     ', String(e.message).split('\n').slice(0, 4).join('\n      ')); await page.screenshot({ path: join(SCR, 'off-fail.png'), fullPage: true }).catch(() => {}); }
}
const state = () => page.evaluate(() => window.__crid.store.getState());
const pick = async (id, pin) => {
  await page.waitForSelector('#hl-u');
  await page.selectOption('#hl-u', id);
  if (pin !== undefined) await page.fill('#hl-p', pin);
  await page.getByRole('button', { name: 'Devam' }).click();
};
const switchUser = async (id, pin) => {
  await page.getByTestId('user-chip').click();
  await page.getByRole('menuitem', { name: 'Kullanıcı değiştir' }).click();
  await pick(id, pin);
  await page.waitForSelector('h1:has-text("Ana Dashboard")');
};
const nav = (l) => page.getByRole('navigation').getByRole('button', { name: l }).first().click();

await page.goto(URL);
await page.evaluate(async () => { localStorage.clear(); await new Promise((r) => { const q = indexedDB.deleteDatabase('crid-offline'); q.onsuccess = q.onerror = q.onblocked = () => r(); }); });
await page.goto(URL);

await step('file:// ile açılır, kullanıcı seçimi gelir, Otokar logosu görünür', async () => {
  await page.waitForSelector('#hl-u');
  assert.ok(await page.locator('.login-brand [data-testid=logo-strip] img').count() === 1);
  await page.screenshot({ path: join(SCR, 'off-login.png') });
  await pick('usr-ayse');
  await page.waitForSelector('h1:has-text("Ana Dashboard")');
  assert.match(await page.getByTestId('user-chip').textContent(), /CRID Sorumlusu/);
  assert.equal(await page.locator('.side [data-testid=logo-strip] img').count(), 1);
  assert.match(await page.getByTestId('storage-chip').textContent(), /Bu bilgisayarda/);
});
await step('Hiçbir harici sunucuya istek atılmaz', async () => {
  assert.deepEqual(external, []);
});
let ideaNo;
await step('Kayıt girilir ve sayfa kapatılıp açılınca korunur (tarayıcı deposu)', async () => {
  await nav('Fikir Havuzu');
  await page.getByRole('button', { name: 'Yeni fikir' }).click();
  await page.fill('#i-title', 'Çevrimdışı test fikri');
  await page.selectOption('#i-cat', { label: 'Ar-Ge' });
  await page.getByRole('dialog').getByRole('button', { name: 'Kaydet' }).click();
  ideaNo = (await page.locator('.toast').last().textContent()).match(/FH-\d{4}-\d{4}/)[0];
  await page.waitForTimeout(400);
  const p2 = await ctx.newPage();
  await p2.goto(URL);
  await p2.waitForSelector('h1:has-text("Ana Dashboard")');
  const found = await p2.evaluate((no) => window.__crid.store.getState().ideas.some((i) => i.no === no && i.createdBy === 'usr-ayse'), ideaNo);
  assert.ok(found, 'kayıt yeni sekmede bulunamadı');
  await p2.close();
});
await step('Kullanıcı değiştirme gerçek kimlikle çalışır ve kayıt o kişi adına yazılır', async () => {
  await switchUser('usr-elif');
  assert.match(await page.getByTestId('user-chip').textContent(), /Finansal Kontrol/);
  await nav('Finansal Kontrol');
  const row = page.getByTestId('finance-table').locator('tbody tr.click').first();
  await row.getByRole('button', { name: /Kontrol et/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Kontrol edildi' }).click();
  await page.waitForTimeout(200);
  const s = await state();
  assert.ok(s.crids.some((c) => c.fin?.checkedBy === 'usr-elif'));
});
await step('IT kullanıcıya PIN tanımlar; seçimde PIN sorulur, yanlış PIN reddedilir', async () => {
  await switchUser('usr-zeynep');
  await nav('Master Data');
  await page.getByRole('tab', { name: /Kullanıcılar/ }).click();
  await page.getByTestId('pin-table').locator('tr', { hasText: 'Ayşe Kaya' }).getByRole('button', { name: 'PIN tanımla' }).click();
  await page.fill('#pin-new', '4321');
  await page.getByRole('dialog').getByRole('button', { name: 'Kaydet' }).click();
  await page.waitForTimeout(300);
  await page.getByTestId('user-chip').click();
  await page.getByRole('menuitem', { name: 'Kullanıcı değiştir' }).click();
  await pick('usr-ayse', '1111');
  assert.match(await page.getByRole('alert').textContent(), /PIN hatalı/);
  await page.fill('#hl-p', '4321');
  await page.getByRole('button', { name: 'Devam' }).click();
  await page.waitForSelector('h1:has-text("Ana Dashboard")');
  assert.match(await page.getByTestId('user-chip').textContent(), /CRID Sorumlusu/);
});
await step('Yedek indirilir; silinen kayıt yedekten geri yüklenir', async () => {
  await switchUser('usr-zeynep', undefined);
  await nav('Master Data');
  await page.getByRole('tab', { name: 'Veri', exact: true }).click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Yedek indir/ }).click()]);
  const bpath = join(SCR, 'crid-yedek.json'); await dl.saveAs(bpath);
  const pack = JSON.parse(readFileSync(bpath, 'utf8'));
  assert.equal(pack.format, 'crid-data');
  assert.ok(Object.values(pack.docs).some((d) => d.no === ideaNo));
  // kaydı sil
  await page.evaluate(async (no) => { const st = window.__crid.store; const i = st.getState().ideas.find((x) => x.no === no); await st.deleteIdea(i.id); }, ideaNo);
  await page.waitForTimeout(200);
  assert.ok(!(await state()).ideas.some((i) => i.no === ideaNo));
  await page.getByLabel('Yedek dosyası').setInputFiles(bpath);
  await page.getByRole('dialog').getByRole('button', { name: 'Tamamen değiştir' }).click();
  await page.waitForTimeout(300);
  assert.ok((await state()).ideas.some((i) => i.no === ideaNo));
});
await step('Veri dosyası oluşturulur; değişiklikler dosyaya yazılır', async () => {
  await page.getByRole('button', { name: 'Yeni veri dosyası oluştur' }).click();
  await page.locator('[data-testid=storage-panel] .pill', { hasText: 'Dosyaya bağlı' }).waitFor();
  assert.match(await page.getByTestId('storage-chip').textContent(), /crid-veri\.json/);
  await page.evaluate(async () => { const st = window.__crid.store; await st.saveIdea({ title: 'Dosyaya yazılan fikir', categoryId: 'cat-tz', maturity: 'raw', vehicleIds: [] }); });
  await page.waitForTimeout(1500);
  const txt = await page.evaluate(() => window.__fakeRead());
  const fp = JSON.parse(txt);
  assert.ok(Object.values(fp.docs).some((d) => d.title === 'Dosyaya yazılan fikir'));
});
await step('Başka bir kullanıcının dosyaya yazdığı değişiklik birleştirilir', async () => {
  // başka bilgisayardan yazılmış gibi: dosyaya doğrudan yeni bir fikir ve var olan kayıtta değişiklik ekle
  await page.evaluate(async () => {
    const p = JSON.parse(window.__fakeRead());
    const now = Date.now() + 5000;
    p.docs['ideas/idea-remote-1'] = { no: 'FH-2026-0999', title: 'Uzaktan eklenen fikir', categoryId: 'cat-ud', maturity: 'raw', vehicleIds: [] }; p.mt['ideas/idea-remote-1'] = now;
    p.docs['crids/crid-sample-004'] = { ...p.docs['crids/crid-sample-004'], title: 'Desen İptali (uzaktan güncellendi)' }; p.mt['crids/crid-sample-004'] = now;
    window.__fakeWrite(JSON.stringify(p));
  });
  await page.getByRole('button', { name: 'Şimdi eşitle' }).click();
  await page.waitForTimeout(400);
  const s = await state();
  assert.ok(s.ideas.some((i) => i.title === 'Uzaktan eklenen fikir'));
  assert.equal(s.crids.find((c) => c.id === 'crid-sample-004').title, 'Desen İptali (uzaktan güncellendi)');
  assert.ok(s.ideas.some((i) => i.title === 'Dosyaya yazılan fikir'), 'yerel kayıt kaybolmamalı');
});
await step('Dosya değişikliği otomatik algılanır (elle eşitlemeden)', async () => {
  await page.evaluate(async () => {
    const p = JSON.parse(window.__fakeRead());
    p.docs['ideas/idea-remote-2'] = { no: 'FH-2026-0998', title: 'Otomatik algılanan fikir', categoryId: 'cat-ud', maturity: 'raw', vehicleIds: [] }; p.mt['ideas/idea-remote-2'] = Date.now() + 9000;
    window.__fakeWrite(JSON.stringify(p));
  });
  await page.waitForFunction(() => window.__crid.store.getState().ideas.some((i) => i.title === 'Otomatik algılanan fikir'), null, { timeout: 12000 });
});
await step('Sayfa yeniden açılınca veriler korunur', async () => {
  await page.reload();
  await page.waitForSelector('h1');
  await page.waitForTimeout(500);
  assert.ok((await state()).ideas.some((i) => i.title === 'Otomatik algılanan fikir'));
  await page.screenshot({ path: join(SCR, 'off-dash.png') });
});
await step('Bağlantı kesilince veriler bu bilgisayarda kalır', async () => {
  await nav('Master Data');
  await page.getByRole('tab', { name: 'Veri', exact: true }).click();
  if (await page.getByRole('button', { name: 'Bağlantıyı kes' }).count()) await page.getByRole('button', { name: 'Bağlantıyı kes' }).click();
  await page.waitForTimeout(300);
  assert.match(await page.getByTestId('storage-chip').textContent(), /Bu bilgisayarda/);
  assert.ok((await state()).ideas.some((i) => i.title === 'Otomatik algılanan fikir'));
});
await step('Doküman eki dosya içine gömülü saklanır', async () => {
  writeFileSync(join(SCR, 'ek.txt'), 'teknik resim notu');
  await nav('CRID Listesi');
  await page.getByTestId('crid-table').locator('tbody tr.click').first().click();
  await page.getByRole('tab', { name: /Dokümanlar/ }).click();
  await page.locator('input[type=file]').setInputFiles(join(SCR, 'ek.txt'));
  await page.getByRole('link', { name: /ek\.txt/ }).waitFor();
  const href = await page.getByRole('link', { name: /ek\.txt/ }).getAttribute('href');
  assert.match(href, /^data:/);
});

console.log(`\n${passed} geçti, ${failed} başarısız; sayfa hataları: ${errors.length ? errors : 'yok'}; harici istek: ${external.length}`);
await browser.close();
process.exit(failed || errors.length || external.length ? 1 : 0);
