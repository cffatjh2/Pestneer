import { useEffect, useState } from 'react';
import { AlertTriangle, Bell, CalendarDays, ChevronRight, Clock3, Menu, Search } from 'lucide-react';
import type { ViewId } from '../../types';
import { navigation } from '../../data/mockData';
import { getInventoryAlerts, type InventoryAlert } from '../../services/inventoryApi';

interface TopbarProps {
  activeView: ViewId;
  onMenuOpen: () => void;
  accessToken: string;
  onStockOpen: () => void;
}

export default function Topbar({ activeView, onMenuOpen, accessToken, onStockOpen }: TopbarProps) {
  const currentLabel = navigation.find((n) => n.id === activeView)?.label;
  const [now, setNow] = useState(new Date());
  const [alerts, setAlerts] = useState<InventoryAlert[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const refreshAlerts = () => { void getInventoryAlerts(accessToken).then(setAlerts).catch(() => setAlerts([])); };
    refreshAlerts();
    const timer = window.setInterval(refreshAlerts, 60_000);
    window.addEventListener('pestneer:inventory-changed', refreshAlerts);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('pestneer:inventory-changed', refreshAlerts);
    };
  }, [accessToken]);

  return (
    <header className="topbar">
      <button
        className="menu-button"
        onClick={onMenuOpen}
        aria-label="Menüyü aç"
      >
        <Menu size={22} />
      </button>

      <div className="breadcrumb">
        <span>Pesneer</span>
        <ChevronRight size={16} />
        <strong>{currentLabel}</strong>
      </div>

      <div className="topbar-actions">
        <button className="icon-button search-button" aria-label="Ara">
          <Search size={20} />
        </button>

        <div className="notification-center">
          <button className="notification-button" aria-label="Bildirimler" onClick={() => setNotificationsOpen((open) => !open)} aria-expanded={notificationsOpen}>
            <Bell size={20} />
            {alerts.length > 0 && <><i /><span>{alerts.length > 9 ? '9+' : alerts.length}</span></>}
          </button>
          {notificationsOpen && <div className="notification-popover">
            <header><div><strong>Bildirimler</strong><small>{alerts.length ? `${alerts.length} kritik stok uyarısı` : 'Yeni uyarı yok'}</small></div></header>
            {alerts.length ? <div className="notification-list">{alerts.map((alert) => <button key={alert.inventoryItemId} type="button" onClick={() => { setNotificationsOpen(false); onStockOpen(); }}>
              <span className={alert.severity === 'Critical' ? 'critical' : 'warning'}><AlertTriangle size={17} /></span>
              <div><strong>{alert.title}</strong><p>{alert.message}</p><small>{formatAlertDate(alert.occurredAt)}</small></div>
            </button>)}</div> : <div className="notification-empty"><Bell size={22} /><span>Stok seviyeleri normal.</span></div>}
          </div>}
        </div>

        <div className="topbar-divider" />

        <div className="today">
          <CalendarDays size={17} />
          <span>{new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', weekday: 'long' }).format(now)}</span>
          <Clock3 size={15} />
          <strong>{new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' }).format(now)}</strong>
        </div>
      </div>
    </header>
  );
}

const formatAlertDate = (value: string) => new Intl.DateTimeFormat('tr-TR', {
  day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
}).format(new Date(value));
