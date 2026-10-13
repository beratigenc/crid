// Uçtan uca senaryolar (yerel/demo modu, gerçek tarayıcı).
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import http from 'node:http';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const SCR = '/tmp/claude-0/-home-claude-crid/9050dcd1-0ede-5808-8df8-d1f3fabc05a6/scratchpad/';
const html = readFileSync('dist/test.html');
const srv = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html); }).listen(0);
const URL = `http://localhost:${srv.address().port}/`;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, acceptDownloads: true });
const page = await ctx.newPage();
page.setDefaultTimeout(6000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_FAILED|Failed to load resource/.test(m.text())) errors.push(m.text()); });
await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());

let passed = 0, failed = 0;
async function step(name, fn) {
  try { await fn(); passed++; console.log('  ✓', name); }
  catch (e) { failed++; console.log('  ✗', name, '\n     ', String(e.message).split('\n').slice(0, 4).join('\n      ')); for (let k = 0; k < 3; k++) await page.keyboard.press('Escape').catch(() => {}); await page.screenshot({ path: SCR + 'fail-' + name.replace(/[^a-z0-9]/gi, '_').slice(0, 40) + '.png', fullPage: true }).catch(() => {}); }
}
const nav = async (label) => { await page.getByRole('navigation').getByRole('button', { name: label }).first().click(); await page.waitForTimeout(150); };
const asUser = async (name) => {
  await page.getByTestId('user-chip').click();
  await page.getByRole('menuitem', { name: new RegExp(name) }).click();
  await page.waitForTimeout(150);
};
const toastText = async () => (await page.locator('.toast').last().textContent({ timeout: 3000 }));
const dialog = () => page.getByRole('dialog').last();
const state = () => page.evaluate(() => window.__crid.store.getState());

await page.goto(URL);
await page.evaluate(() => { localStorage.clear(); });
await page.goto(URL);
await page.waitForSelector('h1');

console.log('Fikir Havuzu → CRID');
let ideaNo, cridId, cridNo;
await step('Fikir Oluşturucu yeni fikir açar', async () => {
  await asUser('Burak');
  await nav('Fikir Havuzu');
  await page.getByRole('button', { name: 'Yeni fikir' }).click();
  // zorunlu alan doğrulaması
  await dialog().getByRole('button', { name: 'Kaydet' }).click();
  assert.match(await toastText(), /Zorunlu/);
  await page.fill('#i-title', 'E2E Test Fikri: Koltuk kumaşı alternatifi');
  await page.fill('#i-prob', 'Kumaş fiyatı yükseldi');
  await page.selectOption('#i-cat', { label: 'Tedarik Zinciri' });
  await page.selectOption('#i-sub', { label: 'Alternatif kaynak' });
  await page.fill('#i-pot', '42');
  await page.selectOption('#i-basis', 'unit');
  await page.fill('#i-est', '2026-12');
  await dialog().getByRole('button', { name: 'Sultan Comfort' }).click();
  await dialog().getByRole('button', { name: 'Navigo' }).click();
  // Fikir oluşturucu dönüştüremez
  assert.equal(await dialog().getByRole('button', { name: "CRID'e Dönüştür" }).count(), 0);
  await dialog().getByRole('button', { name: 'Kaydet' }).click();
  const t = await toastText();
  ideaNo = t.match(/FH-\d{4}-\d{4}/)[0];
  assert.equal(ideaNo, 'FH-2026-0011');
  const s = await state();
  assert.ok(s.ideas.find((i) => i.no === ideaNo && i.createdBy === 'usr-burak'));
});

