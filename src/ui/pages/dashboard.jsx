import { useMemo, useState } from 'react';
import { useApp, useNames } from '../ctx.jsx';
import { FilterBar, Kpis, Seg, StatusPill, Empty, Icon, Pill } from '../components/common.jsx';
import { BarChart, Legend, HBars } from '../components/charts.jsx';
import { VehicleCard } from './vehicle.jsx';
import { applyCridFilters, upcomingSops, ideaAnnualPotential } from '../../logic/filters.js';
import { cridYearFinancials, effectiveStatus, overdueMilestones, vehicleSummary, isOpen, forecastSop } from '../../logic/calc.js';
import { fmtMoneyShort, fmtNum, fmtDate, MONTHS_SHORT, todayISO, yearOf, monthIndex, daysBetween, fmtPct } from '../../logic/util.js';
import { MATURITY } from '../../logic/defaults.js';

/** Filtrelenmiş CRID'ler + yıllık finansallar (birçok ekranda ortak). */
export function usePortfolio() {
  const { state, derived, filters, year } = useApp();
  return useMemo(() => {
    const today = todayISO();
    const crids = applyCridFilters(state.crids, filters, today);
    const fins = new Map(crids.map((c) => [c.id, cridYearFinancials(c, derived.ctx, year)]));
    const tot = { planned: 0, forecast: 0, realized: 0, confirmed: 0, weighted: 0, potential: 0 };
    for (const f of fins.values()) { tot.planned += f.plannedBase; tot.forecast += f.forecastBase; tot.realized += f.realizedBase; tot.confirmed += f.confirmedBase; tot.weighted += f.weightedBase; tot.potential += f.potentialBase; }
    return { crids, fins, tot, today };
  }, [state, filters, year]);
}

