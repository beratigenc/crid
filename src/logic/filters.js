// Filtreleme, arama ve bildirim üretimi.
import { cridYears, effectiveStatus, forecastSop, cridMilestones, overdueMilestones, budgetFlag, vehicleSummary, annualVolume, planFor, toBase } from './calc.js';
import { includesTR, yearOf, monthIndex, daysBetween, todayISO, num } from './util.js';

export const EMPTY_FILTERS = { year: '', month: '', vehicle: '', baseVehicle: '', targetVehicle: '', category: '', team: '', agenda: '', status: '', responsible: '', scope: '' };

export function activeFilterCount(f) {
  return Object.entries(f || {}).filter(([k, v]) => k !== 'year' && v !== '' && v !== null && v !== undefined).length;
}

/** CRID listesine global dashboard filtrelerini uygular. */
export function applyCridFilters(crids, f, today = todayISO()) {
  if (!f) return crids;
  const year = f.year ? +f.year : null;
  const month = f.month ? +f.month : null;
  return crids.filter((c) => {
    if (year) {
      const ys = cridYears(c);
      if (ys.size && !ys.has(year)) return false;
    }
    if (month) {
      const d = forecastSop(c);
      if (!d || monthIndex(d) + 1 !== month) return false;
      if (year && yearOf(d) !== year) return false;
    }
    if (f.vehicle && !(c.targetVehicleIds || []).includes(f.vehicle) && !(c.baseVehicleIds || []).includes(f.vehicle)) return false;
    if (f.baseVehicle && !(c.baseVehicleIds || []).includes(f.baseVehicle)) return false;
    if (f.targetVehicle && !(c.targetVehicleIds || []).includes(f.targetVehicle)) return false;
    if (f.category && c.categoryId !== f.category) return false;
    if (f.team && c.teamId !== f.team) return false;
    if (f.agenda && c.agendaId !== f.agenda) return false;
    if (f.scope && c.scopeId !== f.scope) return false;
    if (f.responsible && c.responsibleId !== f.responsible) return false;
    if (f.status) {
      const es = effectiveStatus(c, today);
      if (f.status === 'open') { if (!['pool', 'eval', 'planned', 'progress', 'delayed'].includes(es)) return false; }
      else if (es !== f.status) return false;
    }
    return true;
  });
}

export function nameOf(list, id) {
  if (!id) return '';
  const x = (list || []).find((i) => i.id === id || i.code === id);
  return x ? x.name || x.code : '';
}

/** Hızlı arama: CRID No, başlık, parça kodu, araç, ekip, kategori, sorumlu. */
export function searchCrids(crids, q, master, subsByCrid) {
  const s = String(q || '').trim();
  if (!s) return crids;
  return crids.filter((c) => {
    const hay = [
      c.no, c.title, c.description, c.publicationNo, c.sourcePoolNo,
      nameOf(master.categories, c.categoryId), nameOf(master.teams, c.teamId), nameOf(master.agendas, c.agendaId),
      nameOf(master.users, c.responsibleId),
      ...(c.targetVehicleIds || []).map((v) => nameOf(master.vehicles, v)),
      ...(c.baseVehicleIds || []).map((v) => nameOf(master.vehicles, v)),
    ];
    const subs = subsByCrid?.get ? subsByCrid.get(c.id) || [] : [];
    for (const x of subs) hay.push(x.no, x.partNo, x.partName, x.del?.partNo, x.add?.partNo, x.del?.partName, x.add?.partName);
    return hay.some((h) => h && includesTR(h, s));
  });
}

export function searchIdeas(ideas, q, master) {
  const s = String(q || '').trim();
  if (!s) return ideas;
  return ideas.filter((i) => [i.no, i.title, i.problem, i.description, i.notes, nameOf(master.categories, i.categoryId), nameOf(master.teams, i.teamId), nameOf(master.users, i.ownerId), ...(i.vehicleIds || []).map((v) => nameOf(master.vehicles, v))].some((h) => h && includesTR(h, s)));
}

/** Havuz fikrinin yıllık potansiyeli (baz para biriminde). */
export function ideaAnnualPotential(idea, master, plans, year) {
  const p = toBase(idea.potential, idea.potentialCurrency || master.baseCurrency, master);
  if (idea.potentialBasis !== 'unit') return p;
  let vol = 0;
  for (const v of idea.vehicleIds || []) vol += annualVolume(planFor(plans, year, v), 'planned', master.settings, year);
  return p * vol;
}

/* ---------------- Bildirimler ---------------- */

