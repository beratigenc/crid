import { useMemo, useState, useEffect } from 'react';
import { useApp, useNames, usePerms } from '../ctx.jsx';
import { DataTable, Field, Input, NumInput, Select, MultiChips, MonthInput, TextArea, Modal, Confirm, Tabs, Pill, Icon, ExportButton, tableRows, useOptions, SampleTag, Kpis } from '../components/common.jsx';
import { History } from './cridDetail.jsx';
import { MATURITY } from '../../logic/defaults.js';
import { emptyIdea } from '../../logic/rules.js';
import { searchIdeas, ideaAnnualPotential } from '../../logic/filters.js';
import { evaluationScore } from '../../logic/calc.js';
import { fmtMoney, fmtMoneyShort, fmtNum, daysBetween, todayISO, fmtMonthKey, clone, fmtPct } from '../../logic/util.js';

const MAT = Object.fromEntries(MATURITY.map((m) => [m.key, m]));

export function PoolPage({ focusId }) {
  const { state, derived, year, nav, toast, session } = useApp();
  const n = useNames();
  const can = usePerms();
  const o = useOptions();
  const [tab, setTab] = useState('open');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [team, setTeam] = useState('');
  const [editing, setEditing] = useState(null);
  useEffect(() => { if (focusId) { const i = state.ideas.find((x) => x.id === focusId); if (i) setEditing(clone(i)); } }, [focusId]);
  const today = todayISO();
  const cur = state.master.baseCurrency;

  const counts = useMemo(() => {
    const c = { all: state.ideas.length, open: 0 };
    for (const m of MATURITY) c[m.key] = 0;
    for (const i of state.ideas) { c[i.maturity || 'raw']++; if (!['converted', 'rejected'].includes(i.maturity)) c.open++; }
    return c;
  }, [state.ideas]);
  const rows = useMemo(() => {
    let r = state.ideas;
    if (tab === 'open') r = r.filter((i) => !['converted', 'rejected'].includes(i.maturity));
    else if (tab !== 'all') r = r.filter((i) => (i.maturity || 'raw') === tab);
    if (cat) r = r.filter((i) => i.categoryId === cat);
    if (team) r = r.filter((i) => i.teamId === team);
    return searchIdeas(r, q, state.master);
  }, [state.ideas, tab, q, cat, team]);
  const potTotal = rows.reduce((a, i) => a + ideaAnnualPotential(i, state.master, derived.plans, year), 0);

  const cols = [
    { key: 'no', label: 'No', render: (i) => <span className="mono">{i.no}</span>, width: 120 },
    { key: 'title', label: 'Kısa fikir', className: 't-title', render: (i) => <div><b>{i.title}</b> <SampleTag show={i.sample} />{i.problem || i.description ? <div className="small muted">{i.description || i.problem}</div> : null}</div>, value: (i) => i.title },
    { key: 'cat', label: 'Kategori', value: (i) => n.category(i.categoryId) },
    { key: 'veh', label: 'İlgili araç', value: (i) => n.vehicles(i.vehicleIds) },
    { key: 'owner', label: 'Ekip / Sahip', render: (i) => <div>{n.team(i.teamId)}<div className="small muted">{n.user(i.ownerId)}</div></div>, value: (i) => `${n.team(i.teamId)} ${n.user(i.ownerId)}` },
    { key: 'pot', label: 'Tahmini potansiyel', num: true, render: (i) => i.potential === '' || i.potential === undefined ? '–' : <div>{fmtMoney(i.potential, i.potentialCurrency)}<div className="small muted">{i.potentialBasis === 'unit' ? '/araç' : '/yıl'}</div></div>, value: (i) => ideaAnnualPotential(i, state.master, derived.plans, year), exportValue: (i) => i.potential },
    { key: 'basis', label: 'Potansiyel tipi', export: true, render: null, value: (i) => (i.potentialBasis === 'unit' ? 'Araç başı' : 'Yıllık'), sortable: false, hidden: true },
    { key: 'est', label: 'Tahmini devreye giriş', render: (i) => i.estSop ? <span className="nowrap">{fmtMonthKey(i.estSop)}</span> : '–', value: (i) => i.estSop || '' },
    { key: 'score', label: 'Değ. skoru', num: true, render: (i) => { const s = evaluationScore(i.evaluation); return s ? s.toFixed(1) : '–'; }, value: (i) => evaluationScore(i.evaluation) || 0 },
    { key: 'mat', label: 'Olgunluk', render: (i) => <Pill tone={MAT[i.maturity || 'raw'].tone}>{MAT[i.maturity || 'raw'].label}</Pill>, value: (i) => MAT[i.maturity || 'raw'].label },
    { key: 'wait', label: 'Bekleme', num: true, render: (i) => { const d = daysBetween((i.updatedAt || i.createdAt || '').slice(0, 10), today); const idle = d >= (+state.master.settings.poolIdleDays || 60) && !['converted', 'rejected'].includes(i.maturity); return <span className={idle ? 'bad-t' : ''}>{d ?? '–'} gün</span>; }, value: (i) => daysBetween((i.updatedAt || i.createdAt || '').slice(0, 10), today) || 0 },
    { key: 'crid', label: 'CRID', render: (i) => i.convertedCridId ? <button className="btn sm" onClick={(e) => { e.stopPropagation(); nav('crid', { id: i.convertedCridId }); }}>{i.convertedCridNo || state.crids.find((c) => c.id === i.convertedCridId)?.no || 'Aç'}</button> : '', value: (i) => i.convertedCridNo || state.crids.find((c) => c.id === i.convertedCridId)?.no || '' },
  ].filter((c) => !c.hidden);

  return (
    <>
      <div className="page-head">
        <div className="grow"><div className="eyebrow">Olgunlaşmamış fikirler</div><h1>Fikir Havuzu</h1></div>
        <ExportButton filename="CRID_Fikir_Havuzu" getSheets={() => [{ name: 'Fikir Havuzu', rows: tableRows([...cols.slice(0, 5), { key: 'p', label: 'Tahmini potansiyel', value: (i) => i.potential }, { key: 'b', label: 'Potansiyel tipi', value: (i) => (i.potentialBasis === 'unit' ? 'Araç başı' : 'Yıllık') }, { key: 'pr', label: 'Problem/Fırsat', value: (i) => i.problem }, { key: 'nt', label: 'Notlar', value: (i) => i.notes }, ...cols.slice(6)], rows) }]} />
        {can('pool.create') ? <button className="btn primary" onClick={() => setEditing(emptyIdea(state.master, session.id))}><Icon name="plus" />Yeni fikir</button> : null}
      </div>
      <Kpis items={[
        { label: 'Açık fikir', value: fmtNum(counts.open) },
        { label: 'Açık potansiyel (yıllık)', value: fmtMoneyShort(state.ideas.filter((i) => !['converted', 'rejected'].includes(i.maturity)).reduce((a, i) => a + ideaAnnualPotential(i, state.master, derived.plans, year), 0), cur) },
        { label: "CRID'e dönüşen", value: fmtNum(counts.converted), tone: 'good', sub: `Dönüşüm oranı ${fmtPct(counts.all ? counts.converted / counts.all : 0)}` },
        { label: 'Reddedilen', value: fmtNum(counts.rejected) },
        { label: `${state.master.settings.poolIdleDays}+ gün bekleyen`, value: fmtNum(state.ideas.filter((i) => !['converted', 'rejected'].includes(i.maturity) && daysBetween((i.updatedAt || i.createdAt || '').slice(0, 10), today) >= (+state.master.settings.poolIdleDays || 60)).length), tone: 'bad' },
      ]} />
      <div className="card">
        <Tabs value={tab} onChange={setTab} tabs={[
          { value: 'open', label: 'Açık', count: counts.open },
          ...MATURITY.map((m) => ({ value: m.key, label: m.label, count: counts[m.key] })),
          { value: 'all', label: 'Tümü', count: counts.all },
        ]} />
        <div className="filterbar" style={{ border: 0, borderRadius: 0, borderBottom: '1px solid var(--line)' }}>
          <Field label="Ara"><Input value={q} onChange={setQ} placeholder="No, fikir, araç, sahip…" aria-label="Havuzda ara" /></Field>
          <Field label="Kategori"><Select value={cat} onChange={setCat} options={o.categories} placeholder="Tümü" aria-label="Kategori filtresi" /></Field>
          <Field label="Ekip"><Select value={team} onChange={setTeam} options={o.teams} placeholder="Tümü" aria-label="Ekip filtresi" /></Field>
          <div className="small muted" style={{ marginLeft: 'auto', alignSelf: 'center' }}>{rows.length} fikir · {fmtMoneyShort(potTotal, cur)}/yıl potansiyel</div>
        </div>
        <DataTable testId="pool-table" columns={cols} rows={rows} onRowClick={(i) => setEditing(clone(i))} initialSort={{ key: 'no', dir: 'desc' }} />
      </div>
      {editing ? <IdeaModal idea={editing} onClose={() => setEditing(null)} /> : null}
    </>
  );
}


