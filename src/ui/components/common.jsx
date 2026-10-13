import { useState, useMemo, useEffect, useRef } from 'react';
import { useApp, useNames, usePerms } from '../ctx.jsx';
import { cmp, fmtMoney, fmtNum, MONTHS_TR, num } from '../../logic/util.js';
import { buildXlsx, buildCsv } from '../../logic/xlsx.js';
import { EMPTY_FILTERS, activeFilterCount } from '../../logic/filters.js';
import { STATUS_KEYS } from '../../logic/defaults.js';

/* ---------------- İkonlar ---------------- */
const P = {
  dash: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z',
  bulb: 'M9 21h6v-1H9v1zm3-19a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z',
  list: 'M4 6h16M4 12h16M4 18h10',
  layers: 'M12 2 2 7l10 5 10-5-10-5zm-10 10 10 5 10-5M2 17l10 5 10-5',
  factory: 'M2 20V9l6 4V9l6 4V4h4l2 16H2z',
  target: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 4a6 6 0 1 1 0 12 6 6 0 0 1 0-12zm0 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  cal: 'M7 2v3M17 2v3M3 8h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  check: 'M20 6 9 17l-5-5',
  chart: 'M3 3v18h18M7 15l4-4 3 3 6-6',
  db: 'M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3zm8 3v12c0 1.7-3.6 3-8 3s-8-1.3-8-3V6m16 6c0 1.7-3.6 3-8 3s-8-1.3-8-3',
  hist: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 3',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm10 17-5-5',
  plus: 'M12 5v14M5 12h14',
  x: 'M18 6 6 18M6 6l12 12',
  edit: 'M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4',
  trash: 'M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14',
  down: 'M12 3v12m0 0-5-5m5 5 5-5M4 21h16',
  up: 'M12 21V9m0 0-5 5m5-5 5 5M4 3h16',
  filter: 'M3 5h18l-7 8v6l-4 2v-8L3 5z',
  menu: 'M3 6h18M3 12h18M3 18h18',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  back: 'M19 12H5m6 6-6-6 6-6',
  lock: 'M6 10V7a6 6 0 0 1 12 0v3M5 10h14v11H5z',
  snow: 'M12 2v20M4 6l16 12M20 6 4 18',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm0 0v6h6',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 9a8 8 0 0 1 16 0',
  swap: 'M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7',
  car: 'M3 13l2-6h14l2 6v5h-3v-2H6v2H3v-5zm3 0h12M7 16h.01M17 16h.01',
  plug: 'M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-12 0V8zM12 17v5',
};
export function Icon({ name, className = 'ico', title }) {
  const d = P[name] || P.dash;
  const filled = ['dash', 'bulb', 'factory', 'target'].includes(name);
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden={title ? undefined : 'true'} role={title ? 'img' : undefined}
      fill={filled ? 'currentColor' : 'none'} stroke={filled ? 'none' : 'currentColor'} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      {title ? <title>{title}</title> : null}
      <path d={d} fillRule={name === 'target' ? 'evenodd' : undefined} />
    </svg>
  );
}

/* ---------------- Rozetler ---------------- */
export function Pill({ tone = 'neutral', children, title }) {
  return <span className={`pill t-${tone}`} title={title}>{children}</span>;
}
export function StatusPill({ status }) {
  const n = useNames();
  return <Pill tone={n.statusTone(status)}>{n.status(status)}</Pill>;
}
export function SampleTag({ show }) { return show ? <span className="tag sample" title="Örnek veri">ÖRNEK</span> : null; }