export function Dashboard() {
  const { state, derived, filters, setFilters, year, nav } = useApp();
  const n = useNames();
  const { crids, fins, tot, today } = usePortfolio();
  const cur = state.master.baseCurrency;
  const [win, setWin] = useState('30');

  const counts = useMemo(() => {
    let active = 0, done = 0, late = 0, cancelled = 0;
    for (const c of crids) {
      const es = effectiveStatus(c, today);
      if (es === 'cancelled') cancelled++;
      else if (['live', 'finconf', 'closed'].includes(es)) done++;
      else active++;
      if (es === 'delayed') late++;
    }
    return { active, done, late, cancelled };
  }, [crids]);

  const vehicles = useMemo(() => state.master.vehicles.filter((v) => v.active !== false)
    .filter((v) => !filters.vehicle || v.id === filters.vehicle)
    .filter((v) => !filters.targetVehicle || v.id === filters.targetVehicle)
    .map((v) => vehicleSummary(v, year, crids, derived.ctx))
    .filter((r) => r.count > 0 || r.targetTotal > 0), [crids, year, state.master.vehicles, filters]);

  const monthly = useMemo(() => {
    const plannedCnt = new Array(12).fill(0), actualCnt = new Array(12).fill(0), plannedVal = new Array(12).fill(0), actualVal = new Array(12).fill(0);
    for (const c of crids) {
      if (c.status === 'cancelled') continue;
      const f = fins.get(c.id);
      if (c.ms?.sopTarget && yearOf(c.ms.sopTarget) === year) { plannedCnt[monthIndex(c.ms.sopTarget)]++; plannedVal[monthIndex(c.ms.sopTarget)] += f.plannedBase; }
      if (c.ms?.sopActual && yearOf(c.ms.sopActual) === year) { actualCnt[monthIndex(c.ms.sopActual)]++; actualVal[monthIndex(c.ms.sopActual)] += f.realizedBase; }
    }
    return { plannedCnt, actualCnt, plannedVal, actualVal };
  }, [crids, fins, year]);

  const upcoming = useMemo(() => upcomingSops(crids, +win, today), [crids, win]);
  const overdue = useMemo(() => crids.map((c) => ({ c, od: overdueMilestones(c, today) })).filter((x) => x.od.length)
    .sort((a, b) => Math.max(...b.od.map((m) => m.delay)) - Math.max(...a.od.map((m) => m.delay))), [crids]);
  const byCat = useMemo(() => state.master.categories.map((cat) => {
    const list = crids.filter((c) => c.categoryId === cat.id);
    return { label: cat.name, a: list.reduce((s, c) => s + fins.get(c.id).forecastBase, 0), b: list.reduce((s, c) => s + fins.get(c.id).realizedBase, 0), n: list.length };
  }), [crids, fins]);
  const pool = useMemo(() => {
    const by = Object.fromEntries(MATURITY.map((m) => [m.key, 0]));
    let pot = 0;
    for (const i of state.ideas) { by[i.maturity || 'raw']++; if (!['converted', 'rejected'].includes(i.maturity)) pot += ideaAnnualPotential(i, state.master, derived.plans, year); }
    const total = state.ideas.length;
    return { by, pot, total, rate: total ? by.converted / total : 0 };
  }, [state.ideas, year]);

  return (
    <>
      <div className="page-head">
        <div className="grow"><div className="eyebrow">{year} maliyet azaltma portföyü</div><h1>Ana Dashboard</h1></div>
      </div>
      <FilterBar filters={filters} setFilters={setFilters} />
      <Kpis items={[
        { label: 'Toplam fikir', value: fmtNum(crids.length), sub: `+ ${state.ideas.filter((i) => !['converted', 'rejected'].includes(i.maturity)).length} havuzda`, onClick: () => nav('crids') },
        { label: 'Aktif', value: fmtNum(counts.active), tone: 'accent', onClick: () => { setFilters({ ...filters, status: 'open' }); nav('crids'); } },
        { label: 'Tamamlanan', value: fmtNum(counts.done), tone: 'good', sub: 'devreye girmiş' },
        { label: 'Geciken', value: fmtNum(counts.late), tone: counts.late ? 'bad' : '', onClick: () => { setFilters({ ...filters, status: 'delayed' }); nav('crids'); } },
        { label: 'Hedef fayda', value: fmtMoneyShort(tot.planned, cur), sub: `Projelendirilen ${fmtMoneyShort(tot.forecast, cur)}` },
        { label: 'Gerçekleşen fayda', value: fmtMoneyShort(tot.realized, cur), tone: 'good', sub: `Teyitli ${fmtMoneyShort(tot.confirmed, cur)}` },
      ]} />

      <div className="card">
        <div className="card-h"><h3>Araç bazlı maliyet azaltma — {year}</h3>
          <Legend items={[{ name: 'Gerçekleşen (€/araç)', color: 'var(--good)' }, { name: 'Planlanan kalan', color: 'var(--plan)' }, { name: 'Yıl sonu hedefi / bugünkü hedef', dash: true }]} />
        </div>
        <div className="card-b">
          {vehicles.length ? <div className="veh-grid">{vehicles.map((r) => <VehicleCard key={r.vehicle.id} row={r} onClick={() => nav('vehicle', { id: r.vehicle.id })} />)}</div>
            : <Empty title="Bu filtrede araç verisi yok">Üretim planı ve bütçe hedefi girildiğinde araç kartları burada görünür.</Empty>}
        </div>
      </div>

      <div className="grid g-main-side">
        <div className="card">
          <div className="card-h"><h3>Aylık devreye giriş — {year}</h3><Legend items={[{ name: 'Planlanan (hedef tarih)', color: 'var(--plan)' }, { name: 'Gerçekleşen', color: 'var(--good)' }]} /></div>
          <div className="card-b">
            <BarChart labels={MONTHS_SHORT} money={false} ariaLabel="Aylık devreye giriş adedi" series={[{ name: 'Planlanan', color: 'var(--plan)', values: monthly.plannedCnt }, { name: 'Gerçekleşen', color: 'var(--good)', values: monthly.actualCnt }]} />
            <div className="small muted" style={{ marginTop: 6 }}>Bir aya tıklamak için Yönetim Raporları &gt; Aylık Devreye Giriş ekranını kullanın; ay filtresiyle "{year} Eylül" gibi tek bir ayı listeleyebilirsiniz.</div>
          </div>
        </div>
        <div className="card">
          <div className="card-h"><h3>Yaklaşan devreye girişler</h3><Seg value={win} onChange={setWin} options={[{ value: '30', label: '30 gün' }, { value: '60', label: '60' }, { value: '90', label: '90' }]} /></div>
          <div className="card-b">
            {upcoming.length ? <ul className="list-plain">{upcoming.slice(0, 8).map((c) => (
              <li key={c.id} style={{ cursor: 'pointer' }} onClick={() => nav('crid', { id: c.id })}>
                <div style={{ minWidth: 0, flex: 1 }}><div className="mono small muted">{c.no}</div><div style={{ fontWeight: 600 }}>{c.title}</div><div className="small muted">{n.vehicles(c.targetVehicleIds)}</div></div>
                <div className="num"><div className="ms-date ms-upcoming">{fmtDate(c.ms.sopTarget)}</div><div className="small muted">{daysBetween(today, c.ms.sopTarget)} gün</div></div>
              </li>))}</ul>
              : <Empty title={`${win} gün içinde devreye giriş yok`} />}
            {upcoming.length > 8 ? <button className="btn sm" onClick={() => nav('milestones', { tab: 'upcoming' })}>Tümünü gör ({upcoming.length})</button> : null}
          </div>
        </div>
      </div>

      <div className="grid g3">
        <div className="card">
          <div className="card-h"><h3>Geciken milestone'lar</h3><Pill tone={overdue.length ? 'bad' : 'good'}>{overdue.length}</Pill></div>
          <div className="card-b">
            {overdue.length ? <ul className="list-plain">{overdue.slice(0, 6).map(({ c, od }) => (
              <li key={c.id} style={{ cursor: 'pointer' }} onClick={() => nav('crid', { id: c.id, tab: 'milestones' })}>
                <span className="sev bad" />
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600 }}>{c.title}</div><div className="small muted">{od.map((m) => `${m.label}: ${m.delay} gün`).join(' · ')}</div></div>
              </li>))}</ul> : <Empty title="Geciken milestone yok" />}
            {overdue.length > 6 ? <button className="btn sm" onClick={() => { setFilters({ ...filters, status: 'delayed' }); nav('crids'); }}>Tümünü listele</button> : null}
          </div>
        </div>
        <div className="card">
          <div className="card-h"><h3>Kategori karşılaştırması</h3></div>
          <div className="card-b"><HBars rows={byCat} cur={cur} /><div className="small muted" style={{ marginTop: 10 }}>Gri: projelendirilen · Yeşil: gerçekleşen</div></div>
        </div>
        <div className="card">
          <div className="card-h"><h3>Fikir Havuzu</h3><button className="btn sm" onClick={() => nav('pool')}>Havuza git <Icon name="arrow" /></button></div>
          <div className="card-b">
            <div className="kv">
              {MATURITY.map((m) => [<div key={m.key + 'l'}>{m.label}</div>, <div key={m.key + 'v'} className="num" style={{ textAlign: 'left', fontWeight: 600 }}>{pool.by[m.key]}</div>])}
              <div>Açık fikir potansiyeli</div><div style={{ fontWeight: 600 }}>{fmtMoneyShort(pool.pot, cur)} / yıl</div>
              <div>CRID'e dönüşüm oranı</div><div style={{ fontWeight: 600 }}>{fmtPct(pool.rate)}</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
