// İş kuralları, yetki kontrolü, audit farkı ve Fikir Havuzu → CRID dönüşümü.
import { ROLES } from './defaults.js';
import { clone, todayISO, num } from './util.js';
import { freezeSub } from './calc.js';

/* ---------------- Yetki ---------------- */

export function roleDef(key) { return ROLES.find((r) => r.key === key) || ROLES.find((r) => r.key === 'readonly'); }

/**
 * user: { id, role, categoryIds } — master.users kaydı (veya oturum kullanıcısı)
 * record: { categoryId, createdBy, ownerId } — kategoriye bağlı yetkiler için
 */
export function can(user, perm, master, record) {
  if (!user || user.readOnlyAccess) return false;
  const role = user.role || 'readonly';
  const perms = (master?.permissions || {})[role] || [];
  if (perm === 'pool.edit' && record && !perms.includes('pool.edit') && perms.includes('pool.editOwn')) {
    return record.createdBy === user.id || record.ownerId === user.id;
  }
  if (!perms.includes(perm)) return false;
  const def = roleDef(role);
  if (def.categoryScoped && record && record.categoryId && !['pool.create', 'export', 'audit.view'].includes(perm)) {
    return (user.categoryIds || []).includes(record.categoryId);
  }
  return true;
}

/* ---------------- Statü kuralları ---------------- */

export const CRITICAL_FIELDS = ['title', 'baseVehicleIds', 'targetVehicleIds', 'unitBenefit', 'unitMode', 'currency', 'annualTargetOverride', 'realizedOverride', 'categoryId', 'ms', 'fin'];

export function isLocked(crid) { return crid && ['closed'].includes(crid.status); }

/** Yeni statüye geçiş mümkün mü? Hata mesajı ya da null döner. */
export function validateStatusChange(crid, next) {
  const ms = crid.ms || {};
  const fin = crid.fin || {};
  if (next === 'live' && !ms.sopActual) return 'Devreye Girdi statüsü için "Devreye Giriş Gerçekleşme" tarihi girilmelidir.';
  if (next === 'finconf' && fin.status !== 'confirmed') return 'Finansal Teyit statüsü için önce Finansal Kontrol tarafından teyit verilmelidir.';
  if (next === 'closed') {
    if (fin.status !== 'confirmed') return 'Finansal teyit verilmeden kayıt kapatılamaz.';
    const missing = [];
    if (!ms.releaseActual && !ms.releaseNa) missing.push('Yayın');
    if (!ms.sampleActual && !ms.sampleNa) missing.push('İlk Numune');
    if (!ms.sopActual && !ms.sopNa) missing.push('Devreye Giriş');
    if (missing.length) return `Kapanış için gerçekleşen tarihi eksik milestone'lar: ${missing.join(', ')}.`;
  }
  if (next === 'cancelled' && !String(crid.cancelReason || '').trim()) return 'İptal için gerekçe yazılmalıdır.';
  return null;
}

/** Finansal teyit verilebilir mi? */
export function validateFinConfirm(crid) {
  if (!crid.ms?.sopActual) return 'Finansal teyit için devreye giriş gerçekleşmiş olmalıdır.';
  if (crid.status === 'cancelled') return 'İptal edilmiş kayda teyit verilemez.';
  return null;
}

/**
 * Kaydetme sırasında otomatik statü ilerletme.
 * Devreye giriş gerçekleşince "Devreye Girdi", teyit gelince "Finansal Teyit".
 * Teyit geri alınırsa (Revizyon) "Devreye Girdi"ye döner.
 */
export function autoAdvanceStatus(crid) {
  const s = crid.status || 'planned';
  if (['cancelled', 'closed'].includes(s)) return s;
  const confirmed = crid.fin?.status === 'confirmed';
  if (crid.ms?.sopActual) {
    if (confirmed) return 'finconf';
    if (s === 'finconf') return 'live';
    if (['pool', 'eval', 'planned', 'progress', 'delayed'].includes(s)) return 'live';
    return s;
  }
  if (s === 'live' || s === 'finconf') return 'progress';
  return s;
}

/** Devreye giriş gerçekleştiğinde Add/Delete listesini finansal olarak dondurur. */
export function freezeSubsIfNeeded(crid, subs, master, by) {
  if (!crid?.ms?.sopActual) return [];
  if (master?.settings?.autoFreezeOnSop === false) return [];
  return subs.filter((s) => !s.frozen).map((s) => freezeSub(s, master, crid.ms.sopActual, by));
}

