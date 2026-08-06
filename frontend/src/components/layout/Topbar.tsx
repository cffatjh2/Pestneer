import { useEffect, useState } from 'react';
import { Bell, CalendarDays, ChevronRight, Clock3, Menu, Search } from 'lucide-react';
import type { ViewId } from '../../types';
import { navigation } from '../../data/mockData';

interface TopbarProps {
  activeView: ViewId;
  onMenuOpen: () => void;
}

export default function Topbar({ activeView, onMenuOpen }: TopbarProps) {
  const currentLabel = navigation.find((n) => n.id === activeView)?.label;
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

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

        <button className="notification-button" aria-label="Bildirimler">
          <Bell size={20} />
          <i />
        </button>

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
