// CRID hesap motoru: kur dönüşümü, alt detay etkisi, hacim bazlı finansal fayda,
// milestone durumları, araç ve bütçe özetleri. Saf fonksiyonlar; UI'dan bağımsız test edilir.
import { num, numOrNull, parseISO, yearOf, monthIndex, daysBetween, todayISO, now } from './util.js';

/* ---------------- Kur ---------------- */

export function rateOf(master, currency, rates) {
  if (!currency) return 1;
  if (rates && rates[currency] !== undefined) return num(rates[currency]) || 0;
  const base = master?.baseCurrency || 'EUR';
  if (currency === base) return 1;
  const c = (master?.currencies || []).find((x) => x.code === currency);
  return c ? num(c.rate) : 1;
}
export function ratesSnapshot(master) {
  const r = {};
  for (const c of master?.currencies || []) r[c.code] = num(c.rate);
  r[master?.baseCurrency || 'EUR'] = 1;
  return r;
}
/** Tutarı raporlama para birimine (varsayılan EUR) çevirir. */
export function toBase(amount, currency, master, rates) {
  return num(amount) * rateOf(master, currency, rates);
}
export function fromBase(amountBase, currency, master) {
  const r = rateOf(master, currency);
  return r ? num(amountBase) / r : 0;
}

/* ---------------- Alt detay (Add/Delete) ---------------- */

/** Bir iptal/ilave satırının baz para birimindeki değeri: adet × fiyat × oran × kur */
export function lineBase(line, master, rates) {
  if (!line) return 0;
  const qty = line.qty === '' || line.qty === undefined || line.qty === null ? 1 : num(line.qty);
  const ratio = line.ratio === '' || line.ratio === undefined || line.ratio === null ? 1 : num(line.ratio);
  return qty * num(line.price) * ratio * rateOf(master, line.currency || master?.baseCurrency, rates);
}

/** Dondurma yokken (canlı fiyat ve kurla) birim etki. Pozitif = maliyet azalımı. */
export function subLiveImpactBase(sub, master) {
  if (!sub) return 0;
  if (sub.impactMode === 'manual') return toBase(sub.manualImpact, sub.manualCurrency || master?.baseCurrency, master);
  return lineBase(sub.del, master) - lineBase(sub.add, master);
}

/** Hesaplarda kullanılan birim etki: dondurulmuşsa donmuş değer, değilse canlı değer. */
export function subUnitImpactBase(sub, master) {
  if (sub?.frozen && sub.frozen.unitImpactBase !== undefined) return num(sub.frozen.unitImpactBase);
  return subLiveImpactBase(sub, master);
}

export function isActiveSub(s) { return s && s.status !== 'cancel'; }

export function subVehicleIds(sub, crid) {
  if (sub?.vehicleIds && sub.vehicleIds.length) return sub.vehicleIds;
  return crid?.targetVehicleIds || [];
}

/** Dondurma anlık görüntüsü oluşturur (devreye giriş tarihinde). */
export function freezeSub(sub, master, at, by) {
  return {
    ...sub,
    frozen: {
      unitImpactBase: subLiveImpactBase(sub, master),
      delBase: lineBase(sub.del, master),
      addBase: lineBase(sub.add, master),
      rates: ratesSnapshot(master),
      at: at || todayISO(),
      by: by || null,
    },
  };
}

/* ---------------- CRID birim fayda ---------------- */

/** Araç bazında birim fayda (baz para biriminde). */
export function cridUnitByVehicle(crid, subs, master) {
  const out = {};
  const targets = crid?.targetVehicleIds || [];
  if (!crid) return out;
  const useSubs = crid.unitMode === 'subs';
  if (!useSubs) {
    const u = toBase(crid.unitBenefit, crid.currency || master?.baseCurrency, master);
    for (const v of targets) out[v] = u;
    return out;
  }
  for (const v of targets) out[v] = 0;
  for (const s of (subs || []).filter(isActiveSub)) {
    const imp = subUnitImpactBase(s, master);
    for (const v of subVehicleIds(s, crid)) {
      if (targets.length && !targets.includes(v)) continue;
      out[v] = (out[v] || 0) + imp;
    }
  }
  return out;
}

