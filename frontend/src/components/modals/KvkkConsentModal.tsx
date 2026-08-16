import { useState } from 'react';
import { ShieldCheck, Scale, FileText, Lock, AlertCircle, LogOut, CheckCircle2, Building2, User, Clock } from 'lucide-react';
import type { AuthenticatedSession } from '../../auth/types';
import { acceptTerms } from '../../services/termsApi';
import './kvkkConsentModal.css';

type LegalTab = 'kvkk' | 'terms' | 'privacy';

interface KvkkConsentModalProps {
  session: AuthenticatedSession;
  onAccepted: (updatedSession: AuthenticatedSession) => void;
  onLogout: () => void;
}

export default function KvkkConsentModal({ session, onAccepted, onLogout }: { session: AuthenticatedSession; onAccepted: (s: AuthenticatedSession) => void; onLogout: () => void }) {
  const [activeTab, setActiveTab] = useState<LegalTab>('kvkk');
  const [kvkkConsent, setKvkkConsent] = useState(false);
  const [termsConsent, setTermsConsent] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = kvkkConsent && termsConsent && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    try {
      // 1. Call Backend API to register legal acceptance with timestamp & IP
      try {
        await acceptTerms(session.accessToken, '2026.1', marketingConsent);
      } catch (apiErr) {
        console.warn('Backend terms registration warning:', apiErr);
      }

      // 2. Mark accepted in local storage permanently for this user
      const userKey = `pestneer_terms_accepted_${session.user.id}`;
      localStorage.setItem(userKey, new Date().toISOString());

      // 3. Update session object
      const updatedSession: AuthenticatedSession = {
        ...session,
        user: {
          ...session.user,
          hasAcceptedTerms: true,
          termsAcceptedAt: new Date().toISOString(),
        },
      };

      // 4. Update session storage & local storage
      window.sessionStorage.setItem('pesneer.session', JSON.stringify(updatedSession));
      if (window.localStorage.getItem('pesneer.session')) {
        window.localStorage.setItem('pesneer.session', JSON.stringify(updatedSession));
      }

      onAccepted(updatedSession);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Onay kaydedilirken bir hata oluştu. Lütfen tekrar deneyin.');
    } finally {
      setSubmitting(false);
    }
  };

  const currentDate = new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  return (
    <div className="kvkk-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="kvkk-title">
      <div className="kvkk-modal-card">
        {/* Header */}
        <header className="kvkk-modal-header">
          <div className="kvkk-badge-row">
            <span className="kvkk-security-badge">
              <ShieldCheck size={14} /> Pestneer Güvenlik & Uyum Merkezi
            </span>
            <span className="kvkk-mandatory-pill">
              <Lock size={12} /> İlk Giriş Zorunlu Onay
            </span>
          </div>
          <h2 id="kvkk-title">
            <Scale size={22} className="text-sky-400" />
            Mevzuat & KVKK Aydınlatma Onayı
          </h2>
          <p>
            6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) ve Sağlık Bakanlığı Biyosidal Ürünler Yönetmeliği standartları uyarınca sistem erişimi öncesinde yasal aydınlatma ve kullanıcı taahhütlerinin onaylanması gerekmektedir.
          </p>
        </header>

        {/* Tab Navigation */}
        <nav className="kvkk-tabs" aria-label="Yasal Metin Sekmeleri">
          <button
            type="button"
            className={`kvkk-tab-button ${activeTab === 'kvkk' ? 'active' : ''}`}
            onClick={() => setActiveTab('kvkk')}
          >
            <FileText size={16} /> 1. KVKK Aydınlatma Metni
          </button>
          <button
            type="button"
            className={`kvkk-tab-button ${activeTab === 'terms' ? 'active' : ''}`}
            onClick={() => setActiveTab('terms')}
          >
            <Scale size={16} /> 2. Kullanıcı & Hizmet Sözleşmesi
          </button>
          <button
            type="button"
            className={`kvkk-tab-button ${activeTab === 'privacy' ? 'active' : ''}`}
            onClick={() => setActiveTab('privacy')}
          >
            <Lock size={16} /> 3. Gizlilik ve Veri Güvenliği
          </button>
        </nav>

        {/* Document Content Reader */}
        <div className="kvkk-modal-body" tabIndex={0}>
          {activeTab === 'kvkk' && (
            <div>
              <div className="kvkk-doc-title">
                <span>6698 SAYILI KİŞİSEL VERİLERİN KORUNMASI KANUNU (KVKK) KAPSAMINDA AYDINLATMA METNİ</span>
                <span className="kvkk-doc-version">Sürüm: 2026.1-TR</span>
              </div>

              <div className="kvkk-highlight-box">
                <strong>Veri Sorumlusu Bilgilendirmesi:</strong> Pestneer Dijital Operasyon ve Biyosidal Takip Sistemleri (“Pestneer”) olarak, 6698 sayılı Kişisel Verilerin Korunması Kanunu (“KVKK”) ve ilgili mevzuat uyarınca; çalışanlarımızın, iş ortaklarımızın, saha teknisyenlerimizin ve müşteri yetkililerimizin kişisel verilerinin gizliliğine ve güvenliğine en üst düzeyde önem vermekteyiz.
              </div>

              <section className="kvkk-section">
                <h4><span>1</span> İşlenen Kişisel Veri Kategorileri</h4>
                <p>Pestneer platformu kullanımı süresince aşağıdaki veri kategorileri işlenmektedir:</p>
                <ul>
                  <li><strong>Kimlik Verileri:</strong> Ad, soyad, unvan ve yetki bilgileri.</li>
                  <li><strong>İletişim Verileri:</strong> Kurumsal/şahsi e-posta adresi, telefon numarası, görev yapılan şube/adres bilgileri.</li>
                  <li><strong>Mesleki Deneyim & Belge Verileri:</strong> Biyosidal uygulayıcı lisansı, sertifika numarası, mesul müdür yetki tanımları.</li>
                  <li><strong>İşlem Güvenliği ve Sistem Logları:</strong> Giriş IP adresi, oturum zaman damgaları, parola hash kayıtları, cihaz/tarayıcı bilgileri (5651 sayılı Kanun gereği).</li>
                  <li><strong>Saha ve Operasyon Verileri:</strong> İş emri uygulama raporları, QR kod tarama zamanları ve lokasyon doğrulama verileri.</li>
                </ul>
              </section>

              <section className="kvkk-section">
                <h4><span>2</span> Kişisel Verilerin İşlenme Amaçları</h4>
                <ul>
                  <li>Biyosidal Ürünlerin Kullanım Usul ve Esasları Hakkında Yönetmelik ve Sağlık Bakanlığı denetim standartlarına tam uyumlu dijital servis raporu, EK-1 formu ve istasyon takip kayıtlarının oluşturulması,</li>
                  <li>İş emirlerinin planlanması, rota optimizasyonu, saha ziyaretlerinin teyidi ve müşteri memnuniyeti süreçlerinin yürütülmesi,</li>
                  <li>Sistem erişim güvenliğinin temini, yetkisiz erişimlerin engellenmesi ve yasal loglama yükümlülüklerinin yerine getirilmesi,</li>
                  <li>Kalite kontrol, pestisit tüketim analizi ve trend raporlarının hazırlanması.</li>
                </ul>
              </section>

              <section className="kvkk-section">
                <h4><span>3</span> Kişisel Verilerin Aktarılması</h4>
                <p>Toplanan kişisel veriler, KVKK’nın 8. ve 9. maddelerine uygun olarak yalnızca;</p>
                <ul>
                  <li>Yasal denetim yetkisine sahip kamu kurum ve kuruluşları (Sağlık Bakanlığı, Tarım ve Orman Bakanlığı, adli ve idari merciler),</li>
                  <li>Hizmetin ifası kapsamında servis raporu alan ilgili müşteri firma ve şube yetkilileri,</li>
                  <li>Yüksek güvenlik standartlarına sahip sunucu, veri tabanı ve e-posta altyapı sağlayıcıları ile paylaşılabilmektedir.</li>
                </ul>
              </section>

              <section className="kvkk-section">
                <h4><span>4</span> İlgili Kişinin Hakları (KVKK Madde 11)</h4>
                <p>
                  KVKK Madde 11 uyarınca veri sahipleri; verilerinin işlenip işlenmediğini öğrenme, işlenmişse bilgi talep etme, işlenme amacına uygun kullanılıp kullanılmadığını öğrenme, yurt içinde/yurt dışında aktarıldığı üçüncü kişileri bilme, eksik/yanlış işlenmişse düzeltilmesini isteme ve silinmesini/yok edilmesini talep etme haklarına sahiptir.
                </p>
                <p>Haklarınıza ilişkin taleplerinizi <strong>kvkk@pestneer.com</strong> adresine iletebilirsiniz.</p>
              </section>
            </div>
          )}

          {activeTab === 'terms' && (
            <div>
              <div className="kvkk-doc-title">
                <span>PESTNEER PLATFORMU KULLANICI VE HİZMET SÖZLEŞMESİ</span>
                <span className="kvkk-doc-version">Sürüm: 2026.1-TR</span>
              </div>

              <section className="kvkk-section">
                <h4><span>1</span> Taraflar ve Sözleşmenin Kapsamı</h4>
                <p>
                  Bu Sözleşme, Pestneer Dijital Haşere ve Biyosidal Takip Platformu (“Pestneer”) ile sisteme giriş yapan kullanıcı (“Kullanıcı”) ve Kullanıcı’nın temsil ettiği tüzel/gerçek kişi firma (“Firma”) arasında akdedilmiştir. Kullanıcı, sisteme giriş yaparak bu sözleşmedeki tüm yükümlülükleri kabul etmiş sayılır.
                </p>
              </section>

              <section className="kvkk-section">
                <h4><span>2</span> Hesap Güvenliği ve Kullanıcı Sorumluluğu</h4>
                <ul>
                  <li>Kullanıcı, kendisine tahsis edilen giriş kimlik bilgilerini (şifre, token vb.) gizli tutmakla ve üçüncü şahıslarla paylaşmamakla yükümlüdür.</li>
                  <li>Kullanıcı hesabından gerçekleştirilen tüm iş emri onayları, servis raporu imzaları, ekipman aktivasyonları ve kimyasal tüketim kayıtları doğrudan kullanıcının ve bağlı bulunduğu firmanın sorumluluğundadır.</li>
                  <li>Şüpheli bir erişim veya şifre ele geçirilmesi durumunda derhal sistem yöneticisine bildirim yapılmalıdır.</li>
                </ul>
              </section>

              <section className="kvkk-section">
                <h4><span>3</span> Veri Doğruluğu ve Mevzuata Uygunluk Beyanı</h4>
                <ul>
                  <li>Kullanıcı; sisteme kaydettiği biyosidal ürün ruhsat numaraları, etken maddeler, dozaj oranları ve istasyon kontrol bulgularının gerçeğe uygun olduğunu, yanıltıcı veya sahte veri girişi yapmayacağını taahhüt eder.</li>
                  <li>Pestneer, kullanıcının girdiği teknik verilerin doğruluğundan sorumlu olmayıp, platformu yasal mevzuat formatlarına uygun raporlama aracı olarak sunmaktadır.</li>
                </ul>
              </section>

              <section className="kvkk-section">
                <h4><span>4</span> Fikri Mülkiyet ve Sistem Bütünlüğü</h4>
                <p>
                  Pestneer yazılımına, arayüzlerine, QR takip algoritmalarına, AI tespit modellerine ve kod tabanına ilişkin tüm fikri mülkiyet hakları münhasıran Pestneer’e aittir. Sistemin tersine mühendislik (reverse engineering), otomatik veri çekme (scraping) veya güvenlik açıklarını suiistimal etme girişimleri hukuki ve cezai yaptırıma tabidir.
                </p>
              </section>
            </div>
          )}

          {activeTab === 'privacy' && (
            <div>
              <div className="kvkk-doc-title">
                <span>GİZLİLİK, ÇEREZ VE SİSTEM GÜVENLİĞİ POLİTİKASI</span>
                <span className="kvkk-doc-version">Sürüm: 2026.1-TR</span>
              </div>

              <section className="kvkk-section">
                <h4><span>1</span> Güvenlik Standartları & Şifreleme</h4>
                <p>
                  Pestneer, endüstri standardı 256-bit TLS/SSL uçtan uca şifreleme protokolleri, PBKDF2/Argon2 şifre hash algoritmaları ve izole çok kiracılı (multi-tenant) veri mimarisi kullanmaktadır. Tüm operasyon verileriniz güvenli bulut ortamında periyodik olarak yedeklenmektedir.
                </p>
              </section>

              <section className="kvkk-section">
                <h4><span>2</span> Çerezler ve Yerel Depolama (Cookies & Local Storage)</h4>
                <p>
                  Sistemimizde <strong>kesinlikle üçüncü taraf reklam veya pazarlama takip çerezleri kullanılmamaktadır</strong>. Yalnızca oturum güvenliğinizi sağlamak, kimlik doğrulama belirteçlerini (JWT) saklamak ve tema tercihlerinizi hatırlamak amacıyla birinci taraf teknik çerezler ve tarayıcı yerel depolama alanları kullanılmaktadır.
                </p>
              </section>

              <section className="kvkk-section">
                <h4><span>3</span> Veri Saklama ve İmha Süresi</h4>
                <p>
                  Biyosidal ürün kayıtları, servis formları ve denetim logları mevzuat gereği 10 (on) yıllık yasal zamanaşımı süresi boyunca güvenle arşivlenir. Süre hitamında veya yasal talep halinde veriler uluslararası veri imha standartlarına uygun olarak geri döndürülemez biçimde anonimleştirilir veya silinir.
                </p>
              </section>
            </div>
          )}

          {/* Audit Stamp */}
          <div className="kvkk-audit-stamp">
            <div className="kvkk-stamp-item">
              <User size={14} className="text-sky-400" />
              <span>Oturum Sahibi: <strong>{session.user.name}</strong> ({session.user.email})</span>
            </div>
            <div className="kvkk-stamp-item">
              <Building2 size={14} className="text-emerald-400" />
              <span>Firma: <strong>{session.company.name}</strong> ({session.company.code})</span>
            </div>
            <div className="kvkk-stamp-item">
              <Clock size={14} className="text-amber-400" />
              <span>Tarih: <strong>{currentDate}</strong></span>
            </div>
          </div>
        </div>

        {/* Consent Form Checkboxes */}
        <form
          className="kvkk-consent-form"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit();
          }}
        >
          {/* Checkbox 1: KVKK */}
          <label className={`kvkk-checkbox-card ${kvkkConsent ? 'checked' : ''}`}>
            <input
              type="checkbox"
              checked={kvkkConsent}
              onChange={(e) => setKvkkConsent(e.target.checked)}
              required
            />
            <div className="kvkk-checkbox-content">
              <div>
                <span className="kvkk-tag-mandatory">Zorunlu</span>
                <strong>6698 Sayılı KVKK Aydınlatma Metni Onayı</strong>
              </div>
              <span>
                Yukarıda yer alan 6698 sayılı Kişisel Verilerin Korunması Kanunu Aydınlatma Metni’ni okudum, anladım; kişisel verilerimin belirtilen kapsam ve amaçlarla işlenmesini ve aktarılmasını kabul ediyorum.
              </span>
            </div>
          </label>

          {/* Checkbox 2: Terms */}
          <label className={`kvkk-checkbox-card ${termsConsent ? 'checked' : ''}`}>
            <input
              type="checkbox"
              checked={termsConsent}
              onChange={(e) => setTermsConsent(e.target.checked)}
              required
            />
            <div className="kvkk-checkbox-content">
              <div>
                <span className="kvkk-tag-mandatory">Zorunlu</span>
                <strong>Kullanıcı ve Hizmet Sözleşmesi Onayı</strong>
              </div>
              <span>
                Pestneer Kullanıcı, Lisans ve Hizmet Sözleşmesi koşullarını okudum; sisteme girdiğim teknik verilerin doğruluğuna ve hesap güvenliği yükümlülüklerine tam olarak uyacağımı kabul ve taahhüt ediyorum.
              </span>
            </div>
          </label>

          {/* Checkbox 3: Operational Notifications (Optional) */}
          <label className={`kvkk-checkbox-card ${marketingConsent ? 'checked' : ''}`}>
            <input
              type="checkbox"
              checked={marketingConsent}
              onChange={(e) => setMarketingConsent(e.target.checked)}
            />
            <div className="kvkk-checkbox-content">
              <div>
                <span className="kvkk-tag-optional">Açık Rıza</span>
                <strong>Operasyonel Bildirimler & Rapor İletişimi</strong>
              </div>
              <span>
                Saha servis raporları, kritik istasyon aktivasyon bildirimleri, yasal mevzuat güncellemeleri ve teknik bültenlerin e-posta/SMS/anlık bildirim yoluyla tarafıma iletilmesine rıza gösteriyorum.
              </span>
            </div>
          </label>
        </form>

        {/* Footer & Actions */}
        <footer className="kvkk-modal-footer">
          {error ? (
            <div className="kvkk-error-text">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          ) : (
            <div className="kvkk-stamp-item text-slate-400 text-xs">
              <CheckCircle2 size={14} className={canSubmit ? 'text-emerald-400' : 'text-slate-600'} />
              <span>Sisteme devam etmek için zorunlu 2 maddeyi işaretleyiniz.</span>
            </div>
          )}

          <div className="kvkk-actions-group">
            <button
              type="button"
              className="kvkk-btn-logout"
              onClick={onLogout}
              title="Onay vermeden çıkış yap"
            >
              <LogOut size={15} /> Çıkış Yap
            </button>
            <button
              type="button"
              className="kvkk-btn-submit"
              disabled={!canSubmit}
              onClick={() => void handleSubmit()}
            >
              {submitting ? (
                <>
                  <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                  Onay Kaydediliyor…
                </>
              ) : (
                <>
                  <ShieldCheck size={16} /> Okudum, Onaylıyorum ve Başla
                </>
              )}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
