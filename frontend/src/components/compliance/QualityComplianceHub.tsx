import { useState } from 'react';
import { ClipboardCheck, HeartPulse, RefreshCw, ShieldCheck } from 'lucide-react';
import type { EmployeeRecord } from '../../services/employeeApi';
import CorrectiveActionCenter from './CorrectiveActionCenter';
import QualityInspectionCenter from './QualityInspectionCenter';
import HealthWasteCenter from './HealthWasteCenter';

export default function QualityComplianceHub({ accessToken, employees, onSessionExpired }: { accessToken: string; employees: EmployeeRecord[]; onSessionExpired: () => void }) {
  const [tab, setTab] = useState<'inspection' | 'actions' | 'health'>('inspection');
  const [reloadKey, setReloadKey] = useState(0);
  return <section className="page quality-compliance-hub">
    <div className="page-header"><div><p className="eyebrow">KALİTE GÜVENCE & UYUM</p><h1>Kalite Kontrol Merkezi</h1><span>İkinci kontrolleri, saha uygulama kalitesini ve düzeltici faaliyetleri tek merkezden yönetin.</span></div><div className="page-actions"><button className="btn btn-outline" onClick={() => setReloadKey((value) => value + 1)}><RefreshCw size={17} />Yenile</button></div></div>
    <nav className="quality-hub-tabs"><button className={tab === 'inspection' ? 'active' : ''} onClick={() => setTab('inspection')}><ClipboardCheck />Saha Denetimleri</button><button className={tab === 'actions' ? 'active' : ''} onClick={() => setTab('actions')}><ShieldCheck />Düzeltici Faaliyetler</button><button className={tab === 'health' ? 'active' : ''} onClick={() => setTab('health')}><HeartPulse />Sağlık & Bertaraf</button></nav>
    {tab === 'inspection' ? <QualityInspectionCenter key={`inspection-${reloadKey}`} accessToken={accessToken} onSessionExpired={onSessionExpired} /> : tab === 'actions' ? <CorrectiveActionCenter key={`actions-${reloadKey}`} accessToken={accessToken} mode="staff" employees={employees} onSessionExpired={onSessionExpired} /> : <HealthWasteCenter key={`health-${reloadKey}`} accessToken={accessToken} mode="staff" onSessionExpired={onSessionExpired} />}
  </section>;
}