/** Listelerde gösterilen birim fayda: ilk hedef aracın değeri (yoksa tekil değer). */
export function cridUnitHeadline(crid, subs, master) {
  const by = cridUnitByVehicle(crid, subs, master);
  const keys = Object.keys(by);
  if (keys.length) return by[crid.targetVehicleIds?.[0]] ?? by[keys[0]];
  if (crid?.unitMode === 'subs') return (subs || []).filter(isActiveSub).reduce((a, s) => a + subUnitImpactBase(s, master), 0);
  return toBase(crid?.unitBenefit, crid?.currency || master?.baseCurrency, master);
}

/* ---------------- Üretim planı / hacim ---------------- */

export function planId(year, vehicleId) { return `${year}_${vehicleId}`; }
export function planFor(plans, year, vehicleId) {
  if (!plans) return null;
  if (plans instanceof Map) return plans.get(planId(year, vehicleId)) || null;
  return plans[planId(year, vehicleId)] || null;
}

function arr12(a) { const out = new Array(12).fill(0); if (Array.isArray(a)) for (let i = 0; i < 12; i++) out[i] = num(a[i]); return out; }

/**
 * Aylık hacim dizisi. kind: 'planned' | 'actual'.
 * 'actual' için gerçekleşen adet girilmemiş, geçmiş/içinde bulunulan aylarda
 * ayar açıksa plan hacmi kullanılır (SAP entegrasyonu gelene kadar).
 */
export function monthlyVolumes(plan, kind, settings, year) {
  if (!plan) return new Array(12).fill(0);
  const planned = arr12(plan.planned);
  if (kind !== 'actual') return planned;
  const out = new Array(12).fill(0);
  const t = now();
  const fallback = settings ? settings.realizedUsePlanFallback !== false : true;
  for (let i = 0; i < 12; i++) {
    const a = Array.isArray(plan.actual) ? plan.actual[i] : null;
    if (a !== null && a !== undefined && a !== '') out[i] = num(a);
    else if (fallback) {
      const started = year < t.getFullYear() || (year === t.getFullYear() && i <= t.getMonth());
      out[i] = started ? planned[i] : 0;
    }
  }
  return out;
}
export function annualVolume(plan, kind = 'planned', settings, year) {
  return monthlyVolumes(plan, kind, settings, year ?? plan?.year).reduce((a, b) => a + b, 0);
}

/**
 * Devreye giriş tarihinden yıl sonuna kadar uygulanabilir hacim.
 * Fayda yalnızca devreye giriş yılında sayılır (önceki yıl devreye girenler baz maliyete dahildir).
 */
export function volumeFrom(plan, year, fromISO, kind, settings) {
  if (!plan || !fromISO) return 0;
  const y = yearOf(fromISO);
  if (y !== year) return 0;
  const start = monthIndex(fromISO);
  const v = monthlyVolumes(plan, kind, settings, year);
  let s = 0;
  for (let i = start; i < 12; i++) s += v[i];
  return s;
}

/**
 * Alt detayın uygulanabilir yıllık hacmi: manuel değer ya da geçerli araçların
 * devreye giriş ayından yıl sonuna kadar plan hacmi (devreye giriş yoksa tam yıl).
 */
export function subVolume(sub, crid, ctx, year) {
  const ov = numOrNull(sub?.volumeOverride);
  if (ov !== null) return ov;
  const settings = ctx.master?.settings || {};
  const sop = forecastSop(crid);
  const y = year ?? (sop ? yearOf(sop) : settings.reportYear);
  let s = 0;
  for (const v of subVehicleIds(sub, crid)) {
    const plan = planFor(ctx.plans, y, v);
    s += sop && yearOf(sop) === y ? volumeFrom(plan, y, sop, 'planned', settings) : annualVolume(plan, 'planned', settings, y);
  }
  return s;
}

/* ---------------- CRID yıllık finansal ---------------- */

/** Tahmini devreye giriş: gerçekleşen varsa o, yoksa hedef. */
export function forecastSop(crid) { return crid?.ms?.sopActual || crid?.ms?.sopTarget || ''; }

