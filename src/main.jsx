import { createRoot } from 'react-dom/client';
import { Component } from 'react';
import { App } from './ui/app.jsx';
import { Store } from './store/store.js';
import { initPlatform } from './ui/platform.js';
import { LoginPage } from './ui/pages/login.jsx';

class Boundary extends Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) { console.error('CRID hata', err, info); }
  render() {
    if (this.state.err) {
      return (
        <div className="loading"><div>
          <h2>Beklenmeyen bir hata oluştu</h2>
          <p className="muted">{String(this.state.err?.message || this.state.err)}</p>
          <button className="btn primary" onClick={() => this.setState({ err: null })}>Tekrar dene</button>
        </div></div>
      );
    }
    return this.props.children;
  }
}

async function boot() {
  const root = createRoot(document.getElementById('root'));
  root.render(<div className="loading"><div className="spin" /><div>CRID başlatılıyor…</div></div>);
  const platform = await initPlatform();
  if (platform.mode === 'login') { root.render(<LoginPage error={platform.error} />); return; }
  const store = new Store(platform.backend);
  store.start();
  window.__crid = { store, platform };
  root.render(<Boundary><App store={store} platform={platform} /></Boundary>);
}
boot();
