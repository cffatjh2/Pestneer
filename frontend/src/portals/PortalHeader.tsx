import { Bell, LogOut, Mail, Sprout } from 'lucide-react';
import type { AuthenticatedSession } from '../auth/types';

export default function PortalHeader({ session, onLogout, context }: { session: AuthenticatedSession; onLogout: () => void; context: string }) {
  return (
    <header className="role-portal-header">
      <div className="role-brand"><span><Sprout size={21} /></span><strong>Pestneer</strong><em>{context}</em></div>
      <div className="role-header-actions">
        <a
          href="mailto:pestneer@gmail.com"
          className="header-support-btn"
          title="Destek Ekibi: pestneer@gmail.com"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            color: '#3b82f6',
            background: 'rgba(239, 246, 255, 0.8)',
            padding: '6px 10px',
            borderRadius: '8px',
            fontSize: '11px',
            fontWeight: 700,
            textDecoration: 'none',
            border: '1px solid rgba(191, 219, 254, 0.6)',
          }}
        >
          <Mail size={14} /> <span>Destek</span>
        </a>
        <button aria-label="Bildirimler"><Bell size={19} /><i /></button>
        <div><strong>{session.user.name}</strong><span>{session.user.role}</span></div>
        <button className="logout-button" onClick={onLogout} aria-label="Çıkış yap"><LogOut size={18} /></button>
      </div>
    </header>
  );
}