/* ---------------- Form alanları ---------------- */
export function Field({ label, hint, error, children, className = '', htmlFor }) {
  return (
    <div className={`field ${className}`}>
      {label ? <label htmlFor={htmlFor}>{label}</label> : null}
      {children}
      {error ? <div className="err">{error}</div> : hint ? <div className="hint">{hint}</div> : null}
    </div>
  );
}
export function Input({ value, onChange, ...rest }) {
  return <input className="inp" value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest} />;
}
export function NumInput({ value, onChange, step = 'any', className = '', ...rest }) {
  return <input className={`inp num-in ${className}`} type="number" inputMode="decimal" step={step} value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? '' : e.target.value)} {...rest} />;
}
export function DateInput({ value, onChange, ...rest }) {
  return <input className="inp" type="date" value={value || ''} onChange={(e) => onChange(e.target.value)} {...rest} />;
}
export function MonthInput({ value, onChange, ...rest }) {
  return <input className="inp" type="month" value={value || ''} onChange={(e) => onChange(e.target.value)} {...rest} />;
}
export function TextArea({ value, onChange, rows = 3, ...rest }) {
  return <textarea className="inp" rows={rows} value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest} />;
}
export function Select({ value, onChange, options, placeholder, className = '', ...rest }) {
  return (
    <select className={`inp ${className}`} value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest}>
      {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
      {options.map((o) => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
    </select>
  );
}
export function MultiChips({ value = [], onChange, options, disabled, id }) {
  const toggle = (v) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <div className="chips" id={id} role="group">
      {options.map((o) => (
        <button type="button" key={o.value} className={`chip ${value.includes(o.value) ? 'on' : ''}`} aria-pressed={value.includes(o.value)} disabled={disabled} onClick={() => toggle(o.value)}>{o.label}</button>
      ))}
      {!options.length ? <span className="faint small">Seçenek yok — Master Data'dan ekleyin.</span> : null}
    </div>
  );
}
export function Seg({ value, onChange, options }) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => <button key={o.value} type="button" role="tab" aria-selected={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  );
}

/* ---------------- master data seçenekleri ---------------- */
export function useOptions() {
  const { state } = useApp();
  const m = state.master;
  return useMemo(() => {
    const act = (l) => l.filter((x) => x.active !== false);
    return {
      vehicles: act(m.vehicles).map((v) => ({ value: v.id, label: v.name })),
      allVehicles: m.vehicles.map((v) => ({ value: v.id, label: v.name + (v.active === false ? ' (pasif)' : '') })),
      categories: act(m.categories).map((v) => ({ value: v.id, label: v.name })),
      teams: act(m.teams).map((v) => ({ value: v.id, label: v.name })),
      agendas: act(m.agendas).map((v) => ({ value: v.id, label: v.name })),
      scopes: act(m.scopes).map((v) => ({ value: v.id, label: v.name })),
      users: act(m.users).map((v) => ({ value: v.id, label: v.name })),
      currencies: m.currencies.filter((c) => c.active !== false).map((c) => ({ value: c.code, label: c.code })),
      statuses: m.statuses.map((s) => ({ value: s.key, label: s.label })),
      subCats: (catId) => (m.categories.find((c) => c.id === catId)?.subs || []).map((s) => ({ value: s, label: s })),
      months: MONTHS_TR.map((l, i) => ({ value: String(i + 1), label: l })),
      years: yearOptions(state),
    };
  }, [m, state.crids, state.plans]);
}
function yearOptions(state) {
  const ys = new Set([state.master.settings.reportYear, new Date().getFullYear(), new Date().getFullYear() + 1]);
  for (const p of state.plans) ys.add(+p.year);
  for (const c of state.crids) { if (c.ms?.sopTarget) ys.add(+c.ms.sopTarget.slice(0, 4)); if (c.ms?.sopActual) ys.add(+c.ms.sopActual.slice(0, 4)); }
  return [...ys].filter(Boolean).sort().map((y) => ({ value: String(y), label: String(y) }));
}

/* ---------------- Modal ---------------- */
export function Modal({ title, onClose, children, footer, size = '', labelledBy }) {
  const ref = useRef(null);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    const first = ref.current?.querySelector('input, select, textarea, button:not(.icon-btn)');
    first?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className={`modal ${size}`} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : labelledBy} ref={ref}>
        <div className="modal-h"><h2>{title}</h2><button className="icon-btn" aria-label="Kapat" onClick={onClose}><Icon name="x" /></button></div>
        <div className="modal-b">{children}</div>
        {footer ? <div className="modal-f">{footer}</div> : null}
      </div>
    </div>
  );
}

