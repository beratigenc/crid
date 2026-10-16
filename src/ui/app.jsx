import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { AppCtx, useStoreState, resolveSessionUser, useToasts, useLocalPref, useApp as useAppCtx } from './ctx.jsx';
import { Icon, Pill, Modal, Field } from './components/common.jsx';
import { LogoStrip, Watermark, useBranding } from './components/branding.jsx';
import { buildNotifications, searchCrids, searchIdeas, EMPTY_FILTERS, nameOf } from '../logic/filters.js';
import { roleDef } from '../logic/rules.js';
import { todayISO, includesTR } from '../logic/util.js';
import { Dashboard } from './pages/dashboard.jsx';
import { PoolPage } from './pages/pool.jsx';
import { CridListPage } from './pages/cridList.jsx';
import { CridDetailPage } from './pages/cridDetail.jsx';
import { SubListPage } from './pages/subList.jsx';
import { PlanPage } from './pages/plan.jsx';
import { BudgetPage } from './pages/budget.jsx';
import { VehiclePage } from './pages/vehicle.jsx';
import { MilestonesPage } from './pages/milestones.jsx';
import { FinancePage } from './pages/finance.jsx';
import { ReportsPage } from './pages/reports.jsx';
import { MasterPage } from './pages/master.jsx';
import { AuditPage } from './pages/audit.jsx';
import { NotificationsPage } from './pages/notifications.jsx';

const NAV = [
  { group: 'Genel' },
  { page: 'dashboard', label: 'Ana Dashboard', icon: 'dash' },
  { page: 'notifications', label: 'Bildirimler', icon: 'bell', count: true },
  { group: 'Portföy' },
  { page: 'pool', label: 'Fikir Havuzu', icon: 'bulb' },
  { page: 'crids', label: 'CRID Listesi', icon: 'list' },
  { page: 'subs', label: 'Alt Detay (Add/Delete)', icon: 'layers' },
  { page: 'milestones', label: 'Milestone Takvimi', icon: 'cal' },
  { group: 'Plan & Finans' },
  { page: 'plan', label: 'Üretim Planı', icon: 'factory' },
  { page: 'budget', label: 'Bütçe / Hedef', icon: 'target' },
  { page: 'finance', label: 'Finansal Kontrol', icon: 'check' },
  { page: 'reports', label: 'Yönetim Raporları', icon: 'chart' },
  { group: 'Sistem' },
  { page: 'master', label: 'Master Data', icon: 'db' },
  { page: 'audit', label: 'Audit Log', icon: 'hist', perm: 'audit.view' },
];

const PAGE_TOKENS = new Set(NAV.filter((n) => n.page).map((n) => n.page));

