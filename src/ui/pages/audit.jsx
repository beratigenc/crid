import { useMemo, useState } from 'react';
import { useApp, useNames, usePerms } from '../ctx.jsx';
import { DataTable, Field, Input, Select, DateInput, ExportButton, tableRows, Empty, Pill } from '../components/common.jsx';
import { fmtDateTime, includesTR } from '../../logic/util.js';

const ACTION = { create: 'Oluşturma', update: 'Güncelleme', convert: 'Dönüşüm', sub: 'Alt detay', freeze: 'Dondurma', unfreeze: 'Dondurma kaldırma', master: 'Master data' };
const KIND = { crid: 'CRID', idea: 'Fikir havuzu', sub: 'Alt detay', plan: 'Üretim planı / bütçe', master: 'Master data' };

export function AuditPage() {
  const { state, nav } = useApp();
  const n = useNames();
  const can = usePerms();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [user, setUser] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const all = useMemo(() => {
    const out = [];
    const push = (k, rec, label, go) => { for (const [i, h] of (rec.history || []).entries()) out.push({ id: `${k}-${rec.id}-${i}`, kind: k, rec, label, go, ...h }); };
    for (const c of state.crids) push('crid', c, `${c.no} · ${c.title}`, () => nav('crid', { id: c.id, tab: 'history' }));
    for (const i of state.ideas) push('idea', i, `${i.no} · ${i.title}`, () => nav('pool', { id: i.id }));
    for (const s of state.subs) push('sub', s, `${s.no} · ${s.partName || s.partNo || ''}`, () => nav('crid', { id: s.cridId, tab: 'subs' }));
    for (const p of state.plans) push('plan', p, `${n.vehicle(p.vehicleId)} ${p.year}`, () => nav('plan'));
    push('master', { ...state.master, id: 'main' }, 'Master data', () => nav('master', { tab: 'history' }));
    return out.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  }, [state]);
  const users = useMemo(() => [...new Set(all.map((h) => h.by))].map((id) => ({ value: id, label: all.find((h) => h.by === id)?.byName || n.user(id) || id })), [all]);
  const rows = all.filter((h) => (!kind || h.kind === kind) && (!user || h.by === user) && (!from || h.at >= from) && (!to || h.at.slice(0, 10) <= to)
    && (!q || includesTR(h.label, q) || (h.changes || []).some((c) => includesTR(c.label, q) || includesTR(String(c.to), q)) || includesTR(h.note, q)));
  if (!can('audit.view')) return <Empty title="Audit log görüntüleme yetkiniz yok" />;
  const cols = [
    { key: 'at', label: 'Zaman', render: (h) => <span className="nowrap">{fmtDateTime(h.at)}</span>, value: (h) => h.at, exportValue: (h) => fmtDateTime(h.at) },
    { key: 'by', label: 'Kullanıcı', value: (h) => h.byName || n.user(h.by) || h.by },
    { key: 'kind', label: 'Kayıt türü', render: (h) => <span className="tag">{KIND[h.kind]}</span>, value: (h) => KIND[h.kind] },
    { key: 'rec', label: 'Kayıt', className: 't-title', render: (h) => <b>{h.label}</b>, value: (h) => h.label },
    { key: 'action', label: 'İşlem', value: (h) => ACTION[h.action] || h.action },
    { key: 'changes', label: 'Değişiklik', render: (h) => <div className="diff">{h.note ? <div>{h.note}</div> : null}{(h.changes || []).slice(0, 4).map((c, i) => <div key={i}><b>{c.label}</b>: <s>{short(c.from) || '∅'}</s> → {short(c.to) || '∅'}</div>)}{(h.changes || []).length > 4 ? <div>+{h.changes.length - 4} alan</div> : null}</div>,
      value: (h) => [h.note, ...(h.changes || []).map((c) => `${c.label}: ${short(c.from)} → ${short(c.to)}`)].filter(Boolean).join(' | ') },
  ];
  return (
    <>
      <div className="page-head">
        <div className="grow"><div className="eyebrow">Tüm kritik değişiklikler</div><h1>Audit Log</h1></div>
        <ExportButton filename="CRID_Audit_Log" getSheets={() => [{ name: 'Audit', rows: tableRows(cols, rows) }]} />
      </div>
      <div className="filterbar">
        <Field label="Ara"><Input value={q} onChange={setQ} placeholder="Kayıt, alan, değer" aria-label="Audit ara" /></Field>
        <Field label="Kayıt türü"><Select value={kind} onChange={setKind} options={Object.entries(KIND).map(([k, v]) => ({ value: k, label: v }))} placeholder="Tümü" aria-label="Kayıt türü" /></Field>
        <Field label="Kullanıcı"><Select value={user} onChange={setUser} options={users} placeholder="Tümü" aria-label="Kullanıcı" /></Field>
        <Field label="Başlangıç"><DateInput value={from} onChange={setFrom} aria-label="Başlangıç" /></Field>
        <Field label="Bitiş"><DateInput value={to} onChange={setTo} aria-label="Bitiş" /></Field>
      </div>
      <div className="card"><DataTable testId="audit-table" columns={cols} rows={rows} onRowClick={(h) => h.go()} maxRows={500} /></div>
    </>
  );
}
function short(v) {
  if (v === null || v === undefined) return '';
  const s = Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : String(v);
  return s.length > 60 ? s.slice(0, 57) + '…' : s;
}
