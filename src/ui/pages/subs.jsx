import { useMemo, useState } from 'react';
import { useApp, useNames, usePerms } from '../ctx.jsx';
import { Field, Input, NumInput, Select, MultiChips, TextArea, Modal, Confirm, Pill, Icon, Empty, useOptions, DataTable } from '../components/common.jsx';
import { History } from './cridDetail.jsx';
import { emptySub } from '../../logic/rules.js';
import { subUnitImpactBase, subLiveImpactBase, lineBase, subVehicleIds, subVolume, isActiveSub } from '../../logic/calc.js';
import { SUB_STATUSES } from '../../logic/defaults.js';
import { buildXlsx, readXlsx, parseCsv } from '../../logic/xlsx.js';
import { clone, fmtMoney, fmtNum, fmtDate, num, includesTR } from '../../logic/util.js';

export const SUBST = Object.fromEntries(SUB_STATUSES.map((s) => [s.key, s]));

export const SUB_TEMPLATE_HEADERS = ['Parça Kodu', 'Parça Adı', 'Mevcut Durum', 'Önerilen Durum', 'İptal Parça No', 'İptal Parça Adı', 'İptal Adet', 'İptal Fiyat', 'İptal PB', 'İptal Oran', 'İlave Parça No', 'İlave Parça Adı', 'İlave Adet', 'İlave Fiyat', 'İlave PB', 'İlave Oran', 'Sorumlu', 'Durum'];