function IdeaModal({ idea: initial, onClose }) {
  const { store, state, session, toast, nav } = useApp();
  const n = useNames();
  const can = usePerms();
  const o = useOptions();
  const [d, setD] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [tab, setTab] = useState('info');
  const [tried, setTried] = useState(false);
  const isNew = !d.id;
  const rec = { ...d, createdBy: initial.createdBy };
  const editable = isNew ? can('pool.create') : can('pool.edit', rec) && !['converted'].includes(initial.maturity);
  const canEval = can('pool.evaluate', rec);
  const set = (k) => (v) => setD((x) => ({ ...x, [k]: v }));
  const setEv = (k) => (v) => setD((x) => ({ ...x, evaluation: { ...(x.evaluation || {}), [k]: v } }));
  const errors = {};
  if (!String(d.title || '').trim()) errors.title = 'Kısa fikir zorunludur.';
  if (!d.categoryId) errors.categoryId = 'Kategori seçin.';

  const save = async (patch = {}, msg) => {
    if (Object.keys(errors).length) { setTried(true); setTab('info'); toast('Zorunlu alanları doldurun.', 'bad'); return null; }
    setBusy(true);
    try {
      const r = await store.saveIdea({ ...d, ...patch });
      toast(msg || (isNew ? `${r.no} havuza eklendi` : 'Kaydedildi'), 'good');
      onClose();
      return r;
    } catch (e) { toast(e.message || 'Kaydedilemedi', 'bad'); } finally { setBusy(false); }
    return null;
  };
  const convert = async () => {
    setBusy(true);
    try {
      // önce düzenlemeleri kaydet (veri kaybı olmasın), sonra dönüştür
      let id = d.id;
      if (isNew || JSON.stringify(d) !== JSON.stringify(initial)) { const r = await store.saveIdea(d); id = r.id; await new Promise((res) => setTimeout(res, 50)); }
      const c = await store.convertIdea(id);
      toast(`${c.no} oluşturuldu — havuz bilgileri aktarıldı`, 'good');
      onClose();
      nav('crid', { id: c.id });
    } catch (e) { toast(e.message || 'Dönüştürülemedi', 'bad'); } finally { setBusy(false); }
  };

  const ev = d.evaluation || {};
  const scoreOpts = [1, 2, 3, 4, 5].map((x) => ({ value: String(x), label: String(x) }));
  return (
    <Modal size="wide" title={isNew ? 'Yeni fikir' : <span><span className="mono muted" style={{ fontSize: 14 }}>{d.no}</span> {initial.title}</span>} labelledBy="Fikir" onClose={onClose} footer={<>
      {!isNew && can('pool.edit', rec) && ['raw', 'review'].includes(initial.maturity) && (session.role === 'it' || initial.createdBy === session.id) ? <button className="btn danger" onClick={() => setConfirm('delete')}><Icon name="trash" />Sil</button> : null}
      <span className="spacer" />
      {!isNew && canEval && !['converted', 'rejected'].includes(initial.maturity) ? <button className="btn" disabled={busy} onClick={() => setConfirm('reject')}>Reddet</button> : null}
      {!isNew && canEval && initial.maturity === 'rejected' ? <button className="btn" disabled={busy} onClick={() => save({ maturity: 'review' }, 'Fikir yeniden incelemeye alındı')}>Yeniden incele</button> : null}
      <button className="btn" onClick={onClose}>Kapat</button>
      {editable || canEval ? <button className="btn primary" disabled={busy} onClick={() => save()}>Kaydet</button> : null}
      {can('pool.convert', rec) && !['converted', 'rejected'].includes(initial.maturity) ? <button className="btn good" disabled={busy} onClick={() => { if (Object.keys(errors).length) { setTried(true); setTab('info'); toast('Dönüştürmeden önce zorunlu alanları doldurun.', 'bad'); } else setConfirm('convert'); }}><Icon name="swap" />CRID'e Dönüştür</button> : null}
    </>}>
      {initial.maturity === 'converted' ? <div className="banner info" style={{ marginBottom: 12 }}>Bu fikir {initial.convertedCridNo || ''} numaralı CRID'e dönüştürüldü. <button className="btn sm" onClick={() => { onClose(); nav('crid', { id: initial.convertedCridId }); }}>CRID'e git</button></div> : null}
      {!isNew ? <Tabs value={tab} onChange={setTab} tabs={[{ value: 'info', label: 'Bilgiler' }, { value: 'eval', label: 'Ön değerlendirme' }, { value: 'hist', label: 'Geçmiş', count: (initial.history || []).length }]} /> : null}
      <div style={{ paddingTop: 14 }}>
        {tab === 'info' ? (
          <div className="form-grid">
            <Field label="Kısa fikir *" className="span2" error={tried ? errors.title : null} htmlFor="i-title"><Input id="i-title" value={d.title} onChange={set('title')} disabled={!editable} /></Field>
            <Field label="Olgunluk" htmlFor="i-mat"><Select id="i-mat" value={d.maturity || 'raw'} onChange={set('maturity')} options={MATURITY.filter((m) => !['converted'].includes(m.key)).map((m) => ({ value: m.key, label: m.label }))} disabled={!(editable || canEval) || initial.maturity === 'converted'} /></Field>
            <Field label="Problem / Fırsat" className="span-all" hint="Fikrin hangi maliyet veya süreç problemine cevap verdiği" htmlFor="i-prob"><TextArea id="i-prob" value={d.problem} onChange={set('problem')} rows={2} disabled={!editable} /></Field>
            <Field label="Öneri / Açıklama" className="span-all" htmlFor="i-desc"><TextArea id="i-desc" value={d.description} onChange={set('description')} rows={2} disabled={!editable} /></Field>
            <Field label="Kategori *" htmlFor="i-cat" error={tried ? errors.categoryId : null}><Select id="i-cat" value={d.categoryId} onChange={(v) => setD((x) => ({ ...x, categoryId: v, subCategory: '' }))} options={o.categories} placeholder="Seçin" disabled={!editable} /></Field>
            <Field label="Alt kırılım" htmlFor="i-sub"><Select id="i-sub" value={d.subCategory} onChange={set('subCategory')} options={o.subCats(d.categoryId)} placeholder="—" disabled={!editable} /></Field>
            <Field label="Ekip" htmlFor="i-team"><Select id="i-team" value={d.teamId} onChange={set('teamId')} options={o.teams} placeholder="—" disabled={!editable} /></Field>
            <Field label="Sahip (ilk sorumlu)" htmlFor="i-owner"><Select id="i-owner" value={d.ownerId} onChange={set('ownerId')} options={o.users.some((u) => u.value === d.ownerId) || !d.ownerId ? o.users : [...o.users, { value: d.ownerId, label: n.user(d.ownerId) || 'Ben' }]} placeholder="—" disabled={!editable} /></Field>
            <Field label="Tahmini potansiyel" htmlFor="i-pot"><NumInput id="i-pot" value={d.potential} onChange={set('potential')} disabled={!editable} /></Field>
            <Field label="Potansiyel tipi" htmlFor="i-basis"><Select id="i-basis" value={d.potentialBasis || 'annual'} onChange={set('potentialBasis')} options={[{ value: 'unit', label: 'Araç başı' }, { value: 'annual', label: 'Yıllık toplam' }]} disabled={!editable} /></Field>
            <Field label="Para birimi" htmlFor="i-cur"><Select id="i-cur" value={d.potentialCurrency} onChange={set('potentialCurrency')} options={o.currencies} disabled={!editable} /></Field>
            <Field label="Yatırım maliyeti" htmlFor="i-inv"><NumInput id="i-inv" value={d.investment} onChange={set('investment')} disabled={!editable} /></Field>
            <Field label="Tahmini devreye giriş" htmlFor="i-est"><MonthInput id="i-est" value={d.estSop} onChange={set('estSop')} disabled={!editable} /></Field>
            <Field label="Kapsam" htmlFor="i-scope"><Select id="i-scope" value={d.scopeId} onChange={set('scopeId')} options={o.scopes} placeholder="—" disabled={!editable} /></Field>
            <Field label="Gündem" htmlFor="i-ag"><Select id="i-ag" value={d.agendaId} onChange={set('agendaId')} options={o.agendas} placeholder="—" disabled={!editable} /></Field>
            <Field label="İlgili araç(lar)" className="span-all"><MultiChips value={d.vehicleIds || []} onChange={set('vehicleIds')} options={o.vehicles} disabled={!editable} /></Field>
            <Field label="Notlar" className="span-all" htmlFor="i-notes"><TextArea id="i-notes" value={d.notes} onChange={set('notes')} rows={2} disabled={!(editable || canEval)} /></Field>
          </div>
        ) : tab === 'eval' ? (
          <div className="stack">
            <p className="muted" style={{ margin: 0 }}>Fikir; potansiyel, uygulanabilirlik, araç uygunluğu ve gündem açısından 1–5 arasında puanlanır.</p>
            <div className="form-grid">
              <Field label="Potansiyel" htmlFor="e-pot"><Select id="e-pot" value={String(ev.potential || '')} onChange={setEv('potential')} options={scoreOpts} placeholder="—" disabled={!canEval} /></Field>
              <Field label="Uygulanabilirlik" htmlFor="e-feas"><Select id="e-feas" value={String(ev.feasibility || '')} onChange={setEv('feasibility')} options={scoreOpts} placeholder="—" disabled={!canEval} /></Field>
              <Field label="Araç uygunluğu" htmlFor="e-veh"><Select id="e-veh" value={String(ev.vehicleFit || '')} onChange={setEv('vehicleFit')} options={scoreOpts} placeholder="—" disabled={!canEval} /></Field>
              <Field label="Gündem uyumu" htmlFor="e-ag"><Select id="e-ag" value={String(ev.agendaFit || '')} onChange={setEv('agendaFit')} options={scoreOpts} placeholder="—" disabled={!canEval} /></Field>
              <Field label="Ortalama skor"><div className="inp" style={{ background: 'var(--surface-2)' }}>{evaluationScore(ev)?.toFixed(1) || '–'}</div></Field>
              <Field label="Değerlendirme notu" className="span-all" htmlFor="e-note"><TextArea id="e-note" value={ev.note} onChange={setEv('note')} disabled={!canEval} /></Field>
            </div>
            {!canEval ? <div className="small muted">Ön değerlendirme yetkiniz yok (CRID Sorumlusu, Kategori Yöneticisi veya Yönetici).</div> : null}
          </div>
        ) : <History items={initial.history} />}
      </div>
      {confirm === 'convert' ? <Confirm title="CRID'e dönüştür" confirmLabel="Dönüştür" onClose={() => setConfirm(null)} onConfirm={convert}
        message="Sistem benzersiz bir CRID numarası üretecek ve havuzdaki tüm bilgiler (kategori, ekip, araçlar, potansiyel, tahmini devreye giriş, notlar, değerlendirme) ana kayda aktarılacak. Havuz kaydı 'CRID'e Dönüştürüldü' olarak işaretlenir ve kaynak ilişkisi korunur." /> : null}
      {confirm === 'reject' ? <Confirm title="Fikri reddet" confirmLabel="Reddet" danger onClose={() => setConfirm(null)} onConfirm={() => save({ maturity: 'rejected' }, 'Fikir reddedildi')} message="Fikir 'Reddedildi' olarak işaretlenecek. Gerekçeyi Notlar alanına yazmanız önerilir." /> : null}
      {confirm === 'delete' ? <Confirm title="Fikri sil" confirmLabel="Kalıcı olarak sil" danger onClose={() => setConfirm(null)} onConfirm={async () => { await store.deleteIdea(initial.id); toast('Fikir silindi'); onClose(); }} message={`${initial.no} kalıcı olarak silinecek.`} /> : null}
    </Modal>
  );
}
