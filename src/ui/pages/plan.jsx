import { useMemo, useState, useEffect } from 'react';
import { useApp, useNames, usePerms } from '../ctx.jsx';
import { Field, Select, Seg, Icon, ExportButton, Modal, Kpis, Empty } from '../components/common.jsx';
import { BarChart, Legend } from '../components/charts.jsx';
import { planId, monthlyVolumes } from '../../logic/calc.js';
import { MONTHS_SHORT, MONTHS_TR, fmtNum, num, clone, fmtDateTime } from '../../logic/util.js';
import { buildXlsx, readXlsx, parseCsv } from '../../logic/xlsx.js';

export function emptyPlan(year, vehicleId) {
  return { id: planId(year, vehicleId), year: +year, vehicleId, planned: new Array(12).fill(0), actual: new Array(12).fill(null), targetPerUnit: '', monthlyTarget: new Array(12).fill(null), annualTargetOverride: null, source: 'Manuel' };
}

export function PlanPage() {
  const { state, derived, store, toast, platform } = useApp();
  const n = useNames();
  const can = usePerms();
  const editable = can('plan.edit');
  const [year, setYear] = useState(String(state.master.settings.reportYear));
  const [mode, setMode] = useState('planned');
  const [draft, setDraft] = useState({});
  const [dirty, setDirty] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const vehicles = state.master.vehicles.filter((v) => v.active !== false);
  useEffect(() => {
    if (dirty) return;
    const d = {};
    for (const v of vehicles) d[v.id] = clone(derived.plans.get(planId(year, v.id)) || emptyPlan(year, v.id));
    setDraft(d);
  }, [state.plans, year, state.master.vehicles, dirty]);
  const years = useMemo(() => {
    const s = new Set(state.plans.map((p) => String(p.year)));
    const y = +state.master.settings.reportYear;
    [y - 1, y, y + 1, y + 2].forEach((x) => s.add(String(x)));
    return [...s].sort().map((x) => ({ value: x, label: x }));
  }, [state.plans]);
  const setCell = (vid, i, v) => {
    setDraft((d) => { const p = clone(d[vid]); const arr = (p[mode] || new Array(12).fill(mode === 'actual' ? null : 0)).slice(); arr[i] = v === '' ? (mode === 'actual' ? null : 0) : num(v); p[mode] = arr; return { ...d, [vid]: p }; });
    setDirty(true);
  };
  const save = async () => {
    let c = 0;
    for (const v of vehicles) {
      const p = draft[v.id];
      const before = derived.plans.get(p.id);
      if (JSON.stringify(stripMeta(before || emptyPlan(year, v.id))) !== JSON.stringify(stripMeta(p))) { await store.savePlan({ ...p, source: 'Manuel' }, `${year} üretim planı güncellendi`); c++; }
    }
    setDirty(false);
    toast(c ? `${c} aracın planı kaydedildi` : 'Değişiklik yok', c ? 'good' : 'info');
  };
  const copyPrev = () => {
    const prev = String(+year - 1);
    setDraft((d) => {
      const out = { ...d };
      for (const v of vehicles) { const pp = derived.plans.get(planId(prev, v.id)); if (pp) out[v.id] = { ...out[v.id], planned: pp.planned.slice() }; }
      return out;
    });
    setDirty(true);
    toast(`${prev} plan adetleri kopyalandı; kontrol edip kaydedin.`);
  };
  const rowVals = (vid) => (mode === 'actual' ? (draft[vid]?.actual || []) : (draft[vid]?.planned || []));
  const total = (vid) => rowVals(vid).reduce((a, x) => a + num(x), 0);
  const colTotal = (i) => vehicles.reduce((a, v) => a + num(rowVals(v.id)[i]), 0);
  const grand = vehicles.reduce((a, v) => a + total(v.id), 0);
  const plannedTotals = MONTHS_SHORT.map((_, i) => vehicles.reduce((a, v) => a + num(draft[v.id]?.planned?.[i]), 0));
  const actualTotals = MONTHS_SHORT.map((_, i) => vehicles.reduce((a, v) => { const x = draft[v.id]?.actual?.[i]; return a + (x === null || x === undefined || x === '' ? 0 : num(x)); }, 0));

  return (
    <>
      <div className="page-head">
        <div className="grow"><div className="eyebrow">Araç × yıl × ay</div><h1>Üretim Planı</h1></div>
        <ExportButton filename={`CRID_Uretim_Plani_${year}`} getSheets={() => [{ name: `Plan ${year}`, rows: planSheet(vehicles, draft, year, 'planned') }, { name: `Gerçekleşen ${year}`, rows: planSheet(vehicles, draft, year, 'actual') }]} />
        {editable ? <>
          <button className="btn" onClick={() => templateDl(platform, toast, vehicles, year)}><Icon name="down" />Şablon</button>
          <button className="btn" onClick={() => setImportOpen(true)}><Icon name="up" />İçe aktar (SAP/Excel)</button>
        </> : null}
      </div>
      <div className="filterbar">
        <Field label="Plan yılı"><Select value={year} onChange={(v) => { if (dirty) { toast('Önce değişiklikleri kaydedin veya vazgeçin.', 'bad'); return; } setYear(v); }} options={years} aria-label="Plan yılı" /></Field>
        <div className="field" style={{ maxWidth: 'none' }}><label>Görünüm</label><Seg value={mode} onChange={setMode} options={[{ value: 'planned', label: 'Planlanan üretim' }, { value: 'actual', label: 'Gerçekleşen üretim' }]} /></div>
        <div className="row" style={{ marginLeft: 'auto', alignSelf: 'flex-end' }}>
          {editable && mode === 'planned' ? <button className="btn sm" onClick={copyPrev}>Önceki yıldan kopyala</button> : null}
          {dirty ? <><button className="btn sm" onClick={() => setDirty(false)}>Vazgeç</button><button className="btn sm primary" onClick={save}>Kaydet</button></> : null}
        </div>
      </div>
      {mode === 'actual' ? <div className="banner info">Gerçekleşen adetler SAP entegrasyonu devreye girene kadar buradan veya şablonla girilir. Boş bırakılan geçmiş aylar için {state.master.settings.realizedUsePlanFallback !== false ? 'plan adedi kullanılır (Master Data > Sistem parametrelerinden kapatılabilir).' : 'gerçekleşen fayda sıfır kabul edilir.'}</div> : null}
      <Kpis items={[
        { label: `${year} plan adedi`, value: fmtNum(plannedTotals.reduce((a, b) => a + b, 0)) },
        { label: 'Gerçekleşen adet (girilen)', value: fmtNum(actualTotals.reduce((a, b) => a + b, 0)), tone: 'good' },
        { label: 'Planı olan araç', value: `${vehicles.filter((v) => (draft[v.id]?.planned || []).some((x) => num(x) > 0)).length} / ${vehicles.length}` },
      ]} />
      <div className="card">
        <div className="card-b flush">
          <div className="tbl-wrap"><table className="tbl" data-testid="plan-table">
            <thead><tr><th>Araç</th>{MONTHS_SHORT.map((m) => <th key={m} className="num">{m}</th>)}<th className="num">Yıllık</th><th>Kaynak</th></tr></thead>
            <tbody>
              {vehicles.map((v) => (
                <tr key={v.id}>
                  <td className="nowrap"><b>{v.name}</b><div className="small muted">{v.code}</div></td>
                  {MONTHS_SHORT.map((m, i) => (
                    <td key={m} className="num" style={{ padding: 3 }}>
                      {editable ? <input className="inp sm num-in" style={{ width: 62 }} type="number" min="0" aria-label={`${v.name} ${MONTHS_TR[i]}`}
                        value={rowVals(v.id)[i] === null || rowVals(v.id)[i] === undefined ? '' : rowVals(v.id)[i]} onChange={(e) => setCell(v.id, i, e.target.value)} />
                        : fmtNum(rowVals(v.id)[i])}
                    </td>
                  ))}
                  <td className="num"><b>{fmtNum(total(v.id))}</b></td>
                  <td className="small muted nowrap">{derived.plans.get(planId(year, v.id))?.source || '—'}{derived.plans.get(planId(year, v.id))?.updatedAt ? <div>{fmtDateTime(derived.plans.get(planId(year, v.id)).updatedAt)}</div> : null}</td>
                </tr>
              ))}
              <tr className="tot"><td>Toplam</td>{MONTHS_SHORT.map((m, i) => <td key={m} className="num">{fmtNum(colTotal(i))}</td>)}<td className="num">{fmtNum(grand)}</td><td /></tr>
            </tbody>
          </table></div>
          {!vehicles.length ? <Empty title="Araç tanımlı değil">Master Data &gt; Araçlar ekranından araç ekleyin.</Empty> : null}
        </div>
      </div>
      <div className="card">
        <div className="card-h"><h3>Aylık toplam üretim — {year}</h3><Legend items={[{ name: 'Planlanan', color: 'var(--plan)' }, { name: 'Gerçekleşen (girilen)', color: 'var(--good)' }]} /></div>
        <div className="card-b"><BarChart labels={MONTHS_SHORT} money={false} series={[{ name: 'Planlanan', color: 'var(--plan)', values: plannedTotals }, { name: 'Gerçekleşen', color: 'var(--good)', values: actualTotals }]} ariaLabel="Aylık üretim" /></div>
      </div>
      {importOpen ? <PlanImport onClose={() => setImportOpen(false)} /> : null}
    </>
  );
}

