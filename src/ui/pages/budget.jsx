import { useMemo, useState } from 'react';
import { useApp, useNames, usePerms } from '../ctx.jsx';
import { Field, Select, NumInput, Icon, ExportButton, Modal, Kpis, Pill, Empty, tableRows } from '../components/common.jsx';
import { BarChart, Legend } from '../components/charts.jsx';
import { emptyPlan } from './plan.jsx';
import { vehicleSummary, planId, budgetFlag } from '../../logic/calc.js';
import { MONTHS_SHORT, fmtMoney, fmtMoneyShort, fmtNum, fmtPct, num, numOrNull, clone } from '../../logic/util.js';

export function BudgetPage() {
  const { state, derived, store, toast, nav } = useApp();
  const can = usePerms();
  const editable = can('budget.edit');
  const [year, setYear] = useState(String(state.master.settings.reportYear));
  const [editV, setEditV] = useState(null);
  const cur = state.master.baseCurrency;
  const years = useMemo(() => {
    const s = new Set(state.plans.map((p) => String(p.year)));
    const y = +state.master.settings.reportYear; [y, y + 1].forEach((x) => s.add(String(x)));
    return [...s].sort().map((x) => ({ value: x, label: x }));
  }, [state.plans]);
  const rows = useMemo(() => state.master.vehicles.filter((v) => v.active !== false).map((v) => vehicleSummary(v, +year, state.crids, derived.ctx)), [state, year]);
  const tot = rows.reduce((a, r) => ({ target: a.target + r.targetTotal, planned: a.planned + r.plannedBase, forecast: a.forecast + r.forecastBase, weighted: a.weighted + r.weightedBase, realized: a.realized + r.realizedBase }), { target: 0, planned: 0, forecast: 0, weighted: 0, realized: 0 });
  const cols = [
    { key: 'v', label: 'Araç', value: (r) => r.vehicle.name },
    { key: 'vol', label: 'Yıllık üretim', value: (r) => r.annualPlanned },
    { key: 'tpu', label: 'Hedef €/araç', value: (r) => r.targetPerUnit },
    { key: 'tt', label: 'Yıllık maliyet azaltma hedefi', value: (r) => r.targetTotal },
    { key: 'pl', label: 'CRID planlanan katkısı', value: (r) => r.plannedBase },
    { key: 'fc', label: 'Projelendirilen fayda', value: (r) => r.forecastBase },
    { key: 'wt', label: 'Ağırlıklı', value: (r) => r.weightedBase },
    { key: 're', label: 'CRID gerçekleşen katkısı', value: (r) => r.realizedBase },
    { key: 'dev', label: 'Sapma (hedef − gerçekleşen)', value: (r) => r.deviation },
    { key: 'rem', label: 'Kalan hedef (hedef − projelendirilen)', value: (r) => r.remaining },
    { key: 'n', label: 'CRID sayısı', value: (r) => r.count },
  ];
  return (
    <>
      <div className="page-head">
        <div className="grow"><div className="eyebrow">Araç + yıl bazında hedef ve CRID katkısı</div><h1>Bütçe / Hedef</h1></div>
        <ExportButton filename={`CRID_Butce_${year}`} getSheets={() => [{ name: `Bütçe ${year}`, rows: tableRows(cols, rows) }]} />
      </div>
      <div className="filterbar"><Field label="Bütçe yılı"><Select value={year} onChange={setYear} options={years} aria-label="Bütçe yılı" /></Field>
        <div className="small muted" style={{ alignSelf: 'center', flex: 3 }}>CRID'ler hedef araç ve devreye giriş yılına göre bütçeye otomatik bağlanır. Hedef = araç başı hedef × yıllık üretim (ya da manuel toplam).</div></div>
      <Kpis items={[
        { label: 'Toplam hedef', value: fmtMoneyShort(tot.target, cur) },
        { label: 'Projelendirilen', value: fmtMoneyShort(tot.forecast, cur), sub: tot.target ? `Hedefin ${fmtPct(tot.forecast / tot.target)}'i` : '' },
        { label: 'Ağırlıklı', value: fmtMoneyShort(tot.weighted, cur) },
        { label: 'Gerçekleşen', value: fmtMoneyShort(tot.realized, cur), tone: 'good', sub: tot.target ? `Hedefin ${fmtPct(tot.realized / tot.target)}'i` : '' },
        { label: 'Kalan hedef', value: fmtMoneyShort(tot.target - tot.forecast, cur), tone: tot.target - tot.forecast > 0 ? 'bad' : 'good' },
      ]} />
      <div className="card">
        <div className="card-b flush">
          <div className="tbl-wrap"><table className="tbl" data-testid="budget-table">
            <thead><tr><th>Araç</th><th className="num">Yıllık üretim</th><th className="num">Hedef €/araç</th><th className="num">Yıllık hedef</th><th className="num">CRID planlanan</th><th className="num">Projelendirilen</th><th className="num">Gerçekleşen</th><th className="num">Sapma</th><th className="num">Kalan hedef</th><th>Gerçekleşme</th><th>İşaret</th><th /></tr></thead>
            <tbody>
              {rows.map((r) => {
                const flag = budgetFlag(r);
                return (
                  <tr key={r.vehicle.id} className="click" onClick={() => nav('vehicle', { id: r.vehicle.id })}>
                    <td><b>{r.vehicle.name}</b><div className="small muted">{r.count} CRID</div></td>
                    <td className="num">{fmtNum(r.annualPlanned)}</td>
                    <td className="num">{r.targetPerUnit ? fmtMoney(r.targetPerUnit, cur) : '–'}</td>
                    <td className="num"><b>{fmtMoney(r.targetTotal, cur)}</b>{numOrNull(r.plan?.annualTargetOverride) !== null ? <div className="small muted">manuel</div> : null}</td>
                    <td className="num">{fmtMoney(r.plannedBase, cur)}</td>
                    <td className="num">{fmtMoney(r.forecastBase, cur)}</td>
                    <td className="num good-t">{fmtMoney(r.realizedBase, cur)}</td>
                    <td className={`num ${r.deviation > 0 ? 'bad-t' : 'good-t'}`}>{fmtMoney(r.deviation, cur)}</td>
                    <td className={`num ${r.remaining > 0 ? 'bad-t' : 'good-t'}`}>{fmtMoney(r.remaining, cur)}</td>
                    <td style={{ minWidth: 110 }}><div className="progress" title={r.targetTotal ? `%${Math.round((r.realizedBase / r.targetTotal) * 100)}` : ''}><i style={{ width: `${r.targetTotal ? Math.min(100, (r.realizedBase / r.targetTotal) * 100) : 0}%` }} /></div></td>
                    <td>{flag === 'under' ? <Pill tone="bad">Hedefin altında</Pill> : flag === 'over' ? <Pill tone="good">Hedefi aşıyor</Pill> : flag === 'none' ? <Pill tone="neutral">Hedef yok</Pill> : <Pill tone="good">Hedefte</Pill>}</td>
                    <td>{editable ? <button className="btn sm" onClick={(e) => { e.stopPropagation(); setEditV(r.vehicle); }}><Icon name="edit" />Hedef</button> : null}</td>
                  </tr>
                );
              })}
              <tr className="tot"><td>Toplam</td><td className="num">{fmtNum(rows.reduce((a, r) => a + r.annualPlanned, 0))}</td><td /><td className="num">{fmtMoney(tot.target, cur)}</td><td className="num">{fmtMoney(tot.planned, cur)}</td><td className="num">{fmtMoney(tot.forecast, cur)}</td><td className="num">{fmtMoney(tot.realized, cur)}</td><td className="num">{fmtMoney(tot.target - tot.realized, cur)}</td><td className="num">{fmtMoney(tot.target - tot.forecast, cur)}</td><td colSpan={3} /></tr>
            </tbody>
          </table></div>
          {!rows.length ? <Empty title="Araç yok" /> : null}
        </div>
      </div>
      <div className="card">
        <div className="card-h"><h3>Hedef, projelendirilen ve gerçekleşen — {year}</h3><Legend items={[{ name: 'Hedef', color: 'var(--info)' }, { name: 'Projelendirilen', color: 'var(--plan)' }, { name: 'Gerçekleşen', color: 'var(--good)' }]} /></div>
        <div className="card-b"><BarChart labels={rows.map((r) => r.vehicle.name)} cur={cur} ariaLabel="Araç bazlı bütçe" series={[{ name: 'Hedef', color: 'var(--info)', values: rows.map((r) => r.targetTotal) }, { name: 'Projelendirilen', color: 'var(--plan)', values: rows.map((r) => r.forecastBase) }, { name: 'Gerçekleşen', color: 'var(--good)', values: rows.map((r) => r.realizedBase) }]} /></div>
      </div>
      {editV ? <TargetModal vehicle={editV} year={+year} onClose={() => setEditV(null)} /> : null}
    </>
  );
}

