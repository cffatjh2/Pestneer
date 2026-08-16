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
  ShieldCheck,
  Store,
  UserRoundCheck,
} from 'lucide-react';
import { login } from '../services/authApi';
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
    email: 'onur@demo.pesneer.app',
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
    email: 'ali@demo.pesneer.app',
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

function createDemoSession(option: RoleOption): AuthenticatedSession {
  return {
    accessToken: 'demo-session',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    portal: option.id,
    company: {
      id: '66cf3f60-eef7-4e6d-afb9-2a8cfe271104',
      name: option.companyName,
      code: 'TURA-ANKARA',
    },
    user: {
      id: `demo-${option.id}`,
      name: option.userName,
      email: option.email,
      role: option.role,
    },
    customerId: option.id === 'customer' ? 'arabica-holding' : undefined,
  };
}

const REMEMBER_LOGIN_KEY = 'pesneer.remember_login';

type SavedLogin = {
  portal?: PortalType;
  companyCode?: string;
  email?: string;
  rememberMe?: boolean;
};

function getSavedLogin(): SavedLogin | null {
  try {
    const raw = localStorage.getItem(REMEMBER_LOGIN_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SavedLogin;
  } catch {
    return null;
  }
}

export default function LoginPage({ onAuthenticated, onBack }: { onAuthenticated: (session: AuthenticatedSession, rememberMe?: boolean) => void; onBack?: () => void }) {
  const saved = useMemo(() => getSavedLogin(), []);
  const [portal, setPortal] = useState<PortalType>(saved?.portal ?? 'owner');
  const [companyCode, setCompanyCode] = useState(saved?.companyCode ?? 'TURA-ANKARA');
  const [email, setEmail] = useState(saved?.email ?? '');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(saved?.rememberMe ?? true);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const selectedRole = useMemo(() => roleOptions.find((option) => option.id === portal)!, [portal]);
  const SelectedRoleIcon = selectedRole.icon;

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
      } catch {
        // ignore
      }
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setInfoMessage(null);
    setIsLoading(true);
    try {
      const session = await login(portal, { companyCode, email, password });
      saveRememberChoice();
      onAuthenticated(session, rememberMe);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Giriş sırasında bir hata oluştu.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoLogin = () => {
    saveRememberChoice();
    onAuthenticated(createDemoSession(selectedRole), rememberMe);
  };

  return (
    <main className="login-page">
      {onBack && <button type="button" className="login-return" onClick={onBack}><ArrowLeft size={16} /> Tanıtıma dön</button>}
      <section className="login-story">
        <div className="login-brand"><span className="auth-logo-shell"><img src="/pesneer-mark.jpeg" alt="" /></span><div><strong>pesneer</strong><small>PEST KONTROL YÖNETİM SİSTEMİ</small></div></div>
        <div className="story-copy"><p className="story-kicker">OPERASYONUNUZUN GÜVENLİ MERKEZİ</p><h1>Her rol için doğru ekran.<br /><em>Her firma için ayrı veri.</em></h1><p>İş planından stok ve müşteri raporlarına kadar tüm pest kontrol süreçlerini tek, güvenli yapıda yönetin.</p></div>
        <div className="trust-list">
          <div><ShieldCheck size={19} /><span><strong>Firma bazlı kesin izolasyon</strong><small>Bir firmanın verisine başka firma erişemez.</small></span></div>
          <div><KeyRound size={19} /><span><strong>Rol bazlı yetkilendirme</strong><small>Sahip, çalışan ve müşteri yalnızca ihtiyacı olanı görür.</small></span></div>
          <div><CheckCircle2 size={19} /><span><strong>Denetlenebilir işlem geçmişi</strong><small>Kritik işlemler kullanıcı ve zaman bilgisiyle kaydedilir.</small></span></div>
        </div>
        <div className="security-note"><LockKeyhole size={16} /><span>KVKK odaklı mimari · Şifreli oturum · Güvenli belge erişimi</span></div>
        <div className="story-orb story-orb-one" /><div className="story-orb story-orb-two" />
      </section>

      <section className="login-panel">
        <div className="login-card">
          <div className="mobile-login-brand"><span className="auth-logo-shell"><img src="/pesneer-mark.jpeg" alt="" /></span><strong>pesneer</strong></div>
          <header><span className="secure-chip"><ShieldCheck size={14} />Güvenli giriş</span><h2>Hesabınıza giriş yapın</h2><p>Devam etmek için kullanacağınız hesabı seçin.</p></header>
          <div className="portal-selector" role="tablist" aria-label="Giriş türü">
            {roleOptions.map((option) => {
              const Icon = option.icon;
              return <button key={option.id} type="button" role="tab" aria-selected={portal === option.id} className={portal === option.id ? 'selected' : ''} onClick={() => { setPortal(option.id); setError(null); }}><span><Icon size={18} /></span><strong>{option.shortLabel}</strong><small>{option.description}</small>{portal === option.id && <i><CheckCircle2 size={14} /></i>}</button>;
            })}
          </div>
          <form className="login-form" onSubmit={submit}>
            <label>{portal === 'customer' ? 'Hizmet sağlayıcı firma kodu' : 'Firma kodu'}<span className="login-input"><Building2 size={18} /><input value={companyCode} onChange={(event) => setCompanyCode(event.target.value)} autoComplete="organization" required /></span></label>
            <label>E-posta adresi<span className="login-input"><UserRoundCheck size={18} /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={selectedRole.email} autoComplete="email" required /></span></label>
            <label><span className="password-label"><span>Şifre</span></span><span className="login-input"><LockKeyhole size={18} /><input type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Şifrenizi girin" autoComplete="current-password" required /><button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></label>

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
                onClick={() => setInfoMessage('Şifre sıfırlama için lütfen sistem yöneticiniz veya firma yetkiliniz ile iletişime geçin.')}
              >
                Şifremi unuttum
              </button>
            </div>

            {infoMessage && <div className="toast" style={{ position: 'static', margin: '4px 0', padding: '10px 12px', borderRadius: '8px', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '8px' }}><CheckCircle2 size={15} /><span>{infoMessage}</span></div>}
            {error && <div className="login-error" role="alert">{error}</div>}
            <button className="login-submit" type="submit" disabled={isLoading}>{isLoading ? 'Kontrol ediliyor…' : selectedRole.label}<ArrowRight size={18} /></button>
          </form>
          <div className="demo-access"><span><i /> veya hızlı önizleme <i /></span><button type="button" onClick={handleDemoLogin}><SelectedRoleIcon size={17} />{selectedRole.shortLabel} demosunu aç</button><small>Demo, gerçek hesap verisi içermez.</small></div>
        </div>
        <footer>© 2026 Pestneer <span>Gizlilik</span><span>Kullanım koşulları</span><span>Destek</span></footer>
      </section>
    </main>
  );
}