/* ---------------- Numaralandırma ---------------- */

export function formatNo(prefix, year, seq) { return `${prefix}-${year}-${String(seq).padStart(4, '0')}`; }
export function formatSubNo(cridNo, seq) { return `${cridNo}-${String(seq).padStart(2, '0')}`; }

/* ---------------- Audit ---------------- */

export const FIELD_LABELS = {
  title: 'Fikir Başlığı', description: 'Açıklama', categoryId: 'Kategori', subCategory: 'Alt Kırılım', teamId: 'Ekip', agendaId: 'Gündem',
  scopeId: 'Kapsam', baseVehicleIds: 'Baz Araç', targetVehicleIds: 'Hedef Araç', responsibleId: 'Sorumlu', currency: 'Para Birimi',
  unitMode: 'Birim Fayda Kaynağı', unitBenefit: 'Birim Fayda', probability: 'Olasılık %', investment: 'Yatırım Maliyeti',
  annualTargetOverride: 'Yıllık Hedef Fayda (manuel)', realizedOverride: 'Gerçekleşen Fayda (manuel)', publicationNo: 'Yayın No',
  status: 'Statü', cancelReason: 'İptal Gerekçesi', attachments: 'Ekler', notes: 'Notlar',
  'ms.releaseTarget': 'Hedef Yayın', 'ms.releaseActual': 'Gerçekleşen Yayın', 'ms.releaseNa': 'Yayın N/A',
  'ms.sampleTarget': 'İlk Numune Hedefi', 'ms.sampleActual': 'İlk Numune Gerçekleşme', 'ms.sampleNa': 'İlk Numune N/A',
  'ms.sopTarget': 'Devreye Giriş Hedefi', 'ms.sopActual': 'Devreye Giriş Gerçekleşme', 'ms.sopNa': 'Devreye Giriş N/A',
  'ms.finTarget': 'Finansal Kontrol Hedef', 'fin.status': 'Finansal Kontrol Durumu', 'fin.date': 'Finansal Kontrol Tarihi',
  'fin.confirmedAmount': 'Teyit Edilen Tutar', 'fin.note': 'Finansal Not', 'fin.by': 'Teyit Eden',
  // havuz
  problem: 'Problem/Fırsat', potential: 'Tahmini Potansiyel', potentialCurrency: 'Potansiyel Para Birimi', vehicleIds: 'İlgili Araç',
  ownerId: 'Ekip/Sahip', maturity: 'Olgunluk', estSop: 'Tahmini Devreye Giriş', evaluation: 'Ön Değerlendirme',
  // alt detay
  partNo: 'Parça Kodu', partName: 'Parça Adı', currentState: 'Mevcut Durum', proposedState: 'Önerilen Durum', del: 'İptal Edilen Parça',
  add: 'İlave Edilen Parça', impactMode: 'Etki Hesabı', manualImpact: 'Manuel Birim Etki', manualCurrency: 'Manuel Etki Para Birimi',
  vehicleIdsSub: 'Geçerli Araçlar', volumeOverride: 'Yıllık Hacim (manuel)', frozen: 'Finansal Dondurma',
};

const SKIP = new Set(['history', 'updatedAt', 'updatedBy', 'createdAt', 'createdBy', 'id', 'source']);