export function SubTable({ crid, subs, locked }) {
  const { state, derived, store, toast, platform } = useApp();
  const n = useNames();
  const can = usePerms();
  const cur = state.master.baseCurrency;
  const editable = can('sub.edit', crid) && !locked;
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const [importing, setImporting] = useState(false);
  const year = crid.ms?.sopTarget ? +crid.ms.sopTarget.slice(0, 4) : +state.master.settings.reportYear;
  const rows = subs.map((s) => {
    const unit = subUnitImpactBase(s, state.master);
    const vol = subVolume(s, crid, derived.ctx, year);
    return { s, unit, live: subLiveImpactBase(s, state.master), vol, annual: isActiveSub(s) ? unit * vol : 0 };
  });
  const tot = rows.filter((r) => isActiveSub(r.s)).reduce((a, r) => ({ unit: a.unit + r.unit, annual: a.annual + r.annual }), { unit: 0, annual: 0 });
  const frozenCount = subs.filter((s) => s.frozen).length;

  const refreshPrices = async () => {
    const parts = state.master.parts || [];
    let changed = 0;
    for (const s of subs.filter((x) => !x.frozen)) {
      const next = clone(s);
      let hit = false;
      for (const side of ['del', 'add']) {
        const p = parts.find((x) => x.partNo && x.partNo === next[side]?.partNo);
        if (p && (num(p.price) !== num(next[side].price) || p.currency !== next[side].currency)) { next[side].price = p.price; next[side].currency = p.currency; hit = true; }
      }
      if (hit) { await store.saveSub(next, crid); changed++; }
    }
    toast(changed ? `${changed} alt detayın fiyatı parça master'dan güncellendi (dondurulmuşlar hariç)` : 'Güncellenecek fiyat bulunamadı', changed ? 'good' : 'info');
  };

  return (
    <div className="stack">
      <div className="row">
        <div style={{ flex: 1, minWidth: 220 }}>
          <b>Add/Delete listesi</b> <span className="small muted">— ana fikir, parça/bileşen/aksiyon bazında kırılır. Birim etki = iptal edilen − ilave edilen (adet × fiyat × oran × kur).</span>
        </div>
        {frozenCount ? <Pill tone="info"><Icon name="snow" className="ico" /> {frozenCount} satır finansal olarak donduruldu</Pill> : null}
        {editable ? <>
          <button className="btn sm" onClick={() => templateDownload(platform, toast)}><Icon name="down" />Şablon</button>
          <button className="btn sm" onClick={() => setImporting(true)}><Icon name="up" />Excel/CSV'den al</button>
          {(state.master.parts || []).length ? <button className="btn sm" onClick={refreshPrices}>Fiyatları güncelle</button> : null}
          <button className="btn sm primary" onClick={() => setEdit(emptySub(crid, state.master))}><Icon name="plus" />Add — alt detay ekle</button>
        </> : null}
      </div>
      {crid.unitMode !== 'subs' && subs.length ? <div className="banner info">Bu CRID'in birim faydası manuel girilmiş. Alt detay toplamını kullanmak için Finansal sekmesinde "Alt detaylardan hesapla"yı seçin.</div> : null}
      <div className="tbl-wrap"><table className="tbl" data-testid="sub-table">
        <thead>
          <tr><th rowSpan={2}>No</th><th rowSpan={2}>Parça / bileşen</th><th colSpan={3} style={{ textAlign: 'center', background: 'color-mix(in srgb, var(--bad) 12%, var(--surface-2))' }}>İptaller (Delete)</th><th colSpan={3} style={{ textAlign: 'center', background: 'color-mix(in srgb, var(--good) 14%, var(--surface-2))' }}>İlaveler (Add)</th><th rowSpan={2} className="num">Birim etki</th><th rowSpan={2} className="num">Yıllık hacim</th><th rowSpan={2} className="num">Yıllık etki</th><th rowSpan={2}>Sorumlu</th><th rowSpan={2}>Durum</th><th rowSpan={2} /></tr>
          <tr><th>Parça No</th><th className="num">Ad.×Oran</th><th className="num">{cur}</th><th>Parça No</th><th className="num">Ad.×Oran</th><th className="num">{cur}</th></tr>
        </thead>
        <tbody>
          {rows.map(({ s, unit, live, vol, annual }) => (
            <tr key={s.id} className={s.status === 'cancel' ? 'cancel' : ''}>
              <td className="mono nowrap">{s.no}</td>
              <td className="t-title"><b>{s.partName || s.partNo || '—'}</b>{s.partNo ? <div className="small muted mono">{s.partNo}</div> : null}{s.currentState || s.proposedState ? <div className="small muted">{s.currentState || '…'} → {s.proposedState || '…'}</div> : null}</td>
              <td className="mono small">{s.impactMode === 'manual' ? '—' : s.del?.partNo}</td>
              <td className="num small">{s.impactMode === 'manual' ? '' : `${fmtNum(s.del?.qty, 0)}×${fmtNum(s.del?.ratio ?? 1, 3)}`}</td>
              <td className="num">{s.impactMode === 'manual' ? '' : fmtMoney(s.frozen ? s.frozen.delBase : lineBase(s.del, state.master), cur, 1)}</td>
              <td className="mono small">{s.impactMode === 'manual' ? '—' : s.add?.partNo}</td>
              <td className="num small">{s.impactMode === 'manual' ? '' : `${fmtNum(s.add?.qty, 0)}×${fmtNum(s.add?.ratio ?? 1, 3)}`}</td>
              <td className="num">{s.impactMode === 'manual' ? '' : fmtMoney(s.frozen ? s.frozen.addBase : lineBase(s.add, state.master), cur, 1)}</td>
              <td className="num"><b className={unit >= 0 ? 'good-t' : 'bad-t'}>{fmtMoney(unit, cur, 1)}</b>{s.frozen && Math.abs(live - unit) > 0.05 ? <div className="small muted" title="Güncel fiyat/kur ile hesaplanan değer — dondurulduğu için kullanılmaz">güncel {fmtMoney(live, cur, 1)}</div> : null}</td>
              <td className="num">{fmtNum(vol)}</td>
              <td className="num">{fmtMoney(annual, cur)}</td>
              <td>{n.user(s.responsibleId)}</td>
              <td><Pill tone={SUBST[s.status || 'open'].tone}>{SUBST[s.status || 'open'].label}</Pill>{s.frozen ? <div className="small muted" title={`Dondurma: ${fmtDate(s.frozen.at)}`}><Icon name="snow" className="ico" style={{ width: 12 }} /> {fmtDate(s.frozen.at)}</div> : null}</td>
              <td className="nowrap">
                <button className="btn sm ghost" onClick={() => setEdit(clone(s))} aria-label={`${s.no} aç`}><Icon name="edit" /></button>
                {editable ? <button className="btn sm ghost" onClick={() => setDel(s)} aria-label={`${s.no} sil`}><Icon name="trash" /></button> : null}
              </td>
            </tr>
          ))}
          {!rows.length ? <tr><td colSpan={14}><Empty title="Alt detay yok">"Add" ile parça, bileşen, aksiyon veya alt proje ekleyin; ya da Excel şablonuyla toplu aktarın.</Empty></td></tr> : null}
          {rows.length ? <tr className="tot"><td colSpan={8}>Toplam (iptal edilenler hariç)</td><td className="num">{fmtMoney(tot.unit, cur, 1)}</td><td /><td className="num">{fmtMoney(tot.annual, cur)}</td><td colSpan={3} /></tr> : null}
        </tbody>
      </table></div>
      {edit ? <SubModal sub={edit} crid={crid} editable={editable} onClose={() => setEdit(null)} /> : null}
      {del ? <Confirm title="Alt detayı sil (Delete)" danger confirmLabel="Sil" onClose={() => setDel(null)} message={`${del.no} ${del.partName || ''} silinecek. İşlem CRID geçmişine yazılır.`}
        onConfirm={async () => { await store.deleteSub(del); toast('Alt detay silindi', 'good'); }} /> : null}
      {importing ? <SubImport crid={crid} onClose={() => setImporting(false)} /> : null}
    </div>
  );
}

async function templateDownload(platform, toast) {
  const rows = [SUB_TEMPLATE_HEADERS, ['13C33-05203-AA', 'ÖN AKS KOMPLE', 'Mevcut tedarikçi', 'Yeni tedarikçi', '13C33-05203-AA', 'ÖN AKS KOMPLE', 1, 2237.6, 'EUR', 1, '25A00-05203-AA', 'KOMPLE ÖN AKS', 1, 1070.5, 'USD', 1, '', 'Açık']];
  try { if (await platform.saveFile('CRID_AddDelete_Sablon.xlsx', buildXlsx([{ name: 'Add-Delete', rows }]))) toast('Şablon hazırlandı', 'good'); } catch (e) { toast(e.message, 'bad'); }
}

/** Excel/CSV satırlarını alt detay kayıtlarına çevirir (başlık adlarıyla eşleşir). */
export function rowsToSubs(rows, crid, master) {
  if (!rows.length) return { subs: [], errors: ['Dosya boş.'] };
  const head = rows[0].map((h) => String(h).trim().toLocaleLowerCase('tr-TR'));
  const idx = (name) => head.indexOf(name.toLocaleLowerCase('tr-TR'));
  const get = (r, name) => { const i = idx(name); return i >= 0 ? r[i] ?? '' : ''; };
  const errors = [];
  if (idx('İptal Parça No') < 0 && idx('İlave Parça No') < 0 && idx('Parça Kodu') < 0) errors.push('Başlık satırı tanınmadı. Şablondaki kolon adlarını kullanın.');
  const statusByLabel = Object.fromEntries(SUB_STATUSES.map((s) => [s.label.toLocaleLowerCase('tr-TR'), s.key]));
  const userBy = (v) => { const s = String(v || '').trim(); if (!s) return crid.responsibleId || ''; const u = master.users.find((x) => x.email === s || includesTR(x.name, s)); return u ? u.id : crid.responsibleId || ''; };
  const subs = [];
  rows.slice(1).forEach((r, i) => {
    const base = emptySub(crid, master);
    const s = {
      ...base,
      partNo: String(get(r, 'Parça Kodu') || get(r, 'İlave Parça No') || get(r, 'İptal Parça No') || ''),
      partName: String(get(r, 'Parça Adı') || get(r, 'İlave Parça Adı') || get(r, 'İptal Parça Adı') || ''),
      currentState: String(get(r, 'Mevcut Durum') || ''), proposedState: String(get(r, 'Önerilen Durum') || ''),
      del: { partNo: String(get(r, 'İptal Parça No') || ''), partName: String(get(r, 'İptal Parça Adı') || ''), qty: get(r, 'İptal Adet') === '' ? 1 : num(get(r, 'İptal Adet')), price: num(get(r, 'İptal Fiyat')), currency: String(get(r, 'İptal PB') || master.baseCurrency).toUpperCase(), ratio: get(r, 'İptal Oran') === '' ? 1 : num(get(r, 'İptal Oran')) },
      add: { partNo: String(get(r, 'İlave Parça No') || ''), partName: String(get(r, 'İlave Parça Adı') || ''), qty: get(r, 'İlave Adet') === '' ? 1 : num(get(r, 'İlave Adet')), price: num(get(r, 'İlave Fiyat')), currency: String(get(r, 'İlave PB') || master.baseCurrency).toUpperCase(), ratio: get(r, 'İlave Oran') === '' ? 1 : num(get(r, 'İlave Oran')) },
      responsibleId: userBy(get(r, 'Sorumlu')),
      status: statusByLabel[String(get(r, 'Durum') || '').toLocaleLowerCase('tr-TR')] || 'open',
    };
    if (!s.del.price && !s.add.price && !s.partNo) { errors.push(`Satır ${i + 2}: parça veya fiyat bilgisi yok, atlandı.`); return; }
    for (const side of ['del', 'add']) if (s[side].currency && !master.currencies.some((c) => c.code === s[side].currency)) errors.push(`Satır ${i + 2}: "${s[side].currency}" para birimi master data'da yok; 1:1 kur kullanılacak.`);
    subs.push(s);
  });
  return { subs, errors };
}

function SubImport({ crid, onClose }) {
  const { state, store, toast } = useApp();
  const [parsed, setParsed] = useState(null);
  const [busy, setBusy] = useState(false);
  const onFile = async (f) => {
    try {
      const rows = /\.xlsx$/i.test(f.name) ? await readXlsx(await f.arrayBuffer()) : parseCsv(await f.text());
      setParsed(rowsToSubs(rows, crid, state.master));
    } catch (e) { toast(e.message || 'Dosya okunamadı', 'bad'); }
  };
  return (
    <Modal title="Add/Delete listesini içe aktar" onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Vazgeç</button>
      <button className="btn primary" disabled={!parsed?.subs.length || busy} onClick={async () => {
        setBusy(true);
        try { for (const s of parsed.subs) await store.saveSub(s, store.state.crids.find((c) => c.id === crid.id) || crid); toast(`${parsed.subs.length} alt detay eklendi`, 'good'); onClose(); } catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
      }}>{parsed?.subs.length ? `${parsed.subs.length} satırı ekle` : 'Ekle'}</button>
    </>}>
      <div className="stack">
        <p className="muted" style={{ margin: 0 }}>Şablondaki kolonları kullanın (.xlsx veya .csv). Her satır bir alt detay olur; mevcut satırlar değişmez.</p>
        <input type="file" accept=".xlsx,.csv,text/csv" aria-label="Dosya seç" onChange={(e) => e.target.files[0] && onFile(e.target.files[0])} />
        {parsed ? <>
          <div><b>{parsed.subs.length}</b> satır okundu.</div>
          {parsed.errors.length ? <div className="banner warn"><div>{parsed.errors.slice(0, 8).map((e, i) => <div key={i}>{e}</div>)}</div></div> : null}
          <div className="tbl-wrap" style={{ maxHeight: 260 }}><table className="tbl"><thead><tr><th>Parça</th><th>İptal</th><th>İlave</th><th className="num">Birim etki</th></tr></thead>
            <tbody>{parsed.subs.slice(0, 50).map((s, i) => <tr key={i}><td>{s.partNo} {s.partName}</td><td>{s.del.partNo} {s.del.price ? fmtMoney(s.del.price, s.del.currency, 2) : ''}</td><td>{s.add.partNo} {s.add.price ? fmtMoney(s.add.price, s.add.currency, 2) : ''}</td><td className="num">{fmtMoney(subLiveImpactBase(s, state.master), state.master.baseCurrency, 2)}</td></tr>)}</tbody></table></div>
        </> : null}
      </div>
    </Modal>
  );
}

