// dist/crid.html  : artifact olarak yayınlanan sayfa (iskelet yayınlarken eklenir)
// dist/test.html  : yerel testler için tam HTML belgesi
import * as esbuild from '/opt/npm-tools/node_modules/esbuild/lib/main.js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const res = await esbuild.build({
  entryPoints: ['src/main.jsx'],
  bundle: true,
  minify: true,
  write: false,
  format: 'iife',
  target: ['es2020'],
  jsx: 'automatic',
  nodePaths: ['/opt/npm-tools/node_modules'],
  define: { 'process.env.NODE_ENV': '"production"' },
  legalComments: 'none',
  logLevel: 'warning',
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = readFileSync('src/ui/styles.css', 'utf8');
const head = `<title>CRID Portföy Takibi</title>
<meta name="description" content="Cost Reduction Ideas Database — maliyet azaltma fikirleri, bütçe ve proje takip sistemi">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Barlow+Semi+Condensed:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>${css}</style>`;
const body = `<div id="root"></div>\n<script>${js}</script>`;
mkdirSync('dist', { recursive: true });
writeFileSync('dist/crid.html', `${head}\n${body}\n`);
const full = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>[hidden]{display:none!important}body{margin:0}</style>${head}</head><body>${body}</body></html>`;
writeFileSync('dist/test.html', full);
writeFileSync('dist/index.html', full);
console.log(`crid.html ${(Buffer.byteLength(head + body) / 1024).toFixed(0)} KB`);

// Çevrimdışı tek dosya sürümü: sunucu/internet gerektirmez, harici kaynak yüklemez.
{
  const { readdirSync } = await import('node:fs');
  const MIME = { '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
  let logos = [];
  try {
    logos = readdirSync('branding').filter((f) => MIME[f.slice(f.lastIndexOf('.')).toLowerCase()]).sort().map((f) => ({
      id: 'repo-' + f, name: f.replace(/\.[^.]+$/, '').replace(/^\d+-/, ''),
      src: `data:${MIME[f.slice(f.lastIndexOf('.')).toLowerCase()]};base64,${readFileSync('branding/' + f).toString('base64')}`,
    }));
  } catch (e) { /* branding yok */ }
  const offlineHead = head.replace(/<link[^>]*fonts\.(googleapis|gstatic)[^>]*>/g, '').replace('<title>CRID Portföy Takibi</title>', '<title>CRID — Maliyet Azaltma Portföyü</title>');
  const flags = `<script>window.__CRID_HTML__=true;window.__CRID_DEFAULT_LOGOS__=${JSON.stringify(logos).replace(/</g, '\\u003c')};</script>`;
  const offline = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>[hidden]{display:none!important}body{margin:0}</style>${offlineHead}${flags}</head><body>${body}</body></html>`;
  writeFileSync('dist/crid-offline.html', offline);
  console.log(`crid-offline.html ${(Buffer.byteLength(offline) / 1024).toFixed(0)} KB, logo: ${logos.length}`);
}
