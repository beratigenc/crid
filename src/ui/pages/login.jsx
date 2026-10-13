import { useState } from 'react';

export function LoginPage({ error: initialError }) {
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [err, setErr] = useState(initialError || '');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: u, password: p }), credentials: 'same-origin' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Giriş yapılamadı.');
      location.reload();
    } catch (e2) { setErr(e2.message); setBusy(false); }
  };
  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <div className="brand-mark">CRID<span aria-hidden="true" /></div>
          <div className="brand-sub">Cost Reduction Ideas Database</div>
        </div>
        <div className="login-body">
          <h1>Giriş yap</h1>
          <p className="muted" style={{ margin: 0 }}>Maliyet azaltma fikirleri, bütçe ve proje takip sistemi</p>
          <div className="field"><label htmlFor="lg-u">Kullanıcı adı</label><input id="lg-u" className="inp" autoComplete="username" autoFocus value={u} onChange={(e) => setU(e.target.value)} /></div>
          <div className="field"><label htmlFor="lg-p">Şifre</label><input id="lg-p" className="inp" type="password" autoComplete="current-password" value={p} onChange={(e) => setP(e.target.value)} /></div>
          {err ? <div className="banner bad" role="alert">{err}</div> : null}
          <button className="btn primary" type="submit" disabled={busy || !u || !p} style={{ justifyContent: 'center', padding: '10px' }}>{busy ? 'Giriş yapılıyor…' : 'Giriş yap'}</button>
          <p className="small muted" style={{ margin: 0 }}>Hesabınız yoksa IT / Sistem Yöneticisinden kullanıcı adı ve şifre isteyin.</p>
        </div>
      </form>
    </div>
  );
}