function PartLine({ side, value, onChange, disabled, title, tone }) {
  const { state } = useApp();
  const o = useOptions();
  const set = (k) => (v) => onChange({ ...value, [k]: v });
  const parts = state.master.parts || [];
  const listId = `parts-${side}`;
  return (
    <div className="stack" style={{ border: '1px solid var(--line)', borderRadius: 6, padding: 12, borderTop: `3px solid var(--${tone})` }}>
      <b>{title}</b>
      <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
        <Field label="Parça No" className="span2" htmlFor={`${side}-pn`}>
          <input id={`${side}-pn`} className="inp" list={listId} value={value.partNo || ''} disabled={disabled}
            onChange={(e) => { const pn = e.target.value; const p = parts.find((x) => x.partNo === pn); onChange(p ? { ...value, partNo: pn, partName: p.name, price: p.price, currency: p.currency } : { ...value, partNo: pn }); }} />
          <datalist id={listId}>{parts.slice(0, 500).map((p) => <option key={p.partNo} value={p.partNo}>{p.name}</option>)}</datalist>
        </Field>
        <Field label="Parça adı" className="span2" htmlFor={`${side}-name`}><Input id={`${side}-name`} value={value.partName} onChange={set('partName')} disabled={disabled} /></Field>
        <Field label="Adet" htmlFor={`${side}-qty`}><NumInput id={`${side}-qty`} value={value.qty} onChange={set('qty')} disabled={disabled} /></Field>
        <Field label="Birim fiyat" htmlFor={`${side}-price`}><NumInput id={`${side}-price`} value={value.price} onChange={set('price')} disabled={disabled} /></Field>
        <Field label="PB" htmlFor={`${side}-cur`}><Select id={`${side}-cur`} value={value.currency} onChange={set('currency')} options={o.currencies} disabled={disabled} /></Field>
        <Field label="Oran" hint="Kullanım oranı" htmlFor={`${side}-ratio`}><NumInput id={`${side}-ratio`} value={value.ratio} onChange={set('ratio')} disabled={disabled} /></Field>
      </div>
      <div className="small muted">Değer: <b>{fmtMoney(lineBase(value, state.master), state.master.baseCurrency, 2)}</b></div>
    </div>
  );
}

