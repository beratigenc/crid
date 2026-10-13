import { useMemo, useState } from 'react';
import { useApp, useNames, usePerms } from '../ctx.jsx';
import { FilterBar, Tabs, DataTable, Pill, Kpis, ExportButton, tableRows, Empty } from '../components/common.jsx';
import { FinanceModal } from './cridDetail.jsx';
import { usePortfolio } from './dashboard.jsx';
import { FIN_STATUSES } from '../../logic/defaults.js';
import { fmtMoney, fmtMoneyShort, fmtDate, fmtNum, num, daysBetween } from '../../logic/util.js';
import { toBase } from '../../logic/calc.js';

const FIN = Object.fromEntries(FIN_STATUSES.map((f) => [f.key, f]));

export function FinancePage() {
  const { state, filters, setFilters, nav, year } = useApp();
  const n = useNames();
  const can = usePerms();
  const { crids, fins, today } = usePortfolio();
  const [tab, setTab] = useState('pending');
  const [open, setOpen] = useState(null);
  const cur = state.master.baseCurrency;
  const live = crids.filter((c) => c.ms?.sopActual && c.status !== 'cancelled');
  const groups = {
    pending: live.filter((c) => (c.fin?.status || 'pending') === 'pending'),
    checked: live.filter((c) => c.fin?.status === 'checked'),
    revision: live.filter((c) => c.fin?.status === 'revision'),
    confirmed: live.filter((c) => c.fin?.status === 'confirmed'),
    notlive: crids.filter((c) => !c.ms?.sopActual && c.status !== 'cancelled'),
  };
  const rows = groups[tab];
  const confirmedBase = (c) => (c.fin?.status === 'confirmed' ? toBase(c.fin.confirmedAmount, c.currency || cur, state.master) : 0);
  const cols = [
    { key: 'no', label: 'CRID No', render: (c) => <span className="mono">{c.no}</span>, value: (c) => c.no },
    { key: 't', label: 'Fikir', className: 't-title', value: (c) => c.title },
    { key: 'cat', label: 'Kategori', value: (c) => n.category(c.categoryId) },
    { key: 'v', label: 'Hedef araç', value: (c) => n.vehicles(c.targetVehicleIds) },
    { key: 'sop', label: 'Devreye giriş', render: (c) => fmtDate(c.ms?.sopActual || c.ms?.sopTarget), value: (c) => c.ms?.sopActual || c.ms?.sopTarget },
    { key: 'pl', label: `Planlanan (${year})`, num: true, sum: true, sumRender: (v) => fmtMoney(v, cur), render: (c) => fmtMoney(fins.get(c.id)?.plannedBase, cur), value: (c) => fins.get(c.id)?.plannedBase || 0 },
    { key: 're', label: 'Hesaplanan gerçekleşen', num: true, sum: true, sumRender: (v) => fmtMoney(v, cur), render: (c) => fmtMoney(fins.get(c.id)?.realizedBase, cur), value: (c) => fins.get(c.id)?.realizedBase || 0 },
    { key: 'cf', label: 'Teyit edilen', num: true, sum: true, sumRender: (v) => fmtMoney(v, cur), render: (c) => c.fin?.status === 'confirmed' ? <b className="good-t">{fmtMoney(confirmedBase(c), cur)}</b> : '–', value: confirmedBase },
    { key: 'st', label: 'Durum', render: (c) => <Pill tone={FIN[c.fin?.status || 'pending'].tone}>{FIN[c.fin?.status || 'pending'].label}</Pill>, value: (c) => FIN[c.fin?.status || 'pending'].label },
    { key: 'dt', label: 'Kontrol / teyit tarihi', render: (c) => fmtDate(c.fin?.date || c.fin?.checkedDate), value: (c) => c.fin?.date || c.fin?.checkedDate || '' },
    { key: 'by', label: 'Kontrol eden', value: (c) => n.user(c.fin?.by || c.fin?.checkedBy) },
    { key: 'wait', label: 'Bekleme', num: true, render: (c) => (c.ms?.sopActual && c.fin?.status !== 'confirmed' ? `${daysBetween(c.ms.sopActual, today)} gün` : ''), value: (c) => (c.ms?.sopActual && c.fin?.status !== 'confirmed' ? daysBetween(c.ms.sopActual, today) : 0) },
    { key: 'act', label: '', sortable: false, export: false, render: (c) => can('finance.confirm') && c.ms?.sopActual ? <button className="btn sm" onClick={(e) => { e.stopPropagation(); setOpen(c); }}>{c.fin?.status === 'confirmed' ? 'Revize et' : 'Kontrol et'}</button> : null },
  ];
  const sum = (list, f) => list.reduce((a, c) => a + f(c), 0);
  return (
    <>
      <div className="page-head">
        <div className="grow"><div className="eyebrow">Planlanan · gerçekleşen · finansal olarak teyit edilmiş</div><h1>Finansal Kontrol</h1></div>
        <ExportButton filename={`CRID_Finansal_Kontrol_${year}`} getSheets={() => [{ name: 'Finansal Kontrol', rows: tableRows(cols, live) }]} />
      </div>
      {!can('finance.confirm') ? <div className="banner info">Bu ekranı görüntüleyebilirsiniz; teyit vermek Finansal Kontrol rolüne aittir.</div> : null}
      <FilterBar filters={filters} setFilters={setFilters} />
      <Kpis items={[
        { label: 'Kontrol bekleyen', value: fmtNum(groups.pending.length + groups.checked.length), tone: groups.pending.length ? 'bad' : '', sub: fmtMoneyShort(sum([...groups.pending, ...groups.checked], (c) => fins.get(c.id)?.realizedBase || 0), cur) },
        { label: 'Revizyonda', value: fmtNum(groups.revision.length) },
        { label: 'Teyit edilen', value: fmtNum(groups.confirmed.length), tone: 'good', sub: fmtMoneyShort(sum(groups.confirmed, confirmedBase), cur) },
        { label: `Planlanan fayda ${year}`, value: fmtMoneyShort(sum(crids, (c) => fins.get(c.id)?.plannedBase || 0), cur) },
        { label: 'Gerçekleşen (hesaplanan)', value: fmtMoneyShort(sum(crids, (c) => fins.get(c.id)?.realizedBase || 0), cur) },
      ]} />
      <div className="card">
        <Tabs value={tab} onChange={setTab} tabs={[
          { value: 'pending', label: 'Kontrol bekleyen', count: groups.pending.length },
          { value: 'checked', label: 'Kontrol edildi', count: groups.checked.length },
          { value: 'revision', label: 'Revizyon', count: groups.revision.length },
          { value: 'confirmed', label: 'Teyit edildi', count: groups.confirmed.length },
          { value: 'notlive', label: 'Henüz devreye girmedi', count: groups.notlive.length },
        ]} />
        <DataTable testId="finance-table" columns={cols} rows={rows} onRowClick={(c) => nav('crid', { id: c.id, tab: 'financial' })} totals initialSort={{ key: 'sop', dir: 'asc' }}
          empty={<Empty title="Bu sekmede kayıt yok" />} />
      </div>
      {open ? <FinanceModal crid={state.crids.find((c) => c.id === open.id)} onClose={() => setOpen(null)} /> : null}
    </>
  );
}
