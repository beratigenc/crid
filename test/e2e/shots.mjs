import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import http from 'node:http';
import { readFileSync } from 'node:fs';
const html = readFileSync('dist/test.html');
const srv = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html); }).listen(0);
const port = srv.address().port;
const browser = await chromium.launch();
const W = +(process.env.W || 1440);
const page = await browser.newPage({ viewport: { width: W, height: 1000 }, colorScheme: process.env.DARK ? 'dark' : 'light' });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('ERR_FAILED')) errors.push(m.text()); });
await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
await page.goto(`http://localhost:${port}/`);
await page.waitForSelector('h1');
const out = '/tmp/claude-0/-home-claude/9050dcd1-0ede-5808-8df8-d1f3fabc05a6/scratchpad/';
const steps = JSON.parse(process.argv[2]);
for (const s of steps) {
  if (s.nav) await page.getByRole('navigation').getByRole('button', { name: s.nav }).first().click();
  if (s.click) await page.locator(s.click).first().click();
  if (s.text) await page.getByText(s.text, { exact: false }).first().click();
  if (s.role) await page.getByRole(s.role[0], { name: s.role[1] }).first().click();
  await page.waitForTimeout(300);
  if (s.shot) await page.screenshot({ path: out + s.shot + '.png', fullPage: !s.viewport });
}
console.log('ERRORS', errors);
await browser.close(); srv.close();
