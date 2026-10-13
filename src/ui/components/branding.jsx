// Kurumsal görünüm: yüklenen logolar menüde, giriş ekranında ve arka planda filigran olarak gösterilir.
import { useApp } from '../ctx.jsx';

/** Etkin marka ayarları: Master Data'da yüklenen logolar, yoksa sunucunun repo varsayılanları. */
export function useBranding() {
  const { state, platform } = useApp();
  const b = state.master.branding || { logos: [] };
  if (b.logos && b.logos.length) return b;
  const def = platform.defaultBranding;
  return def && def.logos && def.logos.length ? { ...b, logos: def.logos } : b;
}

export function LogoStrip({ logos, className = '' }) {
  if (!logos || !logos.length) return null;
  return (
    <div className={`logo-strip ${className}`} data-testid="logo-strip">
      {logos.map((l) => <img key={l.id} src={l.src} alt={l.name || 'Logo'} />)}
    </div>
  );
}

/** Ekran arka planında soluk, eğik döşenmiş logo deseni (tıklamaları engellemez). */
export function Watermark({ branding, tiles }) {
  const b = branding;
  if (!b || b.watermark === false || !b.logos || !b.logos.length) return null;
  const size = Math.max(120, Math.min(520, +b.watermarkSize || 260));
  const n = tiles || Math.min(160, Math.ceil(2400 / (size * 1.3)) * Math.ceil(1600 / (size * .67)));
  const items = Array.from({ length: n }, (_, i) => b.logos[i % b.logos.length]);
  return (
    <div className="watermark" aria-hidden="true" data-testid="watermark" style={{ '--wm-opacity': Math.max(0.02, Math.min(0.3, +b.opacity || 0.07)), '--wm-size': `${size}px` }}>
      <div className="wm-inner">
        {items.map((l, i) => <img key={i} src={l.src} alt="" loading="lazy" />)}
      </div>
    </div>
  );
}