/**
 * Bir CRID'in belirli yıldaki finansal görünümü (baz para biriminde).
 * planned  : hedef devreye giriş tarihine göre (Yıllık Hedef Fayda)
 * forecast : gerçekleşen varsa gerçekleşen, yoksa hedef tarihe göre (projelendirilen)
 * realized : gerçekleşen devreye giriş + gerçekleşen hacim
 * confirmed: finansal kontrolün teyit ettiği tutar
 */
export function cridYearFinancials(crid, ctx, year) {
  const { master, plans, subsByCrid } = ctx;
  const settings = master?.settings || {};
  const subs = subsByCrid ? (subsByCrid.get ? subsByCrid.get(crid.id) : subsByCrid[crid.id]) || [] : [];
  const unitBy = cridUnitByVehicle(crid, subs, master);
  const res = {
    year, unitByVehicle: unitBy,
    plannedBase: 0, forecastBase: 0, realizedBase: 0, confirmedBase: 0, potentialBase: 0, weightedBase: 0,
    plannedByVehicle: {}, forecastByVehicle: {}, realizedByVehicle: {}, volumeByVehicle: {},
    plannedComputed: 0, realizedComputed: 0, plannedOverride: false, realizedOverride: false,
  };
  const cancelled = crid.status === 'cancelled';
  const ms = crid.ms || {};
  const fSop = forecastSop(crid);
  for (const v of Object.keys(unitBy)) {
    const plan = planFor(plans, year, v);
    const u = unitBy[v];
    const annual = annualVolume(plan, 'planned', settings, year);
    res.volumeByVehicle[v] = annual;
    res.potentialBase += cancelled ? 0 : u * annual;
    const p = cancelled ? 0 : u * volumeFrom(plan, year, ms.sopTarget, 'planned', settings);
    const f = cancelled ? 0 : u * volumeFrom(plan, year, fSop, 'planned', settings);
    const r = cancelled ? 0 : u * volumeFrom(plan, year, ms.sopActual, 'actual', settings);
    res.plannedByVehicle[v] = p; res.forecastByVehicle[v] = f; res.realizedByVehicle[v] = r;
    res.plannedBase += p; res.forecastBase += f; res.realizedBase += r;
  }
  res.plannedComputed = res.plannedBase;
  res.realizedComputed = res.realizedBase;
  const cur = crid.currency || master?.baseCurrency;
  const pYear = ms.sopTarget ? yearOf(ms.sopTarget) : null;
  const ov = numOrNull(crid.annualTargetOverride);
  if (!cancelled && ov !== null && pYear === year) {
    const ovBase = toBase(ov, cur, master);
    scaleByVehicle(res.plannedByVehicle, res.plannedBase, ovBase);
    res.plannedBase = ovBase; res.plannedOverride = true;
    if (!ms.sopActual) { scaleByVehicle(res.forecastByVehicle, res.forecastBase, ovBase); res.forecastBase = ovBase; }
  }
  const rv = numOrNull(crid.realizedOverride);
  const rYear = ms.sopActual ? yearOf(ms.sopActual) : null;
  if (!cancelled && rv !== null && rYear === year) {
    const rvBase = toBase(rv, cur, master);
    scaleByVehicle(res.realizedByVehicle, res.realizedBase, rvBase);
    res.realizedBase = rvBase; res.realizedOverride = true;
  }
  if (!cancelled && crid.fin?.status === 'confirmed' && rYear === year) {
    res.confirmedBase = toBase(crid.fin.confirmedAmount, cur, master);
  }
  const prob = crid.probability === '' || crid.probability === undefined || crid.probability === null ? 100 : num(crid.probability);
  res.weightedBase = crid.ms?.sopActual ? res.forecastBase : res.forecastBase * (prob / 100);
  return res;
}

function scaleByVehicle(map, total, newTotal) {
  const keys = Object.keys(map);
  if (!keys.length) return;
  if (total) for (const k of keys) map[k] = (map[k] / total) * newTotal;
  else for (const k of keys) map[k] = newTotal / keys.length;
}

