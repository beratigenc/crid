import { useMemo, useState } from 'react';
import { useApp, useNames } from '../ctx.jsx';
import { FilterBar, Tabs, Seg, StatusPill, Empty, ExportButton, Kpis, DataTable } from '../components/common.jsx';
import { usePortfolio } from './dashboard.jsx';
import { cridMilestones, finMilestone, effectiveStatus, cridUnitHeadline, overdueMilestones } from '../../logic/calc.js';
import { upcomingSops } from '../../logic/filters.js';
import { MONTHS_SHORT, fmtDate, fmtMoney, yearOf, monthIndex, daysBetween, fmtNum } from '../../logic/util.js';

export function MilestonesPage({ initialTab }) {
  const { state, derived, filters, setFilters, year, nav } = useApp();
  const n = useNames();
  const { crids, today } = usePortfolio();
  const [tab, setTab] = useState(initialTab || 'gantt');
  const [win, setWin] = useState('90');
  const cur = state.master.baseCurrency;
  const nd = +state.master.settings.notifyDaysBefore || 14;
  const t = new Date();
  const nowIdx = year === t.getFullYear() ? t.getMonth() : null;
  const ganttRows = useMemo(() => crids.filter((c) => {
    const d1 = c.ms?.sopTarget, d2 = c.ms?.sopActual;
    return (d1 && yearOf(d1) === year) || (d2 && yearOf(d2) === year);
  }).sort((a, b) => (a.ms?.sopActual || a.ms?.sopTarget || '').localeCompare(b.ms?.sopActual || b.ms?.sopTarget || '')), [crids, year]);
  const upcoming = useMemo(() => upcomingSops(crids, +win, today), [crids, win]);
  const allMs = useMemo(() => crids.flatMap((c) => cridMilestones(c, today, nd).filter((m) => !['none', 'na'].includes(m.status)).map((m) => ({ ...m, c, id: `${c.id}-${m.key}` }))), [crids]);
  const overdue = allMs.filter((m) => m.status === 'overdue' && !['cancelled', 'closed'].includes(m.c.status));
  const upMs = allMs.filter((m) => m.status === 'upcoming' && !['cancelled', 'closed'].includes(m.c.status));
  const done = allMs.filter((m) => m.status.startsWith('done'));
  const ontime = done.filter((m) => m.status === 'done_ontime').length;

  const MsCell = ({ m }) => (
    <td className="nowrap small" style={{ borderLeft: '1px solid var(--line)' }}>
      <div className="ms-date" style={{ color: 'var(--muted)', fontWeight: 500 }}>{m.isNa ? 'NA' : fmtDate(m.targetDate) || '—'}</div>
      <div className={`ms-date ms-${m.status}`}>{m.isNa ? 'NA' : fmtDate(m.actualDate) || (m.targetDate ? 'TBC' : '—')}</div>
    </td>
  );
  const msCols = [
    { key: 'no', label: 'CRID No', render: (m) => <span className="mono">{m.c.no}</span>, value: (m) => m.c.no },
    { key: 't', label: 'Fikir', className: 't-title', value: (m) => m.c.title },
    { key: 'ms', label: 'Milestone', value: (m) => m.label },
    { key: 'tg', label: 'Plan', render: (m) => fmtDate(m.targetDate), value: (m) => m.targetDate },
    { key: 'ac', label: 'Gerçekleşme', render: (m) => <span className={`ms-date ms-${m.status}`}>{fmtDate(m.actualDate) || 'TBC'}</span>, value: (m) => m.actualDate },
    { key: 'd', label: 'Gecikme / kalan', num: true, render: (m) => m.status === 'upcoming' ? `${daysBetween(today, m.targetDate)} gün kaldı` : m.delay ? `${m.delay} gün` : '–', value: (m) => (m.status === 'upcoming' ? -daysBetween(today, m.targetDate) : m.delay) },
    { key: 'r', label: 'Sorumlu', value: (m) => n.user(m.c.responsibleId) },
    { key: 'v', label: 'Hedef araç', value: (m) => n.vehicles(m.c.targetVehicleIds) },
  ];
  return (
    <>
      <div className="page-head">
        <div className="grow"><div className="eyebrow">Yayın · ilk numune · devreye giriş · finansal kontrol</div><h1>Milestone Takvimi</h1></div>
        <ExportButton filename={`CRID_Milestone_${year}`} getSheets={() => [{ name: 'Milestone', rows: [['CRID No', 'Fikir', 'Kazanç €/araç', 'Kategori', 'M1 Yayın hedef', 'M1 Yayın gerç.', 'M2 Numune hedef', 'M2 Numune gerç.', 'M3 Devreye giriş hedef', 'M3 Devreye giriş gerç.', 'M3 Durum', 'M4 Finansal teyit', 'Yayın No', 'Statü'],
          ...crids.map((c) => { const ms = cridMilestones(c, today, nd); return [c.no, c.title, Math.round(cridUnitHeadline(c, derived.subsByCrid.get(c.id), state.master) * 100) / 100, n.category(c.categoryId), ...ms.flatMap((m) => [m.isNa ? 'NA' : fmtDate(m.targetDate), m.isNa ? 'NA' : fmtDate(m.actualDate)]), { done_ontime: 'On-time', done_late: 'Gecikmeli', overdue: 'Gecikmiş', upcoming: 'Yaklaşıyor', planned: 'Planlandı', none: '', na: 'NA' }[ms[2].status], fmtDate(c.fin?.status === 'confirmed' ? c.fin.date : ''), c.publicationNo || '', n.status(effectiveStatus(c, today))]; })] }]} />
      </div>
      <FilterBar filters={filters} setFilters={setFilters} />
      <Kpis items={[
        { label: 'Geciken milestone', value: fmtNum(overdue.length), tone: overdue.length ? 'bad' : '' },
        { label: `${nd} gün içinde`, value: fmtNum(upMs.length), tone: 'accent' },
        { label: 'Gerçekleşen milestone', value: fmtNum(done.length), sub: done.length ? `%${Math.round((ontime / done.length) * 100)} zamanında` : '' },
        { label: `${year} devreye giriş`, value: fmtNum(ganttRows.length), sub: `${ganttRows.filter((c) => c.ms?.sopActual).length} gerçekleşti` },
      ]} />
      <div className="card">
        <Tabs value={tab} onChange={setTab} tabs={[
          { value: 'gantt', label: `Devreye giriş takvimi ${year}`, count: ganttRows.length },
          { value: 'upcoming', label: 'Yaklaşan devreye girişler', count: upcoming.length },
          { value: 'overdue', label: 'Geciken', count: overdue.length },
          { value: 'soon', label: 'Yaklaşan milestone\'lar', count: upMs.length },
        ]} />
        {tab === 'gantt' ? (
          <div className="card-b flush">
            <div className="row small muted" style={{ padding: '8px 12px', gap: 16 }}>
              <span><span className="gbox plan" /> Hedef devreye giriş</span><span><span className="gbox done" /> Zamanında gerçekleşti</span><span><span className="gbox warnb" /> Gecikmeli gerçekleşti</span><span><span className="gbox late" /> Gecikmiş (açık)</span><span><span className="gbox cancel" /> İptal</span>
              <span style={{ color: 'var(--target)' }}>│ Bugün</span>
            </div>
            <div className="tbl-wrap"><table className="tbl gantt" data-testid="gantt">
              <thead><tr><th>#</th><th>Teknik/ticari indirim</th><th className="num">Kazanç</th>{MONTHS_SHORT.map((m, i) => <th key={m} className={`gm ${i === nowIdx ? 'now' : ''}`}>{m}</th>)}<th>Kapsam</th><th>Kategori</th><th>M1 Yayın</th><th>M2 İlk numune</th><th>M3 Devreye giriş</th><th>M4 Fin. kontrol</th><th>Yayın No</th></tr></thead>
              <tbody>
                {ganttRows.map((c, k) => {
                  const ms = cridMilestones(c, today, nd);
                  const fm = finMilestone(c, today);
                  const ti = c.ms?.sopTarget && yearOf(c.ms.sopTarget) === year ? monthIndex(c.ms.sopTarget) : null;
                  const ai = c.ms?.sopActual && yearOf(c.ms.sopActual) === year ? monthIndex(c.ms.sopActual) : null;
                  const late = ms[2].status === 'done_late';
                  const cancelled = c.status === 'cancelled';
                  return (
                    <tr key={c.id} className={`click ${cancelled ? 'cancel' : ''}`} onClick={() => nav('crid', { id: c.id, tab: 'milestones' })}>
                      <td className="small muted">{k + 1}</td>
                      <td className="t-title"><b>{c.title}</b></td>
                      <td className="num">{fmtMoney(cridUnitHeadline(c, derived.subsByCrid.get(c.id), state.master), cur)}</td>
                      {MONTHS_SHORT.map((m, i) => (
                        <td key={m} className={`gm ${i === nowIdx ? 'now' : ''}`}>
                          {cancelled && i === ti ? <span className="gbox cancel" /> : null}
                          {!cancelled && i === ai ? <span className={`gbox ${late ? 'warnb' : 'done'}`} title={`Gerçekleşen ${fmtDate(c.ms.sopActual)}`} /> : null}
                          {!cancelled && i === ti && i !== ai ? <span className={`gbox ${ms[2].status === 'overdue' ? 'late' : 'plan'}`} title={`Hedef ${fmtDate(c.ms.sopTarget)}`} /> : null}
                        </td>
                      ))}
                      <td className="small">{n.scope(c.scopeId)}</td>
                      <td className="small">{n.category(c.categoryId)}</td>
                      <MsCell m={ms[0]} /><MsCell m={ms[1]} /><MsCell m={ms[2]} />
                      <td className="nowrap small" style={{ borderLeft: '1px solid var(--line)' }}><div className="ms-date" style={{ color: 'var(--muted)', fontWeight: 500 }}>{fmtDate(fm.targetDate) || '—'}</div><div className={`ms-date ${fm.status === 'confirmed' ? 'ms-done_ontime' : fm.status === 'overdue' ? 'ms-overdue' : 'ms-none'}`}>{fmtDate(fm.actualDate) || (c.ms?.sopActual ? 'Bekliyor' : '—')}</div></td>
                      <td className="mono small">{c.publicationNo}</td>
                    </tr>
                  );
                })}
                {!ganttRows.length ? <tr><td colSpan={22}><Empty title={`${year} yılında devreye giriş planı yok`} /></td></tr> : null}
              </tbody>
            </table></div>
          </div>
        ) : tab === 'upcoming' ? (
          <div className="card-b flush">
            <div className="row" style={{ padding: 12 }}><Seg value={win} onChange={setWin} options={[{ value: '30', label: '30 gün' }, { value: '60', label: '60 gün' }, { value: '90', label: '90 gün' }]} /><span className="small muted">Hedef devreye giriş tarihi önümüzdeki {win} gün içinde olan ve henüz gerçekleşmeyen CRID'ler</span></div>
            <DataTable columns={[
              { key: 'no', label: 'CRID No', render: (c) => <span className="mono">{c.no}</span>, value: (c) => c.no },
              { key: 't', label: 'Fikir', className: 't-title', value: (c) => c.title },
              { key: 'v', label: 'Hedef araç', value: (c) => n.vehicles(c.targetVehicleIds) },
              { key: 'team', label: 'Ekip', value: (c) => n.team(c.teamId) },
              { key: 'r', label: 'Sorumlu', value: (c) => n.user(c.responsibleId) },
              { key: 'd', label: 'Devreye giriş hedefi', render: (c) => <span className="ms-date ms-upcoming">{fmtDate(c.ms.sopTarget)}</span>, value: (c) => c.ms.sopTarget },
              { key: 'k', label: 'Kalan', num: true, render: (c) => `${daysBetween(today, c.ms.sopTarget)} gün`, value: (c) => daysBetween(today, c.ms.sopTarget) },
              { key: 's', label: 'Statü', render: (c) => <StatusPill status={effectiveStatus(c, today)} />, value: (c) => effectiveStatus(c, today) },
            ]} rows={upcoming} onRowClick={(c) => nav('crid', { id: c.id })} empty={<Empty title={`${win} gün içinde devreye giriş yok`} />} />
          </div>
        ) : (
          <div className="card-b flush">
            <DataTable columns={msCols} rows={tab === 'overdue' ? overdue : upMs} onRowClick={(m) => nav('crid', { id: m.c.id, tab: 'milestones' })} rowClass={(m) => (m.status === 'overdue' ? 'late' : '')}
              initialSort={{ key: 'd', dir: 'desc' }} empty={<Empty title={tab === 'overdue' ? 'Geciken milestone yok' : 'Yaklaşan milestone yok'} />} />
          </div>
        )}
      </div>
    </>
  );
}