export function App({ store, platform }) {
  const state = useStoreState(store);
  const [toasts, toast] = useToasts();
  const [previewUserId, setPreviewUserId] = useLocalPref('preview-user', platform.mode === 'local' ? 'usr-zeynep' : '');
  const initialPage = (() => { const h = (location.hash || '').slice(1); return PAGE_TOKENS.has(h) ? h : 'dashboard'; })();
  const [route, setRoute] = useState({ page: initialPage });
  const histRef = useRef([]);
  const [filters, setFilters] = useLocalPref('filters-v2', { ...EMPTY_FILTERS, year: String(store.getState().master.settings.reportYear || new Date().getFullYear()) });
  const [sideOpen, setSideOpen] = useState(false);

  const session = useMemo(() => resolveSessionUser({ platform, master: state.master, previewUserId }), [platform, state.master, previewUserId]);
  store.setUser(session.real && !session.real.real ? { ...session.real } : session);

  // claude.ai: kullanıcıyı kişi listesine kaydet; sahibi master kullanıcılarına bağla
  useEffect(() => {
    if (platform.mode !== 'claude' || !state.ready || !platform.viewer?.id) return;
    const v = platform.viewer;
    if (v.canWrite !== false) store.registerPerson(v.id, v.name).catch(() => {});
    if (v.isOwner && !state.master.users.some((u) => u.claudeId === v.id) && state.masterExists) {
      const m = JSON.parse(JSON.stringify(state.master));
      m.users.push({ id: v.id, claudeId: v.id, name: v.name || 'Sistem Sahibi', email: v.email || '', role: 'it', categoryIds: [], teamId: '', active: true });
      store.saveMaster(m, 'Artifact sahibi IT yöneticisi olarak eklendi').catch(() => {});
    }
  }, [state.ready, state.masterExists]);

  const year = filters.year ? +filters.year : +state.master.settings.reportYear || new Date().getFullYear();
  const derived = store.derived();
  const notifications = useMemo(() => state.ready ? buildNotifications({
    crids: state.crids, ideas: state.ideas, plans: derived.plans, master: state.master, user: session, today: todayISO(), subsByCrid: derived.subsByCrid, year,
  }) : [], [state, session, year]);

  const nav = useCallback((page, params = {}) => {
    histRef.current.push(route);
    if (histRef.current.length > 30) histRef.current.shift();
    setRoute({ page, ...params });
    setSideOpen(false);
    try { if (PAGE_TOKENS.has(page)) history.replaceState(null, '', '#' + page); } catch (e) { /* */ }
    window.scrollTo?.(0, 0);
  }, [route]);
  const back = useCallback(() => {
    const prev = histRef.current.pop();
    setRoute(prev || { page: 'dashboard' });
  }, []);

  const ctx = { store, state, derived, platform, session, toast, nav, back, route, filters, setFilters, year, notifications, setPreviewUserId };

  if (!state.ready) {
    return <div className="loading"><div className="spin" /><div>CRID verileri yükleniyor…</div>{state.error ? <div className="banner bad">{state.error}</div> : null}</div>;
  }

  const page = (() => {
    switch (route.page) {
      case 'pool': return <PoolPage key="pool" focusId={route.id} />;
      case 'crids': return <CridListPage key="crids" initialQ={route.q} preset={route.preset} />;
      case 'crid': return <CridDetailPage key={route.id || 'new'} id={route.id} tab={route.tab} />;
      case 'subs': return <SubListPage key="subs" />;
      case 'plan': return <PlanPage key="plan" />;
      case 'budget': return <BudgetPage key="budget" />;
      case 'vehicle': return <VehiclePage key={route.id} id={route.id} />;
      case 'milestones': return <MilestonesPage key="ms" initialTab={route.tab} />;
      case 'finance': return <FinancePage key="fin" />;
      case 'reports': return <ReportsPage key="rep" initialTab={route.tab} />;
      case 'master': return <MasterPage key="master" initialTab={route.tab} />;
      case 'audit': return <AuditPage key="audit" />;
      case 'notifications': return <NotificationsPage key="notif" />;
      default: return <Dashboard key="dash" />;
    }
  })();

  const activeNav = route.page === 'crid' ? 'crids' : route.page === 'vehicle' ? 'budget' : route.page;
  return (
    <AppCtx.Provider value={ctx}>
      <div className="shell">
        <aside className={`side ${sideOpen ? 'open' : ''}`} aria-label="Ana menü">
          <div className="brand">
            <div className="brand-mark">CRID<span aria-hidden="true" /></div>
            <div className="brand-sub">Cost Reduction Ideas Database</div>
            <SideLogos />
          </div>
          <nav className="nav">
            {NAV.map((n, i) => n.group ? <div className="nav-group" key={'g' + i}>{n.group}</div> : (
              (n.perm && !roleCan(session, state.master, n.perm)) ? null :
                <button key={n.page} className={activeNav === n.page ? 'on' : ''} onClick={() => nav(n.page)} aria-current={activeNav === n.page ? 'page' : undefined}>
                  <Icon name={n.icon} /> {n.label}
                  {n.count && notifications.length ? <span className="count">{notifications.length}</span> : null}
                </button>
            ))}
          </nav>
          <div className="side-foot">
            {platform.mode === 'html' ? <StorageFoot /> : platform.mode === 'claude' || platform.mode === 'server' ? 'Canlı veritabanı · paylaşımlı' : 'Demo modu · tarayıcıda saklanır'}
            <br />SAP entegrasyonu: şablonla içe aktarım
          </div>
        </aside>
        {sideOpen ? <div className="overlay" style={{ zIndex: 65, background: 'rgba(0,0,0,.3)' }} onClick={() => setSideOpen(false)} /> : null}
        <div className="main">
          <AppWatermark />
          <header className="topbar">
            <button className="icon-btn menu-btn" aria-label="Menüyü aç" onClick={() => setSideOpen(true)}><Icon name="menu" /></button>
            <GlobalSearch />
            <div className="top-actions">
              {platform.mode === 'html' ? <StorageChip /> : null}
              <button className="icon-btn" aria-label={`Bildirimler (${notifications.length})`} onClick={() => nav('notifications')}>
                <Icon name="bell" />{notifications.length ? <span className="dot">{notifications.length > 99 ? '99+' : notifications.length}</span> : null}
              </button>
              <UserChip />
            </div>
          </header>
          <main className="content">
            <Banners />
            {page}
          </main>
        </div>
      </div>
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.msg}</div>)}
      </div>
    </AppCtx.Provider>
  );
}

function roleCan(session, master, perm) {
  const perms = (master.permissions || {})[session.role] || [];
  return perms.includes(perm);
}

