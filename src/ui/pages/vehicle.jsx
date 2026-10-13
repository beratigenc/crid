import { useMemo } from 'react';
import { useApp, useNames } from '../ctx.jsx';
import { Kpis, DataTable, StatusPill, Empty, Icon, ExportButton, tableRows, Pill } from '../components/common.jsx';
import { LineChart, Legend } from '../components/charts.jsx';
import { vehicleSummary, cumulativeUnitCurve, effectiveStatus, planFor, budgetFlag } from '../../logic/calc.js';
import { applyCridFilters } from '../../logic/filters.js';
import { fmtMoney, fmtMoneyShort, fmtNum, fmtPct, MONTHS_SHORT, todayISO, num, fmtDate } from '../../logic/util.js';

/** Referans görsel 1: araç başı gerçekleşen / planlanan / hedef görünümü. */
export function VehicleCard({ row, onClick }) {
  const { state } = useApp();
  const cur = state.master.baseCurrency;
  const scale = Math.max(row.potentialUnit, row.targetPerUnit, row.currentTargetUnit, 1) * 1.08;
  const pct = (v) => `${Math.min(100, (v / scale) * 100)}%`;
  const realShare = row.potentialUnit ? row.realizedUnit / row.potentialUnit : 0;
  return (
    <button className="veh" onClick={onClick} aria-label={`${row.vehicle.name} detayı`}>
      <div className="veh-top"><span className="veh-name">{row.vehicle.name}</span><span className="small muted">{row.count} CRID</span>
        {budgetFlag(row) === 'under' ? <Pill tone="bad">Hedefin altında</Pill> : budgetFlag(row) === 'over' ? <Pill tone="good">Hedefi aşıyor</Pill> : null}</div>
      <div className="veh-bar">
        <div className="pot" style={{ width: pct(row.potentialUnit) }}>
          <div className="real" style={{ width: row.potentialUnit ? `${realShare * 100}%` : 0 }}>{(row.realizedUnit / scale) >= 0.3 ? `${fmtPct(realShare)} · ${fmtMoney(row.realizedUnit, cur)}` : ''}</div>
        </div>
        {row.plannedRemainingUnit > 0 ? <span className="rest" style={row.potentialUnit / scale > 0.78 ? { right: `calc(${100 - (row.potentialUnit / scale) * 100}% + 6px)` } : { left: `calc(${(row.potentialUnit / scale) * 100}% + 6px)` }}>{fmtPct(1 - realShare)} · {fmtMoney(row.plannedRemainingUnit, cur)} planlanan</span> : null}
        {row.currentTargetUnit ? <div className="mark now" style={{ left: pct(row.currentTargetUnit) }} title={`Bugünkü hedef: ${fmtMoney(row.currentTargetUnit, cur)}/araç`}><i /></div> : null}
        {row.targetPerUnit ? <div className="mark" style={{ left: pct(row.targetPerUnit) }} title={`Yıl sonu hedefi: ${fmtMoney(row.targetPerUnit, cur)}/araç`}><i /></div> : null}
      </div>
      <div className="row small" style={{ justifyContent: 'space-between' }}>
        <span><b>{fmtMoney(row.potentialUnit, cur)}</b> toplam potansiyel/araç</span>
        <span className="muted">{row.costShare !== null ? `Araç maliyetinin ${fmtPct(row.costShare, 1)}` : ''}</span>
      </div>
      <div className="veh-meta">
        <div><div className="l">Yıllık adet</div><div className="v">{fmtNum(row.annualPlanned)}</div></div>
        <div><div className="l">Gerçekleşen €/araç</div><div className="v">{fmtMoney(row.realizedUnit, cur)}</div></div>
        <div><div className="l">Kazanç</div><div className="v">{fmtMoneyShort(row.realizedBase, cur)}</div></div>
      </div>
    </button>
  );
}

