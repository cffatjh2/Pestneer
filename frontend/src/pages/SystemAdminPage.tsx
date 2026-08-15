import { useEffect, useState, type FormEvent } from 'react';
import { Building2, KeyRound, LogOut, Plus, RefreshCw, ShieldCheck, Store, UserPlus } from 'lucide-react';
import { createSystemCompany, createSystemCustomer, createSystemEmployee, getSystemCompanies, loginSystemAdmin, type SystemAdminSession, type SystemCompany } from '../services/systemAdminApi';

type Mode = 'company' | 'employee' | 'customer';
const STORAGE_KEY = 'pestneer.system-control';

export default function SystemAdminPage() {
  const [session, setSession] = useState<SystemAdminSession | null>(() => loadSession());
  const [companies, setCompanies] = useState<SystemCompany[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [mode, setMode] = useState<Mode>('company');
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!session) return;
    try { const items = await getSystemCompanies(session.accessToken); setCompanies(items); setSelectedCompanyId((current) => current || items[0]?.id || ''); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Firmalar yüklenemedi.'); }
  };
  useEffect(() => { void load(); }, [session?.accessToken]);

  if (!session) return <SystemLogin onLogin={(value) => { window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value)); setSession(value); }} />;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError(undefined); setNotice(undefined);
    const form = new FormData(event.currentTarget); const value = Object.fromEntries(form.entries()) as Record<string, string>;
    try {
      if (mode === 'company') await createSystemCompany(session.accessToken, { companyName: value.companyName, companyCode: value.companyCode, ownerName: value.name, ownerEmail: value.email, ownerPassword: value.password, ownerPhone: value.phone });
      if (mode === 'employee') await createSystemEmployee(session.accessToken, selectedCompanyId, { name: value.name, email: value.email, password: value.password, phone: value.phone, role: value.role, canSelfSchedule: form.get('canSelfSchedule') === 'on' });
      if (mode === 'customer') await createSystemCustomer(session.accessToken, selectedCompanyId, { customerName: value.customerName, customerCode: value.customerCode, contactName: value.name, email: value.email, password: value.password, phone: value.phone, address: value.address, city: value.city, district: value.district, mapUrl: value.mapUrl });
      event.currentTarget.reset(); setNotice(mode === 'company' ? 'Firma ve firma sahibi oluşturuldu.' : mode === 'employee' ? 'Personel hesabı oluşturuldu.' : 'Müşteri ve portal hesabı oluşturuldu.'); await load();
    } catch (submitError) { setError(submitError instanceof Error ? submitError.message : 'Kayıt oluşturulamadı.'); }
    finally { setBusy(false); }
  };

  return <main className="system-admin-page"><header><div><span><ShieldCheck /> PESTNEER SYSTEM CONTROL</span><h1>Sistem yönetimi</h1><p>Firma, personel ve müşteri hesaplarını şirket sınırları korunarak yönetin.</p></div><button onClick={() => { window.sessionStorage.removeItem(STORAGE_KEY); setSession(null); }}><LogOut /> Güvenli çıkış</button></header>
    <section className="system-admin-kpis"><article><Building2 /><strong>{companies.length}</strong><span>firma</span></article><article><UserPlus /><strong>{companies.reduce((sum, item) => sum + item.employeeCount, 0)}</strong><span>personel</span></article><article><Store /><strong>{companies.reduce((sum, item) => sum + item.customerCount, 0)}</strong><span>müşteri</span></article></section>
    <div className="system-admin-grid"><section className="system-admin-companies"><div><h2>Firmalar</h2><button onClick={() => void load()}><RefreshCw /></button></div>{companies.map((company) => <button key={company.id} className={selectedCompanyId === company.id ? 'active' : ''} onClick={() => setSelectedCompanyId(company.id)}><span><strong>{company.legalName}</strong><small>{company.code}</small></span><em>{company.employeeCount} personel · {company.customerCount} müşteri</em></button>)}</section>
      <section className="system-admin-form"><nav><button className={mode === 'company' ? 'active' : ''} onClick={() => setMode('company')}><Building2 /> Yeni firma</button><button className={mode === 'employee' ? 'active' : ''} onClick={() => setMode('employee')} disabled={!selectedCompanyId}><UserPlus /> Personel</button><button className={mode === 'customer' ? 'active' : ''} onClick={() => setMode('customer')} disabled={!selectedCompanyId}><Store /> Müşteri</button></nav>
        {mode !== 'company' && <div className="system-admin-target">Hedef firma: <strong>{companies.find((item) => item.id === selectedCompanyId)?.legalName}</strong></div>}
        <form onSubmit={submit}><FormFields mode={mode} />{error && <div className="system-admin-message error">{error}</div>}{notice && <div className="system-admin-message success">{notice}</div>}<button className="system-admin-submit" disabled={busy || (mode !== 'company' && !selectedCompanyId)}>{busy ? <RefreshCw className="spin-icon" /> : <Plus />} Hesabı oluştur</button></form>
      </section></div>
  </main>;
}

function SystemLogin({ onLogin }: { onLogin: (session: SystemAdminSession) => void }) {
  const [error, setError] = useState<string>(); const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setBusy(true); setError(undefined); const form = new FormData(event.currentTarget); try { onLogin(await loginSystemAdmin(String(form.get('email')), String(form.get('password')))); } catch (loginError) { setError(loginError instanceof Error ? loginError.message : 'Giriş doğrulanamadı.'); } finally { setBusy(false); } };
  return <main className="system-admin-login"><form onSubmit={submit}><span><KeyRound /> YETKİLİ SİSTEM ERİŞİMİ</span><h1>Pestneer Control</h1><p>Bu alan yalnızca platform yöneticileri içindir.</p><label>E-posta<input name="email" type="email" required autoComplete="username" /></label><label>Şifre<input name="password" type="password" required autoComplete="current-password" /></label>{error && <div className="system-admin-message error">{error}</div>}<button disabled={busy}>{busy ? 'Doğrulanıyor…' : 'Güvenli giriş'}</button></form></main>;
}

function FormFields({ mode }: { mode: Mode }) {
  return <div className="system-admin-fields">{mode === 'company' && <><label>Firma adı<input name="companyName" required /></label><label>Firma kodu<input name="companyCode" required /></label></>}{mode === 'customer' && <><label>Müşteri / marka adı<input name="customerName" required /></label><label>Müşteri kodu<input name="customerCode" placeholder="Boşsa otomatik" /></label></>}<label>{mode === 'company' ? 'Firma sahibi' : mode === 'employee' ? 'Ad soyad' : 'Müşteri yetkilisi'}<input name="name" required /></label><label>E-posta<input name="email" type="email" required /></label><label>Telefon<input name="phone" /></label><label>Geçici şifre<input name="password" type="password" minLength={6} required /></label>{mode === 'employee' && <><label>Rol<select name="role"><option value="Technician">Teknisyen</option><option value="OperationsManager">Operasyon yöneticisi</option><option value="Administrator">Yönetici</option></select></label><label className="system-admin-check"><input name="canSelfSchedule" type="checkbox" /> Kendi işini planlayabilsin</label></>}{mode === 'customer' && <><label>İl<input name="city" /></label><label>İlçe<input name="district" /></label><label className="wide">Adres<input name="address" /></label><label className="wide">Google Haritalar bağlantısı<input name="mapUrl" type="url" /></label></>}</div>;
}

function loadSession() { try { const raw = window.sessionStorage.getItem(STORAGE_KEY); if (!raw) return null; const value = JSON.parse(raw) as SystemAdminSession; return new Date(value.expiresAt).getTime() > Date.now() ? value : null; } catch { return null; } }