function stripMeta(p) { const o = { ...p }; delete o.history; delete o.updatedAt; delete o.updatedBy; delete o.source; delete o.id; return { planned: (o.planned || []).map(num), actual: (o.actual || []).map((x) => (x === null || x === undefined || x === '' ? null : num(x))) }; }

function planSheet(vehicles, draft, year, kind) {
  return [['Yıl', 'Araç Kodu', 'Araç', 'Tip', ...MONTHS_SHORT, 'Yıllık'], ...vehicles.map((v) => {
    const arr = (draft[v.id]?.[kind] || []).map((x) => (x === null || x === undefined ? '' : num(x)));
    return [+year, v.code || v.id, v.name, kind === 'actual' ? 'Gerçekleşen' : 'Plan', ...MONTHS_SHORT.map((_, i) => arr[i] ?? ''), arr.reduce((a, b) => a + num(b), 0)];
  })];
}

async function templateDl(platform, toast, vehicles, year) {
  const rows = [['Yıl', 'Araç Kodu', 'Tip', ...MONTHS_SHORT], ...vehicles.flatMap((v) => [[+year, v.code || v.id, 'Plan', ...new Array(12).fill('')], [+year, v.code || v.id, 'Gerçekleşen', ...new Array(12).fill('')]])];
  try { if (await platform.saveFile(`CRID_Uretim_Plani_Sablon_${year}.xlsx`, buildXlsx([{ name: 'Üretim Planı', rows }]))) toast('Şablon hazırlandı', 'good'); } catch (e) { toast(e.message, 'bad'); }
}

