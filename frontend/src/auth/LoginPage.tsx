import { FormEvent, useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  ArrowLeft,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  Mail,
  Phone,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Store,
  UserRound,
  UserRoundCheck,
} from 'lucide-react';
import { login, registerDemo } from '../services/authApi';
import type { AuthenticatedSession, PortalType } from './types';

type RoleOption = {
  id: PortalType;
  label: string;
  shortLabel: string;
  description: string;
  icon: LucideIcon;
  email: string;
  userName: string;
  companyName: string;
  role: string;
};

const roleOptions: RoleOption[] = [
  {
    id: 'owner',
    label: 'Firma sahibi girişi',
    shortLabel: 'Firma sahibi',
    description: 'Yönetim, ekip, finans ve tüm operasyonlar',
    icon: Building2,
    email: 'onur@demo.pestneer.app',
    userName: 'Onur Er',
    companyName: 'Tura Çevre Sağlığı',
    role: 'Firma Sahibi',
  },
  {
    id: 'employee',
    label: 'Firma çalışanı girişi',
    shortLabel: 'Firma çalışanı',
    description: 'Atamalar, saha formları ve günlük işler',
    icon: UserRoundCheck,
    email: 'ali@demo.pestneer.app',
    userName: 'Ali Özkaya',
    companyName: 'Tura Çevre Sağlığı',
    role: 'Saha Uygulayıcısı',
  },
  {
    id: 'customer',
    label: 'Müşteri girişi',
    shortLabel: 'Müşteri',
    description: 'Şubeler, hizmet raporları ve talepler',
    icon: Store,
    email: 'operasyon@arabica.demo',
    userName: 'Deniz Kaya',
    companyName: 'Tura Çevre Sağlığı',
    role: 'Müşteri Yöneticisi',
  },
];

const REMEMBER_LOGIN_KEY = 'pestneer.remember_login';

type SavedLogin = {
  portal?: PortalType;
  companyCode?: string;
  email?: string;
  rememberMe?: boolean;
};

function getSavedLogin(): SavedLogin | null {
  try {
    const raw = localStorage.getItem(REMEMBER_LOGIN_KEY) || localStorage.getItem('pesneer.remember_login');
    if (!raw) return null;
    return JSON.parse(raw) as SavedLogin;
  } catch {
    return null;
  }
}

