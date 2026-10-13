import { useMemo, useState } from 'react';
import { useApp, useNames, usePerms, useLocalPref } from '../ctx.jsx';
import { DataTable, FilterBar, Field, Input, Select, StatusPill, Pill, Icon, ExportButton, tableRows, SampleTag } from '../components/common.jsx';
import { usePortfolio } from './dashboard.jsx';
import { searchCrids } from '../../logic/filters.js';
import { cridUnitHeadline, effectiveStatus, cridMilestones, finMilestone } from '../../logic/calc.js';
import { FIN_STATUSES } from '../../logic/defaults.js';
import { fmtMoney, fmtDate, fmtMonthKey, num, monthKey } from '../../logic/util.js';

const FIN = Object.fromEntries(FIN_STATUSES.map((f) => [f.key, f]));

export const MS_SYMBOL = { done_ontime: '●', done_late: '●', overdue: '!', upcoming: '○', planned: '○', none: '·', na: 'N/A' };
export function MsDot({ m }) {
  const titles = { done_ontime: 'Zamanında gerçekleşti', done_late: 'Gecikmeli gerçekleşti', overdue: 'Gecikmiş', upcoming: 'Yaklaşıyor', planned: 'Planlandı', none: 'Tarih yok', na: 'Uygulanmaz' };
  return <span className={`ms-date ms-${m.status}`} title={`${m.label}: ${titles[m.status]}${m.targetDate ? ` · hedef ${fmtDate(m.targetDate)}` : ''}${m.actualDate ? ` · gerçekleşen ${fmtDate(m.actualDate)}` : ''}`} style={{ display: 'inline-block', minWidth: 22, textAlign: 'center' }}>{MS_SYMBOL[m.status]}</span>;
}

export function cridColumns({ n, state, derived, fins, today, nav }) {
  const cur = state.master.baseCurrency;
  return [
    { key: 'no', label: 'CRID No', render: (c) => <span className="mono">{c.no}</span>, value: (c) => c.no },
    { key: 'title', label: 'Fikir başlığı', className: 't-title', render: (c) => <div><b>{c.title}</b> <SampleTag show={c.sample} />{c.publicationNo ? <div className="small muted">Yayın No {c.publicationNo}</div> : null}</div>, value: (c) => c.title },
    { key: 'cat', label: 'Kategori', render: (c) => <div>{n.category(c.categoryId)}{c.subCategory ? <div className="small muted">{c.subCategory}</div> : null}</div>, value: (c) => n.category(c.categoryId) },
    { key: 'team', label: 'Ekip', value: (c) => n.team(c.teamId) },
    { key: 'agenda', label: 'Gündem', value: (c) => n.agenda(c.agendaId) },
    { key: 'base', label: 'Baz araç', value: (c) => n.vehicles(c.baseVehicleIds) },
    { key: 'target', label: 'Hedef araç', value: (c) => n.vehicles(c.targetVehicleIds) },
    { key: 'resp', label: 'Sorumlu', value: (c) => n.user(c.responsibleId) },
    { key: 'unit', label: 'Birim fayda', num: true, render: (c) => fmtMoney(cridUnitHeadline(c, derived.subsByCrid.get(c.id), state.master), cur), value: (c) => cridUnitHeadline(c, derived.subsByCrid.get(c.id), state.master) },
    { key: 'planned', label: 'Yıllık hedef fayda', num: true, sum: true, sumRender: (v) => fmtMoney(v, cur), render: (c) => fmtMoney(fins.get(c.id)?.plannedBase, cur), value: (c) => fins.get(c.id)?.plannedBase || 0 },
    { key: 'forecast', label: 'Projelendirilen', num: true, sum: true, sumRender: (v) => fmtMoney(v, cur), render: (c) => fmtMoney(fins.get(c.id)?.forecastBase, cur), value: (c) => fins.get(c.id)?.forecastBase || 0 },
    { key: 'realized', label: 'Gerçekleşen fayda', num: true, sum: true, sumRender: (v) => fmtMoney(v, cur), render: (c) => <span className="good-t">{fmtMoney(fins.get(c.id)?.realizedBase, cur)}</span>, value: (c) => fins.get(c.id)?.realizedBase || 0 },
    { key: 'prob', label: 'Olasılık', num: true, render: (c) => `%${c.ms?.sopActual ? 100 : c.probability ?? 100}`, value: (c) => (c.ms?.sopActual ? 100 : num(c.probability ?? 100)) },
    { key: 'sopT', label: 'Devreye giriş hedefi', render: (c) => <span className="nowrap">{fmtDate(c.ms?.sopTarget)}</span>, value: (c) => c.ms?.sopTarget || '' },
    { key: 'sopA', label: 'Devreye giriş gerç.', render: (c) => <span className="nowrap good-t">{fmtDate(c.ms?.sopActual)}</span>, value: (c) => c.ms?.sopActual || '' },
    { key: 'ms', label: 'M1 M2 M3 M4', sortable: false, export: false, render: (c) => <span className="nowrap">{cridMilestones(c, today).map((m) => <MsDot key={m.key} m={m} />)}<MsDot m={{ ...finMilestone(c, today), status: finMilestone(c, today).status === 'confirmed' ? 'done_ontime' : finMilestone(c, today).status === 'overdue' ? 'overdue' : c.ms?.sopActual ? 'upcoming' : 'none' }} /></span> },
    { key: 'status', label: 'Statü', render: (c) => <StatusPill status={effectiveStatus(c, today)} />, value: (c) => n.status(effectiveStatus(c, today)) },
    { key: 'fin', label: 'Finansal kontrol', render: (c) => <Pill tone={FIN[c.fin?.status || 'pending'].tone}>{FIN[c.fin?.status || 'pending'].label}</Pill>, value: (c) => FIN[c.fin?.status || 'pending'].label },
  ];
}

