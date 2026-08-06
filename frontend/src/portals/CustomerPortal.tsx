import { Building2, CalendarDays, ChevronRight, ClipboardCheck, Clock3, Download, FileCheck2, FileText, Plus, Store } from 'lucide-react';
import type { AuthenticatedSession } from '../auth/types';
import PortalHeader from './PortalHeader';

export default function CustomerPortal({ session, onLogout }: { session: AuthenticatedSession; onLogout: () => void }) {
  return (
    <div className="role-portal customer-portal">
      <PortalHeader session={session} onLogout={onLogout} context="MÜŞTERİ PORTALI" />
      <main className="role-portal-main">
        <div className="role-welcome"><div><p>MÜŞTERİ OPERASYONLARI</p><h1>Hizmetleriniz tek ekranda</h1><span>Şubelerinizi, uygulama raporlarını ve yaklaşan kontrolleri güvenle takip edin.</span></div><button><Plus size={18} />Yeni hizmet talebi</button></div>
        <div className="customer-kpis"><article><div><span>Aktif şube</span><strong>6</strong><small>Tek hesap altında</small></div><Building2 size={23} /></article><article><div><span>Bu ay hizmet</span><strong>14</strong><small>12 tamamlandı</small></div><CalendarDays size={23} /></article><article><div><span>Yayınlanan rapor</span><strong>38</strong><small>Son 12 ay</small></div><FileCheck2 size={23} /></article><article><div><span>Açık talep</span><strong>1</strong><small>Planlama aşamasında</small></div><ClipboardCheck size={23} /></article></div>
        <div className="customer-layout">
          <section className="role-surface upcoming-service"><div className="role-section-title"><div><p>YAKLAŞAN HİZMET</p><h2>Bir sonraki uygulama</h2></div><span className="confirmed">Planlandı</span></div><div className="service-date"><strong>12</strong><span>AĞU<br />2026</span><div><b>Arabica Coffee House · Kızılay</b><small>Periyodik haşere kontrolü</small></div></div><div className="service-meta"><span><Clock3 size={16} />10:30 - 11:30</span><span><Store size={16} />Kızılay Şube</span></div><button className="role-primary-button">Hizmet detaylarını görüntüle <ChevronRight size={17} /></button></section>
          <section className="role-surface recent-documents"><div className="role-section-title"><div><p>BELGELER</p><h2>Son hizmet raporları</h2></div><button>Tüm belgeler</button></div>{[['ATG Şube','06 Ağustos 2026','EK-1 · İmzalı'],['Çankaya Şube','03 Ağustos 2026','Kontrol Formu'],['Kızılay Şube','29 Temmuz 2026','EK-1 · İmzalı']].map(([branch,date,type]) => <div className="document-row" key={`${branch}-${date}`}><span><FileText size={18} /></span><div><strong>{branch}</strong><small>{date} · {type}</small></div><button aria-label={`${branch} raporunu indir`}><Download size={17} /></button></div>)}</section>
        </div>
      </main>
    </div>
  );
}
