import { Bell, LogOut, Sprout } from 'lucide-react';
import type { AuthenticatedSession } from '../auth/types';

export default function PortalHeader({ session, onLogout, context }: { session: AuthenticatedSession; onLogout: () => void; context: string }) {
  return (
    <header className="role-portal-header">
      <div className="role-brand"><span><Sprout size={21} /></span><strong>Pestneer</strong><em>{context}</em></div>
      <div className="role-header-actions">
        <button aria-label="Bildirimler"><Bell size={19} /><i /></button>
        <div><strong>{session.user.name}</strong><span>{session.user.role}</span></div>
        <button className="logout-button" onClick={onLogout} aria-label="Çıkış yap"><LogOut size={18} /></button>
      </div>
    </header>
  );
}