/** Şablon satırlarını plan kayıtlarına çevirir. */
export function rowsToPlans(rows, master, existing) {
  const errors = [];
  if (!rows.length) return { plans: [], errors: ['Dosya boş.'] };
  const head = rows[0].map((h) => String(h).trim().toLocaleLowerCase('tr-TR'));
  const iy = head.indexOf('yıl'), iv = head.indexOf('araç kodu'), it = head.indexOf('tip');
  if (iy < 0 || iv < 0) return { plans: [], errors: ['"Yıl" ve "Araç Kodu" kolonları bulunamadı.'] };
  const mIdx = MONTHS_SHORT.map((m) => head.indexOf(m.toLocaleLowerCase('tr-TR')));
  const byId = new Map();
  rows.slice(1).forEach((r, k) => {
    const y = +r[iy];
    const code = String(r[iv] || '').trim();
    const v = master.vehicles.find((x) => x.code === code || x.id === code || x.name === code);
    if (!y || !v) { errors.push(`Satır ${k + 2}: ${!y ? 'yıl' : `"${code}" aracı`} tanınmadı.`); return; }
    const id = planId(y, v.id);
    const p = byId.get(id) || clone(existing.get(id)) || emptyPlan(y, v.id);
    const kind = it >= 0 && /gerç|actual/i.test(String(r[it])) ? 'actual' : 'planned';
    const arr = (p[kind] || []).slice();
    mIdx.forEach((ci, i) => { if (ci >= 0 && r[ci] !== '' && r[ci] !== undefined) arr[i] = num(r[ci]); });
    p[kind] = arr;
    p.source = 'Şablon içe aktarım';
    byId.set(id, p);
  });
  return { plans: [...byId.values()], errors };
}

function PlanImport({ onClose }) {
  const { state, derived, store, toast } = useApp();
  const n = useNames();
  const [parsed, setParsed] = useState(null);
  const [busy, setBusy] = useState(false);
  const onFile = async (f) => {
    try {
      const rows = /\.xlsx$/i.test(f.name) ? await readXlsx(await f.arrayBuffer()) : parseCsv(await f.text());
      setParsed(rowsToPlans(rows, state.master, derived.plans));
    } catch (e) { toast(e.message || 'Dosya okunamadı', 'bad'); }
  };
  return (
    <Modal title="Üretim planı içe aktar" onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Vazgeç</button>
      <button className="btn primary" disabled={!parsed?.plans.length || busy} onClick={async () => {
        setBusy(true);
        try { for (const p of parsed.plans) await store.savePlan(p, 'Şablondan içe aktarıldı'); const m = clone(state.master); m.sap.lastImports = [{ at: new Date().toISOString(), kind: 'Üretim planı', count: parsed.plans.length }, ...(m.sap.lastImports || [])].slice(0, 20); await store.saveMaster(m, 'Üretim planı içe aktarımı'); toast(`${parsed.plans.length} plan kaydı güncellendi`, 'good'); onClose(); } catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
      }}>Aktar</button>
    </>}>
      <div className="stack">
        <p className="muted" style={{ margin: 0 }}>SAP veya planlama sisteminden alınan aylık adetleri şablon biçiminde (.xlsx / .csv) yükleyin. Kolonlar: Yıl, Araç Kodu, Tip (Plan / Gerçekleşen), Oca … Ara. Yalnızca dolu hücreler güncellenir.</p>
        <input type="file" accept=".xlsx,.csv" aria-label="Plan dosyası" onChange={(e) => e.target.files[0] && onFile(e.target.files[0])} />
        {parsed ? <>
          <div><b>{parsed.plans.length}</b> araç-yıl kaydı güncellenecek: {parsed.plans.map((p) => `${n.vehicle(p.vehicleId)} ${p.year}`).join(', ')}</div>
          {parsed.errors.length ? <div className="banner warn"><div>{parsed.errors.slice(0, 8).map((e, i) => <div key={i}>{e}</div>)}</div></div> : null}
        </> : null}
      </div>
    </Modal>
  );
}
