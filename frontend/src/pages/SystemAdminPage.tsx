import { useEffect, useState, type FormEvent } from 'react';
import {
  Building2,
  CalendarClock,
  CheckCircle2,
  Clock3,
  KeyRound,
  Lock,
  LogOut,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Store,
  UserPlus,
} from 'lucide-react';
import {
  convertCompanyToReal,
  createSystemAdmin,
  createSystemCompany,
  createSystemCustomer,
  createSystemEmployee,
  extendCompanyTrial,
  getSystemAdmins,
  getSystemCompanies,
  getSystemCompanyAccounts,
  loginSystemAdmin,
  resetSystemAccountPassword,
  setCompanyTrial,
  type SystemAccount,
  type SystemAdminSession,
  type SystemCompany,
} from '../services/systemAdminApi';

type Mode = 'company' | 'license' | 'employee' | 'customer' | 'reset' | 'admin';
const STORAGE_KEY = 'pestneer.system-control';

export default function SystemAdminPage() {
  const [session, setSession] = useState<SystemAdminSession | null>(() => loadSession());
  const [companies, setCompanies] = useState<SystemCompany[]>([]);
  const [accounts, setAccounts] = useState<SystemAccount[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [mode, setMode] = useState<Mode>('company');
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!session) return;
    try {
      const items = await getSystemCompanies(session.accessToken);
      setCompanies(items);
      setSelectedCompanyId((current) => current || items[0]?.id || '');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Firmalar yüklenemedi.');
    }
  };

  useEffect(() => {
    void load();
  }, [session?.accessToken]);

  useEffect(() => {
    if (!session || mode !== 'reset') return;
    const companyAccounts = selectedCompanyId
      ? getSystemCompanyAccounts(session.accessToken, selectedCompanyId)
      : Promise.resolve<SystemAccount[]>([]);
    Promise.all([companyAccounts, getSystemAdmins(session.accessToken)])
      .then(([companyItems, adminItems]) => setAccounts([...adminItems, ...companyItems]))
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Hesaplar yüklenemedi.'));
  }, [session?.accessToken, selectedCompanyId, mode]);

  if (!session) {
    return (
      <SystemLogin
        onLogin={(value) => {
          window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
          setSession(value);
        }}
      />
    );
  }

  const selectedCompany = companies.find((item) => item.id === selectedCompanyId);

  const handleConvertToReal = async () => {
    if (!session || !selectedCompanyId) return;
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const res = await convertCompanyToReal(session.accessToken, selectedCompanyId);
      setNotice(res.message || 'Firma gerçek hesaba dönüştürüldü.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dönüştürme başarısız oldu.');
    } finally {
      setBusy(false);
    }
  };

  const handleExtendTrial = async (days = 7) => {
    if (!session || !selectedCompanyId) return;
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const res = await extendCompanyTrial(session.accessToken, selectedCompanyId, days);
      setNotice(res.message || `Deneme süresi ${days} gün uzatıldı.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Süre uzatılamadı.');
    } finally {
      setBusy(false);
    }
  };

  const handleSetTrial = async (days = 7) => {
    if (!session || !selectedCompanyId) return;
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const res = await setCompanyTrial(session.accessToken, selectedCompanyId, days);
      setNotice(res.message || `Firma ${days} günlük deneme moduna alındı.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deneme modu ayarlanamadı.');
    } finally {
      setBusy(false);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const value = Object.fromEntries(form.entries()) as Record<string, string>;
    try {
      if (mode === 'company' && value.password !== value.passwordConfirmation) {
        throw new Error('Geçici şifreler eşleşmiyor.');
      }
      if (mode === 'company') {
        const isTrial = form.get('isTrial') === 'on';
        await createSystemCompany(session.accessToken, {
          companyName: value.companyName,
          companyCode: value.companyCode,
          ownerName: value.name,
          ownerEmail: value.email,
          ownerPassword: value.password,
          ownerPhone: value.phone,
          isTrial,
        });
      }
      if (mode === 'employee') {
        await createSystemEmployee(session.accessToken, selectedCompanyId, {
          name: value.name,
          email: value.email,
          password: value.password,
          phone: value.phone,
          role: value.role,
          canSelfSchedule: form.get('canSelfSchedule') === 'on',
        });
      }
      if (mode === 'customer') {
        await createSystemCustomer(session.accessToken, selectedCompanyId, {
          customerName: value.customerName,
          customerCode: value.customerCode,
          contactName: value.name,
          email: value.email,
          password: value.password,
          phone: value.phone,
          address: value.address,
          city: value.city,
          district: value.district,
          mapUrl: value.mapUrl,
        });
      }
      if (mode === 'admin') {
        await createSystemAdmin(session.accessToken, {
          name: value.name,
          email: value.email,
          password: value.password,
          phone: value.phone,
        });
      }
      if (mode === 'reset') {
        await resetSystemAccountPassword(session.accessToken, value.accountId, value.password, value.passwordConfirmation);
      }
      formElement.reset();
      setNotice(modeNotice(mode));
      await load();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'İşlem tamamlanamadı.');
    } finally {
      setBusy(false);
    }
  };

  const trialCount = companies.filter((c) => c.isTrial && !c.isTrialExpired).length;
  const expiredCount = companies.filter((c) => c.isTrial && c.isTrialExpired).length;
  const realCount = companies.filter((c) => !c.isTrial).length;

  return (
    <main className="system-admin-page">
      <header>
        <div>
          <span>
            <ShieldCheck /> PESTNEER SYSTEM CONTROL
          </span>
          <h1>Sistem yönetimi</h1>
          <p>Firma, lisans, deneme süreleri, personel ve müşteri hesaplarını şirket sınırları korunarak yönetin.</p>
        </div>
        <button
          onClick={() => {
            window.sessionStorage.removeItem(STORAGE_KEY);
            setSession(null);
          }}
        >
          <LogOut /> Güvenli çıkış
        </button>
      </header>

      <section className="system-admin-kpis">
        <article>
          <Building2 />
          <strong>{companies.length}</strong>
          <span>toplam firma ({realCount} tam sürüm, {trialCount} deneme, {expiredCount} süresi dolan)</span>
        </article>
        <article>
          <UserPlus />
          <strong>{companies.reduce((sum, item) => sum + item.employeeCount, 0)}</strong>
          <span>toplam personel</span>
        </article>
        <article>
          <Store />
          <strong>{companies.reduce((sum, item) => sum + item.customerCount, 0)}</strong>
          <span>toplam müşteri</span>
        </article>
      </section>

      <div className="system-admin-grid">
        <section className="system-admin-companies">
          <div>
            <h2>Kayıtlı Firmalar</h2>
            <button onClick={() => void load()} aria-label="Yenile">
              <RefreshCw />
            </button>
          </div>
          <div className="system-admin-company-list">
            {companies.map((company) => {
              const isSelected = selectedCompanyId === company.id;
              return (
                <button
                  key={company.id}
                  className={`system-admin-company-item ${isSelected ? 'active' : ''}`}
                  onClick={() => setSelectedCompanyId(company.id)}
                >
                  <div className="system-admin-company-header">
                    <strong>{company.legalName}</strong>
                    <small>{company.code}</small>
                  </div>
                  <div className="system-admin-company-badge-row">
                    {!company.isTrial ? (
                      <span className="trial-badge real">
                        <CheckCircle2 size={12} /> Tam Sürüm
                      </span>
                    ) : company.isTrialExpired ? (
                      <span className="trial-badge expired">
                        <Lock size={12} /> Deneme Bitti (Kapalı)
                      </span>
                    ) : (
                      <span className="trial-badge active">
                        <Clock3 size={12} /> Deneme ({company.remainingDays} gün kaldı)
                      </span>
                    )}
                  </div>
                  <em>
                    {company.employeeCount} personel · {company.customerCount} müşteri
                  </em>
                </button>
              );
            })}
          </div>
        </section>

        <section className="system-admin-form">
          <nav className="system-admin-nav-tabs">
            <button className={mode === 'company' ? 'active' : ''} onClick={() => setMode('company')}>
              <Building2 size={16} /> Yeni firma
            </button>
            <button className={mode === 'license' ? 'active' : ''} onClick={() => setMode('license')} disabled={!selectedCompanyId}>
              <CalendarClock size={16} /> Lisans & Deneme
            </button>
            <button className={mode === 'employee' ? 'active' : ''} onClick={() => setMode('employee')} disabled={!selectedCompanyId}>
              <UserPlus size={16} /> Personel
            </button>
            <button className={mode === 'customer' ? 'active' : ''} onClick={() => setMode('customer')} disabled={!selectedCompanyId}>
              <Store size={16} /> Müşteri
            </button>
            <button className={mode === 'reset' ? 'active' : ''} onClick={() => setMode('reset')} disabled={!selectedCompanyId}>
              <KeyRound size={16} /> Şifre sıfırla
            </button>
            <button className={mode === 'admin' ? 'active' : ''} onClick={() => setMode('admin')}>
              <ShieldCheck size={16} /> Sistem admini
            </button>
          </nav>

          {mode === 'company' && (
            <div className="system-admin-target">
              Firma oluşturulurken aynı anda firma sahibi giriş hesabı açılır. 1 haftalık deneme veya tam sürüm lisansı belirlenebilir.
            </div>
          )}

          {mode === 'license' && selectedCompany && (
            <div className="system-admin-license-panel">
              <div className="license-card">
                <div className="license-header">
                  <div>
                    <h3>{selectedCompany.legalName}</h3>
                    <p>Firma Kodu: <strong>{selectedCompany.code}</strong></p>
                  </div>
                  {!selectedCompany.isTrial ? (
                    <span className="license-status-tag tag-real">
                      <Sparkles size={14} /> Tam Sürüm (Süresiz Gerçek Hesap)
                    </span>
                  ) : selectedCompany.isTrialExpired ? (
                    <span className="license-status-tag tag-expired">
                      <ShieldAlert size={14} /> Deneme Süresi Doldu (Giriş Engellendi)
                    </span>
                  ) : (
                    <span className="license-status-tag tag-trial">
                      <Clock3 size={14} /> 1 Haftalık Deneme ({selectedCompany.remainingDays} Gün Kaldı)
                    </span>
                  )}
                </div>

                <div className="license-info-grid">
                  <div>
                    <label>Hesap Tipi</label>
                    <strong>{selectedCompany.isTrial ? '1 Haftalık Demo / Deneme' : 'Gerçek Hesap (Süresiz)'}</strong>
                  </div>
                  <div>
                    <label>Erişim Durumu</label>
                    <strong style={{ color: selectedCompany.isTrial && selectedCompany.isTrialExpired ? '#ff6b6b' : '#34d399' }}>
                      {selectedCompany.isTrial && selectedCompany.isTrialExpired ? 'Erişim Kilitli (Giriş Yapılamaz)' : 'Aktif (Giriş Açık)'}
                    </strong>
                  </div>
                  {selectedCompany.isTrial && (
                    <>
                      <div>
                        <label>Deneme Bitiş Tarihi</label>
                        <strong>
                          {selectedCompany.trialEndsAt
                            ? new Date(selectedCompany.trialEndsAt).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                            : 'Belirtilmemiş'}
                        </strong>
                      </div>
                      <div>
                        <label>Kalan Süre</label>
                        <strong>{selectedCompany.isTrialExpired ? '0 gün (Süre doldu)' : `${selectedCompany.remainingDays} gün`}</strong>
                      </div>
                    </>
                  )}
                </div>

                <div className="license-retention-notice">
                  <ShieldCheck size={18} />
                  <span>
                    <strong>Sıfır Veri Kaybı Güvencesi:</strong> Deneme süresi dolsa dahi firmanın müşterileri, şubeleri, formları ve tüm geçmiş raporları sistemde kalıcı olarak korunur. Gerçek hesaba dönüştürüldüğünde tüm erişim anında açılır.
                  </span>
                </div>

                <div className="license-action-buttons">
                  <button
                    type="button"
                    className="license-btn-real"
                    onClick={handleConvertToReal}
                    disabled={busy || !selectedCompany.isTrial}
                  >
                    <Sparkles size={16} /> Gerçek Hesaba Dönüştür (Süresiz Tam Sürüm)
                  </button>

                  <button
                    type="button"
                    className="license-btn-extend"
                    onClick={() => handleExtendTrial(7)}
                    disabled={busy}
                  >
                    <Clock3 size={16} /> Deneme Süresini Uzat (+7 Gün)
                  </button>

                  {!selectedCompany.isTrial && (
                    <button
                      type="button"
                      className="license-btn-trial"
                      onClick={() => handleSetTrial(7)}
                      disabled={busy}
                    >
                      <RefreshCw size={16} /> 7 Günlük Deneme Moduna Al
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {(mode === 'employee' || mode === 'customer') && (
            <div className="system-admin-target">
              Hedef firma: <strong>{companies.find((item) => item.id === selectedCompanyId)?.legalName}</strong>
            </div>
          )}
          {mode === 'reset' && (
            <div className="system-admin-target">
              Firma hesapları ve Pestneer sistem yöneticileri listelenir. Firma sahipleri sistem yöneticisi değildir.
            </div>
          )}

          {mode !== 'license' && (
            <form onSubmit={submit}>
              <FormFields mode={mode} accounts={accounts} />
              {error && <div className="system-admin-message error">{error}</div>}
              {notice && <div className="system-admin-message success">{notice}</div>}
              <button
                className="system-admin-submit"
                disabled={busy || ((mode === 'employee' || mode === 'customer' || mode === 'reset') && !selectedCompanyId)}
              >
                {busy ? <RefreshCw className="spin-icon" /> : mode === 'reset' ? <KeyRound /> : <Plus />}{' '}
                {mode === 'reset' ? 'Geçici şifre ata' : 'Hesabı oluştur'}
              </button>
            </form>
          )}

          {mode === 'license' && (
            <>
              {error && <div className="system-admin-message error">{error}</div>}
              {notice && <div className="system-admin-message success">{notice}</div>}
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function SystemLogin({ onLogin }: { onLogin: (session: SystemAdminSession) => void }) {
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    const form = new FormData(event.currentTarget);
    try {
      onLogin(await loginSystemAdmin(String(form.get('email')), String(form.get('password'))));
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Giriş doğrulanamadı.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="system-admin-login">
      <form onSubmit={submit}>
        <span>
          <KeyRound /> YETKİLİ SİSTEM ERİŞİMİ
        </span>
        <h1>Pestneer Control</h1>
        <p>Bu alan yalnızca Pestneer platform yöneticileri içindir.</p>
        <label>
          E-posta
          <input name="email" type="email" required autoComplete="username" />
        </label>
        <label>
          Şifre
          <input name="password" type="password" required autoComplete="current-password" />
        </label>
        {error && <div className="system-admin-message error">{error}</div>}
        <button disabled={busy}>{busy ? 'Doğrulanıyor…' : 'Güvenli giriş'}</button>
      </form>
    </main>
  );
}

function FormFields({ mode, accounts }: { mode: Mode; accounts: SystemAccount[] }) {
  if (mode === 'reset') {
    return (
      <div className="system-admin-fields">
        <label className="wide">
          Hesap
          <select name="accountId" required>
            <option value="">Hesap seçin</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name} · {portalLabel(account.portal)} · {account.email}
              </option>
            ))}
          </select>
        </label>
        <label>
          Yeni geçici şifre
          <input name="password" type="password" minLength={8} required />
        </label>
        <label>
          Geçici şifre tekrarı
          <input name="passwordConfirmation" type="password" minLength={8} required />
        </label>
      </div>
    );
  }

  return (
    <div className="system-admin-fields">
      {mode === 'company' && (
        <>
          <label>
            Firma adı
            <input name="companyName" placeholder="Örn: BioPest İlaçlama Ltd." required />
          </label>
          <label>
            Firma kodu
            <input name="companyCode" placeholder="Örn: BIOPEST" required />
          </label>
          <label className="wide system-admin-check" style={{ padding: '8px 12px', background: '#0e2b44', borderRadius: '10px', marginTop: '4px' }}>
            <input name="isTrial" type="checkbox" defaultChecked />
            <span>
              <strong>1 Hafta Deneme Hesabı (Demo)</strong> — 7 gün sonra giriş kilitlenir, veriler asla silinmez.
            </span>
          </label>
        </>
      )}
      {mode === 'customer' && (
        <>
          <label>
            Müşteri / marka adı
            <input name="customerName" required />
          </label>
          <label>
            Müşteri kodu
            <input name="customerCode" placeholder="Boşsa otomatik" />
          </label>
        </>
      )}
      <label>
        {mode === 'company'
          ? 'Firma sahibi adı soyadı'
          : mode === 'employee'
          ? 'Ad soyad'
          : mode === 'admin'
          ? 'Sistem yöneticisi'
          : 'Müşteri yetkilisi'}
        <input name="name" required />
      </label>
      <label>
        {mode === 'company' ? 'Firma sahibi giriş e-postası' : 'E-posta'}
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <label>
        Telefon
        <input name="phone" />
      </label>
      <label>
        Geçici şifre
        <input name="password" type="password" minLength={8} autoComplete="new-password" required />
      </label>
      {mode === 'company' && (
        <label>
          Geçici şifre tekrarı
          <input name="passwordConfirmation" type="password" minLength={8} autoComplete="new-password" required />
        </label>
      )}
      {mode === 'employee' && (
        <>
          <label>
            Rol
            <select name="role">
              <option value="Technician">Teknisyen</option>
              <option value="OperationsManager">Operasyon yöneticisi</option>
              <option value="Administrator">Yönetici</option>
            </select>
          </label>
          <label className="system-admin-check">
            <input name="canSelfSchedule" type="checkbox" /> Kendi işini planlayabilsin
          </label>
        </>
      )}
      {mode === 'customer' && (
        <>
          <label>
            İl
            <input name="city" />
          </label>
          <label>
            İlçe
            <input name="district" />
          </label>
          <label className="wide">
            Adres
            <input name="address" />
          </label>
          <label className="wide">
            Google Haritalar bağlantısı
            <input name="mapUrl" type="url" />
          </label>
        </>
      )}
    </div>
  );
}

function modeNotice(mode: Mode) {
  return ({
    company: 'Firma ve firma sahibi oluşturuldu.',
    license: 'Lisans durumu güncellendi.',
    employee: 'Personel hesabı oluşturuldu.',
    customer: 'Müşteri ve portal hesabı oluşturuldu.',
    admin: 'Sistem yöneticisi oluşturuldu.',
    reset: 'Hesaba geçici şifre atandı.',
  } as const)[mode];
}

function portalLabel(portal: SystemAccount['portal']) {
  return ({ Owner: 'Firma sahibi', Employee: 'Personel', Customer: 'Müşteri', SystemAdmin: 'Sistem admini' } as const)[portal];
}

function loadSession() {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as SystemAdminSession;
    return new Date(value.expiresAt).getTime() > Date.now() ? value : null;
  } catch {
    return null;
  }
}