/** Bir CRID'in hangi yıla ait olduğu (devreye giriş yılı). */
export function cridYears(crid) {
  const ys = new Set();
  const t = crid?.ms?.sopTarget, a = crid?.ms?.sopActual;
  if (t) ys.add(yearOf(t));
  if (a) ys.add(yearOf(a));
  return ys;
}

/* ---------------- Milestone ---------------- */

export const MILESTONES = [
  { key: 'release', label: 'Yayın', short: 'M1', target: 'releaseTarget', actual: 'releaseActual', na: 'releaseNa' },
  { key: 'sample', label: 'İlk Numune', short: 'M2', target: 'sampleTarget', actual: 'sampleActual', na: 'sampleNa' },
  { key: 'sop', label: 'Devreye Giriş', short: 'M3', target: 'sopTarget', actual: 'sopActual', na: 'sopNa' },
];

/**
 * done_ontime | done_late | overdue | upcoming | planned | none | na
 */
export function msStatus(target, actual, na, today = todayISO(), notifyDays = 14) {
  if (na) return 'na';
  if (actual) {
    if (!target) return 'done_ontime';
    return actual <= target ? 'done_ontime' : 'done_late';
  }
  if (!target) return 'none';
  const d = daysBetween(today, target);
  if (d < 0) return 'overdue';
  if (d <= notifyDays) return 'upcoming';
  return 'planned';
}
export function msDelayDays(target, actual, today = todayISO()) {
  if (!target) return 0;
  const ref = actual || today;
  const d = daysBetween(target, ref);
  return d > 0 ? d : 0;
}
export function cridMilestones(crid, today = todayISO(), notifyDays = 14) {
  const ms = crid?.ms || {};
  return MILESTONES.map((m) => ({
    ...m,
    targetDate: ms[m.target] || '',
    actualDate: ms[m.actual] || '',
    isNa: !!ms[m.na],
    status: msStatus(ms[m.target], ms[m.actual], ms[m.na], today, notifyDays),
    delay: ms[m.na] ? 0 : msDelayDays(ms[m.target], ms[m.actual], today),
  }));
}
export function finMilestone(crid, today = todayISO()) {
  const fin = crid?.fin || {};
  const target = crid?.ms?.finTarget || '';
  const confirmed = fin.status === 'confirmed';
  let status = confirmed ? 'confirmed' : 'pending';
  if (!confirmed && target && target < today) status = 'overdue';
  return { key: 'fin', label: 'Finansal Kontrol', short: 'M4', targetDate: target, actualDate: confirmed ? fin.date : '', status };
}

const OPEN_STATUSES = ['pool', 'eval', 'planned', 'progress', 'delayed'];
export function isOpen(crid) { return OPEN_STATUSES.includes(crid?.status || 'planned'); }

export function overdueMilestones(crid, today = todayISO()) {
  if (!crid || ['cancelled', 'closed'].includes(crid.status)) return [];
  return cridMilestones(crid, today).filter((m) => m.status === 'overdue');
}
export function isDelayed(crid, today = todayISO()) {
  if (!crid) return false;
  if (crid.status === 'delayed') return true;
  return overdueMilestones(crid, today).length > 0;
}
/** Ekranda gösterilen statü: açık kayıtta geciken milestone varsa otomatik "Gecikmiş". */
export function effectiveStatus(crid, today = todayISO()) {
  const s = crid?.status || 'planned';
  if (['planned', 'progress', 'eval', 'pool'].includes(s) && overdueMilestones(crid, today).length) return 'delayed';
  return s;
}

/* ---------------- Araç / bütçe özetleri ---------------- */

/**
 * Araç bazlı görünüm (referans görsel 1): araç başı toplam potansiyel, gerçekleşen,
 * planlanan kalan, yıl sonu hedefi, araç maliyetine oranı, adet ve kazanç.
 */
