// Çevrimdışı HTML sürümü için veri paketi ve birleştirme.
// Paket biçimi: { format: 'crid-data', version: 1, savedAt, docs: {path: doc}, mt: {path: ts}, del: {path: ts} }
// mt: belgenin son değişiklik zamanı, del: silinme zamanı (mezar taşı). Aynı belge iki tarafta değiştiyse yenisi kazanır.

export const FORMAT = 'crid-data';

export function emptyPack() { return { format: FORMAT, version: 1, savedAt: 0, docs: {}, mt: {}, del: {} }; }

export function isPack(x) { return !!x && x.format === FORMAT && x.docs && typeof x.docs === 'object'; }

/** İki paketi belge düzeyinde birleştirir. Sonuç yeni bir pakettir; girişler değişmez. */
export function mergePacks(a, b) {
  const A = a && isPack(a) ? a : emptyPack();
  const B = b && isPack(b) ? b : emptyPack();
  const out = emptyPack();
  const paths = new Set([...Object.keys(A.docs), ...Object.keys(B.docs), ...Object.keys(A.del || {}), ...Object.keys(B.del || {})]);
  const state = (P, p) => {
    const m = P.mt?.[p] || 0, d = P.del?.[p] || 0;
    if (d && d >= m) return { t: d, deleted: true };
    if (p in P.docs) return { t: m, doc: P.docs[p] };
    return null;
  };
  for (const p of paths) {
    const sa = state(A, p), sb = state(B, p);
    const w = !sa ? sb : !sb ? sa : sb.t > sa.t ? sb : sa;
    if (!w) continue;
    if (w.deleted) out.del[p] = w.t;
    else { out.docs[p] = w.doc; out.mt[p] = w.t; }
  }
  out.savedAt = Math.max(A.savedAt || 0, B.savedAt || 0);
  return out;
}

/** Eski mezar taşlarını temizler (varsayılan 180 gün). */
export function pruneTombstones(pack, maxAgeMs = 180 * 86400000, now = Date.now()) {
  for (const [p, t] of Object.entries(pack.del || {})) if (now - t > maxAgeMs) delete pack.del[p];
  return pack;
}

/** Seed (örnek veri) nesnesini pakete çevirir. */
export function seedToPack(seed, ts = 1) {
  const pack = emptyPack();
  const put = (path, d) => { const x = { ...d }; delete x.id; pack.docs[path] = x; pack.mt[path] = ts; };
  put('master/main', seed.master);
  put('meta/counters', seed.counters);
  for (const p of seed.plans) put(`plans/${p.id}`, p);
  for (const c of seed.crids) put(`crids/${c.id}`, c);
  for (const s of seed.subs) put(`subs/${s.id}`, s);
  for (const i of seed.ideas) put(`ideas/${i.id}`, i);
  return pack;
}
