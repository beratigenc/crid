import { useState, useEffect, useMemo } from 'react';
import { useApp, useNames, usePerms } from '../ctx.jsx';
import { Field, Input, NumInput, Select, MultiChips, Tabs, Icon, Pill, Empty, Modal, Confirm, ExportButton, useOptions } from '../components/common.jsx';
import { History } from './cridDetail.jsx';
import { ROLES, PERMISSIONS, DEFAULT_PERMISSION_MATRIX, DEFAULT_STATUSES } from '../../logic/defaults.js';
import { buildSeed } from '../../logic/seed.js';
import { buildXlsx, readXlsx, parseCsv } from '../../logic/xlsx.js';
import { clone, uid, num, fmtDateTime, fmtDate, includesTR } from '../../logic/util.js';

const TONES = ['neutral', 'info', 'accent', 'good', 'bad', 'warn', 'done', 'muted'].map((t) => ({ value: t, label: t }));

/** Satır düzenleyici: master listeleri için ortak. */
function ListEditor({ rows, onChange, columns, disabled, newRow, usage, label, fixed }) {
  const [q, setQ] = useState('');
  const setCell = (i, k, v) => { const next = rows.slice(); next[i] = { ...next[i], [k]: v }; onChange(next); };
  const visible = rows.map((r, i) => ({ r, i })).filter(({ r }) => !q || Object.values(r).some((v) => typeof v === 'string' && includesTR(v, q)));
  return (
    <div className="stack">
      <div className="row">
        {rows.length > 12 ? <input className="inp" style={{ maxWidth: 260 }} placeholder={`${label} ara`} value={q} onChange={(e) => setQ(e.target.value)} aria-label={`${label} ara`} /> : null}
        <span className="spacer" />
        {!disabled && !fixed ? <button className="btn sm" onClick={() => onChange([...rows, newRow()])}><Icon name="plus" />{label} ekle</button> : null}
      </div>
      <div className="tbl-wrap"><table className="tbl">
        <thead><tr>{columns.map((c) => <th key={c.key} className={c.type === 'number' ? 'num' : ''}>{c.label}</th>)}{usage ? <th className="num">Kullanım</th> : null}<th /></tr></thead>
        <tbody>
          {visible.slice(0, 400).map(({ r, i }) => (
            <tr key={r.id || r.code || r.partNo || i}>
              {columns.map((c) => (
                <td key={c.key} style={{ padding: 4, minWidth: c.min || 90 }}>
                  {c.type === 'bool' ? <input type="checkbox" checked={r[c.key] !== false} disabled={disabled} onChange={(e) => setCell(i, c.key, e.target.checked)} aria-label={c.label} />
                    : c.type === 'select' ? <select className="inp sm" value={r[c.key] || ''} disabled={disabled} onChange={(e) => setCell(i, c.key, e.target.value)} aria-label={c.label}><option value="">—</option>{c.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
                      : c.type === 'chips' ? <MultiChips value={r[c.key] || []} options={c.options} disabled={disabled} onChange={(v) => setCell(i, c.key, v)} />
                        : c.type === 'list' ? <input className="inp sm" value={(r[c.key] || []).join(', ')} disabled={disabled} onChange={(e) => setCell(i, c.key, e.target.value.split(',').map((s) => s.trimStart()))} onBlur={(e) => setCell(i, c.key, e.target.value.split(',').map((s) => s.trim()).filter(Boolean))} aria-label={c.label} />
                          : c.type === 'number' ? <input className="inp sm num-in" type="number" step="any" value={r[c.key] ?? ''} disabled={disabled || (c.readOnlyIf && c.readOnlyIf(r))} onChange={(e) => setCell(i, c.key, e.target.value === '' ? '' : num(e.target.value))} aria-label={c.label} />
                            : c.type === 'static' ? <span className={c.mono ? 'mono small' : ''}>{c.render ? c.render(r) : r[c.key]}</span>
                              : <input className={`inp sm ${c.mono ? 'mono' : ''}`} value={r[c.key] ?? ''} disabled={disabled || (c.readOnlyIf && c.readOnlyIf(r))} onChange={(e) => setCell(i, c.key, e.target.value)} aria-label={c.label} />}
                </td>
              ))}
              {usage ? <td className="num small muted">{usage(r)}</td> : null}
              <td>{!disabled && !fixed ? <button className="btn sm ghost" aria-label="Satırı sil" onClick={() => {
                if (usage && usage(r) > 0) { setCell(i, 'active', false); return; }
                onChange(rows.filter((_, j) => j !== i));
              }} title={usage && usage(r) > 0 ? 'Kullanımda olduğu için pasife alınır' : 'Sil'}><Icon name={usage && usage(r) > 0 ? 'lock' : 'trash'} /></button> : null}</td>
            </tr>
          ))}
          {!rows.length ? <tr><td colSpan={columns.length + 2}><Empty title={`Henüz ${label.toLocaleLowerCase('tr-TR')} yok`} /></td></tr> : null}
        </tbody>
      </table></div>
      {usage ? <div className="small muted">Kayıtlarda kullanılan öğeler silinmez, pasife alınır (kilit simgesi). Pasif öğeler yeni kayıtlarda seçilemez.</div> : null}
    </div>
  );
}

export function MasterPage({ initialTab }) {
  const { state, store, toast, session, platform } = useApp();
  const can = usePerms();
  const [tab, setTab] = useState(initialTab || 'vehicles');
  const [draft, setDraft] = useState(() => clone(state.master));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!dirty) setDraft(clone(state.master)); }, [state.master, dirty]);
  const upd = (k) => (v) => { setDraft((d) => ({ ...d, [k]: v })); setDirty(true); };
  const updSettings = (k) => (v) => { setDraft((d) => ({ ...d, settings: { ...d.settings, [k]: v } })); setDirty(true); };
  const canMaster = can('master.edit');
  const canUsers = can('users.edit');
  const canInt = can('integration.edit');
  const editableTab = ['users', 'perms'].includes(tab) ? canUsers : ['sap'].includes(tab) ? canInt : canMaster;
  const o = useOptions();

  const usage = useMemo(() => {
    const u = { veh: {}, cat: {}, team: {}, ag: {}, scope: {} };
    const inc = (m, k) => { if (k) m[k] = (m[k] || 0) + 1; };
    for (const c of state.crids) { (c.targetVehicleIds || []).forEach((v) => inc(u.veh, v)); (c.baseVehicleIds || []).forEach((v) => inc(u.veh, v)); inc(u.cat, c.categoryId); inc(u.team, c.teamId); inc(u.ag, c.agendaId); inc(u.scope, c.scopeId); }
    for (const i of state.ideas) { (i.vehicleIds || []).forEach((v) => inc(u.veh, v)); inc(u.cat, i.categoryId); inc(u.team, i.teamId); }
    for (const p of state.plans) inc(u.veh, p.vehicleId);
    return u;
  }, [state.crids, state.ideas, state.plans]);

  const validate = () => {
    const errs = [];
    const dupe = (list, key, label) => { const s = new Set(); for (const x of list) { const v = String(x[key] || '').trim(); if (!v) { errs.push(`${label}: boş ${key === 'code' ? 'kod' : 'ad'} var.`); continue; } if (s.has(v)) errs.push(`${label}: "${v}" tekrar ediyor.`); s.add(v); } };
    dupe(draft.vehicles, 'code', 'Araçlar'); dupe(draft.vehicles, 'name', 'Araçlar'); dupe(draft.categories, 'name', 'Kategoriler'); dupe(draft.teams, 'name', 'Ekipler'); dupe(draft.currencies, 'code', 'Para birimleri');
    if (!draft.currencies.some((c) => c.code === draft.baseCurrency)) errs.push('Raporlama para birimi listede yok.');
    return errs;
  };
  const save = async () => {
    const errs = validate();
    if (errs.length) { toast(errs[0], 'bad'); return; }
    setBusy(true);
    try {
      const m = clone(draft);
      const base = m.currencies.find((c) => c.code === m.baseCurrency); if (base) base.rate = 1;
      await store.saveMaster(m, `Master data güncellendi (${tab})`);
      setDirty(false); toast('Master data kaydedildi', 'good');
    } catch (e) {
      toast(e?.code === 'invalid_argument' ? 'Master data değişikliği reddedildi: bu işlem için uygulamada Düzenleyici (Editor) erişimi gerekir.' : e.message || 'Kaydedilemedi', 'bad');
    } finally { setBusy(false); }
  };

  return (
    <>
      <div className="page-head">
        <div className="grow"><div className="eyebrow">Kontrollü listeler, kullanıcılar, yetkiler ve entegrasyon</div><h1>Master Data</h1></div>
        {dirty ? <><button className="btn" onClick={() => { setDraft(clone(state.master)); setDirty(false); }}>Vazgeç</button><button className="btn primary" disabled={busy} onClick={save}>Değişiklikleri kaydet</button></> : null}
      </div>
      {!editableTab && !['data', 'history'].includes(tab) ? <div className="banner info">Bu bölümü görüntüleyebilirsiniz; değişiklik yetkisi {tab === 'users' || tab === 'perms' ? 'IT/Sistem Yöneticisi' : 'IT/Sistem Yöneticisi'} rolündedir.</div> : null}
      <div className="card">
        <Tabs value={tab} onChange={setTab} tabs={[
          { value: 'vehicles', label: 'Araçlar', count: draft.vehicles.length },
          { value: 'categories', label: 'Kategoriler', count: draft.categories.length },
          { value: 'teams', label: 'Ekipler', count: draft.teams.length },
          { value: 'agendas', label: 'Gündem', count: draft.agendas.length },
          { value: 'scopes', label: 'Kapsam', count: draft.scopes.length },
          { value: 'statuses', label: 'Statüler' },
          { value: 'currencies', label: 'Para birimleri', count: draft.currencies.length },
          { value: 'parts', label: 'Parçalar', count: draft.parts.length },
          { value: 'users', label: 'Kullanıcılar & roller', count: draft.users.length },
          { value: 'perms', label: 'Yetki matrisi' },
          { value: 'settings', label: 'Sistem parametreleri' },
          { value: 'sap', label: 'SAP / Entegrasyon' },
          { value: 'data', label: 'Veri' },
          { value: 'history', label: 'Değişiklik geçmişi' },
        ]} />
        <div className="card-b">
          {tab === 'vehicles' ? <ListEditor label="Araç" rows={draft.vehicles} onChange={upd('vehicles')} disabled={!canMaster} usage={(r) => usage.veh[r.id] || 0}
            newRow={() => ({ id: uid('veh-'), code: '', name: '', family: '', version: '', cost: '', active: true })}
            columns={[{ key: 'code', label: 'Kod', mono: true }, { key: 'name', label: 'Araç / model', min: 160 }, { key: 'family', label: 'Aile' }, { key: 'version', label: 'Versiyon' }, { key: 'cost', label: `Araç maliyeti (${draft.baseCurrency})`, type: 'number' }, { key: 'sapCode', label: 'SAP malzeme kodu', mono: true }, { key: 'active', label: 'Aktif', type: 'bool' }]} /> : null}
          {tab === 'categories' ? <ListEditor label="Kategori" rows={draft.categories} onChange={upd('categories')} disabled={!canMaster} usage={(r) => usage.cat[r.id] || 0}
            newRow={() => ({ id: uid('cat-'), name: '', subs: [], active: true })}
            columns={[{ key: 'name', label: 'Ana kategori', min: 170 }, { key: 'subs', label: 'Alt kırılımlar (virgülle)', type: 'list', min: 380 }, { key: 'active', label: 'Aktif', type: 'bool' }]} /> : null}
          {tab === 'teams' ? <ListEditor label="Ekip" rows={draft.teams} onChange={upd('teams')} disabled={!canMaster} usage={(r) => usage.team[r.id] || 0}
            newRow={() => ({ id: uid('team-'), name: '', categoryId: '', active: true })}
            columns={[{ key: 'name', label: 'Ekip / birim', min: 200 }, { key: 'categoryId', label: 'Bağlı kategori', type: 'select', options: draft.categories.map((c) => ({ value: c.id, label: c.name })) }, { key: 'active', label: 'Aktif', type: 'bool' }]} /> : null}
          {tab === 'agendas' ? <ListEditor label="Gündem" rows={draft.agendas} onChange={upd('agendas')} disabled={!canMaster} usage={(r) => usage.ag[r.id] || 0}
            newRow={() => ({ id: uid('ag-'), name: '', active: true })} columns={[{ key: 'name', label: 'Stratejik / kurumsal gündem', min: 260 }, { key: 'active', label: 'Aktif', type: 'bool' }]} /> : null}
          {tab === 'scopes' ? <ListEditor label="Kapsam" rows={draft.scopes} onChange={upd('scopes')} disabled={!canMaster} usage={(r) => usage.scope[r.id] || 0}
            newRow={() => ({ id: uid('scope-'), name: '', active: true })} columns={[{ key: 'name', label: 'Kapsam', min: 200 }, { key: 'active', label: 'Aktif', type: 'bool' }]} /> : null}
          {tab === 'statuses' ? <div className="stack">
            <p className="muted" style={{ margin: 0 }}>Statü anahtarları iş kurallarını taşıdığı için sabittir; görünen ad ve renk düzenlenebilir.</p>
            <ListEditor label="Statü" fixed rows={draft.statuses} onChange={upd('statuses')} disabled={!canMaster} newRow={() => null}
              columns={[{ key: 'key', label: 'Anahtar', type: 'static', mono: true }, { key: 'label', label: 'Görünen ad', min: 180 }, { key: 'tone', label: 'Renk', type: 'select', options: TONES }, { key: 'preview', label: 'Önizleme', type: 'static', render: (r) => <Pill tone={r.tone}>{r.label}</Pill> }]} />
            {canMaster ? <div><button className="btn sm" onClick={() => upd('statuses')(DEFAULT_STATUSES.map((s) => ({ ...s })))}>Varsayılan adlara dön</button></div> : null}
          </div> : null}
          {tab === 'currencies' ? <div className="stack">
            <div className="form-grid"><Field label="Raporlama para birimi" htmlFor="m-base"><Select id="m-base" value={draft.baseCurrency} onChange={upd('baseCurrency')} options={draft.currencies.map((c) => ({ value: c.code, label: c.code }))} disabled={!canMaster} /></Field></div>
            <ListEditor label="Para birimi" rows={draft.currencies} onChange={upd('currencies')} disabled={!canMaster} newRow={() => ({ code: '', rate: 1, active: true })}
              columns={[{ key: 'code', label: 'Kod', mono: true }, { key: 'rate', label: `1 birim = ? ${draft.baseCurrency}`, type: 'number', readOnlyIf: (r) => r.code === draft.baseCurrency }, { key: 'active', label: 'Aktif', type: 'bool' }]} />
            <div className="small muted">Kur değişiklikleri dondurulmamış kayıtların hesaplarını etkiler; devreye girmiş Add/Delete satırları devreye giriş tarihindeki kurla dondurulduğu için etkilenmez.</div>
          </div> : null}
          {tab === 'parts' ? <PartsTab draft={draft} upd={upd} disabled={!canMaster} /> : null}
          {tab === 'users' ? <UsersTab draft={draft} upd={upd} disabled={!canUsers} /> : null}
          {tab === 'perms' ? <PermsTab draft={draft} upd={upd} disabled={!canUsers} /> : null}
          {tab === 'settings' ? <div className="form-grid">
            <Field label="CRID numara ön eki" hint="Örn. CRID-2027-0001" htmlFor="s-cp"><Input id="s-cp" value={draft.settings.cridPrefix} onChange={updSettings('cridPrefix')} disabled={!canMaster} /></Field>
            <Field label="Fikir havuzu ön eki" htmlFor="s-pp"><Input id="s-pp" value={draft.settings.poolPrefix} onChange={updSettings('poolPrefix')} disabled={!canMaster} /></Field>
            <Field label="Raporlama yılı (varsayılan)" htmlFor="s-ry"><NumInput id="s-ry" value={draft.settings.reportYear} onChange={(v) => updSettings('reportYear')(num(v))} disabled={!canMaster} /></Field>
            <Field label="Milestone bildirimi (gün önce)" htmlFor="s-nd"><NumInput id="s-nd" value={draft.settings.notifyDaysBefore} onChange={(v) => updSettings('notifyDaysBefore')(num(v))} disabled={!canMaster} /></Field>
            <Field label="Havuzda bekleme uyarısı (gün)" htmlFor="s-pi"><NumInput id="s-pi" value={draft.settings.poolIdleDays} onChange={(v) => updSettings('poolIdleDays')(num(v))} disabled={!canMaster} /></Field>
            <Field label="Rolü atanmamış kullanıcı varsayılan rolü" htmlFor="s-dr"><Select id="s-dr" value={draft.settings.defaultRole} onChange={updSettings('defaultRole')} options={ROLES.filter((r) => r.key !== 'it').map((r) => ({ value: r.key, label: r.label }))} disabled={!canUsers} /></Field>
            <Field label="Gerçekleşen adet girilmemişse" className="span2"><Select value={draft.settings.realizedUsePlanFallback === false ? 'no' : 'yes'} onChange={(v) => updSettings('realizedUsePlanFallback')(v === 'yes')} options={[{ value: 'yes', label: 'Geçmiş aylar için plan adedini kullan' }, { value: 'no', label: 'Gerçekleşen faydayı sıfır kabul et' }]} disabled={!canMaster} aria-label="Gerçekleşen adet yedeği" /></Field>
            <Field label="Devreye girişte Add/Delete dondurma"><Select value={draft.settings.autoFreezeOnSop === false ? 'no' : 'yes'} onChange={(v) => updSettings('autoFreezeOnSop')(v === 'yes')} options={[{ value: 'yes', label: 'Otomatik dondur' }, { value: 'no', label: 'Dondurma' }]} disabled={!canMaster} aria-label="Dondurma" /></Field>
            <Field label="Otomatik statü ilerletme"><Select value={draft.settings.autoStatus === false ? 'no' : 'yes'} onChange={(v) => updSettings('autoStatus')(v === 'yes')} options={[{ value: 'yes', label: 'Açık' }, { value: 'no', label: 'Kapalı' }]} disabled={!canMaster} aria-label="Otomatik statü" /></Field>
          </div> : null}
          {tab === 'sap' ? <SapTab draft={draft} upd={upd} disabled={!canInt} /> : null}
          {tab === 'data' ? <DataTab /> : null}
          {tab === 'history' ? <History items={state.master.history} exportName="Master_Data" /> : null}
        </div>
      </div>
    </>
  );
}