export function vehicleSummary(vehicle, year, crids, ctx) {
  const { master, plans } = ctx;
  const settings = master?.settings || {};
  const plan = planFor(plans, year, vehicle.id);
  const annualPlanned = annualVolume(plan, 'planned', settings, year);
  const actualToDate = annualVolume(plan, 'actual', settings, year);
  let potentialUnit = 0, realizedUnit = 0, realizedBase = 0, forecastBase = 0, plannedBase = 0, weightedBase = 0;
  let count = 0;
  const contributing = [];
  for (const c of crids) {
    if (c.status === 'cancelled') continue;
    if (!(c.targetVehicleIds || []).includes(vehicle.id)) continue;
    const ys = cridYears(c);
    if (!ys.has(year)) continue;
    const fin = cridYearFinancials(c, ctx, year);
    const u = fin.unitByVehicle[vehicle.id] || 0;
    const fYear = yearOf(forecastSop(c));
    if (fYear === year) potentialUnit += u;
    if (c.ms?.sopActual && yearOf(c.ms.sopActual) === year) realizedUnit += u;
    realizedBase += fin.realizedByVehicle[vehicle.id] || 0;
    forecastBase += fin.forecastByVehicle[vehicle.id] || 0;
    plannedBase += fin.plannedByVehicle[vehicle.id] || 0;
    weightedBase += fin.forecastBase ? (fin.weightedBase * (fin.forecastByVehicle[vehicle.id] || 0)) / fin.forecastBase : 0;
    count++;
    contributing.push({ crid: c, unit: u, fin });
  }
  const targetPerUnit = num(plan?.targetPerUnit);
  const t = now();
  const mi = year === t.getFullYear() ? t.getMonth() : year < t.getFullYear() ? 11 : 0;
  const monthlyTarget = Array.isArray(plan?.monthlyTarget) ? plan.monthlyTarget : null;
  const currentTargetUnit = monthlyTarget && monthlyTarget[mi] !== null && monthlyTarget[mi] !== undefined && monthlyTarget[mi] !== ''
    ? num(monthlyTarget[mi]) : targetPerUnit;
  const cost = num(vehicle.cost);
  const targetTotal = numOrNull(plan?.annualTargetOverride) ?? targetPerUnit * annualPlanned;
  return {
    vehicle, year, plan, annualPlanned, actualToDate,
    potentialUnit, realizedUnit, plannedRemainingUnit: Math.max(0, potentialUnit - realizedUnit),
    realizedShare: potentialUnit ? realizedUnit / potentialUnit : 0,
    targetPerUnit, currentTargetUnit, costShare: cost ? potentialUnit / cost : null,
    realizedBase, forecastBase, plannedBase, weightedBase, targetTotal,
    deviation: targetTotal - realizedBase, remaining: targetTotal - forecastBase,
    count, contributing,
  };
}

/** Kümülatif araç başı ucuzlatma eğrisi (referans görsel 4). kind: forecast | realized */
export function cumulativeUnitCurve(vehicleId, year, crids, ctx, kind) {
  const out = new Array(12).fill(0);
  const t = now();
  for (const c of crids) {
    if (c.status === 'cancelled') continue;
    if (!(c.targetVehicleIds || []).includes(vehicleId)) continue;
    const d = kind === 'realized' ? c.ms?.sopActual : forecastSop(c);
    if (!d || yearOf(d) !== year) continue;
    const subs = ctx.subsByCrid ? (ctx.subsByCrid.get ? ctx.subsByCrid.get(c.id) : ctx.subsByCrid[c.id]) || [] : [];
    const u = cridUnitByVehicle(c, subs, ctx.master)[vehicleId] || 0;
    for (let i = monthIndex(d); i < 12; i++) out[i] += u;
  }
  if (kind === 'realized') {
    // gelecek aylar boş bırakılır
    for (let i = 0; i < 12; i++) {
      if (year > t.getFullYear() || (year === t.getFullYear() && i > t.getMonth())) out[i] = null;
    }
  }
  return out;
}

export function budgetFlag(row) {
  if (!row.targetTotal) return 'none';
  if (row.forecastBase < row.targetTotal) return 'under';
  if (row.forecastBase > row.targetTotal * 1.0) return 'over';
  return 'ok';
}

/* ---------------- Fikir havuzu değerlendirme ---------------- */

export function evaluationScore(ev) {
  if (!ev) return null;
  const keys = ['potential', 'feasibility', 'vehicleFit', 'agendaFit'];
  const vals = keys.map((k) => numOrNull(ev[k])).filter((x) => x !== null && x > 0);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export { parseISO };