export function VehiclePage({ id }) {
  const { state, derived, year, nav, back, filters } = useApp();
  const n = useNames();
  const cur = state.master.baseCurrency;
  const vehicle = state.master.vehicles.find((v) => v.id === id);
  const today = todayISO();
  const crids = useMemo(() => applyCridFilters(state.crids, { ...filters, vehicle: '', targetVehicle: '', baseVehicle: '' }, today), [state.crids, filters]);
  const row = useMemo(() => vehicle ? vehicleSummary(vehicle, year, crids, derived.ctx) : null, [vehicle, year, crids]);
  const plan = vehicle ? planFor(derived.plans, year, vehicle.id) : null;
  const curves = useMemo(() => vehicle ? {
    forecast: cumulativeUnitCurve(vehicle.id, year, crids, derived.ctx, 'forecast'),
    realized: cumulativeUnitCurve(vehicle.id, year, crids, derived.ctx, 'realized'),
    target: (plan?.monthlyTarget || []).some((x) => x !== null && x !== '' && x !== undefined) ? plan.monthlyTarget.map((x) => (x === null || x === '' ? null : num(x))) : new Array(12).fill(row?.targetPerUnit || null),
  } : null, [vehicle, year, crids, plan]);
  if (!vehicle) return <Empty title="Araç bulunamadı" action={<button className="btn" onClick={back}>Geri</button>} />;

  const t = new Date();
  const marker = year === t.getFullYear() ? t.getMonth() : null;
  // Referans görsel 2: kategori/kapsam kırılımı, gerçekleşen vs planlanan
  const groups = useMemoGroups(row, state.master, cur);
  const contributing = row.contributing.slice().sort((a, b) => b.unit - a.unit);
  const cols = [
    { key: 'no', label: 'CRID No', render: (r) => <span className="mono">{r.crid.no}</span>, value: (r) => r.crid.no },
    { key: 'title', label: 'Fikir', className: 't-title', render: (r) => <b>{r.crid.title}</b>, value: (r) => r.crid.title },
    { key: 'cat', label: 'Kategori', value: (r) => n.category(r.crid.categoryId) },
    { key: 'status', label: 'Statü', render: (r) => <StatusPill status={effectiveStatus(r.crid, today)} />, value: (r) => n.status(effectiveStatus(r.crid, today)) },
    { key: 'sop', label: 'Devreye giriş', render: (r) => fmtDate(r.crid.ms?.sopActual || r.crid.ms?.sopTarget), value: (r) => r.crid.ms?.sopActual || r.crid.ms?.sopTarget },
    { key: 'prob', label: 'Olasılık', num: true, render: (r) => r.crid.ms?.sopActual ? '%100' : `%${r.crid.probability ?? 100}`, value: (r) => (r.crid.ms?.sopActual ? 100 : num(r.crid.probability ?? 100)) },
    { key: 'unit', label: '€/araç', num: true, sum: true, render: (r) => fmtMoney(r.unit, cur), value: (r) => r.unit, sumRender: (v) => fmtMoney(v, cur) },
    { key: 'fc', label: 'Projelendirilen', num: true, sum: true, render: (r) => fmtMoney(r.fin.forecastByVehicle[vehicle.id], cur), value: (r) => r.fin.forecastByVehicle[vehicle.id] || 0, sumRender: (v) => fmtMoney(v, cur) },
    { key: 'real', label: 'Gerçekleşen', num: true, sum: true, render: (r) => fmtMoney(r.fin.realizedByVehicle[vehicle.id], cur), value: (r) => r.fin.realizedByVehicle[vehicle.id] || 0, sumRender: (v) => fmtMoney(v, cur) },
  ];
  return (
    <>
      <div className="page-head">
        <button className="btn ghost" onClick={back}><Icon name="back" />Geri</button>
        <div className="grow"><div className="eyebrow">Araç bazlı görünüm · {year}</div><h1>{vehicle.name}</h1></div>
        <ExportButton filename={`CRID_${vehicle.code || vehicle.name}_${year}`} getSheets={() => [{ name: vehicle.name, rows: tableRows(cols, contributing) }, { name: 'Aylık eğri', rows: [['Ay', 'Hedef €/araç', 'Planlanan €/araç', 'Gerçekleşen €/araç'], ...MONTHS_SHORT.map((m, i) => [m, curves.target[i] ?? '', curves.forecast[i] ?? '', curves.realized[i] ?? ''])] }]} />
      </div>
      <Kpis items={[
        { label: 'Yıllık plan adedi', value: fmtNum(row.annualPlanned), sub: `Gerçekleşen/tahmini ${fmtNum(row.actualToDate)}` },
        { label: 'Yıl sonu hedefi', value: fmtMoney(row.targetPerUnit, cur), sub: `Toplam ${fmtMoneyShort(row.targetTotal, cur)}` },
        { label: 'Potansiyel €/araç', value: fmtMoney(row.potentialUnit, cur), sub: row.costShare !== null ? `Araç maliyetinin ${fmtPct(row.costShare, 1)}` : '' },
        { label: 'Gerçekleşen €/araç', value: fmtMoney(row.realizedUnit, cur), tone: 'good', sub: fmtPct(row.realizedShare) + ' gerçekleşme' },
        { label: 'Gerçekleşen kazanç', value: fmtMoneyShort(row.realizedBase, cur), tone: 'good' },
        { label: 'Sapma (hedef − gerçekleşen)', value: fmtMoneyShort(row.deviation, cur), tone: row.deviation > 0 ? 'bad' : 'good' },
      ]} />
      <div className="grid g2">
        <div className="card"><div className="card-h"><h3>Özet</h3></div><div className="card-b"><VehicleCard row={row} onClick={() => {}} /></div></div>
        <div className="card">
          <div className="card-h"><h3>{vehicle.name} ucuzlatma €/araç (kümülatif)</h3>
            <Legend items={[{ name: 'Hedef', color: 'var(--info)' }, { name: 'Planlanan', color: 'var(--warn)' }, { name: 'Gerçekleşen', color: 'var(--good)' }]} /></div>
          <div className="card-b"><LineChart labels={MONTHS_SHORT.map((m) => `${m}.${String(year).slice(2)}`)} cur={cur} marker={marker} ariaLabel="Kümülatif ucuzlatma"
            series={[{ name: 'Hedef', color: 'var(--info)', values: curves.target }, { name: 'Planlanan', color: 'var(--warn)', values: curves.forecast }, { name: 'Gerçekleşen', color: 'var(--good)', values: curves.realized }]} /></div>
        </div>
      </div>
      <div className="card">
        <div className="card-h"><h3>Kategori kırılımı — gerçekleşen ve planlanan indirimler</h3></div>
        <div className="card-b flush">
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Kırılım</th><th className="num">İndirim €/araç</th><th className="num">Olasılık</th><th className="num">{year} adet</th><th className="num">Ağırlıklı fayda</th><th className="num">Gerçekleşen</th></tr></thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.key} className={g.head ? 'grp' : ''}>
                  <td style={{ paddingLeft: g.head ? 10 : 26 }}>{g.label}</td>
                  <td className="num">{fmtMoney(g.unit, cur)}</td><td className="num">{g.prob}</td><td className="num">{fmtNum(row.annualPlanned)}</td>
                  <td className="num">{fmtMoney(g.weighted, cur)}</td><td className="num">{fmtMoney(g.realized, cur)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      </div>
      <div className="card">
        <div className="card-h"><h3>Katkı sağlayan CRID'ler</h3><span className="small muted">{contributing.length} kayıt</span></div>
        <div className="card-b flush"><DataTable columns={cols} rows={contributing} rowKey={(r) => r.crid.id} onRowClick={(r) => nav('crid', { id: r.crid.id })} totals /></div>
      </div>
    </>
  );
}

