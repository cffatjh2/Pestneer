import {
  Activity,
  ArrowUpRight,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  FileText,
  FolderArchive,
  LayoutDashboard,
  LogOut,
  Package,
  Settings,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import type { ViewId } from '../../types';
import { navigation } from '../../data/mockData';

const iconMap: Record<string, React.ElementType> = {
  LayoutDashboard,
  ClipboardList,
  CalendarDays,
  Package,
  FileText,
  FolderArchive,
  Users,
};

interface SidebarProps {
  activeView: ViewId;
  setActiveView: (view: ViewId) => void;
  isMenuOpen: boolean;
  setIsMenuOpen: (open: boolean) => void;
  onNotify: (message: string) => void;
  companyName: string;
  userName: string;
  userRole: string;
  onLogout: () => void;
}

export default function Sidebar({
  activeView,
  setActiveView,
  isMenuOpen,
  setIsMenuOpen,
  onNotify,
  companyName,
  userName,
  userRole,
  onLogout,
}: SidebarProps) {
  const initials = userName.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();

  return (
    <aside className={`sidebar ${isMenuOpen ? 'sidebar-open' : ''}`}>
      <div className="brand">
        <img src="/logo.png" alt="Pesneer" className="brand-logo" />
        <div className="brand-text"><strong>pesneer</strong><span>OPERASYON PANELİ</span></div>
        <button className="mobile-close" onClick={() => setIsMenuOpen(false)} aria-label="Menüyü kapat"><X size={20} /></button>
      </div>

      <div className="company-card">
        <div className="company-icon"><ShieldCheck size={18} /></div>
        <div><span>Çalışma alanı</span><strong>{companyName}</strong></div>
        <ChevronDown size={16} />
      </div>

      <nav className="navigation" aria-label="Ana menü">
        <p>YÖNETİM</p>
        {navigation.map((item) => {
          const Icon = iconMap[item.iconName] || LayoutDashboard;
          return <button key={item.id} className={`nav-item ${activeView === item.id ? 'active' : ''}`} onClick={() => { setActiveView(item.id); setIsMenuOpen(false); }}><Icon size={19} strokeWidth={activeView === item.id ? 2.4 : 2} /><span>{item.label}</span></button>;
        })}
      </nav>

      <div className="sidebar-bottom">
        <button className="nav-item"><Settings size={19} /><span>Ayarlar</span></button>
        <div className="support-card"><div className="support-icon"><Activity size={18} /></div><strong>Yardıma mı ihtiyacınız var?</strong><span>Destek ekibimiz yanınızda.</span><button onClick={() => onNotify('Destek talebi ekranı yakında hazır olacak.')}>Destek Merkezi <ArrowUpRight size={14} /></button></div>
        <button className="profile profile-button" onClick={onLogout}>
          <div className="avatar avatar-blue">{initials}</div>
          <div><strong>{userName}</strong><span>{userRole}</span></div>
          <LogOut size={18} />
        </button>
      </div>
    </aside>
  );
}
