import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import http from 'node:http';
import { readFileSync } from 'node:fs';
const html = readFileSync('dist/test.html');
const srv = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html); }).listen(0);
const port = srv.address().port;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
await page.goto(`http://localhost:${port}/`);
await page.waitForSelector('h1', { timeout: 15000 });
const shots = process.argv.slice(2);
const pages = ['dashboard', 'pool', 'crids', 'subs', 'milestones', 'plan', 'budget', 'finance', 'reports', 'master', 'audit', 'notifications'];
for (const p of pages) {
  await page.evaluate((p) => { location.hash = p; }, p);
  const label = { dashboard: 'Ana Dashboard', pool: 'Fikir Havuzu', crids: 'CRID Listesi', subs: 'Alt Detay (Add/Delete)', milestones: 'Milestone Takvimi', plan: 'Üretim Planı', budget: 'Bütçe / Hedef', finance: 'Finansal Kontrol', reports: 'Yönetim Raporları', master: 'Master Data', audit: 'Audit Log', notifications: 'Bildirimler' }[p];
  await page.getByRole('navigation').getByRole('button', { name: new RegExp('^' + label.replace(/[()/]/g, '.')) }).first().click();
  await page.waitForTimeout(250);
  const h1 = await page.locator('h1').first().textContent();
  console.log(p, '->', h1);
  if (shots.includes(p)) await page.screenshot({ path: `/tmp/claude-0/-home-claude/9050dcd1-0ede-5808-8df8-d1f3fabc05a6/scratchpad/${p}.png`, fullPage: true });
}
console.log('ERRORS', errors.length, errors.slice(0, 10));
await browser.close(); srv.close();