export default function LoginPage({
  onAuthenticated,
  onBack,
  initialMode = 'login',
}: {
  onAuthenticated: (session: AuthenticatedSession, rememberMe?: boolean) => void;
  onBack?: () => void;
  initialMode?: 'login' | 'demo';
}) {
  const saved = useMemo(() => getSavedLogin(), []);
  const [viewMode, setViewMode] = useState<'login' | 'demo'>(initialMode);
  
  // Login State
  const [portal, setPortal] = useState<PortalType>(saved?.portal ?? 'owner');
  const [companyCode, setCompanyCode] = useState(saved?.companyCode ?? 'TURA-ANKARA');
  const [email, setEmail] = useState(saved?.email ?? '');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(saved?.rememberMe ?? true);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isTrialExpired, setIsTrialExpired] = useState(false);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  // Demo Register State
  const [demoCompanyName, setDemoCompanyName] = useState('');
  const [demoFullName, setDemoFullName] = useState('');
  const [demoEmail, setDemoEmail] = useState('');
  const [demoPhone, setDemoPhone] = useState('');
  const [demoPassword, setDemoPassword] = useState('');
  const [showDemoPassword, setShowDemoPassword] = useState(false);
  const [isDemoLoading, setIsDemoLoading] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);

  const selectedRole = useMemo(() => roleOptions.find((option) => option.id === portal)!, [portal]);

  const saveRememberChoice = () => {
    if (rememberMe) {
      try {
        localStorage.setItem(
          REMEMBER_LOGIN_KEY,
          JSON.stringify({ portal, companyCode, email, rememberMe: true })
        );
      } catch {
        // ignore
      }
    } else {
      try {
        localStorage.removeItem(REMEMBER_LOGIN_KEY);
        localStorage.removeItem('pesneer.remember_login');
      } catch {
        // ignore
      }
    }
  };

  const submitLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsTrialExpired(false);
    setInfoMessage(null);
    setIsLoading(true);
    try {
      const session = await login(portal, { companyCode, email, password });
      saveRememberChoice();
      onAuthenticated(session, rememberMe);
    } catch (requestError) {
      const msg = requestError instanceof Error ? requestError.message : 'Giriş sırasında bir hata oluştu.';
      setError(msg);
      if (msg.includes('deneme') || msg.includes('süresi sona')) {
        setIsTrialExpired(true);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const submitDemo = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setDemoError(null);
    setIsDemoLoading(true);
    try {
      const session = await registerDemo({
        companyName: demoCompanyName,
        fullName: demoFullName,
        email: demoEmail,
        phone: demoPhone,
        password: demoPassword,
      });
      try {
        localStorage.setItem(
          REMEMBER_LOGIN_KEY,
          JSON.stringify({ portal: 'owner', companyCode: session.company.code, email: demoEmail, rememberMe: true })
        );
      } catch {
        // ignore
      }
      onAuthenticated(session, true);
    } catch (requestError) {
      setDemoError(requestError instanceof Error ? requestError.message : 'Demo hesabı oluşturulamadı.');
    } finally {
      setIsDemoLoading(false);
    }
  };

  return (
    <main className="login-page">
      {onBack && (
        <button type="button" className="login-return" onClick={onBack}>
          <ArrowLeft size={16} /> Tanıtıma dön
        </button>
      )}
      <section className="login-story">
        <div className="login-brand">
          <span className="auth-logo-shell">
            <img src="/pesneer-mark.jpeg" alt="Pestneer" />
          </span>
          <div>
            <strong>Pestneer</strong>
            <small>PEST KONTROL YÖNETİM SİSTEMİ</small>
          </div>
        </div>
        <div className="story-copy">
          <p className="story-kicker">OPERASYONUNUZUN GÜVENLİ MERKEZİ</p>
          <h1>
            Her rol için doğru ekran.<br />
            <em>Her firma için ayrı veri.</em>
          </h1>
          <p>
            İş planından stok ve müşteri raporlarına kadar tüm pest kontrol süreçlerini tek, güvenli yapıda yönetin.
          </p>
        </div>
        <div className="trust-list">
          <div>
            <ShieldCheck size={19} />
            <span>
              <strong>Firma bazlı kesin izolasyon</strong>
              <small>Bir firmanın verisine başka firma erişemez.</small>
            </span>
          </div>
          <div>
            <KeyRound size={19} />
            <span>
              <strong>Rol bazlı yetkilendirme</strong>
              <small>Sahip, çalışan ve müşteri yalnızca ihtiyacı olanı görür.</small>
            </span>
          </div>
          <div>
            <CheckCircle2 size={19} />
            <span>
              <strong>Denetlenebilir işlem geçmişi</strong>
              <small>Kritik işlemler kullanıcı ve zaman bilgisiyle kaydedilir.</small>
            </span>
          </div>
        </div>
        <div className="security-note">
          <LockKeyhole size={16} />
          <span>KVKK odaklı mimari · Şifreli oturum · Güvenli belge erişimi</span>
        </div>
        <div className="story-orb story-orb-one" />
        <div className="story-orb story-orb-two" />
      </section>

      <section className="login-panel">
        <div className="login-card">
          <div className="mobile-login-brand">
            <span className="auth-logo-shell">
              <img src="/pesneer-mark.jpeg" alt="Pestneer" />
            </span>
            <strong>Pestneer</strong>
          </div>

          {/* Ana Mod Seçici (Giriş Yap / Demo Hesap Aç) */}
          <div className="auth-main-tabs">
            <button
              type="button"
              className={viewMode === 'login' ? 'active' : ''}
              onClick={() => {
                setViewMode('login');
                setError(null);
              }}
            >
              <KeyRound size={16} />
              Giriş Yap
            </button>
            <button
              type="button"
              className={viewMode === 'demo' ? 'active' : ''}
              onClick={() => {
                setViewMode('demo');
                setDemoError(null);
              }}
            >
              <Sparkles size={16} />
              Demo Hesap Aç (1 Hafta)
            </button>
          </div>

          {viewMode === 'login' ? (
            <>
              <header>
                <span className="secure-chip">
                  <ShieldCheck size={14} /> Güvenli giriş
                </span>
                <h2>Hesabınıza giriş yapın</h2>
                <p>Devam etmek için kullanacağınız hesabı seçin.</p>
              </header>

              <div className="portal-selector" role="tablist" aria-label="Giriş türü">
                {roleOptions.map((option) => {
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="tab"
                      aria-selected={portal === option.id}
                      className={portal === option.id ? 'selected' : ''}
                      onClick={() => {
                        setPortal(option.id);
                        setError(null);
                        setIsTrialExpired(false);
                      }}
                    >
                      <span>
                        <Icon size={18} />
                      </span>
                      <strong>{option.shortLabel}</strong>
                      <small>{option.description}</small>
                      {portal === option.id && (
                        <i>
                          <CheckCircle2 size={14} />
                        </i>
                      )}
                    </button>
                  );
                })}
              </div>

              <form className="login-form" onSubmit={submitLogin}>
                <label>
                  {portal === 'customer' ? 'Hizmet sağlayıcı firma kodu' : 'Firma kodu'}
                  <span className="login-input">
                    <Building2 size={18} />
                    <input
                      value={companyCode}
                      onChange={(event) => setCompanyCode(event.target.value)}
                      autoComplete="organization"
                      placeholder="Örn: TURA-ANKARA"
                      required
                    />
                  </span>
                </label>
                <label>
                  E-posta adresi
                  <span className="login-input">
                    <UserRoundCheck size={18} />
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder={selectedRole.email}
                      autoComplete="email"
                      required
                    />
                  </span>
                </label>
                <label>
                  <span className="password-label">
                    <span>Şifre</span>
                  </span>
                  <span className="login-input">
                    <LockKeyhole size={18} />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="Şifrenizi girin"
                      autoComplete="current-password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                      aria-label={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </span>
                </label>

                <div className="login-form-options">
                  <label className="remember-me-label">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(event) => setRememberMe(event.target.checked)}
                    />
                    <span>Beni hatırla</span>
                  </label>
                  <button
                    type="button"
                    className="forgot-password-link"
                    onClick={() =>
                      setInfoMessage('Şifre sıfırlama için lütfen sistem yöneticiniz veya firma yetkiliniz ile iletişime geçin.')
                    }
                  >
                    Şifremi unuttum
                  </button>
                </div>

                {infoMessage && (
                  <div
                    className="toast"
                    style={{
                      position: 'static',
                      margin: '4px 0',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      background: '#eff6ff',
                      border: '1px solid #bfdbfe',
                      color: '#1d4ed8',
                      fontSize: '11px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <CheckCircle2 size={15} />
                    <span>{infoMessage}</span>
                  </div>
                )}

                {error && (
                  <div className={`login-error ${isTrialExpired ? 'login-trial-expired-box' : ''}`} role="alert">
                    {isTrialExpired && <ShieldAlert size={18} style={{ flexShrink: 0, marginTop: '1px' }} />}
                    <div>
                      <strong>{isTrialExpired ? 'Deneme Süresi Doldu' : 'Giriş Başarısız'}</strong>
                      <p style={{ margin: '4px 0 0', lineHeight: 1.45 }}>{error}</p>
                    </div>
                  </div>
                )}

                <button className="login-submit" type="submit" disabled={isLoading}>
                  {isLoading ? 'Kontrol ediliyor…' : selectedRole.label}
                  <ArrowRight size={18} />
                </button>
              </form>

              {/* Alt Geçiş Butonu */}
              <div className="login-demo-switch-card">
                <div>
                  <strong>Pestneer'ı ücretsiz denemek mi istiyorsunuz?</strong>
                  <p>Firma sahibi hesabı ile 7 gün boyunca tüm özellikleri test edin.</p>
                </div>
                <button
                  type="button"
                  className="demo-switch-btn"
                  onClick={() => {
                    setViewMode('demo');
                    setDemoError(null);
                  }}
                >
                  <Sparkles size={15} /> 1 Hafta Demo Aç
                </button>
              </div>
            </>
          ) : (
            <>
              {/* 1 HAFTA DEMO HESAP AÇ FORMU */}
              <header>
                <span className="secure-chip demo-chip">
                  <Sparkles size={14} /> 1 Haftalık Ücretsiz Deneme (Demo)
                </span>
                <h2>Firma Sahibi Demo Hesabı Aç</h2>
                <p>7 gün boyunca tüm operasyon, saha ve denetim modüllerini anında ücretsiz deneyin.</p>
              </header>

              <div className="demo-highlights-banner">
                <div><CheckCircle2 size={15} /> <span><strong>7 Gün</strong> Sınırsız Erişim</span></div>
                <div><CheckCircle2 size={15} /> <span><strong>Sıfır</strong> Veri Kaybı</span></div>
                <div><CheckCircle2 size={15} /> <span>Kredi Kartı <strong>İstenmez</strong></span></div>
              </div>

              <form className="login-form demo-form" onSubmit={submitDemo}>
                <label>
                  Firma Adı
                  <span className="login-input">
                    <Building2 size={18} />
                    <input
                      value={demoCompanyName}
                      onChange={(event) => setDemoCompanyName(event.target.value)}
                      placeholder="Örn: BioPest Çevre Sağlığı Ltd."
                      required
                    />
                  </span>
                </label>

                <label>
                  Firma Sahibi Adı Soyadı
                  <span className="login-input">
                    <UserRound size={18} />
                    <input
                      value={demoFullName}
                      onChange={(event) => setDemoFullName(event.target.value)}
                      placeholder="Örn: Ahmet Yılmaz"
                      required
                    />
                  </span>
                </label>

                <div className="demo-input-grid">
                  <label>
                    Giriş E-postası
                    <span className="login-input">
                      <Mail size={18} />
                      <input
                        type="email"
                        value={demoEmail}
                        onChange={(event) => setDemoEmail(event.target.value)}
                        placeholder="ahmet@biopest.com"
                        autoComplete="email"
                        required
                      />
                    </span>
                  </label>

                  <label>
                    Telefon Numarası
                    <span className="login-input">
                      <Phone size={18} />
                      <input
                        type="tel"
                        value={demoPhone}
                        onChange={(event) => setDemoPhone(event.target.value)}
                        placeholder="0555 123 45 67"
                        autoComplete="tel"
                        required
                      />
                    </span>
                  </label>
                </div>

                <label>
                  <span className="password-label">
                    <span>Giriş Şifresi</span>
                  </span>
                  <span className="login-input">
                    <LockKeyhole size={18} />
                    <input
                      type={showDemoPassword ? 'text' : 'password'}
                      value={demoPassword}
                      onChange={(event) => setDemoPassword(event.target.value)}
                      placeholder="En az 6 karakterli şifre belirleyin"
                      autoComplete="new-password"
                      minLength={6}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowDemoPassword((current) => !current)}
                      aria-label={showDemoPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
                    >
                      {showDemoPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </span>
                </label>

                {demoError && (
                  <div className="login-error" role="alert">
                    {demoError}
                  </div>
                )}

                <button className="login-submit demo-submit-btn" type="submit" disabled={isDemoLoading}>
                  {isDemoLoading ? (
                    'Demo hesabınız hazırlanıyor…'
                  ) : (
                    <>
                      <Sparkles size={18} /> 1 Haftalık Demo Hesabımı Başlat
                      <ArrowRight size={18} />
                    </>
                  )}
                </button>
              </form>

              <div className="login-demo-switch-card">
                <div>
                  <strong>Zaten kayıtlı bir hesabınız var mı?</strong>
                  <p>Mevcut firma sahibi, çalışan veya müşteri hesabınızla giriş yapın.</p>
                </div>
                <button
                  type="button"
                  className="demo-switch-btn"
                  onClick={() => {
                    setViewMode('login');
                    setError(null);
                  }}
                >
                  <KeyRound size={15} /> Giriş Yap
                </button>
              </div>
            </>
          )}
        </div>
        <footer>
          © 2026 Pestneer <span>Gizlilik</span><span>Kullanım koşulları</span><span>Destek</span>
        </footer>
      </section>
    </main>
  );
}