function SubModal({ sub: initial, crid, editable, onClose }) {
  const { state, store, toast, derived } = useApp();
  const can = usePerms();
  const o = useOptions();
  const [d, setD] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('form');
  const isNew = !d.id;
  const frozen = !!initial.frozen;
  const finDis = !editable || frozen;
  const set = (k) => (v) => setD((x) => ({ ...x, [k]: v }));
  const unit = subLiveImpactBase(d, state.master);
  const year = crid.ms?.sopTarget ? +crid.ms.sopTarget.slice(0, 4) : +state.master.settings.reportYear;
  const vol = subVolume(d, crid, derived.ctx, year);
  const save = async () => {
    setBusy(true);
    try { const r = await store.saveSub(d, crid); toast(isNew ? `${r.no} eklendi` : 'Alt detay kaydedildi', 'good'); onClose(); } catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  return (
    <Modal size="wide" title={isNew ? 'Alt detay ekle (Add)' : `${initial.no} — ${initial.partName || initial.partNo || 'Alt detay'}`} onClose={onClose} footer={<>
      {frozen && can('sub.unfreeze') ? <button className="btn" onClick={async () => { await store.unfreezeSub(initial); toast('Dondurma kaldırıldı'); onClose(); }}>Dondurmayı kaldır</button> : null}
      <span className="spacer" />
      <button className="btn" onClick={onClose}>Kapat</button>
      {editable ? <button className="btn primary" disabled={busy} onClick={save}>Kaydet</button> : null}
    </>}>
      {frozen ? <div className="banner info" style={{ marginBottom: 12 }}><Icon name="snow" className="ico" /> Bu satır {fmtDate(initial.frozen.at)} devreye giriş tarihinde finansal olarak donduruldu: birim etki <b>{fmtMoney(initial.frozen.unitImpactBase, state.master.baseCurrency, 2)}</b>. Fiyat ve kur güncellemeleri etkilemez.</div> : null}
      {!isNew ? <div className="tabs" style={{ marginBottom: 12 }}><button className={tab === 'form' ? 'on' : ''} onClick={() => setTab('form')}>Bilgiler</button><button className={tab === 'hist' ? 'on' : ''} onClick={() => setTab('hist')}>Geçmiş</button></div> : null}
      {tab === 'hist' ? <History items={initial.history} /> : (
        <div className="stack" style={{ gap: 14 }}>
          <div className="form-grid">
            <Field label="Parça / bileşen kodu" hint="Varsa SAP/ERP parça kodu" htmlFor="s-pn"><Input id="s-pn" value={d.partNo} onChange={set('partNo')} disabled={!editable} /></Field>
            <Field label="Parça / bileşen / aksiyon adı" className="span2" htmlFor="s-name"><Input id="s-name" value={d.partName} onChange={set('partName')} disabled={!editable} /></Field>
            <Field label="Durum" htmlFor="s-st"><Select id="s-st" value={d.status || 'open'} onChange={set('status')} options={SUB_STATUSES.map((s) => ({ value: s.key, label: s.label }))} disabled={!editable} /></Field>
            <Field label="Mevcut durum" className="span2" hint="Mevcut malzeme, proses, tedarikçi veya maliyet" htmlFor="s-cur"><TextArea id="s-cur" rows={2} value={d.currentState} onChange={set('currentState')} disabled={!editable} /></Field>
            <Field label="Önerilen durum" className="span2" hint="Yeni malzeme / proses / tedarikçi / teknik çözüm" htmlFor="s-prop"><TextArea id="s-prop" rows={2} value={d.proposedState} onChange={set('proposedState')} disabled={!editable} /></Field>
            <Field label="Sorumlu" htmlFor="s-resp"><Select id="s-resp" value={d.responsibleId} onChange={set('responsibleId')} options={o.users} placeholder="—" disabled={!editable} /></Field>
            <Field label="Etki hesabı" htmlFor="s-mode"><Select id="s-mode" value={d.impactMode || 'lines'} onChange={set('impactMode')} options={[{ value: 'lines', label: 'İptal − ilave parça' }, { value: 'manual', label: 'Manuel birim etki' }]} disabled={finDis} /></Field>
            <Field label="Yıllık hacim (manuel)" hint={`Boşsa plan: ${fmtNum(subVolume({ ...d, volumeOverride: '' }, crid, derived.ctx, year))} adet`} htmlFor="s-vol"><NumInput id="s-vol" value={d.volumeOverride} onChange={set('volumeOverride')} disabled={!editable} /></Field>
            <Field label="Geçerli araçlar" className="span-all" hint="Boş bırakılırsa CRID'in tüm hedef araçları"><MultiChips value={d.vehicleIds || []} onChange={set('vehicleIds')} options={o.vehicles.filter((v) => (crid.targetVehicleIds || []).includes(v.value))} disabled={finDis} /></Field>
          </div>
          {d.impactMode === 'manual' ? (
            <div className="form-grid">
              <Field label="Birim etki (araç başı)" htmlFor="s-mi"><NumInput id="s-mi" value={d.manualImpact} onChange={set('manualImpact')} disabled={finDis} /></Field>
              <Field label="Para birimi" htmlFor="s-mc"><Select id="s-mc" value={d.manualCurrency} onChange={set('manualCurrency')} options={o.currencies} disabled={finDis} /></Field>
            </div>
          ) : (
            <div className="grid g2">
              <PartLine side="del" title="İptal edilen (Delete)" tone="bad" value={d.del || {}} onChange={set('del')} disabled={finDis} />
              <PartLine side="add" title="İlave edilen (Add)" tone="good" value={d.add || {}} onChange={set('add')} disabled={finDis} />
            </div>
          )}
          <div className="kpis">
            <div className="kpi"><div className="l">Birim etki</div><div className="v">{fmtMoney(frozen ? initial.frozen.unitImpactBase : unit, state.master.baseCurrency, 2)}</div><div className="s">{frozen ? 'Donmuş değer' : 'Güncel fiyat ve kurla'}</div></div>
            <div className="kpi"><div className="l">Uygulanabilir hacim {year}</div><div className="v">{fmtNum(vol)}</div></div>
            <div className="kpi k-good"><div className="l">Yıllık finansal etki</div><div className="v">{fmtMoney((frozen ? initial.frozen.unitImpactBase : unit) * vol, state.master.baseCurrency)}</div><div className="s">Birim etki × hacim</div></div>
          </div>
        </div>
      )}
    </Modal>
  );
}
