import { useMemo, useState } from 'react';
import { useApp, useNames } from '../ctx.jsx';
import { DataTable, Field, Input, Select, Pill, ExportButton, tableRows, useOptions, Kpis, Icon } from '../components/common.jsx';
import { SUBST } from './subs.jsx';
import { SUB_STATUSES } from '../../logic/defaults.js';
import { subUnitImpactBase, subVolume, subVehicleIds, isActiveSub, lineBase } from '../../logic/calc.js';
import { fmtMoney, fmtNum, fmtDate, includesTR, fmtMoneyShort } from '../../logic/util.js';

export function SubListPage() {
  const { state, derived, nav } = useApp();
  const n = useNames();
  const o = useOptions();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [veh, setVeh] = useState('');
  const [frozen, setFrozen] = useState('');
  const cur = state.master.baseCurrency;
  const rows = useMemo(() => {
    const out = [];
    for (const s of state.subs) {
      const c = derived.cridById.get(s.cridId);
      if (!c) continue;
      if (status && (s.status || 'open') !== status) continue;
      if (veh && !subVehicleIds(s, c).includes(veh)) continue;
      if (frozen === 'yes' && !s.frozen) continue;
      if (frozen === 'no' && s.frozen) continue;
      if (q && ![s.no, s.partNo, s.partName, s.del?.partNo, s.add?.partNo, s.del?.partName, s.add?.partName, c.no, c.title].some((h) => h && includesTR(h, q))) continue;
      const year = c.ms?.sopTarget ? +c.ms.sopTarget.slice(0, 4) : +state.master.settings.reportYear;
      const unit = subUnitImpactBase(s, state.master);
      const vol = subVolume(s, c, derived.ctx, year);
      out.push({ s, c, unit, vol, annual: isActiveSub(s) ? unit * vol : 0, id: s.id });
    }
    return out;
  }, [state.subs, state.crids, q, status, veh, frozen]);
  const cols = [
    { key: 'no', label: 'Alt detay ID', render: (r) => <span className="mono">{r.s.no}</span>, value: (r) => r.s.no },
    { key: 'crid', label: 'Ana CRID', render: (r) => <button className="btn sm" onClick={(e) => { e.stopPropagation(); nav('crid', { id: r.c.id }); }}>{r.c.no}</button>, value: (r) => r.c.no },
    { key: 'title', label: 'Ana fikir', className: 't-title', value: (r) => r.c.title },
    { key: 'part', label: 'Parça / bileşen', render: (r) => <div><b>{r.s.partName}</b><div className="small muted mono">{r.s.partNo}</div></div>, value: (r) => `${r.s.partNo} ${r.s.partName}` },
    { key: 'cur', label: 'Mevcut → önerilen', render: (r) => <span className="small">{r.s.currentState || '…'} → {r.s.proposedState || '…'}</span>, value: (r) => `${r.s.currentState} → ${r.s.proposedState}` },
    { key: 'del', label: 'İptal parça', render: (r) => <span className="mono small">{r.s.del?.partNo}</span>, value: (r) => r.s.del?.partNo },
    { key: 'delv', label: `İptal ${cur}`, num: true, render: (r) => fmtMoney(r.s.frozen ? r.s.frozen.delBase : lineBase(r.s.del, state.master), cur, 1), value: (r) => (r.s.frozen ? r.s.frozen.delBase : lineBase(r.s.del, state.master)) },
    { key: 'add', label: 'İlave parça', render: (r) => <span className="mono small">{r.s.add?.partNo}</span>, value: (r) => r.s.add?.partNo },
    { key: 'addv', label: `İlave ${cur}`, num: true, render: (r) => fmtMoney(r.s.frozen ? r.s.frozen.addBase : lineBase(r.s.add, state.master), cur, 1), value: (r) => (r.s.frozen ? r.s.frozen.addBase : lineBase(r.s.add, state.master)) },
    { key: 'veh', label: 'Araçlar', value: (r) => n.vehicles(subVehicleIds(r.s, r.c)) },
    { key: 'unit', label: 'Birim etki', num: true, render: (r) => <b>{fmtMoney(r.unit, cur, 1)}</b>, value: (r) => r.unit },
    { key: 'vol', label: 'Yıllık hacim', num: true, render: (r) => fmtNum(r.vol), value: (r) => r.vol },
    { key: 'annual', label: 'Yıllık etki', num: true, sum: true, sumRender: (v) => fmtMoney(v, cur), render: (r) => fmtMoney(r.annual, cur), value: (r) => r.annual },
    { key: 'resp', label: 'Sorumlu', value: (r) => n.user(r.s.responsibleId) },
    { key: 'status', label: 'Durum', render: (r) => <Pill tone={SUBST[r.s.status || 'open'].tone}>{SUBST[r.s.status || 'open'].label}</Pill>, value: (r) => SUBST[r.s.status || 'open'].label },
    { key: 'frozen', label: 'Dondurma', render: (r) => r.s.frozen ? <span className="small"><Icon name="snow" className="ico" /> {fmtDate(r.s.frozen.at)}</span> : '', value: (r) => (r.s.frozen ? r.s.frozen.at : '') },
  ];
  const active = rows.filter((r) => isActiveSub(r.s));
  return (
    <>
      <div className="page-head">
        <div className="grow"><div className="eyebrow">Parça, bileşen ve aksiyon kırılımı</div><h1>Alt Detay (Add/Delete)</h1></div>
        <ExportButton filename="CRID_Alt_Detaylar" getSheets={() => [{ name: 'Alt Detaylar', rows: tableRows(cols, rows) }]} />
      </div>
      <Kpis items={[
        { label: 'Alt detay', value: fmtNum(rows.length), sub: `${active.length} aktif` },
        { label: 'Bağlı CRID', value: fmtNum(new Set(rows.map((r) => r.c.id)).size) },
        { label: 'Dondurulmuş', value: fmtNum(rows.filter((r) => r.s.frozen).length), sub: 'devreye girişte' },
        { label: 'Yıllık etki', value: fmtMoneyShort(active.reduce((a, r) => a + r.annual, 0), cur), tone: 'good' },
      ]} />
      <div className="card">
        <div className="filterbar" style={{ border: 0, borderBottom: '1px solid var(--line)', borderRadius: 0 }}>
          <Field label="Parça kodu / ad / CRID"><Input value={q} onChange={setQ} placeholder="Örn. 13C33-05203" aria-label="Alt detay ara" /></Field>
          <Field label="Durum"><Select value={status} onChange={setStatus} options={SUB_STATUSES.map((s) => ({ value: s.key, label: s.label }))} placeholder="Tümü" aria-label="Durum" /></Field>
          <Field label="Araç"><Select value={veh} onChange={setVeh} options={o.allVehicles} placeholder="Tümü" aria-label="Araç" /></Field>
          <Field label="Dondurma"><Select value={frozen} onChange={setFrozen} options={[{ value: 'yes', label: 'Dondurulmuş' }, { value: 'no', label: 'Açık' }]} placeholder="Tümü" aria-label="Dondurma" /></Field>
        </div>
        <DataTable testId="sublist-table" columns={cols} rows={rows} onRowClick={(r) => nav('crid', { id: r.c.id, tab: 'subs' })} totals initialSort={{ key: 'no', dir: 'asc' }} />
      </div>
    </>
  );
}
