// Bağımlılıksız SVG grafikler. Renkler tema değişkenlerinden gelir.
import { useState } from 'react';
import { fmtMoneyShort, fmtNum } from '../../logic/util.js';

function niceMax(v) {
  if (!v || v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const s = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return s * p;
}
function ticks(max, count = 4) { return Array.from({ length: count + 1 }, (_, i) => (max / count) * i); }

function useTip() {
  const [tip, setTip] = useState(null);
  const show = (e, text) => setTip({ x: e.clientX + 12, y: e.clientY + 12, text });
  const hide = () => setTip(null);
  const el = tip ? <div className="chart-tip" style={{ left: tip.x, top: tip.y }}>{tip.text}</div> : null;
  return { show, hide, el };
}

/**
 * Gruplu çubuk grafik.
 * labels: string[]; series: [{ name, color (css var), values: number[] }]
 */
export function BarChart({ labels, series, height = 240, money = true, cur = 'EUR', stacked = false, ariaLabel }) {
  const tip = useTip();
  const W = 640, H = height, L = 58, R = 10, T = 14, B = 34;
  const iw = W - L - R, ih = H - T - B;
  const maxV = niceMax(Math.max(0, ...labels.map((_, i) => stacked ? series.reduce((a, s) => a + (s.values[i] || 0), 0) : Math.max(0, ...series.map((s) => s.values[i] || 0)))));
  const y = (v) => T + ih - (v / maxV) * ih;
  const tickCount = money ? 4 : maxV <= 5 ? Math.max(1, maxV) : maxV % 5 === 0 ? 5 : 4;
  const gw = iw / Math.max(1, labels.length);
  const bw = stacked ? Math.min(42, gw * 0.6) : Math.min(26, (gw * 0.75) / series.length);
  const fmt = (v) => (money ? fmtMoneyShort(v, cur) : fmtNum(v));
  return (
    <>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel || 'Çubuk grafik'}>
        <g className="grid">{ticks(maxV, tickCount).map((t) => <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} /><text x={L - 6} y={y(t) + 4} textAnchor="end">{fmt(t)}</text></g>)}</g>
        {labels.map((lab, i) => {
          const gx = L + gw * i + gw / 2;
          let acc = 0;
          return (
            <g key={i}>
              {series.map((s, si) => {
                const v = s.values[i] || 0;
                let x, yy, h;
                if (stacked) { x = gx - bw / 2; yy = y(acc + v); h = y(acc) - y(acc + v); acc += v; }
                else { x = gx - (bw * series.length) / 2 + si * bw; yy = y(v); h = T + ih - y(v); }
                return <rect key={si} x={x} y={yy} width={Math.max(1, bw - (stacked ? 0 : 2))} height={Math.max(0, h)} fill={s.color} rx="1.5"
                  onMouseMove={(e) => tip.show(e, `${lab} · ${s.name}: ${fmt(v)}`)} onMouseLeave={tip.hide} />;
              })}
              <text x={gx} y={H - B + 16} textAnchor="middle">{lab}</text>
            </g>
          );
        })}
        <line x1={L} x2={W - R} y1={T + ih} y2={T + ih} stroke="var(--line-strong)" />
      </svg>
      {tip.el}
    </>
  );
}

/**
 * Çizgi grafik (kümülatif ucuzlatma — referans görsel 4).
 * series: [{ name, color, values: (number|null)[] , labelLast?: true }]
 * marker: dikey kesikli çizginin konumu (indeks)
 */
export function LineChart({ labels, series, height = 260, cur = 'EUR', marker = null, ariaLabel }) {
  const tip = useTip();
  const W = 640, H = height, L = 62, R = 64, T = 16, B = 34;
  const iw = W - L - R, ih = H - T - B;
  const all = series.flatMap((s) => s.values.filter((v) => v !== null && v !== undefined));
  const maxV = niceMax(Math.max(0, ...all));
  const x = (i) => L + (labels.length <= 1 ? iw / 2 : (iw * i) / (labels.length - 1));
  const y = (v) => T + ih - (v / maxV) * ih;
  return (
    <>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel || 'Çizgi grafik'}>
        <g className="grid">{ticks(maxV).map((t) => <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} /><text x={L - 6} y={y(t) + 4} textAnchor="end">{fmtMoneyShort(t, cur)}</text></g>)}</g>
        {labels.map((l, i) => <text key={i} x={x(i)} y={H - B + 16} textAnchor="middle">{l}</text>)}
        {marker !== null ? <line x1={x(marker)} x2={x(marker)} y1={T - 6} y2={T + ih + 4} stroke="var(--target)" strokeWidth="2" strokeDasharray="6 4" /> : null}
        {series.map((s, si) => {
          const pts = s.values.map((v, i) => (v === null || v === undefined ? null : [x(i), y(v)]));
          let d = '';
          pts.forEach((p, i) => { if (!p) return; d += (i === 0 || !pts[i - 1] ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1); });
          const lastIdx = pts.map((p, i) => (p ? i : -1)).filter((i) => i >= 0).pop();
          return (
            <g key={si}>
              <path d={d} fill="none" stroke={s.color} strokeWidth="2.4" strokeLinejoin="round" />
              {pts.map((p, i) => p ? <circle key={i} cx={p[0]} cy={p[1]} r="3.2" fill={s.color} onMouseMove={(e) => tip.show(e, `${labels[i]} · ${s.name}: ${fmtMoneyShort(s.values[i], cur)}`)} onMouseLeave={tip.hide} /> : null)}
              {lastIdx !== undefined ? <text x={pts[lastIdx][0] + 6} y={pts[lastIdx][1] + 4 + si * 2} className="lbl-strong">{fmtMoneyShort(s.values[lastIdx], cur)}</text> : null}
            </g>
          );
        })}
        <line x1={L} x2={W - R} y1={T + ih} y2={T + ih} stroke="var(--line-strong)" />
      </svg>
      {tip.el}
    </>
  );
}

export function Legend({ items }) {
  return <div className="legend">{items.map((i) => <span key={i.name}><i className={i.dash ? 'dash' : ''} style={i.dash ? undefined : { background: i.color }} />{i.name}</span>)}</div>;
}

/** Yatay oransal çubuk (kategori karşılaştırması gibi). */
export function HBars({ rows, cur = 'EUR' }) {
  const max = Math.max(1, ...rows.map((r) => Math.max(r.a || 0, r.b || 0)));
  return (
    <div className="stack" style={{ gap: 12 }}>
      {rows.map((r) => (
        <div key={r.label}>
          <div className="row" style={{ justifyContent: 'space-between' }}><b style={{ fontWeight: 600 }}>{r.label}</b><span className="small muted num">{fmtMoneyShort(r.b, cur)} / {fmtMoneyShort(r.a, cur)}</span></div>
          <div style={{ position: 'relative', height: 14, background: 'var(--surface-3)', borderRadius: 3, marginTop: 4 }}>
            <div style={{ position: 'absolute', inset: 0, width: `${((r.a || 0) / max) * 100}%`, background: 'var(--plan)', borderRadius: 3 }} />
            <div style={{ position: 'absolute', inset: 0, width: `${((r.b || 0) / max) * 100}%`, background: 'var(--good)', borderRadius: 3 }} />
          </div>
        </div>
      ))}
    </div>
  );
}
