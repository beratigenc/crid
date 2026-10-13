import { useMemo, useState, useEffect, useRef } from 'react';
import { useApp, useNames, usePerms } from '../ctx.jsx';
import { Field, Input, NumInput, Select, MultiChips, DateInput, TextArea, Modal, Confirm, Tabs, Pill, StatusPill, Icon, Empty, SampleTag, useOptions, ExportButton, tableRows } from '../components/common.jsx';
import { SubTable } from './subs.jsx';
import { emptyCrid, validateStatusChange, isLocked, CRITICAL_FIELDS, FIELD_LABELS } from '../../logic/rules.js';
import { cridYearFinancials, cridMilestones, finMilestone, effectiveStatus, planFor, annualVolume, volumeFrom, forecastSop, fromBase, cridUnitByVehicle, subUnitImpactBase, isActiveSub } from '../../logic/calc.js';
import { FIN_STATUSES, MATURITY } from '../../logic/defaults.js';
import { clone, fmtDate, fmtDateTime, fmtMoney, fmtNum, yearOf, todayISO, num, numOrNull } from '../../logic/util.js';

const FIN = Object.fromEntries(FIN_STATUSES.map((f) => [f.key, f]));
const MS_LABEL = { done_ontime: 'On-time', done_late: 'Gecikmeli', overdue: 'Gecikmiş', upcoming: 'Yaklaşıyor', planned: 'Planlandı', none: 'Tarih yok', na: 'Uygulanmaz', confirmed: 'Teyit', pending: 'Bekliyor' };