function Banners() {
  const { platform, session, store, toast, setPreviewUserId, state } = useAppCtx();
  const out = [];
  if (platform.mode === 'local') {
    out.push(<div key="local" className="banner info"><b>Demo modu.</b> Veriler yalnızca bu tarayıcıda saklanır. Sağ üstten farklı roller seçerek yetkileri deneyebilirsiniz.
      {platform.resetDemo ? <button className="btn sm" onClick={() => { platform.resetDemo(); toast('Demo verisi sıfırlandı'); }}>Demo verisini sıfırla</button> : null}</div>);
  }
  if (session.readOnlyAccess) out.push(<div key="ro" className="banner warn">Bu uygulamayı yalnızca görüntüleme yetkisiyle açtınız; veri giremezsiniz. Veri girişi için uygulama sahibinden "Katkıda bulunan" erişimi isteyin.</div>);
  if (session.pending && !session.previewing) out.push(<div key="pend" className="banner info">Hoş geldiniz {session.name}. Rolünüz henüz atanmadı; varsayılan rol <b>{roleDef(session.role).label}</b> ile çalışıyorsunuz. IT/Sistem Yöneticisi Master Data &gt; Kullanıcılar ekranından rol atayabilir.</div>);
  if (session.previewing) out.push(<div key="pv" className="banner warn"><b>Rol önizleme:</b> {session.name} ({roleDef(session.role).label}) olarak görüntülüyorsunuz. <button className="btn sm" onClick={() => setPreviewUserId('')}>Önizlemeden çık</button></div>);
  if (platform.mode === 'claude' && !state.masterExists) out.push(<div key="nm" className="banner warn">Master data henüz oluşturulmadı. {session.role === 'it' ? <button className="btn sm" onClick={() => store.ensureMaster().then(() => toast('Varsayılan master data oluşturuldu', 'good'))}>Varsayılanları oluştur</button> : 'IT yöneticisinin ilk kurulumu yapması gerekiyor.'}</div>);
  return out.length ? <>{out}</> : null;
}


function GlobalSearch() {
  const { state, derived, nav } = useAppCtx();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hl, setHl] = useState(0);
  const results = useMemo(() => {
    const s = q.trim();
    if (s.length < 2) return [];
    const crids = searchCrids(state.crids, s, state.master, derived.subsByCrid).slice(0, 7).map((c) => ({ kind: 'CRID', id: c.id, no: c.no, title: c.title, go: () => nav('crid', { id: c.id }) }));
    const ideas = searchIdeas(state.ideas, s, state.master).slice(0, 4).map((i) => ({ kind: 'Havuz', id: i.id, no: i.no, title: i.title, go: () => nav('pool', { id: i.id }) }));
    const subs = state.subs.filter((x) => [x.no, x.partNo, x.partName, x.del?.partNo, x.add?.partNo].some((h) => h && includesTR(h, s))).slice(0, 4)
      .map((x) => ({ kind: 'Alt detay', id: x.id, no: x.no, title: `${x.partNo || ''} ${x.partName || ''}`.trim(), go: () => nav('crid', { id: x.cridId, tab: 'subs' }) }));
    return [...crids, ...subs, ...ideas];
  }, [q, state]);
  const go = (r) => { r.go(); setQ(''); setOpen(false); };
  return (
    <div className="search">
      <Icon name="search" />
      <input aria-label="Hızlı arama" placeholder="CRID No, başlık, parça kodu, araç, ekip, sorumlu…" value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setHl(0); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { setHl((h) => Math.min(results.length - 1, h + 1)); e.preventDefault(); }
          if (e.key === 'ArrowUp') { setHl((h) => Math.max(0, h - 1)); e.preventDefault(); }
          if (e.key === 'Enter') { if (results[hl]) go(results[hl]); else if (q.trim()) { nav('crids', { q: q.trim() }); setQ(''); setOpen(false); } }
          if (e.key === 'Escape') setOpen(false);
        }} />
      {open && q.trim().length >= 2 ? (
        <div className="search-pop" role="listbox">
          {results.map((r, i) => (
            <button key={r.kind + r.id} role="option" aria-selected={i === hl} className={i === hl ? 'hl' : ''} onMouseDown={(e) => { e.preventDefault(); go(r); }}>
              <span className="tag">{r.kind}</span><span className="mono">{r.no}</span><span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
            </button>
          ))}
          <button onMouseDown={(e) => { e.preventDefault(); nav('crids', { q: q.trim() }); setQ(''); setOpen(false); }}><Icon name="arrow" className="ico" /> CRID listesinde "{q.trim()}" ara</button>
        </div>
      ) : null}
    </div>
  );
}

