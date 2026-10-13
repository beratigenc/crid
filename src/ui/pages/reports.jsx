import { useMemo, useState } from 'react';
import { useApp, useNames } from '../ctx.jsx';
import { FilterBar, Tabs, DataTable, ExportButton, tableRows, Empty, Kpis, StatusPill } from '../components/common.jsx';
import { BarChart, Legend } from '../components/charts.jsx';
import { usePortfolio } from './dashboard.jsx';
import { effectiveStatus, vehicleSummary, cridMilestones } from '../../logic/calc.js';
import { ideaAnnualPotential } from '../../logic/filters.js';
import { MATURITY } from '../../logic/defaults.js';
import { fmtMoney, fmtMoneyShort, fmtNum, fmtPct, MONTHS_TR, MONTHS_SHORT, yearOf, monthIndex, fmtDate } from '../../logic/util.js';

function aggregate(crids, fins, keyFn, today) {
  const m = new Map();
  for (const c of crids) {
    const keys = [].concat(keyFn(c) || ['']);
    for (const k of keys) {
      if (!m.has(k)) m.set(k, { key: k, count: 0, active: 0, done: 0, delayed: 0, cancelled: 0, planned: 0, forecast: 0, weighted: 0, realized: 0, confirmed: 0 });
      const r = m.get(k);
      const es = effectiveStatus(c, today);
      const f = fins.get(c.id);
      r.count++;
      if (es === 'cancelled') r.cancelled++; else if (['live', 'finconf', 'closed'].includes(es)) r.done++; else r.active++;
      if (es === 'delayed') r.delayed++;
      const share = keys.length > 1 ? 1 / keys.length : 1; // çoklu araçta faydayı bölüştürme yerine araç bazlı kırılım ayrı raporda
      r.planned += f.plannedBase * share; r.forecast += f.forecastBase * share; r.weighted += f.weightedBase * share; r.realized += f.realizedBase * share; r.confirmed += f.confirmedBase * share;
    }
  }
  return [...m.values()];
}

