// Çevrimdışı HTML sürümü: kullanıcı seçimi (+ isteğe bağlı PIN). Sunucu olmadığı için kimlik bu bilgisayarda hatırlanır.
import { useState } from 'react';
import { LogoStrip, Watermark } from '../components/branding.jsx';
import { htmlRememberUser, pinHash } from '../platform.js';
import { ROLES } from '../../logic/defaults.js';

export function HtmlLoginPage({ platform }) {
  const master = platform.backend.pack.docs['master/main'] || { users: [] };
  const users = (master.users || []).filter((u) => u.active !== false);
  const branding = (master.branding?.logos || []).length ? master.branding : platform.defaultBranding;
  const [sel, setSel] = useState(users[0]?.id || '');
  const [pin, setPin] = useState('');
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const user = users.find((u) => u.id === sel);
  const go = async (e) => {
    e.preventDefault();
    setErr('');
    if (!user) return;
    if (user.pinHash && (await pinHash(user.id, pin)) !== user.pinHash) { setErr('PIN hatalı.'); return; }
    htmlRememberUser(user.id);
    try { history.replaceState(null, '', location.pathname); } catch (e2) { /* */ }
    location.reload();
  };
  const createAdmin = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    const id = 'usr-' + Date.now().toString(36);
    const m = { ...master, users: [...(master.users || []), { id, name: name.trim(), email: '', role: 'it', teamId: '', categoryIds: [], active: true }] };
    await platform.backend.set('master/main', m);
    await platform.backend.flush?.();
    htmlRememberUser(id);
    location.reload();
  };
  return (
    <div className="login-wrap">
      <Watermark branding={branding} />
      <form className="login-card" onSubmit={users.length ? go : createAdmin}>
        <div className="login-brand">
          <div className="brand-mark">CRID<span aria-hidden="true" /></div>
          <div className="brand-sub">Cost Reduction Ideas Database</div>
          <LogoStrip logos={branding?.logos} />
        </div>
        <div className="login-body">
          <h1>{users.length ? 'Kim olarak çalışıyorsunuz?' : 'İlk kurulum'}</h1>
          {users.length ? <>
            <div className="field"><label htmlFor="hl-u">Kullanıcı</label>
              <select id="hl-u" className="inp" value={sel} onChange={(e) => { setSel(e.target.value); setPin(''); setErr(''); }}>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name} — {ROLES.find((r) => r.key === u.role)?.label}</option>)}
              </select>
            </div>
            {user?.pinHash ? <div className="field"><label htmlFor="hl-p">PIN</label><input id="hl-p" className="inp" type="password" inputMode="numeric" autoFocus value={pin} onChange={(e) => setPin(e.target.value)} /></div> : null}
            {err ? <div className="banner bad" role="alert">{err}</div> : null}
            <button className="btn primary" type="submit" style={{ justifyContent: 'center', padding: '10px' }}>Devam</button>
            <p className="small muted" style={{ margin: 0 }}>Bu bilgisayar seçiminizi hatırlar. Listede yoksanız IT / Sistem Yöneticisinden sizi Master Data → Kullanıcılar ekranına eklemesini isteyin.</p>
          </> : <>
            <p className="muted" style={{ margin: 0 }}>Henüz kullanıcı yok. Sizi IT / Sistem Yöneticisi olarak ekleyelim; diğer kişileri sonra Master Data ekranından eklersiniz.</p>
            <div className="field"><label htmlFor="hl-n">Ad soyad</label><input id="hl-n" className="inp" autoFocus value={name} onChange={(e) => setName(e.target.value)} /></div>
            <button className="btn primary" type="submit" disabled={!name.trim()} style={{ justifyContent: 'center', padding: '10px' }}>Başla</button>
          </>}
        </div>
      </form>
    </div>
  );
}
