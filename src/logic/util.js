// Genel yardımcılar: tarih, sayı biçimleri, kimlik üretimi.

export const MONTHS_TR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
export const MONTHS_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

let _now = null;
/** Testlerde sabit "bugün" vermek için. */
export function setNow(d) { _now = d ? new Date(d) : null; }
export function now() { return _now ? new Date(_now) : new Date(); }
export function todayISO() { return toISODate(now()); }

export function toISODate(d) {
  if (!d) return '';
  const x = d instanceof Date ? d : new Date(d);
  if (isNaN(x)) return '';
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 'YYYY-MM-DD' -> yerel gece yarısı Date. */
export function parseISO(s) {
  if (!s || typeof s !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3]);
}

export function daysBetween(a, b) {
  const da = typeof a === 'string' ? parseISO(a) : a;
  const db = typeof b === 'string' ? parseISO(b) : b;
  if (!da || !db) return null;
  return Math.round((db - da) / 86400000);
}

export function monthKey(iso) { return iso && iso.length >= 7 ? iso.slice(0, 7) : ''; }
export function yearOf(iso) { return iso && iso.length >= 4 ? +iso.slice(0, 4) : null; }
export function monthIndex(iso) { return iso && iso.length >= 7 ? +iso.slice(5, 7) - 1 : null; }

export function fmtDate(iso) {
  const d = parseISO(iso);
  if (!d) return '';
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}
export function fmtMonthKey(mk) {
  if (!mk) return '';
  const [y, m] = mk.split('-');
  return `${MONTHS_SHORT[+m - 1]}.${y.slice(2)}`;
}
export function fmtDateTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d)) return '';
  return `${fmtDate(toISODate(d))} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const nfCache = {};
function nf(digits) {
  const k = String(digits);
  if (!nfCache[k]) nfCache[k] = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return nfCache[k];
}
export function fmtNum(v, digits = 0) {
  if (v === null || v === undefined || v === '' || isNaN(v)) return '–';
  return nf(digits).format(+v);
}
const SYMBOLS = { EUR: '€', USD: '$', TRY: '₺', GBP: '£' };
export function curSymbol(c) { return SYMBOLS[c] || c || ''; }
export function fmtMoney(v, currency = 'EUR', digits = 0) {
  if (v === null || v === undefined || v === '' || isNaN(v)) return '–';
  const s = curSymbol(currency);
  return `${s} ${nf(digits).format(+v)}`;
}
/** Kısa para: 3,28 M€ / 512 B€ */
export function fmtMoneyShort(v, currency = 'EUR') {
  if (v === null || v === undefined || isNaN(v)) return '–';
  const s = curSymbol(currency);
  const a = Math.abs(v);
  if (a >= 1e6) return `${s} ${nf(2).format(v / 1e6)} M`;
  if (a >= 1e4) return `${s} ${nf(0).format(v / 1e3)} B`;
  return `${s} ${nf(0).format(v)}`;
}
export function fmtPct(v, digits = 0) {
  if (v === null || v === undefined || isNaN(v) || !isFinite(v)) return '–';
  return `%${nf(digits).format(v * 100)}`;
}

export function num(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const s = String(v).trim().replace(/\s/g, '');
  // Türkçe biçim: 1.234,56  |  İngilizce: 1,234.56
  let t = s;
  if (/,\d{1,}$/.test(s) && s.includes('.')) t = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d+,\d+$/.test(s)) t = s.replace(',', '.');
  else t = s.replace(/,/g, '');
  const n = parseFloat(t);
  return isFinite(n) ? n : 0;
}
export function numOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  return num(v);
}

export function uid(prefix = '') {
  const r = Math.random().toString(36).slice(2, 8);
  const t = Date.now().toString(36).slice(-5);
  return `${prefix}${t}${r}`;
}

export function clone(o) { return o === undefined ? undefined : JSON.parse(JSON.stringify(o)); }

export function sum(arr, f = (x) => x) { let s = 0; for (const x of arr) s += num(f(x)); return s; }

export function groupBy(arr, keyFn) {
  const m = new Map();
  for (const x of arr) {
    const k = keyFn(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
}

export function trLower(s) { return String(s || '').toLocaleLowerCase('tr-TR'); }
export function includesTR(hay, needle) { return trLower(hay).includes(trLower(needle)); }

export function cmp(a, b) {
  if (a === b) return 0;
  if (a === null || a === undefined || a === '') return 1;
  if (b === null || b === undefined || b === '') return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'tr', { numeric: true });
}