await step('Salt okuma kullanıcısı kayıt açamaz, dışa aktaramaz', async () => {
  await asUser('Selin');
  await nav('Fikir Havuzu');
  assert.equal(await page.getByRole('button', { name: 'Yeni fikir' }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Dışa aktar' }).count(), 0);
  await nav('CRID Listesi');
  assert.equal(await page.getByRole('button', { name: 'Yeni CRID' }).count(), 0);
});

await step('CRID Sorumlusu değerlendirir ve CRIDe dönüştürür (veri kaybı yok)', async () => {
  await asUser('Ayşe');
  await nav('Fikir Havuzu');
  await page.getByTestId('pool-table').getByText('E2E Test Fikri').click();
  await dialog().getByRole('tab', { name: 'Ön değerlendirme' }).click();
  await page.selectOption('#e-pot', '4');
  await page.selectOption('#e-feas', '5');
  await page.fill('#e-note', 'Hızlı uygulanabilir');
  await dialog().getByRole('button', { name: "CRID'e Dönüştür" }).click();
  await page.getByRole('dialog').filter({ hasText: 'benzersiz bir CRID' }).getByRole('button', { name: 'Dönüştür', exact: true }).click();
  await page.waitForSelector('.rec-title');
  cridNo = (await page.locator('.rec-no').textContent()).match(/CRID-\d{4}-\d{4}/)[0];
  assert.equal(cridNo, 'CRID-2026-0044');
  assert.equal(await page.locator('.rec-title').textContent(), 'E2E Test Fikri: Koltuk kumaşı alternatifi');
  const s = await state();
  const c = s.crids.find((x) => x.no === cridNo);
  cridId = c.id;
  assert.equal(c.unitBenefit, '42');
  assert.deepEqual(c.targetVehicleIds, ['veh-sc', 'veh-nv']);
  assert.equal(c.ms.sopTarget, '2026-12-01');
  assert.equal(c.categoryId, 'cat-tz');
  assert.equal(c.source.evaluation.note, 'Hızlı uygulanabilir');
  assert.equal(c.sourcePoolNo, ideaNo);
  const i = s.ideas.find((x) => x.no === ideaNo);
  assert.equal(i.maturity, 'converted');
  assert.equal(i.convertedCridId, cridId);
  assert.ok(await page.getByText(`Kaynak: ${ideaNo}`).isVisible());
});

console.log('CRID düzenleme, milestone, alt detay');
await step('Ana bilgiler ve milestone hedefleri düzenlenir, audit yazılır', async () => {
  await page.getByRole('button', { name: 'Düzenle' }).click();
  await page.selectOption('#c-team', { label: 'Satın Alma' });
  await page.selectOption('#c-resp', { label: 'Ayşe Kaya' });
  await page.fill('#c-pub', '100000999001');
  await page.getByRole('tab', { name: 'Milestone' }).click();
  await page.getByLabel('Yayın hedef').fill('2026-09-01');
  await page.getByLabel('İlk numune hedef').fill('2026-11-01');
  await page.getByRole('button', { name: 'Kaydet' }).click();
  assert.match(await toastText(), /kaydedildi/);
  const c = (await state()).crids.find((x) => x.id === cridId);
  assert.equal(c.publicationNo, '100000999001');
  assert.equal(c.ms.releaseTarget, '2026-09-01');
  const last = c.history[c.history.length - 1];
  assert.ok(last.changes.some((ch) => ch.field === 'ms.releaseTarget'));
  // yayın hedefi geçti → otomatik Gecikmiş
  assert.ok(await page.locator('.rec-head .pill', { hasText: 'Gecikmiş' }).first().isVisible());
});

await step('Gelecek tarihli gerçekleşme reddedilir', async () => {
  await page.getByRole('button', { name: 'Düzenle' }).click();
  await page.getByRole('tab', { name: 'Milestone' }).click();
  await page.getByLabel('Yayın gerçekleşen').fill('2030-01-01');
  await page.getByRole('button', { name: 'Kaydet' }).click();
  assert.match(await toastText(), /düzeltin/);
  assert.ok(await page.getByText('ileri bir tarih olamaz').isVisible());
  await page.getByLabel('Yayın gerçekleşen').fill('2026-09-20');
  await page.getByRole('button', { name: 'Kaydet' }).click();
  await page.waitForTimeout(150);
  const c = (await state()).crids.find((x) => x.id === cridId);
  assert.equal(c.ms.releaseActual, '2026-09-20');
});

await step('Alt detay ekleme (Add): iptal−ilave etkisi hesaplanır', async () => {
  await page.getByRole('tab', { name: /Alt detay/ }).click();
  await page.getByRole('button', { name: /Add — alt detay ekle/ }).click();
  await page.fill('#s-pn', 'KMS-001');
  await page.fill('#s-name', 'Koltuk kumaşı');
  await page.fill('#del-pn', 'KMS-OLD');
  await page.fill('#del-qty', '10');
  await page.fill('#del-price', '12');
  await page.fill('#add-pn', 'KMS-NEW');
  await page.fill('#add-qty', '10');
  await page.fill('#add-price', '10');
  await page.selectOption('#add-cur', 'USD');
  // 120 − 10*10*0.851 = 34.9
  assert.match(await dialog().locator('.kpi').first().textContent(), /34,90/);
  await dialog().getByRole('button', { name: 'Kaydet' }).click();
  assert.match(await toastText(), new RegExp(`${cridNo}-01 eklendi`));
  await page.getByRole('button', { name: /Add — alt detay ekle/ }).click();
  await page.fill('#s-name', 'Silinecek satır');
  await page.selectOption('#s-mode', 'manual');
  await page.fill('#s-mi', '5');
  await dialog().getByRole('button', { name: 'Kaydet' }).click();
  await page.waitForTimeout(150);
  assert.equal(await page.getByTestId('sub-table').locator('tbody tr').count(), 3); // 2 satır + toplam
});

await step('Alt detay silme (Delete) ve geçmişe yazılması', async () => {
  await page.getByRole('button', { name: `${cridNo}-02 sil` }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Sil', exact: true }).click();
  await page.waitForTimeout(200);
  const s = await state();
  assert.equal(s.subs.filter((x) => x.cridId === cridId).length, 1);
  assert.ok(s.crids.find((x) => x.id === cridId).history.some((h) => /Alt detay silindi/.test(h.note)));
});

await step('Birim fayda kaynağı alt detaylara alınır; araç bazlı hacim hesaplanır', async () => {
  await page.getByRole('button', { name: 'Düzenle' }).click();
  await page.getByRole('tab', { name: 'Finansal' }).click();
  await page.selectOption('#f-mode', 'subs');
  await page.getByRole('button', { name: 'Kaydet' }).click();
  await page.waitForTimeout(150);
  const kpi = await page.locator('.kpis .kpi').first().textContent();
  assert.match(kpi, /€ 35/);
  // Aralık hedefi: Comfort 88 + Navigo 36 adet × 34,9
  assert.match(await page.locator('.kpis .kpi').nth(1).textContent(), /€ 4\.32\d/);
});

await step('Kapanış finansal teyit olmadan engellenir', async () => {
  await page.getByRole('button', { name: 'Statü değiştir' }).click();
  await page.selectOption('#st-next', 'closed');
  assert.ok(await page.getByText('Finansal teyit verilmeden kayıt kapatılamaz.').isVisible());
  assert.ok(await dialog().getByRole('button', { name: 'Uygula' }).isDisabled());
  await page.selectOption('#st-next', 'live');
  assert.ok(await page.getByText('Devreye Giriş Gerçekleşme').first().isVisible());
  await dialog().getByRole('button', { name: 'Vazgeç' }).click();
});

await step('Devreye giriş gerçekleşince statü otomatik ilerler, Add/Delete dondurulur', async () => {
  await page.getByRole('button', { name: 'Düzenle' }).click();
  await page.getByRole('tab', { name: 'Milestone' }).click();
  await page.getByLabel('İlk numune gerçekleşen').fill('2026-10-01');
  await page.getByLabel('Devreye giriş (seri üretim) hedef').fill('2026-10-01');
  await page.getByLabel('Devreye giriş (seri üretim) gerçekleşen').fill('2026-10-06');
  await page.getByRole('button', { name: 'Kaydet' }).click();
  await page.waitForTimeout(250);
  const s = await state();
  const c = s.crids.find((x) => x.id === cridId);
  assert.equal(c.status, 'live');
  const sub = s.subs.find((x) => x.cridId === cridId);
  assert.ok(sub.frozen && Math.abs(sub.frozen.unitImpactBase - 34.9) < 1e-6);
  assert.equal(sub.frozen.at, '2026-10-06');
});

await step('Kur değişikliği dondurulmuş alt detayı etkilemez', async () => {
  await asUser('Zeynep');
  await nav('Master Data');
  await page.getByRole('tab', { name: /Para birimleri/ }).click();
  const usdRow = page.locator('tr', { has: page.locator('input[value="USD"]') });
  await usdRow.getByLabel(/1 birim/).fill('0.95');
  await page.getByRole('button', { name: 'Değişiklikleri kaydet' }).click();
  assert.match(await toastText(), /kaydedildi/);
  const s = await state();
  assert.equal(s.master.currencies.find((c) => c.code === 'USD').rate, 0.95);
  await page.evaluate(() => 0);
  const unit = await page.evaluate((id) => { const st = window.__crid.store; const d = st.derived(); const sub = d.subsByCrid.get(id)[0]; return sub.frozen.unitImpactBase; }, cridId);
  assert.ok(Math.abs(unit - 34.9) < 1e-6);
});

console.log('Finansal kontrol');
await step('CRID Sorumlusu teyit veremez; Finansal Kontrol teyit verir', async () => {
  await asUser('Ayşe');
  await nav('Finansal Kontrol');
  assert.equal(await page.getByTestId('finance-table').getByRole('button', { name: 'Kontrol et' }).count(), 0);
  await asUser('Elif');
  await nav('Finansal Kontrol');
  const row = page.getByTestId('finance-table').locator('tr', { hasText: cridNo });
  await row.getByRole('button', { name: 'Kontrol et' }).click();
  await page.fill('#fk-amt', '850');
  await page.fill('#fk-note', 'SAP fatura karşılaştırması yapıldı');
  await dialog().getByRole('button', { name: 'Teyit et' }).click();
  assert.match(await toastText(), /teyit verildi/);
  const c = (await state()).crids.find((x) => x.id === cridId);
  assert.equal(c.fin.status, 'confirmed');
  assert.equal(c.fin.by, 'usr-elif');
  assert.equal(c.fin.confirmedAmount, 850);
  assert.equal(c.status, 'finconf');
});

await step('Kapanış: tüm milestone ve teyit tamamlanınca kapanır, sonra kilitlenir', async () => {
  await asUser('Ayşe');
  await page.evaluate(() => 0);
  await nav('CRID Listesi');
  await page.getByLabel('CRID ara').fill(cridNo);
  await page.getByTestId('crid-table').locator('tbody tr.click').first().click();
  await page.getByRole('button', { name: 'Statü değiştir' }).click();
  await page.selectOption('#st-next', 'closed');
  await dialog().getByRole('button', { name: 'Uygula' }).click();
  assert.match(await toastText(), /Statü güncellendi/);
  const c = (await state()).crids.find((x) => x.id === cridId);
  assert.equal(c.status, 'closed');
  assert.equal(await page.getByRole('button', { name: 'Düzenle' }).count(), 0, 'kapalı kayıt CRID Sorumlusuna kilitli olmalı');
  await asUser('Can');
  assert.equal(await page.getByRole('button', { name: 'Düzenle' }).count(), 1, 'Yönetici kapalı kaydı düzenleyebilmeli');
});

console.log('Yetki, filtre, arama');
await step('Kategori Yöneticisi yalnız kendi kategorisini düzenler', async () => {
  await asUser('Mehmet');
  await nav('CRID Listesi');
  await page.getByLabel('CRID ara').fill('CRID-2026-0004'); // Ar-Ge
  await page.getByTestId('crid-table').locator('tbody tr.click').first().click();
  assert.equal(await page.getByRole('button', { name: 'Düzenle' }).count(), 1);
  await nav('CRID Listesi');
  await page.getByLabel('CRID ara').fill('CRID-2026-0033'); // Tedarik Zinciri
  await page.getByTestId('crid-table').locator('tbody tr.click').first().click();
  assert.equal(await page.getByRole('button', { name: 'Düzenle' }).count(), 0);
});

await step('"2027 Eylül devreye girecek CRIDler" tek filtreyle listelenir', async () => {
  await asUser('Can');
  await nav('CRID Listesi');
  await page.getByLabel('Yıl').selectOption('2027');
  await page.getByLabel('Ay').selectOption('9');
  await page.waitForTimeout(150);
  const rows = page.getByTestId('crid-table').locator('tbody tr.click');
  assert.equal(await rows.count(), 2);
  await page.getByRole('button', { name: 'Temizle' }).click();
  await page.getByLabel('Yıl').selectOption('2026');
});

await step('Gecikmiş filtresi ve gruplama', async () => {
  await page.getByRole('button', { name: /Tüm filtreler/ }).click();
  await page.getByLabel('Statü').selectOption('delayed');
  await page.waitForTimeout(100);
  const n = await page.getByTestId('crid-table').locator('tbody tr.click').count();
  assert.ok(n >= 5, `gecikmiş ${n}`);
  assert.equal(await page.getByTestId('crid-table').locator('tbody tr.late').count(), n);
  await page.getByLabel('Grupla').selectOption('cat');
  assert.ok(await page.getByTestId('crid-table').locator('tr.grp').count() >= 1);
  await page.getByLabel('Grupla').selectOption('');
  await page.getByRole('button', { name: 'Temizle' }).click();
});

await step('Hızlı arama: parça kodu ile alt detaydan ana CRIDe geçiş', async () => {
  await page.getByLabel('Hızlı arama').fill('12L51-36856');
  await page.getByRole('option', { name: /Alt detay/ }).first().click();
  await page.waitForSelector('[data-testid=sub-table]');
  assert.match(await page.locator('.rec-title').textContent(), /Geri Görüş Kamera/);
});

console.log('Plan, bütçe, raporlar');
await step('Üretim planı düzenlenir ve kaydedilir', async () => {
  await asUser('Ayşe');
  await nav('Üretim Planı');
  await page.getByLabel('Sultan Comfort Aralık').fill('120');
  await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await page.waitForTimeout(150);
  const p = (await state()).plans.find((x) => x.id === '2026_veh-sc');
  assert.equal(p.planned[11], 120);
  assert.ok(p.history.some((h) => h.changes.some((c) => c.field === 'planned')));
  await page.getByRole('tab', { name: 'Gerçekleşen üretim' }).click();
  await page.getByLabel('Sultan Comfort Ekim').fill('101');
  await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await page.waitForTimeout(150);
  assert.equal((await state()).plans.find((x) => x.id === '2026_veh-sc').actual[9], 101);
});

await step('Bütçe hedefi tanımlanır; araç detayına inilir', async () => {
  await nav('Bütçe / Hedef');
  const row = page.getByTestId('budget-table').locator('tr', { hasText: 'Territo' });
  await row.getByRole('button', { name: 'Hedef' }).click();
  await page.fill('#t-pu', '2400');
  await dialog().getByRole('button', { name: 'Doğrusal dağıt' }).click();
  await dialog().getByRole('button', { name: 'Kaydet' }).click();
  await page.waitForTimeout(150);
  const p = (await state()).plans.find((x) => x.id === '2026_veh-tr');
  assert.equal(p.targetPerUnit, '2400');
  assert.equal(p.monthlyTarget[11], 2400);
  assert.match(await row.textContent(), /€ 720\.000/);
  await page.getByTestId('budget-table').locator('tr', { hasText: 'Sultan Comfort' }).click();
  assert.equal(await page.locator('h1').textContent(), 'Sultan Comfort');
  assert.ok(await page.locator('svg.chart').count() >= 1);
});

await step('Raporlar: tüm sekmeler açılır, aylık sekmede ay detayına inilir', async () => {
  await nav('Yönetim Raporları');
  for (const t of ['Araç bazlı', 'Aylık devreye giriş', 'Kategori', 'Ekip', 'Gündem', 'Sorumlu', 'Statü', 'Milestone', 'Fikir havuzu']) {
    await page.getByRole('tab', { name: t, exact: true }).click();
    await page.waitForTimeout(60);
  }
  await page.getByRole('tab', { name: 'Aylık devreye giriş' }).click();
  await page.getByTestId('report-monthly').locator('tr', { hasText: 'Ağustos' }).click();
  assert.ok(await page.getByText('Ağustos 2026 — devreye girecek').isVisible());
});

await step('Excel dışa aktarım geçerli bir xlsx üretir', async () => {
  await nav('CRID Listesi');
  await page.getByRole('button', { name: 'Dışa aktar' }).click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: /Excel/ }).click()]);
  const path = SCR + 'export.xlsx';
  await dl.saveAs(path);
  const out = execFileSync('python3', ['-c', `import openpyxl,sys;wb=openpyxl.load_workbook(sys.argv[1]);ws=wb.active;print(ws.max_row, ws.cell(1,1).value, ws.cell(2,1).value, sep='|')`, path]).toString().trim();
  const [rows, h, v] = out.split('|');
  assert.equal(h, 'CRID No');
  assert.ok(+rows >= 40, out);
  assert.match(v, /CRID-2026-0001/);
});