function flat(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj || {})) {
    if (!prefix && SKIP.has(k)) continue;
    const key = prefix ? `${prefix}.${k}` : k;
    if ((k === 'ms' || k === 'fin') && v && typeof v === 'object' && !prefix) flat(v, key, out);
    else out[key] = v;
  }
  return out;
}
function norm(v) {
  if (v === undefined || v === null || v === '') return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** İki kayıt arasındaki değişen alanlar. */
export function diffRecords(before, after) {
  const a = flat(before || {});
  const b = flat(after || {});
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const changes = [];
  for (const k of keys) {
    if (norm(a[k]) !== norm(b[k])) changes.push({ field: k, label: FIELD_LABELS[k] || k, from: a[k] ?? '', to: b[k] ?? '' });
  }
  return changes;
}

export function appendHistory(record, entry, cap = 300) {
  const h = Array.isArray(record.history) ? record.history.slice() : [];
  h.push(entry);
  while (h.length > cap) h.shift();
  return h;
}

/* ---------------- Fikir Havuzu → CRID ---------------- */

/** Havuz kaydından ana CRID oluşturur; tüm havuz bilgisi kaynak olarak saklanır (veri kaybı yok). */
export function poolToCrid(idea, { no, id, userId, master }) {
  const src = clone(idea);
  delete src.history;
  const desc = [idea.problem ? `Problem/Fırsat: ${idea.problem}` : '', idea.description || ''].filter(Boolean).join('\n\n');
  return {
    id,
    no,
    title: idea.title || '',
    description: desc,
    categoryId: idea.categoryId || '',
    subCategory: idea.subCategory || '',
    teamId: idea.teamId || '',
    agendaId: idea.agendaId || '',
    scopeId: idea.scopeId || '',
    baseVehicleIds: [...(idea.vehicleIds || [])],
    targetVehicleIds: [...(idea.vehicleIds || [])],
    responsibleId: idea.ownerId || userId || '',
    currency: idea.potentialCurrency || master?.baseCurrency || 'EUR',
    unitMode: 'manual',
    unitBenefit: idea.potentialBasis === 'unit' ? (idea.potential ?? '') : '',
    probability: 25,
    investment: idea.investment ?? '',
    annualTargetOverride: '',
    realizedOverride: '',
    estimatedPotential: idea.potentialBasis === 'unit' ? '' : (idea.potential ?? ''),
    publicationNo: '',
    ms: { releaseTarget: '', releaseActual: '', sampleTarget: '', sampleActual: '', sopTarget: idea.estSop ? `${idea.estSop}-01` : '', sopActual: '', finTarget: '' },
    fin: { status: 'pending', date: '', by: '', confirmedAmount: '', note: '' },
    status: 'planned',
    notes: idea.notes || '',
    attachments: clone(idea.attachments || []),
    sourcePoolId: idea.id,
    sourcePoolNo: idea.no,
    source: src,
    sample: !!idea.sample,
  };
}

export function emptyCrid(master) {
  return {
    title: '', description: '', categoryId: '', subCategory: '', teamId: '', agendaId: '', scopeId: '',
    baseVehicleIds: [], targetVehicleIds: [], responsibleId: '', currency: master?.baseCurrency || 'EUR',
    unitMode: 'manual', unitBenefit: '', probability: 50, investment: '', annualTargetOverride: '', realizedOverride: '',
    estimatedPotential: '', publicationNo: '',
    ms: { releaseTarget: '', releaseActual: '', releaseNa: false, sampleTarget: '', sampleActual: '', sampleNa: false, sopTarget: '', sopActual: '', sopNa: false, finTarget: '' },
    fin: { status: 'pending', date: '', by: '', confirmedAmount: '', note: '' },
    status: 'planned', notes: '', attachments: [],
  };
}

export function emptyIdea(master, userId) {
  return {
    title: '', problem: '', description: '', categoryId: '', subCategory: '', potential: '', potentialBasis: 'annual', potentialCurrency: master?.baseCurrency || 'EUR',
    investment: '', vehicleIds: [], teamId: '', ownerId: userId || '', maturity: 'raw', notes: '', estSop: '', scopeId: '', agendaId: '',
    evaluation: { potential: '', feasibility: '', vehicleFit: '', agendaFit: '', note: '' }, attachments: [],
  };
}

export function emptySub(crid, master) {
  return {
    cridId: crid.id, partNo: '', partName: '', currentState: '', proposedState: '',
    del: { partNo: '', partName: '', qty: 1, price: '', currency: master?.baseCurrency || 'EUR', ratio: 1 },
    add: { partNo: '', partName: '', qty: 1, price: '', currency: master?.baseCurrency || 'EUR', ratio: 1 },
    impactMode: 'lines', manualImpact: '', manualCurrency: master?.baseCurrency || 'EUR',
    vehicleIds: [], volumeOverride: '', responsibleId: crid.responsibleId || '', status: 'open', frozen: null,
  };
}

/** Alt detayın yıllık finansal etkisi = birim etki × uygulanabilir hacim */
export function subAnnualImpact(unitBase, volume) { return num(unitBase) * num(volume); }

export { todayISO };
