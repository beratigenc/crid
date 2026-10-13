import { useState } from 'react';
import { useApp } from '../ctx.jsx';
import { Tabs, Empty, Pill } from '../components/common.jsx';
import { fmtDate } from '../../logic/util.js';

const TYPES = { overdue: 'Gecikme', upcoming: 'Yaklaşan milestone', finance: 'Finansal kontrol', poolIdle: 'Havuzda bekleyen', budget: 'Bütçe altında', budgetOver: 'Hedefi aşan' };

export function NotificationsPage() {
  const { notifications, nav, state, session } = useApp();
  const [tab, setTab] = useState('all');
  const list = notifications.filter((x) => tab === 'all' || (tab === 'mine' ? x.mine : x.type === tab));
  const count = (t) => notifications.filter((x) => (t === 'mine' ? x.mine : x.type === t)).length;
  const go = (x) => {
    if (x.cridId) nav('crid', { id: x.cridId, tab: x.type === 'finance' ? 'financial' : 'milestones' });
    else if (x.ideaId) nav('pool', { id: x.ideaId });
    else if (x.vehicleId) nav('vehicle', { id: x.vehicleId });
  };
  return (
    <>
      <div className="page-head">
        <div className="grow"><div className="eyebrow">Rolünüze göre: {session.name}</div><h1>Bildirimler</h1></div>
      </div>
      <div className="banner info">Milestone tarihinden {state.master.settings.notifyDaysBefore} gün önce sorumluya hatırlatma, tarih geçtiyse gecikme uyarısı, devreye girmiş kayıtlar için Finansal Kontrol'e görev, havuzda {state.master.settings.poolIdleDays} günden uzun bekleyen fikirler ve bütçe sapmaları burada listelenir. E-posta/Teams bildirimi kurumsal entegrasyon fazında eklenecektir.</div>
      <div className="card">
        <Tabs value={tab} onChange={setTab} tabs={[
          { value: 'all', label: 'Tümü', count: notifications.length },
          { value: 'mine', label: 'Bana atanan', count: count('mine') },
          ...Object.entries(TYPES).map(([k, v]) => ({ value: k, label: v, count: count(k) })).filter((t) => t.count),
        ]} />
        <div className="card-b">
          {list.length ? <ul className="list-plain">
            {list.map((x) => (
              <li key={x.id} style={{ cursor: 'pointer' }} onClick={() => go(x)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && go(x)}>
                <span className={`sev ${x.severity}`} />
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600 }}>{x.title}</div><div className="small muted">{x.detail}</div></div>
                <div className="row" style={{ flexWrap: 'nowrap' }}>{x.mine ? <Pill tone="accent">Size</Pill> : null}<span className="tag">{TYPES[x.type]}</span>{x.date ? <span className="small muted nowrap">{fmtDate(x.date)}</span> : null}</div>
              </li>
            ))}
          </ul> : <Empty title="Bildirim yok">Bu görünümde size ait uyarı bulunmuyor.</Empty>}
        </div>
      </div>
    </>
  );
}