function TargetModal({ vehicle, year, onClose }) {
  const { derived, store, toast, state } = useApp();
  const base = derived.plans.get(planId(year, vehicle.id));
  const [p, setP] = useState(() => clone(base || emptyPlan(year, vehicle.id)));
  const [busy, setBusy] = useState(false);
  const cur = state.master.baseCurrency;
  const mt = p.monthlyTarget || new Array(12).fill(null);
  const vol = (p.planned || []).reduce((a, b) => a + num(b), 0);
  const linear = () => {
    const t = num(p.targetPerUnit);
    setP({ ...p, monthlyTarget: MONTHS_SHORT.map((_, i) => Math.round((t * (i + 1)) / 12)) });
  };
  return (
    <Modal title={`${vehicle.name} — ${year} maliyet azaltma hedefi`} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Vazgeç</button>
      <button className="btn primary" disabled={busy} onClick={async () => {
        setBusy(true);
        try { await store.savePlan(p, `${year} bütçe hedefi güncellendi`); toast('Hedef kaydedildi', 'good'); onClose(); } catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
      }}>Kaydet</button>
    </>}>
      <div className="stack">
        <div className="form-grid">
          <Field label={`Yıl sonu hedefi (${cur}/araç)`} htmlFor="t-pu"><NumInput id="t-pu" value={p.targetPerUnit} onChange={(v) => setP({ ...p, targetPerUnit: v })} /></Field>
          <Field label={`Yıllık hedef toplamı — manuel (${cur})`} hint={`Boşsa: ${fmtMoney(num(p.targetPerUnit) * vol, cur)} (= hedef × ${fmtNum(vol)} adet)`} htmlFor="t-ov"><NumInput id="t-ov" value={p.annualTargetOverride ?? ''} onChange={(v) => setP({ ...p, annualTargetOverride: v === '' ? null : v })} /></Field>
        </div>
        <div className="row"><b style={{ flex: 1 }}>Aylık kümülatif hedef ({cur}/araç)</b><button className="btn sm" onClick={linear}>Doğrusal dağıt</button></div>
        <div className="tbl-wrap"><table className="tbl"><thead><tr>{MONTHS_SHORT.map((m) => <th key={m} className="num">{m}</th>)}</tr></thead>
          <tbody><tr>{MONTHS_SHORT.map((m, i) => <td key={m} style={{ padding: 3 }}><input className="inp sm num-in" style={{ width: 70 }} type="number" aria-label={`${m} hedef`} value={mt[i] === null || mt[i] === undefined ? '' : mt[i]} onChange={(e) => { const a = mt.slice(); a[i] = e.target.value === '' ? null : num(e.target.value); setP({ ...p, monthlyTarget: a }); }} /></td>)}</tr></tbody></table></div>
        <div className="small muted">Aylık hedef eğrisi araç ekranındaki "Hedef" çizgisini ve bugünkü hedef işaretini besler. Boş bırakılırsa yıl sonu hedefi kullanılır.</div>
      </div>
    </Modal>
  );
}