/**
 * Kullanıcıya göre bildirim listesi.
 * - Yaklaşan milestone (N gün kala) → sorumlu
 * - Geciken milestone (tarih geçti, gerçekleşme yok) → sorumlu + yönetim
 * - Finansal kontrol bekleyen → Finansal Kontrol rolü
 * - Havuzda uzun süre bekleyen → Yönetici / CRID Sorumlusu
 * - Bütçe hedefinin altında kalan / aşan araçlar → Yönetici / CRID Sorumlusu
 */
export function buildNotifications({ crids, ideas, plans, master, user, today = todayISO(), subsByCrid, year }) {
  const out = [];
  const s = master.settings || {};
  const nd = num(s.notifyDaysBefore) || 14;
  const role = user?.role || 'readonly';
  const mgmt = ['manager', 'it', 'crid'].includes(role);
  const mine = (c) => user && (c.responsibleId === user.id);
  for (const c of crids) {
    if (['cancelled', 'closed'].includes(c.status)) continue;
    for (const m of cridMilestones(c, today, nd)) {
      if (m.status === 'upcoming') {
        const d = daysBetween(today, m.targetDate);
        out.push({ id: `up-${c.id}-${m.key}`, type: 'upcoming', severity: 'warn', cridId: c.id, mine: mine(c), visible: mine(c) || mgmt,
          title: `${m.label} ${d === 0 ? 'bugün' : `${d} gün sonra`}`, detail: `${c.no} · ${c.title}`, date: m.targetDate });
      } else if (m.status === 'overdue') {
        out.push({ id: `od-${c.id}-${m.key}`, type: 'overdue', severity: 'bad', cridId: c.id, mine: mine(c), visible: mine(c) || mgmt || role === 'catmgr',
          title: `${m.label} gecikti (${m.delay} gün)`, detail: `${c.no} · ${c.title} — gerçekleşme tarihi girilmedi`, date: m.targetDate });
      }
    }
    if (c.ms?.sopActual && c.fin?.status !== 'confirmed') {
      out.push({ id: `fk-${c.id}`, type: 'finance', severity: c.fin?.status === 'revision' ? 'bad' : 'info', cridId: c.id, mine: role === 'finance', visible: ['finance', 'it', 'manager'].includes(role) || mine(c),
        title: c.fin?.status === 'revision' ? 'Finansal revizyon istendi' : 'Finansal kontrol bekliyor', detail: `${c.no} · ${c.title}`, date: c.ms.sopActual });
    }
  }
  const idle = num(s.poolIdleDays) || 60;
  for (const i of ideas) {
    if (['converted', 'rejected'].includes(i.maturity)) continue;
    const last = (i.updatedAt || i.createdAt || '').slice(0, 10);
    const d = last ? daysBetween(last, today) : null;
    if (d !== null && d >= idle) {
      out.push({ id: `pi-${i.id}`, type: 'poolIdle', severity: 'info', ideaId: i.id, mine: i.ownerId === user?.id, visible: ['manager', 'it', 'crid', 'catmgr'].includes(role) || i.ownerId === user?.id,
        title: `Havuzda ${d} gündür bekliyor`, detail: `${i.no} · ${i.title}`, date: last });
    }
  }
  if (['manager', 'it', 'crid'].includes(role)) {
    const y = year || s.reportYear;
    const ctx = { master, plans, subsByCrid };
    for (const v of master.vehicles.filter((x) => x.active !== false)) {
      const row = vehicleSummary(v, +y, crids, ctx);
      const flag = budgetFlag(row);
      if (flag === 'under') out.push({ id: `bu-${v.id}`, type: 'budget', severity: 'bad', vehicleId: v.id, visible: true, mine: false, title: `${v.name}: bütçe hedefinin altında`, detail: `${y} projelendirilen fayda hedefin %${Math.round((row.forecastBase / row.targetTotal) * 100)}'i` });
      if (flag === 'over') out.push({ id: `bo-${v.id}`, type: 'budgetOver', severity: 'good', vehicleId: v.id, visible: true, mine: false, title: `${v.name}: portföy hedefi aşıyor`, detail: `${y} projelendirilen fayda hedefin %${Math.round((row.forecastBase / row.targetTotal) * 100)}'i` });
    }
  }
  const order = { bad: 0, warn: 1, info: 2, good: 3 };
  return out.filter((n) => n.visible).sort((a, b) => order[a.severity] - order[b.severity] || String(a.date || '').localeCompare(String(b.date || '')));
}

/** Yaklaşan devreye girişler (30/60/90 gün). */
export function upcomingSops(crids, days, today = todayISO()) {
  return crids.filter((c) => {
    if (['cancelled', 'closed'].includes(c.status) || c.ms?.sopActual || !c.ms?.sopTarget) return false;
    const d = daysBetween(today, c.ms.sopTarget);
    return d >= 0 && d <= days;
  }).sort((a, b) => a.ms.sopTarget.localeCompare(b.ms.sopTarget));
}

export { overdueMilestones };