export function ReportsPage({ initialTab }) {
  const { state, derived, filters, setFilters, year, nav } = useApp();
  const n = useNames();
  const { crids, fins, tot, today } = usePortfolio();
  const [tab, setTab] = useState(initialTab || 'vehicle');
  const [month, setMonth] = useState(null);
  const cur = state.master.baseCurrency;
  const money = (k, label) => ({ key: k, label, num: true, sum: true, sumRender: (v) => fmtMoney(v, cur), render: (r) => fmtMoney(r[k], cur), value: (r) => r[k] });
  const cnt = (k, label) => ({ key: k, label, num: true, sum: true, render: (r) => fmtNum(r[k]), value: (r) => r[k] });
  const groupCols = (labelFn, title) => [
    { key: 'label', label: title, render: (r) => <b>{labelFn(r.key) || '(boş)'}</b>, value: (r) => labelFn(r.key) || '(boş)' },
    cnt('count', 'Fikir'), cnt('active', 'Aktif'), cnt('done', 'Tamamlanan'), cnt('delayed', 'Geciken'),
    money('planned', 'Hedef fayda'), money('forecast', 'Projelendirilen'), money('weighted', 'Ağırlıklı'), money('realized', 'Gerçekleşen'), money('confirmed', 'Teyitli'),
    { key: 'rate', label: 'Gerçekleşme', num: true, render: (r) => fmtPct(r.planned ? r.realized / r.planned : 0), value: (r) => (r.planned ? r.realized / r.planned : 0) },
  ];

  const data = useMemo(() => {
    const cat = aggregate(crids, fins, (c) => c.categoryId, today);
    const team = aggregate(crids, fins, (c) => c.teamId, today);
    const agenda = aggregate(crids, fins, (c) => c.agendaId, today);
    const resp = aggregate(crids, fins, (c) => c.responsibleId, today);
    const status = aggregate(crids, fins, (c) => effectiveStatus(c, today), today);
    const vehicles = state.master.vehicles.filter((v) => v.active !== false).map((v) => {
      const s = vehicleSummary(v, year, crids, derived.ctx);
      return { ...s, id: v.id, name: v.name, baseCount: crids.filter((c) => (c.baseVehicleIds || []).includes(v.id)).length, targetCount: crids.filter((c) => (c.targetVehicleIds || []).includes(v.id)).length };
    });
    const months = MONTHS_TR.map((m, i) => ({ id: i, month: m, pc: 0, pv: 0, ac: 0, av: 0, list: [] }));
    for (const c of crids) {
      if (c.status === 'cancelled') continue;
      const f = fins.get(c.id);
      if (c.ms?.sopTarget && yearOf(c.ms.sopTarget) === year) { const r = months[monthIndex(c.ms.sopTarget)]; r.pc++; r.pv += f.plannedBase; r.list.push(c); }
      if (c.ms?.sopActual && yearOf(c.ms.sopActual) === year) { const r = months[monthIndex(c.ms.sopActual)]; r.ac++; r.av += f.realizedBase; if (!r.list.includes(c)) r.list.push(c); }
    }
    const msRows = ['release', 'sample', 'sop'].map((k) => {
      const all = crids.filter((c) => c.status !== 'cancelled').map((c) => cridMilestones(c, today).find((m) => m.key === k));
      const planned = all.filter((m) => m.targetDate && !m.isNa);
      const done = all.filter((m) => m.status.startsWith('done'));
      const ontime = all.filter((m) => m.status === 'done_ontime');
      return { id: k, label: all[0]?.label || k, planned: planned.length, done: done.length, ontime: ontime.length, late: all.filter((m) => m.status === 'done_late').length, overdue: all.filter((m) => m.status === 'overdue').length, na: all.filter((m) => m.isNa).length, avgDelay: done.length ? done.reduce((a, m) => a + m.delay, 0) / done.length : 0 };
    });
    const pool = MATURITY.map((m) => {
      const list = state.ideas.filter((i) => (i.maturity || 'raw') === m.key);
      return { id: m.key, label: m.label, count: list.length, pot: list.reduce((a, i) => a + ideaAnnualPotential(i, state.master, derived.plans, year), 0) };
    });
    const poolCat = state.master.categories.map((c) => {
      const list = state.ideas.filter((i) => i.categoryId === c.id);
      return { id: c.id, label: c.name, count: list.length, open: list.filter((i) => !['converted', 'rejected'].includes(i.maturity)).length, converted: list.filter((i) => i.maturity === 'converted').length, pot: list.filter((i) => !['converted', 'rejected'].includes(i.maturity)).reduce((a, i) => a + ideaAnnualPotential(i, state.master, derived.plans, year), 0) };
    });
    return { cat, team, agenda, resp, status, vehicles, months, msRows, pool, poolCat };
  }, [crids, fins, year, state.ideas]);

  const vehCols = [
    { key: 'name', label: 'Araç', render: (r) => <b>{r.name}</b>, value: (r) => r.name },
    { key: 'baseCount', label: 'Baz araç olarak', num: true, value: (r) => r.baseCount },
    { key: 'targetCount', label: 'Hedef araç olarak', num: true, value: (r) => r.targetCount },
    { key: 'annualPlanned', label: 'Üretim adedi', num: true, sum: true, render: (r) => fmtNum(r.annualPlanned), value: (r) => r.annualPlanned },
    { key: 'targetTotal', ...money('targetTotal', 'Hedef azaltma') },
    { key: 'forecastBase', ...money('forecastBase', 'CRID katkısı (projelendirilen)') },
    { key: 'realizedBase', ...money('realizedBase', 'Gerçekleşen') },
    { key: 'deviation', ...money('deviation', 'Sapma') },
    { key: 'potentialUnit', label: 'Potansiyel €/araç', num: true, render: (r) => fmtMoney(r.potentialUnit, cur), value: (r) => r.potentialUnit },
    { key: 'realizedUnit', label: 'Gerçekleşen €/araç', num: true, render: (r) => fmtMoney(r.realizedUnit, cur), value: (r) => r.realizedUnit },
  ];
  const monthCols = [
    { key: 'month', label: 'Ay', render: (r) => <b>{r.month} {year}</b>, value: (r) => r.id, exportValue: (r) => `${r.month} ${year}` },
    { key: 'pc', label: 'Planlanan devreye giriş', num: true, sum: true, value: (r) => r.pc },
    { ...money('pv', 'Planlanan fayda'), key: 'pv' },
    { key: 'ac', label: 'Gerçekleşen devreye giriş', num: true, sum: true, value: (r) => r.ac },
    { ...money('av', 'Gerçekleşen fayda'), key: 'av' },
  ];
  const msCols = [
    { key: 'label', label: 'Milestone', render: (r) => <b>{r.label}</b> },
    { key: 'planned', label: 'Planlanan', num: true, value: (r) => r.planned },
    { key: 'done', label: 'Gerçekleşen', num: true, value: (r) => r.done },
    { key: 'ontime', label: 'Zamanında', num: true, value: (r) => r.ontime },
    { key: 'late', label: 'Gecikmeli gerçekleşen', num: true, value: (r) => r.late },
    { key: 'overdue', label: 'Gecikmiş (açık)', num: true, render: (r) => <span className={r.overdue ? 'bad-t' : ''}>{r.overdue}</span>, value: (r) => r.overdue },
    { key: 'rate', label: 'Zamanında oranı', num: true, render: (r) => fmtPct(r.done ? r.ontime / r.done : 0), value: (r) => (r.done ? r.ontime / r.done : 0) },
    { key: 'avgDelay', label: 'Ort. gecikme (gün)', num: true, render: (r) => fmtNum(r.avgDelay, 1), value: (r) => r.avgDelay },
    { key: 'na', label: 'N/A', num: true, value: (r) => r.na },
  ];
  const tabs = {
    vehicle: { label: 'Araç bazlı', cols: vehCols, rows: data.vehicles, chart: { labels: data.vehicles.map((v) => v.name), series: [{ name: 'Hedef', color: 'var(--info)', values: data.vehicles.map((v) => v.targetTotal) }, { name: 'Projelendirilen', color: 'var(--plan)', values: data.vehicles.map((v) => v.forecastBase) }, { name: 'Gerçekleşen', color: 'var(--good)', values: data.vehicles.map((v) => v.realizedBase) }] }, click: (r) => nav('vehicle', { id: r.id }) },
    monthly: { label: 'Aylık devreye giriş', cols: monthCols, rows: data.months, chart: { labels: MONTHS_SHORT, series: [{ name: 'Planlanan fayda', color: 'var(--plan)', values: data.months.map((m) => m.pv) }, { name: 'Gerçekleşen fayda', color: 'var(--good)', values: data.months.map((m) => m.av) }] }, click: (r) => setMonth(r) },
    category: { label: 'Kategori', cols: groupCols(n.category, 'Kategori'), rows: data.cat, chartFrom: true, click: (r) => { setFilters({ ...filters, category: r.key }); nav('crids'); } },
    team: { label: 'Ekip', cols: groupCols(n.team, 'Ekip'), rows: data.team, chartFrom: true, click: (r) => { setFilters({ ...filters, team: r.key }); nav('crids'); } },
    agenda: { label: 'Gündem', cols: groupCols(n.agenda, 'Gündem'), rows: data.agenda, chartFrom: true, click: (r) => { setFilters({ ...filters, agenda: r.key }); nav('crids'); } },
    resp: { label: 'Sorumlu', cols: groupCols(n.user, 'Sorumlu'), rows: data.resp, chartFrom: true, click: (r) => { setFilters({ ...filters, responsible: r.key }); nav('crids'); } },
    status: { label: 'Statü', cols: groupCols(n.status, 'Statü'), rows: data.status, chartFrom: true },
    milestone: { label: 'Milestone', cols: msCols, rows: data.msRows, chart: { labels: data.msRows.map((m) => m.label), money: false, series: [{ name: 'Zamanında', color: 'var(--good)', values: data.msRows.map((m) => m.ontime) }, { name: 'Gecikmeli', color: 'var(--warn)', values: data.msRows.map((m) => m.late) }, { name: 'Gecikmiş (açık)', color: 'var(--bad)', values: data.msRows.map((m) => m.overdue) }] } },
    pool: { label: 'Fikir havuzu', cols: [{ key: 'label', label: 'Olgunluk', render: (r) => <b>{r.label}</b> }, { key: 'count', label: 'Fikir', num: true, sum: true, value: (r) => r.count }, { ...money('pot', 'Yıllık potansiyel'), key: 'pot' }], rows: data.pool, extra: true },
  };
  const t = tabs[tab];
  const chart = t.chart || (t.chartFrom ? { labels: t.rows.map((r) => t.cols[0].value(r)), series: [{ name: 'Projelendirilen', color: 'var(--plan)', values: t.rows.map((r) => r.forecast) }, { name: 'Gerçekleşen', color: 'var(--good)', values: t.rows.map((r) => r.realized) }] } : null);
  return (
    <>
      <div className="page-head">
        <div className="grow"><div className="eyebrow">Araç, kategori, ekip, yıl/ay ve gündem bazlı analiz</div><h1>Yönetim Raporları</h1></div>
        <ExportButton filename={`CRID_Yonetim_Raporu_${year}`} label="Tüm raporlar (Excel)" getSheets={() => Object.values(tabs).map((x) => ({ name: x.label, rows: tableRows(x.cols, x.rows) }))} />
      </div>
      <FilterBar filters={filters} setFilters={setFilters} />
      <Kpis items={[
        { label: 'Fikir', value: fmtNum(crids.length) },
        { label: 'Hedef fayda', value: fmtMoneyShort(tot.planned, cur) },
        { label: 'Projelendirilen', value: fmtMoneyShort(tot.forecast, cur) },
        { label: 'Gerçekleşen', value: fmtMoneyShort(tot.realized, cur), tone: 'good' },
        { label: 'Finansal teyitli', value: fmtMoneyShort(tot.confirmed, cur), tone: 'good' },
      ]} />
      <div className="card">
        <Tabs value={tab} onChange={(v) => { setTab(v); setMonth(null); }} tabs={Object.entries(tabs).map(([k, v]) => ({ value: k, label: v.label }))} />
        {chart && chart.labels.length ? <div className="card-b"><Legend items={chart.series.map((s) => ({ name: s.name, color: s.color }))} /><BarChart labels={chart.labels} series={chart.series} cur={cur} money={chart.money !== false} height={220} ariaLabel={t.label} /></div> : null}
        <div className="row end" style={{ padding: '0 16px 10px' }}><ExportButton filename={`CRID_${t.label.replace(/\s/g, '_')}_${year}`} getSheets={() => [{ name: t.label, rows: tableRows(t.cols, t.rows) }]} label="Bu raporu dışa aktar" /></div>
        <DataTable testId={`report-${tab}`} columns={t.cols} rows={t.rows} rowKey={(r) => r.key ?? r.id} onRowClick={t.click} totals={tab !== 'milestone'} />
        {tab === 'pool' ? <div className="card-b"><h3 style={{ marginBottom: 8 }}>Kategoriye göre havuz ve dönüşüm</h3>
          <DataTable columns={[{ key: 'label', label: 'Kategori' }, { key: 'count', label: 'Toplam', num: true, sum: true, value: (r) => r.count }, { key: 'open', label: 'Açık', num: true, sum: true, value: (r) => r.open }, { key: 'converted', label: "CRID'e dönüşen", num: true, sum: true, value: (r) => r.converted }, { key: 'rate', label: 'Dönüşüm oranı', num: true, render: (r) => fmtPct(r.count ? r.converted / r.count : 0), value: (r) => (r.count ? r.converted / r.count : 0) }, { ...money('pot', 'Açık potansiyel (yıllık)'), key: 'pot' }]} rows={data.poolCat} totals /></div> : null}
      </div>
      {month ? (
        <div className="card">
          <div className="card-h"><h3>{month.month} {year} — devreye girecek / giren CRID'ler</h3><button className="btn sm" onClick={() => { setFilters({ ...filters, year: String(year), month: String(month.id + 1) }); nav('crids'); }}>CRID listesinde aç</button></div>
          <DataTable columns={[
            { key: 'no', label: 'CRID No', render: (c) => <span className="mono">{c.no}</span>, value: (c) => c.no },
            { key: 't', label: 'Fikir', className: 't-title', value: (c) => c.title },
            { key: 'v', label: 'Hedef araç', value: (c) => n.vehicles(c.targetVehicleIds) },
            { key: 'tg', label: 'Hedef', render: (c) => fmtDate(c.ms?.sopTarget), value: (c) => c.ms?.sopTarget },
            { key: 'ac', label: 'Gerçekleşen', render: (c) => <span className="good-t">{fmtDate(c.ms?.sopActual)}</span>, value: (c) => c.ms?.sopActual },
            { key: 's', label: 'Statü', render: (c) => <StatusPill status={effectiveStatus(c, today)} /> },
          ]} rows={month.list} onRowClick={(c) => nav('crid', { id: c.id })} empty={<Empty title="Bu ayda devreye giriş yok" />} />
        </div>
      ) : null}
    </>
  );
}