export function CridDetailPage({ id, tab: initialTab }) {
  const { state, store, derived, session, toast, nav, back, year: reportYear } = useApp();
  const n = useNames();
  const can = usePerms();
  const saved = id ? state.crids.find((c) => c.id === id) : null;
  const isNew = !id;
  const [editing, setEditing] = useState(isNew);
  const [draft, setDraft] = useState(() => (saved ? clone(saved) : { ...emptyCrid(state.master), responsibleId: session.id && state.master.users.some((u) => u.id === session.id) ? session.id : '' }));
  const baseRef = useRef(saved?.updatedAt || null);
  const [tab, setTab] = useState(initialTab || 'general');
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState(null);
  const today = todayISO();

  // Düzenleme dışındayken canlı kaydı izle
  useEffect(() => { if (saved && !editing) { setDraft(clone(saved)); baseRef.current = saved.updatedAt; } }, [saved, editing]);

  const [tried, setTried] = useState(false);
  const rec = editing ? draft : saved || draft;
  const locked = !isNew && isLocked(saved) && !can('crid.editClosed', rec);
  const closedOverride = !isNew && isLocked(saved) && can('crid.editClosed', saved);
  const canGeneral = (isNew ? can('crid.create') : can('crid.edit', saved) || closedOverride) && !locked;
  const canMs = (isNew ? can('crid.create') : can('milestone.edit', saved) || can('crid.edit', saved) || closedOverride) && !locked;
  const canEditAny = canGeneral || canMs;
  const subs = derived.subsByCrid.get(rec.id) || [];
  const set = (k) => (v) => setDraft((d) => ({ ...d, [k]: v }));
  const setMs = (k) => (v) => setDraft((d) => ({ ...d, ms: { ...(d.ms || {}), [k]: v } }));
  const errors = {};
  if (!String(rec.title || '').trim()) errors.title = 'Fikir başlığı zorunludur.';
  if (!rec.categoryId) errors.categoryId = 'Kategori seçin.';
  if (!(rec.targetVehicleIds || []).length) errors.targetVehicleIds = 'En az bir hedef araç seçin.';
  const ms = rec.ms || {};
  for (const [t, a, label] of [['releaseTarget', 'releaseActual', 'Yayın'], ['sampleTarget', 'sampleActual', 'İlk numune'], ['sopTarget', 'sopActual', 'Devreye giriş']]) {
    if (ms[a] && ms[a] > today) errors[a] = `${label} gerçekleşme tarihi ileri bir tarih olamaz.`;
  }

  const doSave = async (force = false) => {
    if (Object.keys(errors).length) { setTried(true); toast('Eksik veya hatalı alanları düzeltin.', 'bad'); if (errors.title || errors.categoryId || errors.targetVehicleIds) setTab('general'); else setTab('milestones'); return; }
    const live = id ? state.crids.find((c) => c.id === id) : null;
    if (!force && live && baseRef.current && live.updatedAt !== baseRef.current) { setModal({ type: 'conflict', live }); return; }
    setBusy(true);
    try {
      const r = await store.saveCrid(draft);
      toast(isNew ? `${r.no} oluşturuldu` : 'Değişiklikler kaydedildi', 'good');
      setEditing(false);
      baseRef.current = r.updatedAt;
      if (isNew) nav('crid', { id: r.id });
      else if (r.status !== draft.status) toast(`Statü otomatik güncellendi: ${n.status(r.status)}`);
    } catch (e) { toast(e.message || 'Kaydedilemedi', 'bad'); } finally { setBusy(false); }
  };

  const fin = useMemo(() => {
    const y = rec.ms?.sopActual ? yearOf(rec.ms.sopActual) : rec.ms?.sopTarget ? yearOf(rec.ms.sopTarget) : reportYear;
    return { y, f: cridYearFinancials(rec, derived.ctx, y) };
  }, [rec, derived]);
  if (id && !saved) return <Empty title="CRID bulunamadı" action={<button className="btn" onClick={() => nav('crids')}>CRID listesine dön</button>}>Kayıt silinmiş ya da henüz yüklenmemiş olabilir.</Empty>;
  const es = effectiveStatus(rec, today);
  const cur = state.master.baseCurrency;
  const source = rec.sourcePoolId ? state.ideas.find((i) => i.id === rec.sourcePoolId) : null;

  return (
    <>
      <div className="page-head">
        <button className="btn ghost" onClick={back}><Icon name="back" />Geri</button>
        <div className="grow" />
        {!isNew && !editing ? <>
          <ExportButton filename={`${rec.no}`} label="Dışa aktar" getSheets={() => cridExportSheets(rec, subs, n, fin, cur, state.master)} />
          {can('crid.status', saved) ? <button className="btn" onClick={() => setModal({ type: 'status' })}>Statü değiştir</button> : null}
          {can('finance.confirm') ? <button className="btn" onClick={() => setModal({ type: 'finance' })}><Icon name="check" />Finansal kontrol</button> : null}
          {canEditAny ? <button className="btn primary" onClick={() => { setDraft(clone(saved)); baseRef.current = saved.updatedAt; setEditing(true); }}><Icon name="edit" />Düzenle</button> : null}
        </> : null}
        {editing ? <>
          <button className="btn" onClick={() => { if (isNew) back(); else { setEditing(false); setDraft(clone(saved)); } }}>Vazgeç</button>
          <button className="btn primary" disabled={busy} onClick={() => doSave()}>{isNew ? 'CRID oluştur' : 'Kaydet'}</button>
        </> : null}
      </div>

      <div className="rec-head">
        <div style={{ flex: 1, minWidth: 260 }}>
          <div className="rec-no">{isNew ? 'Yeni CRID — numara kayıtta otomatik üretilir' : rec.no} <SampleTag show={rec.sample} /></div>
          <div className="rec-title">{rec.title || (isNew ? 'Başlıksız fikir' : '')}</div>
          <div className="row" style={{ marginTop: 6 }}>
            {!isNew ? <StatusPill status={es} /> : null}
            {es === 'delayed' && rec.status !== 'delayed' ? <span className="small muted">(geciken milestone nedeniyle otomatik)</span> : null}
            <Pill tone={FIN[rec.fin?.status || 'pending'].tone}>FK: {FIN[rec.fin?.status || 'pending'].label}</Pill>
            {isLocked(saved) ? <Pill tone="done"><Icon name="lock" className="ico" /> Kapalı kayıt</Pill> : null}
            {rec.sourcePoolNo ? <button className="btn sm ghost" onClick={() => nav('pool', { id: rec.sourcePoolId })}><Icon name="link" />Kaynak: {rec.sourcePoolNo}</button> : null}
            <span className="small muted">{n.category(rec.categoryId)}{rec.subCategory ? ` · ${rec.subCategory}` : ''} · {n.vehicles(rec.targetVehicleIds) || 'Hedef araç yok'}</span>
          </div>
        </div>
      </div>
      {locked && editing ? <div className="banner warn">Kapalı kayıtlarda kritik alanları yalnızca Yönetici veya IT değiştirebilir.</div> : null}
      {editing && !isNew && isLocked(saved) && can('crid.editClosed', saved) ? <div className="banner warn">Kapalı bir kaydı düzenliyorsunuz. Kritik alan değişiklikleri audit log'a yazılır.</div> : null}

      <div className="kpis">
        <div className="kpi"><div className="l">Birim fayda (ilk hedef araç)</div><div className="v">{fmtMoney(Object.values(fin.f.unitByVehicle)[0] ?? 0, cur)}</div><div className="s">{rec.unitMode === 'subs' ? 'Alt detaylardan hesaplanan' : 'Manuel girilen'}</div></div>
        <div className="kpi"><div className="l">Yıllık hedef fayda {fin.y}</div><div className="v">{fmtMoney(fin.f.plannedBase, cur)}</div><div className="s">{fin.f.plannedOverride ? 'Manuel düzeltme' : 'Hacimle hesaplanan'}</div></div>
        <div className="kpi k-good"><div className="l">Gerçekleşen fayda</div><div className="v">{fmtMoney(fin.f.realizedBase, cur)}</div><div className="s">{fin.f.realizedOverride ? 'Manuel düzeltme' : rec.ms?.sopActual ? 'Devreye giriş sonrası' : 'Devreye girmedi'}</div></div>
        <div className="kpi"><div className="l">Finansal teyit</div><div className="v">{rec.fin?.status === 'confirmed' ? fmtMoney(fin.f.confirmedBase, cur) : '–'}</div><div className="s">{rec.fin?.status === 'confirmed' ? `${fmtDate(rec.fin.date)} · ${n.user(rec.fin.by)}` : FIN[rec.fin?.status || 'pending'].label}</div></div>
      </div>

      <div className="card">
        <Tabs value={tab} onChange={setTab} tabs={[
          { value: 'general', label: 'Ana bilgiler' },
          { value: 'financial', label: 'Finansal' },
          { value: 'milestones', label: 'Milestone' },
          isNew ? null : { value: 'subs', label: 'Alt detay (Add/Delete)', count: subs.length },
          isNew ? null : { value: 'docs', label: 'Dokümanlar', count: (rec.attachments || []).length },
          isNew ? null : { value: 'history', label: 'Geçmiş', count: (rec.history || []).length },
        ]} />
        <div className="card-b">
          {tab === 'general' ? <GeneralTab rec={rec} editing={editing} can={canGeneral} set={set} setDraft={setDraft} errors={tried ? errors : {}} source={source} /> : null}
          {tab === 'financial' ? <FinancialTab rec={rec} editing={editing} can={canGeneral} set={set} fin={fin} subs={subs} /> : null}
          {tab === 'milestones' ? <MilestoneTab rec={rec} editing={editing} can={canMs} setMs={setMs} errors={tried ? errors : {}} /> : null}
          {tab === 'subs' && !isNew ? <SubTable crid={saved} subs={subs} locked={locked} /> : null}
          {tab === 'docs' && !isNew ? <DocsTab crid={saved} /> : null}
          {tab === 'history' && !isNew ? <History items={saved.history} exportName={rec.no} /> : null}
        </div>
      </div>

      {modal?.type === 'status' ? <StatusModal crid={saved} onClose={() => setModal(null)} /> : null}
      {modal?.type === 'finance' ? <FinanceModal crid={saved} onClose={() => setModal(null)} /> : null}
      {modal?.type === 'conflict' ? (
        <Modal title="Kayıt başka biri tarafından güncellendi" size="narrow" onClose={() => setModal(null)} footer={<>
          <button className="btn" onClick={() => { setDraft(clone(modal.live)); baseRef.current = modal.live.updatedAt; setModal(null); toast('Güncel kayıt yüklendi; değişikliklerinizi yeniden uygulayın.'); }}>Güncel kaydı yükle</button>
          <button className="btn danger" onClick={() => { setModal(null); doSave(true); }}>Yine de kaydet</button>
        </>}>
          <p style={{ marginTop: 0 }}>Siz düzenlerken bu kayıt {n.user(modal.live.updatedBy) || 'başka bir kullanıcı'} tarafından {fmtDateTime(modal.live.updatedAt)} tarihinde değiştirildi.</p>
          <p className="muted">"Yine de kaydet" derseniz sizin sürümünüz geçerli olur; diğer değişiklikler geçmişte görünmeye devam eder.</p>
        </Modal>
      ) : null}
    </>
  );
}

function GeneralTab({ rec, editing, can, set, setDraft, errors, source }) {
  const n = useNames();
  const o = useOptions();
  const { nav } = useApp();
  const dis = !editing || !can;
  if (!editing) {
    return (
      <div className="grid g2">
        <div className="stack">
          <h3>Kimlik</h3>
          <div className="kv">
            <div>CRID No</div><div className="mono">{rec.no}</div>
            <div>Fikir başlığı</div><div>{rec.title}</div>
            <div>Açıklama</div><div style={{ whiteSpace: 'pre-wrap' }}>{rec.description || '–'}</div>
            <div>Yayın No</div><div>{rec.publicationNo || '–'}</div>
            <div>Notlar</div><div style={{ whiteSpace: 'pre-wrap' }}>{rec.notes || '–'}</div>
            {rec.status === 'cancelled' ? <><div>İptal gerekçesi</div><div>{rec.cancelReason}</div></> : null}
          </div>
          <h3 style={{ marginTop: 10 }}>Audit</h3>
          <div className="kv">
            <div>Oluşturan</div><div>{n.user(rec.createdBy)} · {fmtDateTime(rec.createdAt)}</div>
            <div>Son güncelleyen</div><div>{n.user(rec.updatedBy)} · {fmtDateTime(rec.updatedAt)}</div>
          </div>
        </div>
        <div className="stack">
          <h3>Sınıflandırma ve araç</h3>
          <div className="kv">
            <div>Kategori</div><div>{n.category(rec.categoryId)}{rec.subCategory ? ` · ${rec.subCategory}` : ''}</div>
            <div>Ekip</div><div>{n.team(rec.teamId) || '–'}</div>
            <div>Gündem</div><div>{n.agenda(rec.agendaId) || '–'}</div>
            <div>Kapsam</div><div>{n.scope(rec.scopeId) || '–'}</div>
            <div>Sorumlu</div><div>{n.user(rec.responsibleId) || '–'}</div>
            <div>Baz araç</div><div>{n.vehicles(rec.baseVehicleIds) || '–'}</div>
            <div>Hedef araç</div><div>{n.vehicles(rec.targetVehicleIds) || '–'}</div>
          </div>
          {source ? (
            <>
              <h3 style={{ marginTop: 10 }}>Kaynak havuz kaydı</h3>
              <div className="kv">
                <div>Havuz No</div><div><button className="btn sm" onClick={() => nav('pool', { id: source.id })}>{source.no}</button></div>
                <div>Problem / Fırsat</div><div>{source.problem || '–'}</div>
                <div>Tahmini potansiyel</div><div>{source.potential !== '' && source.potential !== undefined ? `${fmtMoney(source.potential, source.potentialCurrency)} ${source.potentialBasis === 'unit' ? '/araç' : '/yıl'}` : '–'}</div>
                <div>Değerlendirme notu</div><div>{source.evaluation?.note || '–'}</div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    );
  }
  return (
    <div className="form-grid">
      <Field label="Fikir başlığı *" className="span2" error={errors.title} htmlFor="c-title"><Input id="c-title" value={rec.title} onChange={set('title')} disabled={dis} /></Field>
      <Field label="Yayın No" htmlFor="c-pub"><Input id="c-pub" value={rec.publicationNo} onChange={set('publicationNo')} disabled={dis} /></Field>
      <Field label="Fikir açıklaması" className="span-all" hint="Problem, öneri ve beklenen değişiklik" htmlFor="c-desc"><TextArea id="c-desc" value={rec.description} onChange={set('description')} rows={4} disabled={dis} /></Field>
      <Field label="Kategori *" error={errors.categoryId} htmlFor="c-cat"><Select id="c-cat" value={rec.categoryId} onChange={(v) => setDraft((d) => ({ ...d, categoryId: v, subCategory: '' }))} options={o.categories} placeholder="Seçin" disabled={dis} /></Field>
      <Field label="Alt kırılım" htmlFor="c-sub"><Select id="c-sub" value={rec.subCategory} onChange={set('subCategory')} options={o.subCats(rec.categoryId)} placeholder="—" disabled={dis} /></Field>
      <Field label="Ekip" htmlFor="c-team"><Select id="c-team" value={rec.teamId} onChange={set('teamId')} options={o.teams} placeholder="—" disabled={dis} /></Field>
      <Field label="Gündem" htmlFor="c-ag"><Select id="c-ag" value={rec.agendaId} onChange={set('agendaId')} options={o.agendas} placeholder="—" disabled={dis} /></Field>
      <Field label="Kapsam" htmlFor="c-scope"><Select id="c-scope" value={rec.scopeId} onChange={set('scopeId')} options={o.scopes} placeholder="—" disabled={dis} /></Field>
      <Field label="Sorumlu" htmlFor="c-resp"><Select id="c-resp" value={rec.responsibleId} onChange={set('responsibleId')} options={o.users} placeholder="—" disabled={dis} /></Field>
      <Field label="Baz araç(lar)" className="span-all" hint="Mevcut maliyetin / referans durumun ait olduğu araç"><MultiChips id="c-base" value={rec.baseVehicleIds || []} onChange={set('baseVehicleIds')} options={o.vehicles} disabled={dis} /></Field>
      <Field label="Hedef araç(lar) *" className="span-all" error={errors.targetVehicleIds} hint="Değişikliğin uygulanacağı araç/versiyon — birden fazla seçilebilir"><MultiChips id="c-target" value={rec.targetVehicleIds || []} onChange={set('targetVehicleIds')} options={o.vehicles} disabled={dis} /></Field>
      <Field label="Notlar" className="span-all" htmlFor="c-notes"><TextArea id="c-notes" value={rec.notes} onChange={set('notes')} rows={2} disabled={dis} /></Field>
    </div>
  );
}

function FinancialTab({ rec, editing, can, set, fin, subs }) {
  const { state, derived } = useApp();
  const n = useNames();
  const o = useOptions();
  const cur = state.master.baseCurrency;
  const dis = !editing || !can;
  const y = fin.y;
  const settings = state.master.settings;
  const rows = (rec.targetVehicleIds || []).map((v) => {
    const plan = planFor(derived.plans, y, v);
    return {
      v, unit: fin.f.unitByVehicle[v] || 0, annual: annualVolume(plan, 'planned', settings, y),
      volT: volumeFrom(plan, y, rec.ms?.sopTarget, 'planned', settings), volR: volumeFrom(plan, y, rec.ms?.sopActual, 'actual', settings),
      planned: fin.f.plannedByVehicle[v] || 0, forecast: fin.f.forecastByVehicle[v] || 0, realized: fin.f.realizedByVehicle[v] || 0, hasPlan: !!plan,
    };
  });
  const annualBenefit = fin.f.potentialBase;
  const inv = num(rec.investment) * (state.master.currencies.find((c) => c.code === rec.currency)?.rate ?? 1);
  const payback = inv && annualBenefit ? (inv / annualBenefit) * 12 : null;
  const subUnitTotal = subs.filter(isActiveSub).reduce((a, s) => a + subUnitImpactBase(s, state.master), 0);
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="form-grid">
        <Field label="Para birimi" htmlFor="f-cur"><Select id="f-cur" value={rec.currency} onChange={set('currency')} options={o.currencies} disabled={dis} /></Field>
        <Field label="Birim fayda kaynağı" htmlFor="f-mode" hint={rec.unitMode === 'subs' ? `Alt detay toplamı: ${fmtMoney(subUnitTotal, cur)} / araç` : 'Araç başına beklenen maliyet azalımı'}>
          <Select id="f-mode" value={rec.unitMode || 'manual'} onChange={set('unitMode')} options={[{ value: 'manual', label: 'Manuel giriş' }, { value: 'subs', label: 'Alt detaylardan (Add/Delete) hesapla' }]} disabled={dis} />
        </Field>
        <Field label={`Birim fayda (${rec.currency}/araç)`} htmlFor="f-unit"><NumInput id="f-unit" value={rec.unitMode === 'subs' ? '' : rec.unitBenefit} onChange={set('unitBenefit')} disabled={dis || rec.unitMode === 'subs'} placeholder={rec.unitMode === 'subs' ? 'Alt detaylardan' : ''} /></Field>
        <Field label="Olasılık / ilerleme %" htmlFor="f-prob" hint="Ağırlıklı bütçe için; devreye girince %100"><NumInput id="f-prob" value={rec.probability} onChange={set('probability')} min="0" max="100" disabled={dis} /></Field>
        <Field label={`Yatırım maliyeti (${rec.currency})`} htmlFor="f-inv"><NumInput id="f-inv" value={rec.investment} onChange={set('investment')} disabled={dis} /></Field>
        <Field label={`Yıllık hedef fayda — manuel (${rec.currency})`} htmlFor="f-ov" hint="Boş bırakılırsa birim fayda × hacim"><NumInput id="f-ov" value={rec.annualTargetOverride} onChange={set('annualTargetOverride')} disabled={dis} /></Field>
        <Field label={`Gerçekleşen fayda — manuel (${rec.currency})`} htmlFor="f-rov" hint="Boş bırakılırsa gerçekleşen hacimle hesaplanır"><NumInput id="f-rov" value={rec.realizedOverride} onChange={set('realizedOverride')} disabled={dis} /></Field>
        <Field label="Havuzdaki tahmini potansiyel"><div className="inp" style={{ background: 'var(--surface-2)' }}>{rec.estimatedPotential !== '' && rec.estimatedPotential !== undefined ? fmtMoney(rec.estimatedPotential, rec.currency) : '–'}</div></Field>
      </div>
      <div>
        <h3>Araç bazında hacim ve fayda — {y}</h3>
        <p className="small muted" style={{ margin: '4px 0 8px' }}>Fayda yalnızca devreye giriş yılında, devreye giriş ayından yıl sonuna kadar üretim hacmiyle hesaplanır. Hedef: hedef tarih · Projelendirilen: gerçekleşen varsa o tarih · Gerçekleşen: gerçekleşen tarih ve gerçekleşen adet.</p>
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Hedef araç</th><th className="num">Birim fayda</th><th className="num">Yıllık plan adedi</th><th className="num">Uygulanabilir hacim (hedef)</th><th className="num">Hedef fayda</th><th className="num">Projelendirilen</th><th className="num">Gerçekleşen hacim</th><th className="num">Gerçekleşen fayda</th></tr></thead>
          <tbody>
            {rows.map((r) => <tr key={r.v}><td>{n.vehicle(r.v)}{!r.hasPlan ? <div className="small warn-t">{y} üretim planı yok</div> : null}</td><td className="num">{fmtMoney(r.unit, cur, 2)}</td><td className="num">{fmtNum(r.annual)}</td><td className="num">{fmtNum(r.volT)}</td><td className="num">{fmtMoney(r.planned, cur)}</td><td className="num">{fmtMoney(r.forecast, cur)}</td><td className="num">{fmtNum(r.volR)}</td><td className="num good-t">{fmtMoney(r.realized, cur)}</td></tr>)}
            {!rows.length ? <tr><td colSpan={8}><Empty title="Hedef araç seçilmedi" /></td></tr> : null}
            {rows.length ? <tr className="tot"><td>Toplam</td><td /><td className="num">{fmtNum(rows.reduce((a, r) => a + r.annual, 0))}</td><td className="num">{fmtNum(rows.reduce((a, r) => a + r.volT, 0))}</td><td className="num">{fmtMoney(fin.f.plannedBase, cur)}</td><td className="num">{fmtMoney(fin.f.forecastBase, cur)}</td><td className="num">{fmtNum(rows.reduce((a, r) => a + r.volR, 0))}</td><td className="num">{fmtMoney(fin.f.realizedBase, cur)}</td></tr> : null}
          </tbody>
        </table></div>
      </div>
      <div className="grid g2">
        <div className="stack">
          <h3>Finansal kontrol</h3>
          <div className="kv">
            <div>Durum</div><div><Pill tone={FIN[rec.fin?.status || 'pending'].tone}>{FIN[rec.fin?.status || 'pending'].label}</Pill></div>
            <div>Kontrol / teyit tarihi</div><div>{fmtDate(rec.fin?.date || rec.fin?.checkedDate) || '–'}</div>
            <div>Kontrol eden</div><div>{n.user(rec.fin?.by || rec.fin?.checkedBy) || '–'}</div>
            <div>Teyit edilen tutar</div><div>{rec.fin?.status === 'confirmed' ? fmtMoney(rec.fin.confirmedAmount, rec.currency) : '–'}</div>
            <div>Not</div><div>{rec.fin?.note || '–'}</div>
          </div>
        </div>
        <div className="stack">
          <h3>Özet</h3>
          <div className="kv">
            <div>Tam yıl potansiyeli</div><div>{fmtMoney(fin.f.potentialBase, cur)}</div>
            <div>Ağırlıklı fayda</div><div>{fmtMoney(fin.f.weightedBase, cur)}</div>
            <div>Planlanan – gerçekleşen</div><div>{fmtMoney(fin.f.plannedBase - fin.f.realizedBase, cur)}</div>
            <div>Geri ödeme süresi</div><div>{payback !== null ? `${fmtNum(payback, 1)} ay` : '–'}</div>
            {rec.currency !== cur ? <><div>Kur (1 {rec.currency})</div><div>{fmtNum(state.master.currencies.find((c) => c.code === rec.currency)?.rate, 4)} {cur}</div></> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function MilestoneTab({ rec, editing, can, setMs, errors }) {
  const { state } = useApp();
  const today = todayISO();
  const nd = +state.master.settings.notifyDaysBefore || 14;
  const list = cridMilestones(rec, today, nd);
  const fm = finMilestone(rec, today);
  const dis = !editing || !can;
  const ms = rec.ms || {};
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="ms-track">
        {list.map((m) => (
          <div key={m.key} className={`ms-cell s-${m.status}`}>
            <div className="bar" />
            <div className="k"><span className="m">{m.short}</span>{m.label}</div>
            <div className="small muted" style={{ marginTop: 6 }}>Plan</div>
            <div className="ms-date">{m.isNa ? 'N/A' : fmtDate(m.targetDate) || '–'}</div>
            <div className="small muted" style={{ marginTop: 4 }}>Gerçekleşme</div>
            <div className={`ms-date ms-${m.status}`}>{m.isNa ? '–' : fmtDate(m.actualDate) || 'TBC'}</div>
            <div style={{ marginTop: 6 }}><Pill tone={{ done_ontime: 'good', done_late: 'warn', overdue: 'bad', upcoming: 'accent', planned: 'neutral', none: 'neutral', na: 'neutral' }[m.status]}>{MS_LABEL[m.status]}{m.delay && m.status !== 'na' ? ` · ${m.delay} gün` : ''}</Pill></div>
          </div>
        ))}
        <div className={`ms-cell s-${fm.status === 'confirmed' ? 'confirmed' : fm.status === 'overdue' ? 'overdue' : 'pending'}`}>
          <div className="bar" />
          <div className="k"><span className="m">M4</span>Finansal Kontrol</div>
          <div className="small muted" style={{ marginTop: 6 }}>Hedef (ops.)</div>
          <div className="ms-date">{fmtDate(fm.targetDate) || '–'}</div>
          <div className="small muted" style={{ marginTop: 4 }}>Teyit tarihi</div>
          <div className={`ms-date ${fm.status === 'confirmed' ? 'ms-done_ontime' : ''}`}>{fmtDate(fm.actualDate) || '–'}</div>
          <div style={{ marginTop: 6 }}><Pill tone={fm.status === 'confirmed' ? 'good' : fm.status === 'overdue' ? 'bad' : 'warn'}>{fm.status === 'confirmed' ? 'Teyit' : fm.status === 'overdue' ? 'Gecikmiş' : 'Bekliyor'}</Pill></div>
        </div>
      </div>
      {editing ? (
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Milestone</th><th>Plan (hedef) tarihi</th><th>Gerçekleşen tarih</th><th>Uygulanmaz</th></tr></thead>
          <tbody>
            {[['release', 'Yayın'], ['sample', 'İlk numune'], ['sop', 'Devreye giriş (seri üretim)']].map(([k, label]) => (
              <tr key={k}>
                <td>{label}</td>
                <td><DateInput value={ms[k + 'Target']} onChange={setMs(k + 'Target')} disabled={dis || ms[k + 'Na']} aria-label={`${label} hedef`} /></td>
                <td><DateInput value={ms[k + 'Actual']} onChange={setMs(k + 'Actual')} disabled={dis || ms[k + 'Na']} max={today} aria-label={`${label} gerçekleşen`} />{errors[k + 'Actual'] ? <div className="small bad-t">{errors[k + 'Actual']}</div> : null}</td>
                <td><label className="chk"><input type="checkbox" checked={!!ms[k + 'Na']} disabled={dis || k === 'sop'} onChange={(e) => setMs(k + 'Na')(e.target.checked)} />N/A</label></td>
              </tr>
            ))}
            <tr><td>Finansal kontrol (opsiyonel hedef)</td><td><DateInput value={ms.finTarget} onChange={setMs('finTarget')} disabled={dis} aria-label="Finansal kontrol hedef" /></td><td className="muted small">Teyit Finansal Kontrol ekranından verilir</td><td /></tr>
          </tbody>
        </table></div>
      ) : null}
      <div className="small muted">Durum otomatik hesaplanır: gerçekleşen tarih hedefle karşılaştırılır (On-time / Gecikmeli); hedef geçtiği halde gerçekleşme girilmediyse "Gecikmiş" olur ve sorumluya bildirim düşer. Devreye giriş gerçekleşince Add/Delete listesi finansal olarak dondurulur ve statü "Devreye Girdi" olur.</div>
    </div>
  );
}

function DocsTab({ crid }) {
  const { store, platform, toast, session } = useApp();
  const can = usePerms();
  const n = useNames();
  const editable = can('crid.edit', crid) || can('sub.edit', crid) || can('milestone.edit', crid);
  const [link, setLink] = useState({ name: '', url: '' });
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const atts = crid.attachments || [];
  const save = async (list, note) => { await store.saveCrid({ ...crid, attachments: list }, { note }); };
  const upload = async (files) => {
    if (!platform.upload) { toast('Dosya yükleme bu görünümde kullanılamıyor; bağlantı ekleyebilirsiniz.', 'bad'); return; }
    setBusy(true);
    try {
      const list = atts.slice();
      for (const f of files) {
        if (f.size > 20 * 1024 * 1024) { toast(`${f.name}: 20 MB sınırını aşıyor`, 'bad'); continue; }
        const r = await platform.upload(f);
        list.push({ id: r.id, url: r.url, name: f.name, size: f.size, type: f.type, at: new Date().toISOString(), by: session.id });
      }
      await save(list, `${files.length} doküman eklendi`);
      toast('Doküman eklendi', 'good');
    } catch (e) { toast(e?.message || 'Yükleme başarısız', 'bad'); } finally { setBusy(false); }
  };
  return (
    <div className="stack">
      {atts.length ? (
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Doküman</th><th>Tür</th><th>Ekleyen</th><th>Tarih</th><th /></tr></thead>
          <tbody>{atts.map((a, i) => (
            <tr key={a.id || a.url || i}>
              <td><a href={a.url} target="_blank" rel="noreferrer"><Icon name={a.id ? 'file' : 'link'} className="ico" /> {a.name}</a></td>
              <td className="small muted">{a.id ? (a.type || 'dosya') + (a.size ? ` · ${fmtNum(a.size / 1024)} KB` : '') : 'Bağlantı'}</td>
              <td>{n.user(a.by)}</td><td>{fmtDateTime(a.at)}</td>
              <td className="num">{editable ? <button className="btn sm danger" onClick={() => save(atts.filter((_, j) => j !== i), `Doküman kaldırıldı: ${a.name}`)}>Kaldır</button> : null}</td>
            </tr>))}</tbody>
        </table></div>
      ) : <Empty title="Henüz doküman yok">Teknik resim, hesap, teklif, sunum ve fotoğraf gibi ekleri buraya ekleyin.</Empty>}
      {editable ? (
        <div className="grid g2">
          <div className={`drop ${over ? 'over' : ''}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); upload([...e.dataTransfer.files]); }}>
            {platform.upload ? <>
              <div>Dosyaları buraya sürükleyin veya</div>
              <label className="btn sm" style={{ marginTop: 8 }}>{busy ? 'Yükleniyor…' : 'Dosya seç'}<input type="file" multiple hidden onChange={(e) => upload([...e.target.files])} /></label>
              <div className="small faint" style={{ marginTop: 6 }}>Dosya başına en fazla 20 MB</div>
            </> : <div>Dosya yükleme yalnızca canlı uygulamada (kurum içi paylaşım) kullanılabilir. Bu modda bağlantı ekleyebilirsiniz.</div>}
          </div>
          <div className="stack">
            <b>Bağlantı ekle</b>
            <Field label="Ad" htmlFor="l-name"><Input id="l-name" value={link.name} onChange={(v) => setLink({ ...link, name: v })} placeholder="Örn. Tedarikçi teklifi (SharePoint)" /></Field>
            <Field label="Adres (https://…)" htmlFor="l-url"><Input id="l-url" value={link.url} onChange={(v) => setLink({ ...link, url: v })} /></Field>
            <div><button className="btn sm" disabled={!/^https?:\/\//.test(link.url)} onClick={async () => { await save([...atts, { name: link.name || link.url, url: link.url, at: new Date().toISOString(), by: session.id }], `Bağlantı eklendi: ${link.name || link.url}`); setLink({ name: '', url: '' }); toast('Bağlantı eklendi', 'good'); }}>Ekle</button></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const ACTION_LABEL = { create: 'Oluşturuldu', update: 'Güncellendi', convert: "CRID'e dönüştürüldü", sub: 'Alt detay', freeze: 'Donduruldu', unfreeze: 'Dondurma kaldırıldı', master: 'Master data' };
export function History({ items, exportName }) {
  const n = useNames();
  const list = (items || []).slice().reverse();
  if (!list.length) return <Empty title="Geçmiş kaydı yok" />;
  return (
    <div className="stack" style={{ gap: 0 }}>
      {exportName ? <div className="row end" style={{ marginBottom: 8 }}><ExportButton filename={`${exportName}_gecmis`} getSheets={() => [{ name: 'Geçmiş', rows: [['Zaman', 'Kullanıcı', 'İşlem', 'Alan', 'Önceki', 'Yeni', 'Not'], ...list.flatMap((h) => (h.changes?.length ? h.changes : [{}]).map((c) => [fmtDateTime(h.at), h.byName || n.user(h.by), ACTION_LABEL[h.action] || h.action, c.label || '', fmtVal(c.from), fmtVal(c.to), h.note || '']))] }]} /></div> : null}
      {list.map((h, i) => (
        <div className="hist-item" key={i}>
          <div className="small"><b>{ACTION_LABEL[h.action] || h.action}</b> · {h.byName || n.user(h.by) || h.by} · <span className="muted">{fmtDateTime(h.at)}</span></div>
          {h.note ? <div className="small">{h.note}</div> : null}
          {(h.changes || []).map((c, j) => <div className="diff" key={j}><b>{c.label}</b>: <s>{fmtVal(c.from) || '∅'}</s> → {fmtVal(c.to) || '∅'}</div>)}
        </div>
      ))}
    </div>
  );
}
function fmtVal(v) {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function StatusModal({ crid, onClose }) {
  const { store, state, toast } = useApp();
  const can = usePerms();
  const [next, setNext] = useState(crid.status);
  const [reason, setReason] = useState(crid.cancelReason || '');
  const [busy, setBusy] = useState(false);
  const candidate = { ...crid, status: next, cancelReason: reason };
  const err = next !== crid.status ? validateStatusChange(candidate, next) : null;
  const opts = state.master.statuses.map((s) => ({ value: s.key, label: s.label }));
  const reopen = ['closed', 'cancelled'].includes(crid.status) && !['closed', 'cancelled'].includes(next) && !can('crid.editClosed', crid);
  return (
    <Modal title="Statü değiştir" size="narrow" onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Vazgeç</button>
      <button className="btn primary" disabled={!!err || busy || next === crid.status || reopen} onClick={async () => {
        setBusy(true);
        try { await store.saveCrid({ ...candidate, status: next }, { note: `Statü: ${next}` }); toast('Statü güncellendi', 'good'); onClose(); } catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
      }}>Uygula</button>
    </>}>
      <div className="stack">
        <Field label="Yeni statü" htmlFor="st-next"><Select id="st-next" value={next} onChange={setNext} options={opts} /></Field>
        {next === 'cancelled' ? <Field label="İptal gerekçesi *" htmlFor="st-reason"><TextArea id="st-reason" value={reason} onChange={setReason} /></Field> : null}
        {err ? <div className="banner bad">{err}</div> : null}
        {reopen ? <div className="banner warn">Kapalı/iptal kaydı yeniden açmak için Yönetici veya IT yetkisi gerekir.</div> : null}
        <div className="small muted">Kurallar: Devreye Girdi için devreye giriş gerçekleşme tarihi; Finansal Teyit ve Kapandı için finansal teyit; Kapandı için tüm milestone'ların gerçekleşmesi gerekir. Statüler kayıt sırasında otomatik de ilerler.</div>
      </div>
    </Modal>
  );
}

export function FinanceModal({ crid, onClose }) {
  const { store, toast } = useApp();
  const suggested = store.suggestedConfirmAmount(crid);
  const [amount, setAmount] = useState(crid.fin?.confirmedAmount !== '' && crid.fin?.confirmedAmount !== undefined ? crid.fin.confirmedAmount : suggested);
  const [note, setNote] = useState(crid.fin?.note || '');
  const [date, setDate] = useState(todayISO());
  const [busy, setBusy] = useState(false);
  const run = async (status) => {
    setBusy(true);
    try {
      await store.confirmFinance(crid, { status, amount: numOrNull(amount) ?? 0, note, date });
      toast({ confirmed: 'Finansal teyit verildi', checked: 'Kontrol edildi olarak işaretlendi', revision: 'Revizyon istendi', pending: 'Beklemeye alındı' }[status], 'good');
      onClose();
    } catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  const noSop = !crid.ms?.sopActual;
  return (
    <Modal title={`Finansal kontrol — ${crid.no}`} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Kapat</button>
      <button className="btn danger" disabled={busy} onClick={() => run('revision')}>Revizyon iste</button>
      <button className="btn" disabled={busy} onClick={() => run('checked')}>Kontrol edildi</button>
      <button className="btn good" disabled={busy || noSop} onClick={() => run('confirmed')}>Teyit et</button>
    </>}>
      <div className="stack">
        <div><b>{crid.title}</b></div>
        {noSop ? <div className="banner warn">Devreye giriş gerçekleşmediği için teyit verilemez; yalnızca kontrol veya revizyon işaretlenebilir.</div> : null}
        <div className="form-grid">
          <Field label="Hesaplanan gerçekleşen fayda"><div className="inp" style={{ background: 'var(--surface-2)' }}>{fmtMoney(suggested, crid.currency)}</div></Field>
          <Field label={`Teyit edilen tutar (${crid.currency})`} htmlFor="fk-amt"><NumInput id="fk-amt" value={amount} onChange={setAmount} /></Field>
          <Field label="Kontrol / teyit tarihi" htmlFor="fk-date"><DateInput id="fk-date" value={date} onChange={setDate} max={todayISO()} /></Field>
          <Field label="Not" className="span-all" htmlFor="fk-note"><TextArea id="fk-note" value={note} onChange={setNote} /></Field>
        </div>
        <div className="small muted">Teyit tarihi ve teyit eden kullanıcı otomatik kaydedilir. Teyit sonrası statü "Finansal Teyit" olur; kayıt bu aşamadan sonra kapatılabilir.</div>
      </div>
    </Modal>
  );
}

function cridExportSheets(rec, subs, n, fin, cur, master) {
  const general = [
    ['Alan', 'Değer'],
    ['CRID No', rec.no], ['Fikir başlığı', rec.title], ['Açıklama', rec.description], ['Kategori', n.category(rec.categoryId)], ['Alt kırılım', rec.subCategory],
    ['Ekip', n.team(rec.teamId)], ['Gündem', n.agenda(rec.agendaId)], ['Sorumlu', n.user(rec.responsibleId)], ['Baz araç', n.vehicles(rec.baseVehicleIds)], ['Hedef araç', n.vehicles(rec.targetVehicleIds)],
    ['Statü', n.status(rec.status)], ['Para birimi', rec.currency], ['Birim fayda (ilk araç, ' + cur + ')', Object.values(fin.f.unitByVehicle)[0] || 0],
    [`Yıllık hedef fayda ${fin.y} (${cur})`, Math.round(fin.f.plannedBase)], [`Gerçekleşen fayda (${cur})`, Math.round(fin.f.realizedBase)],
    ['Finansal kontrol', FIN[rec.fin?.status || 'pending'].label], ['Teyit tarihi', fmtDate(rec.fin?.date)],
    ['Hedef yayın', fmtDate(rec.ms?.releaseTarget)], ['Gerçekleşen yayın', fmtDate(rec.ms?.releaseActual)], ['İlk numune hedefi', fmtDate(rec.ms?.sampleTarget)], ['İlk numune gerçekleşme', fmtDate(rec.ms?.sampleActual)],
    ['Devreye giriş hedefi', fmtDate(rec.ms?.sopTarget)], ['Devreye giriş gerçekleşme', fmtDate(rec.ms?.sopActual)],
  ];
  const subRows = [['Alt detay', 'Parça kodu', 'Parça adı', 'Mevcut durum', 'Önerilen durum', 'İptal parça', 'İptal adet', 'İptal fiyat', 'İptal PB', 'İptal oran', 'İlave parça', 'İlave adet', 'İlave fiyat', 'İlave PB', 'İlave oran', `Birim etki (${cur})`, 'Durum', 'Donduruldu'],
    ...subs.map((s) => [s.no, s.partNo, s.partName, s.currentState, s.proposedState, s.del?.partNo, num(s.del?.qty), num(s.del?.price), s.del?.currency, num(s.del?.ratio), s.add?.partNo, num(s.add?.qty), num(s.add?.price), s.add?.currency, num(s.add?.ratio), Math.round(subUnitImpactBase(s, master) * 100) / 100, s.status, s.frozen ? fmtDate(s.frozen.at) : ''])];
  return [{ name: 'Ana bilgiler', rows: general }, { name: 'Add-Delete', rows: subRows }];
}