function UserChip() {
  const { session, state, setPreviewUserId, platform } = useAppCtx();
  const [open, setOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      {pwOpen ? <PasswordModal onClose={() => setPwOpen(false)} /> : null}
      <button className="btn ghost" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} data-testid="user-chip">
        <Icon name="user" /><span className="who-name">{session.name}</span> <Pill tone={session.previewing ? 'warn' : 'info'}>{roleDef(session.role).label}</Pill>
      </button>
      {open ? (
        <div className="search-pop" style={{ right: 0, left: 'auto', width: 300 }} role="menu">
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--line)' }}>
            <div><b>{session.real?.name || session.name}</b></div>
            <div className="small muted">{roleDef(session.real?.role || session.role).desc}</div>
          </div>
          {platform.mode === 'html' ? <button role="menuitem" onClick={() => platform.logout()}>Kullanıcı değiştir</button> : null}
          {platform.mode === 'server' ? <>
            <button role="menuitem" onClick={() => { setOpen(false); setPwOpen(true); }}>Şifremi değiştir</button>
            <button role="menuitem" onClick={() => platform.logout()}>Çıkış yap</button>
          </> : null}
          {session.canPreview ? <>
            <div className="small muted" style={{ padding: '8px 12px 4px' }}>{platform.mode === 'local' ? 'Demo kullanıcısı seç' : 'Rol önizleme (yetkileri test etmek için)'}</div>
            {platform.mode !== 'local' ? <button role="menuitem" onClick={() => { setPreviewUserId(''); setOpen(false); }}>Kendi rolüm</button> : null}
            {state.master.users.filter((u) => u.active !== false).map((u) => (
              <button role="menuitem" key={u.id} onClick={() => { setPreviewUserId(u.id); setOpen(false); }}>
                <span style={{ flex: 1 }}>{u.name}</span><span className="small muted">{roleDef(u.role).label}</span>
              </button>
            ))}
          </> : null}
        </div>
      ) : null}
    </div>
  );
}

function PasswordModal({ onClose }) {
  const { platform, toast } = useAppCtx();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Şifremi değiştir" size="narrow" onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Vazgeç</button>
      <button className="btn primary" disabled={busy || next.length < 8} onClick={async () => { setBusy(true); try { await platform.changePassword(cur, next); toast('Şifreniz değiştirildi', 'good'); onClose(); } catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); } }}>Kaydet</button>
    </>}>
      <div className="stack">
        <Field label="Mevcut şifre" htmlFor="pw-cur"><input id="pw-cur" className="inp" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} /></Field>
        <Field label="Yeni şifre" hint="En az 8 karakter" htmlFor="pw-new"><input id="pw-new" className="inp" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function SideLogos() { const b = useBranding(); return <LogoStrip logos={b.logos} />; }
function AppWatermark() { const b = useBranding(); return <Watermark branding={b} />; }

function useStorageStatus() {
  const { platform } = useAppCtx();
  const [st, setSt] = useState(() => platform.backend?.file || { status: 'none' });
  useEffect(() => platform.backend?.onStatus ? platform.backend.onStatus(setSt) : undefined, [platform]);
  return st;
}
function StorageFoot() {
  const st = useStorageStatus();
  return st.status === 'none' ? 'Çevrimdışı · veriler bu bilgisayarda' : `Veri dosyası: ${st.name}`;
}
function StorageChip() {
  const { platform, nav, toast } = useAppCtx();
  const st = useStorageStatus();
  if (st.status === 'ok') return <button className="btn sm ghost" data-testid="storage-chip" title={`Son eşitleme: ${st.lastSync ? new Date(st.lastSync).toLocaleTimeString('tr-TR') : '—'}`} onClick={() => nav('master', { tab: 'data' })}><Icon name="db" /> {st.name}</button>;
  if (st.status === 'needs-permission') return <button className="btn sm" data-testid="storage-chip" style={{ borderColor: 'var(--warn)', color: 'var(--warn)' }} onClick={async () => { try { await platform.backend.reauthorize(); toast('Veri dosyasına yeniden bağlanıldı', 'good'); } catch (e) { toast(e.message, 'bad'); } }}><Icon name="db" /> Veri dosyasına bağlanmak için tıklayın</button>;
  if (st.status === 'error') return <button className="btn sm danger" data-testid="storage-chip" title={st.error} onClick={() => nav('master', { tab: 'data' })}><Icon name="db" /> Veri dosyası hatası</button>;
  return <button className="btn sm ghost" data-testid="storage-chip" onClick={() => nav('master', { tab: 'data' })} title="Veriler bu bilgisayarın tarayıcısında saklanıyor"><Icon name="db" /> Bu bilgisayarda</button>;
}