const GROUPS = [
  { value: '', label: 'Gruplama yok' },
  { value: 'cat', label: 'Kategori' }, { value: 'team', label: 'Ekip' }, { value: 'status', label: 'Statü' }, { value: 'resp', label: 'Sorumlu' },
  { value: 'target', label: 'Hedef araç' }, { value: 'agenda', label: 'Gündem' }, { value: 'sopMonth', label: 'Devreye giriş ayı' }, { value: 'fin', label: 'Finansal kontrol' },
];

export function CridListPage({ initialQ }) {
  const { state, derived, filters, setFilters, year, nav } = useApp();
  const n = useNames();
  const can = usePerms();
  const { crids, fins, today } = usePortfolio();
  const [q, setQ] = useState(initialQ || '');
  const [group, setGroup] = useLocalPref('crid-group', '');
  const [colsOn, setColsOn] = useLocalPref('crid-cols-v1', ['no', 'title', 'cat', 'target', 'resp', 'unit', 'planned', 'realized', 'sopT', 'ms', 'status', 'fin']);
  const [colMenu, setColMenu] = useState(false);
  const rows = useMemo(() => searchCrids(crids, q, state.master, derived.subsByCrid), [crids, q]);
  const all = cridColumns({ n, state, derived, fins, today, nav });
  const cols = all.filter((c) => colsOn.includes(c.key));
  const groupFn = group ? (c) => {
    if (group === 'sopMonth') { const d = c.ms?.sopActual || c.ms?.sopTarget; return d ? monthKey(d) : ''; }
    const col = all.find((x) => x.key === group);
    return col.value(c);
  } : null;
  return (
    <>
      <div className="page-head">
        <div className="grow"><div className="eyebrow">Tüm maliyet azaltma fikirleri · finansallar {year}</div><h1>CRID Listesi</h1></div>
        <ExportButton filename={`CRID_Listesi_${year}`} getSheets={() => [{ name: 'CRID Listesi', rows: tableRows([...all, { key: 'desc', label: 'Açıklama', value: (c) => c.description }, { key: 'cur', label: 'Para birimi', value: (c) => c.currency }, { key: 'pool', label: 'Kaynak havuz no', value: (c) => c.sourcePoolNo }], rows.slice().sort((a, b) => String(a.no).localeCompare(String(b.no), 'tr', { numeric: true }))) }]} />
        {can('crid.create') ? <button className="btn primary" onClick={() => nav('crid', { id: null })}><Icon name="plus" />Yeni CRID</button> : null}
      </div>
      <FilterBar filters={filters} setFilters={setFilters} />
      <div className="card">
        <div className="filterbar" style={{ border: 0, borderBottom: '1px solid var(--line)', borderRadius: 0 }}>
          <Field label="Hızlı arama"><Input value={q} onChange={setQ} placeholder="CRID No, başlık, parça kodu, araç, ekip, kategori, sorumlu" aria-label="CRID ara" /></Field>
          <Field label="Grupla"><Select value={group} onChange={setGroup} options={GROUPS} aria-label="Grupla" /></Field>
          <div style={{ position: 'relative', alignSelf: 'flex-end' }}>
            <button className="btn sm" onClick={() => setColMenu(!colMenu)} aria-expanded={colMenu}>Kolonlar ({cols.length})</button>
            {colMenu ? <div className="search-pop" style={{ width: 230, padding: 8, left: 'auto', right: 0 }}>
              {all.map((c) => <label key={c.key} className="chk" style={{ display: 'flex', padding: '3px 4px' }}><input type="checkbox" checked={colsOn.includes(c.key)} onChange={(e) => setColsOn(e.target.checked ? [...colsOn, c.key] : colsOn.filter((k) => k !== c.key))} />{c.label}</label>)}
            </div> : null}
          </div>
          <div className="small muted" style={{ marginLeft: 'auto', alignSelf: 'center' }}>{rows.length} kayıt</div>
        </div>
        <DataTable testId="crid-table" columns={cols} rows={rows} onRowClick={(c) => nav('crid', { id: c.id })} totals
          rowClass={(c) => { const es = effectiveStatus(c, today); return es === 'delayed' ? 'late' : es === 'cancelled' ? 'cancel' : ''; }}
          groupBy={groupFn} groupLabel={group === 'sopMonth' ? (k) => (k ? fmtMonthKey(k) : 'Tarih yok') : undefined} initialSort={{ key: 'no', dir: 'asc' }} />
      </div>
    </>
  );
}