/** Sayfa içi onay penceresi (tarayıcı confirm() artifact içinde çalışmaz). */
export function Confirm({ title, message, confirmLabel = 'Onayla', danger, onConfirm, onClose, children }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={title} onClose={onClose} size="narrow" footer={<>
      <button className="btn" onClick={onClose}>Vazgeç</button>
      <button className={`btn ${danger ? 'danger' : 'primary'}`} disabled={busy} onClick={async () => { setBusy(true); try { await onConfirm(); onClose(); } finally { setBusy(false); } }}>{confirmLabel}</button>
    </>}>
      <p style={{ margin: 0 }}>{message}</p>
      {children}
    </Modal>
  );
}

/* ---------------- Sekmeler ---------------- */
export function Tabs({ value, onChange, tabs }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.filter(Boolean).map((t) => (
        <button key={t.value} role="tab" aria-selected={value === t.value} className={value === t.value ? 'on' : ''} onClick={() => onChange(t.value)}>
          {t.label}{t.count !== undefined ? <span className="c">{t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Empty({ title, children, action }) {
  return <div className="empty"><b>{title}</b>{children ? <div>{children}</div> : null}{action}</div>;
}

export function Kpis({ items }) {
  return (
    <div className="kpis">
      {items.map((k) => k.onClick ? (
        <button key={k.label} className={`kpi ${k.tone ? 'k-' + k.tone : ''}`} onClick={k.onClick}>
          <div className="l">{k.label}</div><div className="v">{k.value}</div>{k.sub ? <div className="s">{k.sub}</div> : null}
        </button>
      ) : (
        <div key={k.label} className={`kpi ${k.tone ? 'k-' + k.tone : ''}`}>
          <div className="l">{k.label}</div><div className="v">{k.value}</div>{k.sub ? <div className="s">{k.sub}</div> : null}
        </div>
      ))}
    </div>
  );
}

export function Money({ v, cur, digits = 0, className = '' }) {
  const { state } = useApp();
  return <span className={`num ${className}`}>{fmtMoney(v, cur || state.master.baseCurrency, digits)}</span>;
}

export function Progress({ value, bad }) {
  const w = Math.max(0, Math.min(1, value || 0));
  return <div className={`progress ${bad ? 'bad' : ''}`} title={`%${Math.round(w * 100)}`}><i style={{ width: `${w * 100}%` }} /></div>;
}

/* ---------------- Veri tablosu (sıralama, gruplama, toplam) ---------------- */
/**
 * columns: [{ key, label, render?(row), value?(row), num?, sum?: boolean, width?, export?: false }]
 */
export function DataTable({ columns, rows, rowKey = (r) => r.id, onRowClick, rowClass, groupBy, groupLabel, initialSort, totals, empty, maxRows = 2000, testId }) {
  const [sort, setSort] = useState(initialSort || null);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    const val = col.value || ((r) => r[col.key]);
    const out = rows.slice().sort((a, b) => cmp(val(a), val(b)));
    return sort.dir === 'desc' ? out.reverse() : out;
  }, [rows, sort, columns]);
  const groups = useMemo(() => {
    if (!groupBy) return null;
    const m = new Map();
    for (const r of sorted) { const k = groupBy(r) ?? ''; if (!m.has(k)) m.set(k, []); m.get(k).push(r); }
    return [...m.entries()].sort((a, b) => cmp(a[0], b[0]));
  }, [sorted, groupBy]);
  const clickSort = (c) => {
    if (c.sortable === false) return;
    setSort((s) => (s && s.key === c.key ? (s.dir === 'asc' ? { key: c.key, dir: 'desc' } : null) : { key: c.key, dir: 'asc' }));
  };
  const sumRow = (list) => columns.map((c) => (c.sum ? list.reduce((a, r) => a + num((c.value || ((x) => x[c.key]))(r)), 0) : null));
  const renderSum = (vals, label) => (
    <tr className="tot">{columns.map((c, i) => <td key={c.key} className={c.num ? 'num' : ''}>{i === 0 ? label : vals[i] !== null ? (c.sumRender ? c.sumRender(vals[i]) : fmtNum(vals[i])) : ''}</td>)}</tr>
  );
  const body = (list) => list.slice(0, maxRows).map((r) => (
    <tr key={rowKey(r)} className={`${onRowClick ? 'click' : ''} ${rowClass ? rowClass(r) : ''}`} onClick={onRowClick ? () => onRowClick(r) : undefined}
      tabIndex={onRowClick ? 0 : undefined} onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter') onRowClick(r); } : undefined}>
      {columns.map((c) => <td key={c.key} className={`${c.num ? 'num' : ''} ${c.className || ''}`}>{c.render ? c.render(r) : c.value ? fmtCell(c.value(r)) : r[c.key]}</td>)}
    </tr>
  ));
  return (
    <div className="tbl-wrap" data-testid={testId}>
      <table className="tbl">
        <thead><tr>{columns.map((c) => (
          <th key={c.key} className={`${c.num ? 'num' : ''} ${c.sortable === false ? '' : 'sortable'}`} style={c.width ? { width: c.width } : undefined}
            onClick={() => clickSort(c)} aria-sort={sort?.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
            {c.label}{sort?.key === c.key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
          </th>
        ))}</tr></thead>
        <tbody>
          {!rows.length ? <tr><td colSpan={columns.length}>{empty || <Empty title="Kayıt bulunamadı">Filtreleri değiştirmeyi deneyin.</Empty>}</td></tr> : null}
          {groups ? groups.map(([k, list]) => (
            <GroupRows key={k} label={groupLabel ? groupLabel(k, list) : k || '(boş)'} count={list.length} colSpan={columns.length}>
              {body(list)}
              {totals ? renderSum(sumRow(list), 'Ara toplam') : null}
            </GroupRows>
          )) : body(sorted)}
          {totals && rows.length ? renderSum(sumRow(rows), `Toplam (${rows.length})`) : null}
        </tbody>
      </table>
      {rows.length > maxRows ? <div className="small muted" style={{ padding: 8 }}>İlk {maxRows} kayıt gösteriliyor; tamamı için dışa aktarın.</div> : null}
    </div>
  );
}
function fmtCell(v) { if (v === null || v === undefined) return ''; if (typeof v === 'number') return fmtNum(v, Number.isInteger(v) ? 0 : 2); return v; }
function GroupRows({ label, count, colSpan, children }) {
  return <>
    <tr className="grp"><td colSpan={colSpan}>{label} <span className="muted">({count})</span></td></tr>
    {children}
  </>;
}

/** Tablo verisini dışa aktarım satırlarına çevirir. */
export function tableRows(columns, rows) {
  const cols = columns.filter((c) => c.export !== false);
  return [cols.map((c) => c.exportLabel || c.label), ...rows.map((r) => cols.map((c) => {
    const v = c.exportValue ? c.exportValue(r) : c.value ? c.value(r) : r[c.key];
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return Math.round(v * 100) / 100;
    if (typeof v === 'object') return '';
    return v;
  }))];
}

export function ExportButton({ filename, getSheets, label = 'Dışa aktar' }) {
  const { platform, toast } = useApp();
  const can = usePerms();
  const [open, setOpen] = useState(false);
  if (!can('export')) return null;
  const run = async (fmt) => {
    setOpen(false);
    try {
      const sheets = getSheets();
      let ok;
      if (fmt === 'xlsx') ok = await platform.saveFile(`${filename}.xlsx`, buildXlsx(sheets));
      else ok = await platform.saveFile(`${filename}.csv`, buildCsv(sheets[0].rows));
      if (ok) toast(`${filename}.${fmt} hazırlandı`, 'good');
    } catch (e) { toast(e.message || 'Dışa aktarım başarısız', 'bad'); }
  };
  return (
    <div style={{ position: 'relative' }}>
      <button className="btn" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}><Icon name="down" />{label}</button>
      {open ? (
        <div className="search-pop" role="menu" style={{ right: 0, left: 'auto', minWidth: 170 }}>
          <button role="menuitem" onClick={() => run('xlsx')}>Excel (.xlsx)</button>
          <button role="menuitem" onClick={() => run('csv')}>CSV (.csv)</button>
        </div>
      ) : null}
    </div>
  );
}

/* ---------------- Global filtre çubuğu ---------------- */
export function FilterBar({ filters, setFilters, show = ['year', 'month', 'vehicle', 'baseVehicle', 'targetVehicle', 'category', 'team', 'agenda', 'status', 'responsible'], extra }) {
  const o = useOptions();
  const [open, setOpen] = useState(false);
  const set = (k) => (v) => setFilters({ ...filters, [k]: v });
  const n = activeFilterCount(filters);
  const defs = {
    year: <Field label="Yıl" key="year"><Select value={filters.year} onChange={set('year')} options={o.years} placeholder="Tümü" aria-label="Yıl" /></Field>,
    month: <Field label="Devreye giriş ayı" key="month"><Select value={filters.month} onChange={set('month')} options={o.months} placeholder="Tümü" aria-label="Ay" /></Field>,
    vehicle: <Field label="Araç" key="vehicle"><Select value={filters.vehicle} onChange={set('vehicle')} options={o.allVehicles} placeholder="Tümü" aria-label="Araç" /></Field>,
    baseVehicle: <Field label="Baz araç" key="baseVehicle"><Select value={filters.baseVehicle} onChange={set('baseVehicle')} options={o.allVehicles} placeholder="Tümü" aria-label="Baz araç" /></Field>,
    targetVehicle: <Field label="Hedef araç" key="targetVehicle"><Select value={filters.targetVehicle} onChange={set('targetVehicle')} options={o.allVehicles} placeholder="Tümü" aria-label="Hedef araç" /></Field>,
    category: <Field label="Kategori" key="category"><Select value={filters.category} onChange={set('category')} options={o.categories} placeholder="Tümü" aria-label="Kategori" /></Field>,
    team: <Field label="Ekip" key="team"><Select value={filters.team} onChange={set('team')} options={o.teams} placeholder="Tümü" aria-label="Ekip" /></Field>,
    agenda: <Field label="Gündem" key="agenda"><Select value={filters.agenda} onChange={set('agenda')} options={o.agendas} placeholder="Tümü" aria-label="Gündem" /></Field>,
    status: <Field label="Statü" key="status"><Select value={filters.status} onChange={set('status')} options={[{ value: 'open', label: 'Tüm açık kayıtlar' }, ...o.statuses]} placeholder="Tümü" aria-label="Statü" /></Field>,
    responsible: <Field label="Sorumlu" key="responsible"><Select value={filters.responsible} onChange={set('responsible')} options={o.users} placeholder="Tümü" aria-label="Sorumlu" /></Field>,
  };
  const primary = show.slice(0, 4);
  const rest = show.slice(4);
  return (
    <div className="filterbar" data-testid="filterbar">
      {primary.map((k) => defs[k])}
      {open ? rest.map((k) => defs[k]) : null}
      <div className="row" style={{ marginLeft: 'auto' }}>
        {extra}
        {rest.length ? <button className="btn sm" onClick={() => setOpen(!open)} aria-expanded={open}><Icon name="filter" />{open ? 'Daha az' : `Tüm filtreler${n ? ` (${n})` : ''}`}</button> : null}
        {n ? <button className="btn sm ghost" onClick={() => setFilters({ ...EMPTY_FILTERS, year: filters.year })}>Temizle</button> : null}
      </div>
    </div>
  );
}

export { STATUS_KEYS };
