// Bağımlılıksız, küçük XLSX yazıcı/okuyucu ve CSV yardımcıları.
// Yazıcı: sıkıştırmasız ZIP (stored) + SpreadsheetML. Okuyucu: stored/deflate (DecompressionStream).

const enc = new TextEncoder();

let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zipStore(files) {
  // files: [{name, data: Uint8Array}]
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, 0, true); lh.setUint16(12, 0x21, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, f.data.length, true); lh.setUint32(22, f.data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    chunks.push(new Uint8Array(lh.buffer), name, f.data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, 0, true); ch.setUint16(14, 0x21, true); ch.setUint32(16, crc, true); ch.setUint32(20, f.data.length, true); ch.setUint32(24, f.data.length, true);
    ch.setUint16(28, name.length, true); ch.setUint16(30, 0, true); ch.setUint16(32, 0, true); ch.setUint16(34, 0, true); ch.setUint16(36, 0, true);
    ch.setUint32(38, 0, true); ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + f.data.length;
  }
  const cdSize = central.reduce((a, c) => a + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  const all = [...chunks, ...central, new Uint8Array(end.buffer)];
  const total = all.reduce((a, c) => a + c.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of all) { out.set(c, p); p += c.length; }
  return out;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    // XML 1.0'da geçersiz kontrol karakterlerini at
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}
function colName(i) { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
function safeSheetName(n, used) {
  let s = String(n || 'Sayfa').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sayfa';
  let k = s, i = 2;
  while (used.has(k)) k = `${s.slice(0, 28)} ${i++}`;
  used.add(k);
  return k;
}

/**
 * sheets: [{ name, rows: any[][], header?: number (başlık satır sayısı, kalın), widths?: number[] }]
 * Uint8Array döner.
 */
export function buildXlsx(sheets) {
  const used = new Set();
  const names = sheets.map((s) => safeSheetName(s.name, used));
  const files = [];
  files.push({ name: '[Content_Types].xml', data: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`) });
  files.push({ name: '_rels/.rels', data: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`) });
  files.push({ name: 'xl/workbook.xml', data: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`) });
  files.push({ name: 'xl/_rels/workbook.xml.rels', data: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`) });
  files.push({ name: 'xl/styles.xml', data: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF13254B"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`) });
  sheets.forEach((sh, si) => {
    const hdr = sh.header ?? 1;
    const rows = sh.rows || [];
    const maxCols = rows.reduce((a, r) => Math.max(a, r.length), 0);
    const widths = sh.widths || Array.from({ length: maxCols }, (_, c) => {
      let w = 8;
      for (const r of rows.slice(0, 200)) { const v = r[c]; const l = v === null || v === undefined ? 0 : String(v).length; if (l > w) w = l; }
      return Math.min(60, w + 2);
    });
    const cols = widths.length ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
    const body = rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => {
      const ref = `${colName(ci)}${ri + 1}`;
      const style = ri < hdr ? ' s="1"' : '';
      if (v === null || v === undefined || v === '') return ri < hdr ? `<c r="${ref}"${style}/>` : '';
      if (typeof v === 'number' && isFinite(v)) return `<c r="${ref}"${ri < hdr ? style : (Number.isInteger(v) ? '' : ' s="2"')}><v>${v}</v></c>`;
      if (typeof v === 'boolean') return `<c r="${ref}" t="b"${style}><v>${v ? 1 : 0}</v></c>`;
      return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
    }).join('')}</row>`).join('');
    const pane = hdr ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${hdr}" topLeftCell="A${hdr + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` : '';
    const af = hdr && rows.length > hdr && maxCols ? `<autoFilter ref="A${hdr}:${colName(maxCols - 1)}${rows.length}"/>` : '';
    files.push({ name: `xl/worksheets/sheet${si + 1}.xml`, data: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${pane}${cols}<sheetData>${body}</sheetData>${af}</worksheet>`) });
  });
  return zipStore(files);
}

/* ---------------- CSV ---------------- */

export function buildCsv(rows, sep = ';') {
  const q = (v) => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v);
    return /[";\n\r,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map((r) => r.map(q).join(sep)).join('\r\n');
}

export function parseCsv(text) {
  const t = String(text || '').replace(/^﻿/, '');
  const firstLine = t.split(/\r?\n/)[0] || '';
  const counts = { ';': (firstLine.match(/;/g) || []).length, ',': (firstLine.match(/,/g) || []).length, '\t': (firstLine.match(/\t/g) || []).length };
  const sep = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [], cell = '', inQ = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (inQ) {
      if (ch === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else inQ = false; }
      else cell += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}

/* ---------------- XLSX okuyucu (tarayıcı) ---------------- */

async function inflateRaw(data) {
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([data]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function unzip(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) { if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; } }
  if (eocd < 0) throw new Error('Geçerli bir XLSX dosyası değil.');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const out = {};
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const lho = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
    const lnlen = dv.getUint16(lho + 26, true), lelen = dv.getUint16(lho + 28, true);
    const start = lho + 30 + lnlen + lelen;
    const raw = u8.subarray(start, start + csize);
    out[name] = { method, raw };
    p += 46 + nlen + elen + clen;
  }
  return {
    names: Object.keys(out),
    async text(name) {
      const f = out[name];
      if (!f) return null;
      const data = f.method === 0 ? f.raw : await inflateRaw(f.raw);
      return dec.decode(data);
    },
  };
}

/** İlk sayfayı (veya adı verilen sayfayı) satır dizisi olarak okur. */
export async function readXlsx(buf, sheetName) {
  const z = await unzip(buf);
  const parse = (s) => new DOMParser().parseFromString(s, 'application/xml');
  const wb = parse(await z.text('xl/workbook.xml'));
  const rels = parse((await z.text('xl/_rels/workbook.xml.rels')) || '<r/>');
  const sheets = [...wb.getElementsByTagName('sheet')];
  const sheet = (sheetName && sheets.find((s) => s.getAttribute('name') === sheetName)) || sheets[0];
  if (!sheet) throw new Error('Dosyada sayfa bulunamadı.');
  const rid = sheet.getAttribute('r:id') || sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
  const rel = [...rels.getElementsByTagName('Relationship')].find((r) => r.getAttribute('Id') === rid);
  let target = rel ? rel.getAttribute('Target') : 'worksheets/sheet1.xml';
  target = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
  const ssText = await z.text('xl/sharedStrings.xml');
  const shared = ssText ? [...parse(ssText).getElementsByTagName('si')].map((si) => [...si.getElementsByTagName('t')].map((t) => t.textContent).join('')) : [];
  const ws = parse(await z.text(target));
  const rows = [];
  for (const r of ws.getElementsByTagName('row')) {
    const ri = +(r.getAttribute('r') || rows.length + 1) - 1;
    const row = [];
    for (const c of r.getElementsByTagName('c')) {
      const ref = c.getAttribute('r') || '';
      const letters = ref.replace(/\d+/g, '');
      let ci = 0;
      for (const ch of letters) ci = ci * 26 + (ch.charCodeAt(0) - 64);
      ci = ci ? ci - 1 : row.length;
      const t = c.getAttribute('t');
      const vEl = c.getElementsByTagName('v')[0];
      let v = vEl ? vEl.textContent : '';
      if (t === 's') v = shared[+v] ?? '';
      else if (t === 'inlineStr') v = [...c.getElementsByTagName('t')].map((x) => x.textContent).join('');
      else if (t === 'b') v = v === '1';
      else if (v !== '' && !isNaN(+v)) v = +v;
      row[ci] = v;
    }
    rows[ri] = row;
  }
  return rows.map((r) => (r || []).map((v) => (v === undefined ? '' : v))).filter((r) => r.some((c) => String(c).trim() !== ''));
}

/** Excel seri tarihini ISO'ya çevirir; zaten metinse olduğu gibi normalize eder. */
export function excelDateToISO(v) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number') {
    const d = new Date(Math.round((v - 25569) * 86400000));
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return '';
}
