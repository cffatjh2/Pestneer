import { Mail, Headphones, ShieldCheck } from 'lucide-react';

export default function PortalFooter() {
  return (
    <footer className="portal-universal-footer" aria-label="Destek ve İletişim">
      <div className="portal-footer-inner">
        <div className="portal-footer-brand">
          <ShieldCheck size={14} className="portal-footer-icon" />
          <span>© 2026 <strong>Pestneer</strong> Operasyon Merkezi</span>
        </div>
        <div className="portal-footer-support">
          <Headphones size={14} className="portal-footer-support-icon" />
          <span className="portal-footer-label">Teknik Destek & İletişim:</span>
          <a
            href="mailto:pestneer@gmail.com"
            className="portal-footer-email"
            title="Pestneer Destek Ekibine E-posta Gönder"
          >
            <Mail size={13} />
            <span>pestneer@gmail.com</span>
          </a>
        </div>
      </div>
    </footer>
  );
}