function PartsTab({ draft, upd, disabled }) {
  const { toast, platform } = useApp();
  const onFile = async (f) => {
    try {
      const rows = /\.xlsx$/i.test(f.name) ? await readXlsx(await f.arrayBuffer()) : parseCsv(await f.text());
      const head = rows[0].map((h) => String(h).trim().toLocaleLowerCase('tr-TR'));
      const ix = (n) => head.indexOf(n);
      const iP = ix('parça no'), iN = ix('parça adı'), iF = ix('fiyat'), iC = ix('pb'), iS = ix('tedarikçi');
      if (iP < 0) { toast('"Parça No" kolonu bulunamadı.', 'bad'); return; }
      const map = new Map(draft.parts.map((p) => [p.partNo, p]));
      let c = 0;
      for (const r of rows.slice(1)) {
        const pn = String(r[iP] || '').trim(); if (!pn) continue;
        map.set(pn, { partNo: pn, name: iN >= 0 ? String(r[iN] || '') : map.get(pn)?.name || '', price: iF >= 0 ? num(r[iF]) : map.get(pn)?.price || 0, currency: iC >= 0 ? String(r[iC] || 'EUR').toUpperCase() : map.get(pn)?.currency || 'EUR', supplier: iS >= 0 ? String(r[iS] || '') : map.get(pn)?.supplier || '', source: 'Şablon' });
        c++;
      }
      upd('parts')([...map.values()]);
      toast(`${c} parça okundu — kaydetmeyi unutmayın`, 'good');
    } catch (e) { toast(e.message || 'Dosya okunamadı', 'bad'); }
  };
  return (
    <div className="stack">
      <p className="muted" style={{ margin: 0 }}>SAP parça/malzeme ve fiyat verisi entegrasyon gelene kadar şablonla içe aktarılır. Alt detay ekranında parça numarası yazıldığında ad ve fiyat buradan gelir.</p>
      {!disabled ? <div className="row">
        <button className="btn sm" onClick={async () => { try { await platform.saveFile('CRID_Parca_Sablon.xlsx', buildXlsx([{ name: 'Parçalar', rows: [['Parça No', 'Parça Adı', 'Fiyat', 'PB', 'Tedarikçi'], ['13C33-05203-AA', 'ÖN AKS KOMPLE', 2237.6, 'EUR', 'Tedarikçi A']] }])); } catch (e) { toast(e.message, 'bad'); } }}><Icon name="down" />Şablon</button>
        <label className="btn sm"><Icon name="up" />Excel/CSV'den al<input type="file" hidden accept=".xlsx,.csv" onChange={(e) => e.target.files[0] && onFile(e.target.files[0])} /></label>
      </div> : null}
      <ListEditor label="Parça" rows={draft.parts} onChange={upd('parts')} disabled={disabled} newRow={() => ({ partNo: '', name: '', price: '', currency: draft.baseCurrency, supplier: '' })}
        columns={[{ key: 'partNo', label: 'Parça No', mono: true, min: 150 }, { key: 'name', label: 'Parça adı', min: 220 }, { key: 'price', label: 'Fiyat', type: 'number' }, { key: 'currency', label: 'PB', type: 'select', options: draft.currencies.map((c) => ({ value: c.code, label: c.code })) }, { key: 'supplier', label: 'Tedarikçi' }]} />
    </div>
  );
}

