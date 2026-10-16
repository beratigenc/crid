import { createContext, useContext, useSyncExternalStore, useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { can as canFn, roleDef } from '../logic/rules.js';
import { nameOf } from '../logic/filters.js';
import { todayISO } from '../logic/util.js';

export const AppCtx = createContext(null);
export function useApp() { return useContext(AppCtx); }

export function useStoreState(store) {
  return useSyncExternalStore((l) => store.subscribe(l), () => store.getState());
}

/** Oturum kullanıcısını çözer: claude.ai kimliği → master kullanıcı → rol. */
export function resolveSessionUser({ platform, master, previewUserId }) {
  const users = master.users || [];
  if (platform.mode === 'local') {
    const u = users.find((x) => x.id === previewUserId) || users.find((x) => x.role === 'it') || users[0];
    return u ? { ...u, real: u, canPreview: true } : { id: 'demo', name: 'Demo Kullanıcı', role: 'it', canPreview: true };
  }
  if (platform.mode === 'server' || platform.mode === 'html') {
    const v = platform.viewer || {};
    const u = users.find((x) => x.id === v.id) || { id: v.id, name: v.name || 'Kullanıcı', role: 'readonly' };
    const real = { ...u };
    const canPreview = real.role === 'it';
    let eff = { ...real, real, canPreview };
    if (canPreview && previewUserId && previewUserId !== real.id) {
      const p = users.find((x) => x.id === previewUserId);
      if (p) eff = { ...p, real, canPreview, previewing: true };
    }
    return eff;
  }
  const v = platform.viewer || {};
  const linked = v.id ? users.find((x) => x.claudeId === v.id && x.active !== false) : null;
  let real;
  if (linked) real = { ...linked };
  else if (v.isOwner) real = { id: v.id || 'owner', claudeId: v.id, name: v.name || 'Sahip', role: 'it', synthetic: true };
  else real = { id: v.id || 'anon', claudeId: v.id, name: v.name || 'Ziyaretçi', role: master.settings.defaultRole || 'creator', synthetic: true, pending: true };
  const readOnlyAccess = v.canWrite === false;
  const canPreview = real.role === 'it' || v.isOwner;
  let eff = { ...real, readOnlyAccess, real, canPreview };
  if (canPreview && previewUserId && previewUserId !== real.id) {
    const p = users.find((x) => x.id === previewUserId);
    if (p) eff = { ...p, readOnlyAccess, real, canPreview, previewing: true };
  }
  return eff;
}

export function usePerms() {
  const { session, state } = useApp();
  return useCallback((perm, record) => canFn(session, perm, state.master, record), [session, state.master]);
}

export function useNames() {
  const { state } = useApp();
  const m = state.master;
  return useMemo(() => ({
    user: (id) => nameOf(m.users, id) || state.people.find((p) => p.id === id)?.name || (id ? '—' : ''),
    vehicle: (id) => nameOf(m.vehicles, id),
    vehicles: (ids) => (ids || []).map((id) => nameOf(m.vehicles, id)).filter(Boolean).join(', '),
    category: (id) => nameOf(m.categories, id),
    team: (id) => nameOf(m.teams, id),
    agenda: (id) => nameOf(m.agendas, id),
    scope: (id) => nameOf(m.scopes, id),
    role: (k) => roleDef(k).label,
    status: (k) => m.statuses.find((s) => s.key === k)?.label || k,
    statusTone: (k) => m.statuses.find((s) => s.key === k)?.tone || 'neutral',
  }), [m, state.people]);
}

export function useToday() { return todayISO(); }

/** Geçici bildirim (toast) yönetimi */
export function useToasts() {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);
  const push = useCallback((msg, kind = 'info', ms = 3800) => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ms);
  }, []);
  return [toasts, push];
}

export function useLocalPref(key, initial) {
  const [v, setV] = useState(() => {
    try { const raw = localStorage.getItem('crid-pref-' + key); return raw ? JSON.parse(raw) : initial; } catch (e) { return initial; }
  });
  useEffect(() => { try { localStorage.setItem('crid-pref-' + key, JSON.stringify(v)); } catch (e) { /* */ } }, [key, v]);
  return [v, setV];
}