await step('Add/Delete CSV içe aktarımı', async () => {
  const csv = '﻿Parça Kodu;Parça Adı;İptal Parça No;İptal Adet;İptal Fiyat;İptal PB;İlave Parça No;İlave Adet;İlave Fiyat;İlave PB;Durum\nP-1;Etiket;E-OLD;2;3,5;EUR;E-NEW;2;1;EUR;Açık\nP-2;Vida;V-OLD;4;1;EUR;;;;;Tamam\n';
  writeFileSync(SCR + 'ad.csv', csv);
  await page.getByLabel('CRID ara').fill('CRID-2026-0008');
  await page.getByTestId('crid-table').locator('tbody tr.click').first().click();
  await page.getByRole('tab', { name: /Alt detay/ }).click();
  await page.getByRole('button', { name: /Excel\/CSV'den al/ }).click();
  await page.getByLabel('Dosya seç').setInputFiles(SCR + 'ad.csv');
  await dialog().getByRole('button', { name: '2 satırı ekle' }).click();
  await page.waitForTimeout(250);
  const s = await state();
  const subs = s.subs.filter((x) => x.cridId === 'crid-sample-008');
  assert.equal(subs.length, 2);
  assert.equal(subs.find((x) => x.partNo === 'P-2').status, 'done');
});

await step('XLSX okuyucu: dışa aktarılan plan şablonu geri okunur', async () => {
  const rows = await page.evaluate(async () => {
    const { buildXlsx, readXlsx } = window.__cridTest || {};
    return null;
  });
  // okuyucu üretim paketinde; plan içe aktarma diyaloğundan test edilir
  await nav('Üretim Planı');
  await page.getByRole('button', { name: 'Şablon' }).click().catch(() => {});
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Şablon' }).click()]);
  const path = SCR + 'plan.xlsx';
  await dl.saveAs(path);
  // python ile doldur (gerçek Excel gibi sharedStrings kullanan, deflate sıkıştırmalı dosya)
  execFileSync('python3', ['-c', `import openpyxl,sys;wb=openpyxl.load_workbook(sys.argv[1]);ws=wb.active;ws.cell(2,4).value=77;ws.cell(2,15).value=88;wb.save(sys.argv[2])`, path, SCR + 'plan2.xlsx']);
  await page.getByRole('button', { name: /İçe aktar/ }).click();
  await page.getByLabel('Plan dosyası').setInputFiles(SCR + 'plan2.xlsx');
  await dialog().getByRole('button', { name: 'Aktar' }).click();
  await page.waitForTimeout(400);
  const p = (await state()).plans.find((x) => x.id === '2026_veh-sc');
  assert.equal(p.planned[0], 77);
  assert.equal(p.planned[11], 88);
  assert.equal(p.source, 'Şablon içe aktarım');
});

console.log('Master data ve audit');
await step('Master data: araç eklenir, yeni CRIDde seçilebilir', async () => {
  await asUser('Zeynep');
  await nav('Master Data');
  await page.getByRole('tab', { name: /Araçlar/ }).click();
  await page.getByRole('button', { name: 'Araç ekle' }).click();
  const last = page.locator('tbody tr').last();
  await last.getByLabel('Kod', { exact: true }).fill('ST');
  await last.getByLabel('Araç / model').fill('Sultan Maxi');
  await page.getByRole('button', { name: 'Değişiklikleri kaydet' }).click();
  assert.match(await toastText(), /kaydedildi/);
  await nav('CRID Listesi');
  await page.getByRole('button', { name: 'Yeni CRID' }).click();
  assert.ok(await page.getByRole('button', { name: 'Sultan Maxi' }).first().isVisible());
  await page.getByRole('button', { name: 'CRID oluştur' }).click();
  assert.match(await toastText(), /düzeltin/);
  await page.fill('#c-title', 'Doğrudan açılan CRID');
  await page.selectOption('#c-cat', { label: 'Üretim Direktörlüğü' });
  await page.locator('#c-target').getByRole('button', { name: 'Sultan Maxi' }).click();
  await page.getByRole('button', { name: 'CRID oluştur' }).click();
  assert.match(await toastText(), /CRID-\d{4}-\d{4} oluşturuldu/);
});

await step('Tekrarlanan araç kodu reddedilir', async () => {
  await nav('Master Data');
  await page.getByRole('tab', { name: /Araçlar/ }).click();
  await page.getByRole('button', { name: 'Araç ekle' }).click();
  const last = page.locator('tbody tr').last();
  await last.getByLabel('Kod', { exact: true }).fill('SC');
  await last.getByLabel('Araç / model').fill('Kopya');
  await page.getByRole('button', { name: 'Değişiklikleri kaydet' }).click();
  assert.match(await toastText(), /tekrar ediyor/);
  await page.getByRole('button', { name: 'Vazgeç' }).click();
});

await step('Yetki matrisi değiştirilir ve hemen uygulanır', async () => {
  await page.getByRole('tab', { name: 'Yetki matrisi' }).click();
  await page.getByLabel('Salt Okuma: Excel/CSV dışa aktarım').check();
  await page.getByRole('button', { name: 'Değişiklikleri kaydet' }).click();
  await page.waitForTimeout(100);
  await asUser('Selin');
  await nav('CRID Listesi');
  assert.equal(await page.getByRole('button', { name: 'Dışa aktar' }).count(), 1);
});

await step('Audit log tüm kayıt türlerini listeler', async () => {
  await asUser('Zeynep');
  await nav('Audit Log');
  const n = await page.getByTestId('audit-table').locator('tbody tr').count();
  assert.ok(n > 15, `audit ${n}`);
  await page.getByLabel('Kayıt türü').selectOption('master');
  assert.ok(await page.getByTestId('audit-table').locator('tbody tr').count() > 0);
  assert.match(await page.getByTestId('audit-table').locator('tbody').textContent(), /Master data/);
});

await step('Bildirimler rol bazlı', async () => {
  await asUser('Elif');
  await nav('Bildirimler');
  assert.ok(await page.getByText('Finansal kontrol bekliyor').first().isVisible());
  await asUser('Can');
  await nav('Bildirimler');
  assert.ok(await page.getByText(/gecikti/).first().isVisible());
  assert.ok(await page.getByText(/bütçe hedefinin altında/).first().isVisible());
});

await step('Kalıcılık: sayfa yenilense de veriler durur', async () => {
  await page.reload();
  await page.waitForSelector('h1');
  const s = await state();
  assert.ok(s.crids.find((c) => c.no === cridNo && c.status === 'closed'));
});

console.log('Duyarlı tasarım');
await step('Telefon genişliğinde yatay kaydırma yok', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const label of ['Ana Dashboard', 'CRID Listesi', 'Fikir Havuzu', 'Milestone Takvimi', 'Master Data']) {
    await page.getByRole('button', { name: 'Menüyü aç' }).click();
    await nav(label);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(over <= 1, `${label} taşma ${over}px`);
  }
  await page.screenshot({ path: SCR + 'mobile.png' });
  await page.setViewportSize({ width: 1440, height: 950 });
});

console.log(`\n${passed} geçti, ${failed} başarısız`);
console.log('Konsol hataları:', errors.length ? errors : 'yok');
await browser.close(); srv.close();
process.exit(failed || errors.length ? 1 : 0);