function AccountsPanel({ draft, disabled }) {
  const { platform, toast, state } = useApp();
  const [accounts, setAccounts] = useState(null);
  const [edit, setEdit] = useState(null);
  const load = () => platform.accounts.list().then(setAccounts).catch((e) => toast(e.message, 'bad'));
  useEffect(() => { if (!disabled) load(); }, [disabled]);
  if (disabled) return null;
  const savedUsers = state.master.users;
  return (
    <div className="card" style={{ borderColor: 'var(--accent)' }}>
      <div className="card-h"><h3>Giriş hesapları</h3><span className="small muted">Kullanıcı adı ve şifre — yalnız IT görür</span></div>
      <div className="card-b flush">
        <table className="tbl" data-testid="accounts-table"><thead><tr><th>Kişi</th><th>Rol</th><th>Kullanıcı adı</th><th /></tr></thead><tbody>
          {savedUsers.filter((u) => u.active !== false).map((u) => {
            const acc = (accounts || []).find((a) => a.userId === u.id);
            return (
              <tr key={u.id}>
                <td>{u.name || '—'}</td><td className="small">{ROLES.find((r) => r.key === u.role)?.label}</td>
                <td className="mono">{acc ? acc.username : <span className="faint">giriş yok</span>}</td>
                <td className="num nowrap">
                  <button className="btn sm" onClick={() => setEdit({ userId: u.id, name: u.name, username: acc?.username || (u.email ? u.email.split('@')[0] : ''), password: '' })}>{acc ? 'Şifre sıfırla' : 'Giriş tanımla'}</button>
                  {acc && acc.userId !== 'usr-admin' ? <button className="btn sm ghost" onClick={async () => { try { await platform.accounts.remove(acc.username); toast('Giriş kaldırıldı'); load(); } catch (e) { toast(e.message, 'bad'); } }}>Kaldır</button> : null}
                </td>
              </tr>
            );
          })}
        </tbody></table>
        {draft.users.length !== savedUsers.length ? <div className="small muted" style={{ padding: 10 }}>Yeni eklediğiniz kişiye giriş tanımlamak için önce "Değişiklikleri kaydet"e basın.</div> : null}
      </div>
      {edit ? (
        <Modal title={`${edit.name} — giriş bilgisi`} size="narrow" onClose={() => setEdit(null)} footer={<>
          <button className="btn" onClick={() => setEdit(null)}>Vazgeç</button>
          <button className="btn primary" onClick={async () => { try { await platform.accounts.set(edit.userId, edit.username, edit.password); toast('Giriş bilgisi kaydedildi', 'good'); setEdit(null); load(); } catch (e) { toast(e.message, 'bad'); } }}>Kaydet</button>
        </>}>
          <div className="stack">
            <Field label="Kullanıcı adı" htmlFor="ac-u"><Input id="ac-u" value={edit.username} onChange={(v) => setEdit({ ...edit, username: v })} /></Field>
            <Field label="Şifre" hint="En az 8 karakter. Kişiye iletin; ilk girişte değiştirmesini isteyin." htmlFor="ac-p"><Input id="ac-p" value={edit.password} onChange={(v) => setEdit({ ...edit, password: v })} /></Field>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function UsersTab({ draft, upd, disabled }) {
  const { state, platform } = useApp();
  const pending = state.people.filter((p) => !draft.users.some((u) => u.claudeId === p.id));
  return (
    <div className="stack">
      <p className="muted" style={{ margin: 0 }}>Kullanıcılar sorumlu seçimlerinde ve rol bazlı yetkide kullanılır. {platform.mode === 'server' ? 'Kişiyi listeye ekleyip kaydedin, ardından "Giriş hesapları" bölümünden kullanıcı adı ve şifre tanımlayın.' : platform.mode === 'claude' ? 'Uygulamayı açan kişiler aşağıdaki "Bekleyen" listesine düşer; rol atayarak ekleyin.' : 'Demo modunda sağ üstteki menüden kullanıcı değiştirerek rolleri deneyebilirsiniz.'} Kategori Yöneticisi yalnız seçili kategorilerdeki kayıtları düzenleyebilir.</p>
      {platform.mode === 'server' ? <AccountsPanel draft={draft} disabled={disabled} /> : null}
      {pending.length ? <div className="card" style={{ borderColor: 'var(--accent)' }}>
        <div className="card-h"><h3>Bekleyen kullanıcılar ({pending.length})</h3><span className="small muted">Uygulamayı açmış, rol atanmamış</span></div>
        <div className="card-b flush"><table className="tbl"><thead><tr><th>Ad</th><th>İlk / son giriş</th><th /></tr></thead><tbody>
          {pending.map((p) => <tr key={p.id}><td>{p.name || 'İsimsiz'}</td><td className="small">{fmtDate(p.firstSeen)} / {fmtDate(p.lastSeen)}</td><td className="num">{!disabled ? <button className="btn sm" onClick={() => upd('users')([...draft.users, { id: p.id, claudeId: p.id, name: p.name || '', email: '', role: draft.settings.defaultRole || 'creator', teamId: '', categoryIds: [], active: true }])}>Kullanıcı olarak ekle</button> : null}</td></tr>)}
        </tbody></table></div>
      </div> : null}
      <ListEditor label="Kullanıcı" rows={draft.users} onChange={upd('users')} disabled={disabled} newRow={() => ({ id: uid('usr-'), name: '', email: '', role: draft.settings.defaultRole || 'creator', teamId: '', categoryIds: [], active: true })}
        columns={[
          { key: 'name', label: 'Ad soyad', min: 160 },
          { key: 'email', label: 'E-posta', min: 180 },
          { key: 'role', label: 'Rol', type: 'select', options: ROLES.map((r) => ({ value: r.key, label: r.label })), min: 160 },
          { key: 'teamId', label: 'Ekip', type: 'select', options: draft.teams.map((t) => ({ value: t.id, label: t.name })) },
          { key: 'categoryIds', label: 'Kategoriler (Kat. Yön.)', type: 'chips', options: draft.categories.map((c) => ({ value: c.id, label: c.name })), min: 260 },
          ...(platform.mode === 'claude' ? [{ key: 'claudeId', label: 'claude.ai hesabı', type: 'static', render: (r) => (r.claudeId ? <Pill tone="good">Bağlı</Pill> : <span className="faint small">—</span>) }] : []),
          { key: 'active', label: 'Aktif', type: 'bool' },
        ]} />
      {platform.mode === 'claude' ? <div className="small muted">Not: uygulama içi roller ekranları ve işlemleri yönetir. Master data ve kullanıcı/rol değişikliklerinin kaydı ayrıca claude.ai paylaşımında "Düzenleyici" erişimi gerektirir; veri girişi için "Katkıda bulunan" erişimi yeterlidir.</div> : null}
    </div>
  );
}

function PermsTab({ draft, upd, disabled }) {
  const matrix = draft.permissions;
  const toggle = (role, perm) => {
    const list = matrix[role] || [];
    upd('permissions')({ ...matrix, [role]: list.includes(perm) ? list.filter((p) => p !== perm) : [...list, perm] });
  };
  let lastGroup = '';
  return (
    <div className="stack">
      <p className="muted" style={{ margin: 0 }}>Roller ve yetkiler bu matristen yönetilir. IT/Sistem Yöneticisinin "Master data" ve "Kullanıcı ve rol yönetimi" yetkisi kaldırılamaz.</p>
      <div className="tbl-wrap"><table className="tbl perm-grid">
        <thead><tr><th>Yetki</th>{ROLES.map((r) => <th key={r.key} title={r.desc}>{r.label}</th>)}</tr></thead>
        <tbody>
          {PERMISSIONS.map((p) => {
            const head = p.group !== lastGroup ? (lastGroup = p.group, <tr className="grp" key={'g' + p.group}><td colSpan={ROLES.length + 1}>{p.group}</td></tr>) : null;
            return [head, (
              <tr key={p.key}>
                <td>{p.label}</td>
                {ROLES.map((r) => {
                  const fixed = r.key === 'it' && ['master.edit', 'users.edit'].includes(p.key);
                  return <td key={r.key}><input type="checkbox" aria-label={`${r.label}: ${p.label}`} checked={(matrix[r.key] || []).includes(p.key)} disabled={disabled || fixed} onChange={() => toggle(r.key, p.key)} /></td>;
                })}
              </tr>
            )];
          })}
        </tbody>
      </table></div>
      {!disabled ? <div><button className="btn sm" onClick={() => upd('permissions')(clone(DEFAULT_PERMISSION_MATRIX))}>Varsayılan matrise dön</button></div> : null}
    </div>
  );
}

function SapTab({ draft, upd, disabled }) {
  const sap = draft.sap || {};
  const set = (k) => (v) => upd('sap')({ ...sap, [k]: v });
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="banner info">CRID, SAP'nin yerine geçmez; maliyet azaltma portföyü ve süreç yönetim katmanıdır. Canlı SAP bağlantısı IT ve veri sahipleriyle kesinleştirilecek. O zamana kadar veriler şablonlarla içe aktarılır.</div>
      <div className="tbl-wrap"><table className="tbl">
        <thead><tr><th>Veri</th><th>Muhtemel kaynak</th><th>CRID kullanım amacı</th><th>Bugünkü yöntem</th></tr></thead>
        <tbody>
          <tr><td>Araç / model master</td><td>SAP / mevcut master</td><td>Baz ve hedef araç seçimleri</td><td>Master Data &gt; Araçlar</td></tr>
          <tr><td>Parça / malzeme</td><td>SAP</td><td>Alt detay ve bileşen ilişkisi</td><td>Master Data &gt; Parçalar (şablon)</td></tr>
          <tr><td>Üretim planı</td><td>SAP / planlama</td><td>Yıllık/aylık hacim ve finansal fayda</td><td>Üretim Planı &gt; İçe aktar (şablon)</td></tr>
          <tr><td>Maliyet / fiyat</td><td>SAP / maliyet sistemi</td><td>Mevcut/gerçekleşen maliyet</td><td>Parça fiyatları + Add/Delete satırları</td></tr>
          <tr><td>Tedarikçi</td><td>SAP / satın alma</td><td>Tedarikçi değişimi ve alt detay</td><td>Parçalar &gt; Tedarikçi kolonu</td></tr>
          <tr><td>Kullanıcı / organizasyon</td><td>AD / SSO</td><td>Kimlik ve yetkilendirme</td><td>claude.ai hesabı + Kullanıcılar &amp; roller</td></tr>
        </tbody>
      </table></div>
      <div>
        <h3>Bağlantı parametreleri (hazırlık)</h3>
        <p className="small muted">Bu alanlar entegrasyon fazında kullanılacaktır; şimdilik bağlantı kurulmaz. API / web service tabanlı entegrasyon önerilir; doğrudan veritabanı erişimi yalnızca IT mimarisi onaylarsa kullanılmalıdır.</p>
        <div className="form-grid">
          <Field label="Entegrasyon modu" htmlFor="sap-mode"><Select id="sap-mode" value={sap.mode || 'manual'} onChange={set('mode')} options={[{ value: 'manual', label: 'Manuel / şablon (aktif)' }, { value: 'api', label: 'SAP OData / REST API (planlı)' }, { value: 'middleware', label: 'Ara katman (PI/PO, CPI) (planlı)' }]} disabled={disabled} /></Field>
          <Field label="SAP sistem" htmlFor="sap-sys"><Input id="sap-sys" value={sap.system} onChange={set('system')} placeholder="Örn. PRD" disabled={disabled} /></Field>
          <Field label="Client (mandant)" htmlFor="sap-cl"><Input id="sap-cl" value={sap.client} onChange={set('client')} placeholder="Örn. 100" disabled={disabled} /></Field>
          <Field label="Servis adresi" className="span2" htmlFor="sap-ep"><Input id="sap-ep" value={sap.endpoint} onChange={set('endpoint')} placeholder="https://…/sap/opu/odata/…" disabled={disabled} /></Field>
          <Field label="Notlar" className="span-all" htmlFor="sap-n"><Input id="sap-n" value={sap.notes} onChange={set('notes')} disabled={disabled} /></Field>
        </div>
      </div>
      <div>
        <h3>Son içe aktarımlar</h3>
        {(sap.lastImports || []).length ? <ul className="list-plain">{sap.lastImports.map((x, i) => <li key={i}><span className="sev info" /><div>{x.kind}: {x.count} kayıt · <span className="muted">{fmtDateTime(x.at)}</span></div></li>)}</ul> : <div className="muted small">Henüz içe aktarım yapılmadı.</div>}
      </div>
    </div>
  );
}

function DataTab() {
  const { state, store, toast, session, platform } = useApp();
  const [confirm, setConfirm] = useState(null);
  const sampleCount = state.crids.filter((c) => c.sample).length + state.ideas.filter((i) => i.sample).length + state.plans.filter((p) => p.sample).length;
  const isIt = session.role === 'it';
  const empty = !state.crids.length && !state.ideas.length;
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="kv">
        <div>CRID</div><div>{state.crids.length}</div>
        <div>Fikir havuzu</div><div>{state.ideas.length}</div>
        <div>Alt detay</div><div>{state.subs.length}</div>
        <div>Üretim planı (araç-yıl)</div><div>{state.plans.length}</div>
        <div>Örnek kayıt</div><div>{sampleCount}</div>
        <div>Depolama</div><div>{platform.mode === 'claude' ? 'claude.ai paylaşımlı veritabanı (kalıcı, canlı)' : platform.mode === 'server' ? 'Sunucu veritabanı (kalıcı, canlı)' : 'Tarayıcı (demo)'}</div>
      </div>
      {isIt ? <div className="row">
        {sampleCount ? <button className="btn danger" onClick={() => setConfirm('remove')}><Icon name="trash" />Örnek veriyi kaldır</button> : null}
        {empty ? <button className="btn" onClick={() => setConfirm('load')}>Örnek veriyi yükle</button> : null}
      </div> : <div className="small muted">Veri yönetimi IT/Sistem Yöneticisi rolüne aittir.</div>}
      {confirm === 'remove' ? <Confirm title="Örnek veriyi kaldır" danger confirmLabel="Kaldır" onClose={() => setConfirm(null)} message={`"ÖRNEK" etiketli ${sampleCount} kayıt (CRID, alt detay, havuz, üretim planı ve örnek kullanıcılar) kalıcı olarak silinecek. Sizin girdiğiniz kayıtlar etkilenmez.`}
        onConfirm={async () => { await store.removeSampleData(); toast('Örnek veri kaldırıldı', 'good'); }} /> : null}
      {confirm === 'load' ? <Confirm title="Örnek veriyi yükle" confirmLabel="Yükle" onClose={() => setConfirm(null)} message="Referans görsellerden türetilmiş örnek araçlar, üretim planı, CRID'ler ve havuz fikirleri yüklenecek."
        onConfirm={async () => { await store.loadSeed(buildSeed()); toast('Örnek veri yüklendi', 'good'); }} /> : null}
    </div>
  );
}