function useMemoGroups(row, master, cur) {
  const out = [];
  const realized = row.contributing.filter((x) => x.crid.ms?.sopActual);
  const planned = row.contributing.filter((x) => !x.crid.ms?.sopActual);
  const agg = (list) => ({ unit: list.reduce((a, x) => a + x.unit, 0), weighted: list.reduce((a, x) => a + (x.fin.forecastBase ? (x.fin.weightedBase * (x.fin.forecastByVehicle[row.vehicle.id] || 0)) / x.fin.forecastBase : 0), 0), realized: list.reduce((a, x) => a + (x.fin.realizedByVehicle[row.vehicle.id] || 0), 0) });
  const push = (key, label, list, head, prob) => { const a = agg(list); out.push({ key, label, head, prob, ...a }); };
  push('all', `${row.vehicle.name} İndirimler`, row.contributing, true, '');
  for (const [nm, list, prob] of [['Gerçekleşen İndirimler', realized, '%100'], ['Planlanan İndirimler', planned, list2prob(planned)]]) {
    push(nm, `${row.vehicle.name} ${nm}`, list, true, prob);
    for (const cat of master.categories) {
      const l = list.filter((x) => x.crid.categoryId === cat.id);
      push(nm + cat.id, `${cat.name} İndirimler`, l, false, nm.startsWith('Ger') ? '%100' : list2prob(l));
    }
    const ticari = list.filter((x) => x.crid.scopeId === 'scope-ticari');
    if (ticari.length) push(nm + 'tic', 'Ticari İndirimler (kapsam)', ticari, false, nm.startsWith('Ger') ? '%100' : list2prob(ticari));
  }
  return out;
}
function list2prob(list) {
  if (!list.length) return '–';
  const avg = list.reduce((a, x) => a + num(x.crid.probability ?? 100), 0) / list.length;
  return `%${Math.round(avg)}`;
}
