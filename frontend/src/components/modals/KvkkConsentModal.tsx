import { useState } from 'react';
import {
  ShieldCheck,
  Scale,
  FileText,
  Lock,
  AlertCircle,
  LogOut,
  CheckCircle2,
  ExternalLink,
  X,
  ChevronRight,
  Sparkles,
  BookOpen,
} from 'lucide-react';
import type { AuthenticatedSession } from '../../auth/types';
import { acceptTerms } from '../../services/termsApi';
import './kvkkConsentModal.css';

type LegalDocumentType = 'kvkk' | 'terms' | 'privacy';

export default function KvkkConsentModal({
  session,
  onAccepted,
  onLogout,
}: {
  session: AuthenticatedSession;
  onAccepted: (s: AuthenticatedSession) => void;
  onLogout: () => void;
}) {
  const [activeViewerDoc, setActiveViewerDoc] = useState<LegalDocumentType | null>(null);
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
      // 1. Call Backend API to register legal acceptance
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

      // 4. Update storage
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

  const { user, company } = session;

  return (
    <>
      {/* 1. ANA ONAY MODALI (Kompakt, Ferah ve Şık Genel Görünüm) */}
      <div className="kvkk-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="kvkk-title">
        <div className="kvkk-modal-card">
          {/* Header */}
          <header className="kvkk-modal-header">
            <div className="kvkk-badge-row">
              <span className="kvkk-security-badge">
                <ShieldCheck size={14} /> PESTNEER GÜVENLİK & UYUM MERKEZİ
              </span>
              <span className="kvkk-mandatory-pill">İlk Giriş Zorunlu Onay</span>
            </div>
            <h2 id="kvkk-title">
              <Scale size={22} className="text-sky-400" />
              Mevzuat & KVKK Aydınlatma Onayı
            </h2>
            <p>
              6698 sayılı KVKK ve Sağlık Bakanlığı Biyosidal Ürünler Yönetmeliği standartları gereği sisteme devam etmeden önce yasal metinleri inceleyip onaylamanız gerekmektedir.
            </p>
          </header>

          {/* User & Company Identity Badge */}
          <div className="kvkk-user-bar">
            <div className="kvkk-user-bar-left">
              <div className="kvkk-user-avatar">{user.name.charAt(0).toUpperCase()}</div>
              <div>
                <strong>{user.name}</strong>
                <span>{user.email} · {company?.name || 'Pestneer'}</span>
              </div>
            </div>
            <span className="kvkk-role-pill">{user.role}</span>
          </div>

          {/* 3 Interactive Document Cards (Tıklanıp Büyük Ekranda Açılan Metinler) */}
          <div className="kvkk-docs-cards-grid">
            <div
              className="kvkk-doc-item-card"
              role="button"
              tabIndex={0}
              onClick={() => setActiveViewerDoc('kvkk')}
              onKeyDown={(e) => e.key === 'Enter' && setActiveViewerDoc('kvkk')}
            >
              <div className="kvkk-doc-icon-wrap">
                <FileText size={20} />
              </div>
              <div className="kvkk-doc-item-info">
                <h4>6698 Sayılı KVKK Aydınlatma Metni</h4>
                <p>İşlenen 8 veri kategorisi, veri sorumlusu kimliği, yasal gerekçeler ve haklarınız.</p>
              </div>
              <span className="kvkk-read-btn">
                Büyük Metni Oku <ExternalLink size={13} />
              </span>
            </div>

            <div
              className="kvkk-doc-item-card"
              role="button"
              tabIndex={0}
              onClick={() => setActiveViewerDoc('terms')}
              onKeyDown={(e) => e.key === 'Enter' && setActiveViewerDoc('terms')}
            >
              <div className="kvkk-doc-icon-wrap terms">
                <Scale size={20} />
              </div>
              <div className="kvkk-doc-item-info">
                <h4>Kullanıcı ve Hizmet Sözleşmesi</h4>
                <p>Hesap güvenliği, teknik veri doğruluğu, fikri mülkiyet ve sorumluluk sınırları.</p>
              </div>
              <span className="kvkk-read-btn">
                Büyük Metni Oku <ExternalLink size={13} />
              </span>
            </div>

            <div
              className="kvkk-doc-item-card"
              role="button"
              tabIndex={0}
              onClick={() => setActiveViewerDoc('privacy')}
              onKeyDown={(e) => e.key === 'Enter' && setActiveViewerDoc('privacy')}
            >
              <div className="kvkk-doc-icon-wrap privacy">
                <Lock size={20} />
              </div>
              <div className="kvkk-doc-item-info">
                <h4>Gizlilik, Çerez ve Veri Güvenliği</h4>
                <p>AES-256 / TLS 1.3 şifreleme, sıfır 3. taraf çerez ve 10 yıl yasal arşiv politikası.</p>
              </div>
              <span className="kvkk-read-btn">
                Büyük Metni Oku <ExternalLink size={13} />
              </span>
            </div>
          </div>

          {/* Consent Checkboxes */}
          <div className="kvkk-consent-section">
            <label className={`kvkk-check-row ${kvkkConsent ? 'checked' : ''}`}>
              <input
                type="checkbox"
                checked={kvkkConsent}
                onChange={(e) => setKvkkConsent(e.target.checked)}
              />
              <div className="kvkk-check-text">
                <span className="kvkk-tag-req">ZORUNLU</span>
                <strong>
                  <span
                    className="kvkk-link-highlight"
                    onClick={(e) => {
                      e.preventDefault();
                      setActiveViewerDoc('kvkk');
                    }}
                  >
                    6698 Sayılı KVKK Aydınlatma Metni'ni
                  </span>{' '}
                  okudum, anladım ve kabul ediyorum.
                </strong>
              </div>
            </label>

            <label className={`kvkk-check-row ${termsConsent ? 'checked' : ''}`}>
              <input
                type="checkbox"
                checked={termsConsent}
                onChange={(e) => setTermsConsent(e.target.checked)}
              />
              <div className="kvkk-check-text">
                <span className="kvkk-tag-req">ZORUNLU</span>
                <strong>
                  <span
                    className="kvkk-link-highlight"
                    onClick={(e) => {
                      e.preventDefault();
                      setActiveViewerDoc('terms');
                    }}
                  >
                    Pestneer Kullanıcı ve Hizmet Sözleşmesi
                  </span>{' '}
                  şartlarına tam olarak uyacağımı taahhüt ediyorum.
                </strong>
              </div>
            </label>

            <label className={`kvkk-check-row ${marketingConsent ? 'checked' : ''}`}>
              <input
                type="checkbox"
                checked={marketingConsent}
                onChange={(e) => setMarketingConsent(e.target.checked)}
              />
              <div className="kvkk-check-text">
                <span className="kvkk-tag-opt">AÇIK RIZA</span>
                <strong>
                  Kritik servis raporları, istasyon bildirimleri ve operasyonel duyuruların tarafıma iletilmesine onay veriyorum.
                </strong>
              </div>
            </label>
          </div>

          {/* Footer & Actions */}
          <footer className="kvkk-modal-footer">
            {error ? (
              <div className="kvkk-error-text">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            ) : (
              <div className="kvkk-status-hint">
                <CheckCircle2 size={15} className={canSubmit ? 'text-emerald-400' : 'text-slate-500'} />
                <span>{canSubmit ? 'Tüm zorunlu onaylar verildi. Giriş yapabilirsiniz.' : 'Sisteme geçmek için zorunlu 2 maddeyi onaylayınız.'}</span>
              </div>
            )}

            <div className="kvkk-actions-group">
              <button
                type="button"
                className="kvkk-btn-logout"
                onClick={onLogout}
                title="Onay vermeden güvenli çıkış yap"
              >
                <LogOut size={14} /> Çıkış Yap
              </button>

              <button
                type="button"
                className="kvkk-btn-submit"
                disabled={!canSubmit || submitting}
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

      {/* 2. BÜYÜK TAM EKRAN METİN OKUMA MODALI (Full Large Reader Popup) */}
      {activeViewerDoc && (
        <div
          className="kvkk-reader-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => setActiveViewerDoc(null)}
        >
          <div
            className="kvkk-reader-modal"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Reader Header */}
            <div className="kvkk-reader-header">
              <div className="kvkk-reader-title-box">
                <BookOpen size={20} className="text-sky-400" />
                <div>
                  <h3>Yasal Metin & Mevzuat İnceleme</h3>
                  <small>Pestneer Resmi Hukuki Uyum Dokümanları</small>
                </div>
              </div>

              {/* Reader Tabs */}
              <div className="kvkk-reader-tabs">
                <button
                  type="button"
                  className={activeViewerDoc === 'kvkk' ? 'active' : ''}
                  onClick={() => setActiveViewerDoc('kvkk')}
                >
                  <FileText size={14} /> 1. KVKK Aydınlatma
                </button>
                <button
                  type="button"
                  className={activeViewerDoc === 'terms' ? 'active' : ''}
                  onClick={() => setActiveViewerDoc('terms')}
                >
                  <Scale size={14} /> 2. Kullanıcı Sözleşmesi
                </button>
                <button
                  type="button"
                  className={activeViewerDoc === 'privacy' ? 'active' : ''}
                  onClick={() => setActiveViewerDoc('privacy')}
                >
                  <Lock size={14} /> 3. Gizlilik Politikası
                </button>
              </div>

              <button
                type="button"
                className="kvkk-reader-close-btn"
                onClick={() => setActiveViewerDoc(null)}
                aria-label="Kapat"
              >
                <X size={18} />
              </button>
            </div>

            {/* Reader Body (Geniş, Ferah, Rahat Okunabilir Alan) */}
            <div className="kvkk-reader-body">
              {activeViewerDoc === 'kvkk' && (
                <div className="kvkk-reader-doc-content">
                  <div className="kvkk-doc-title">
                    <span>6698 SAYILI KİŞİSEL VERİLERİN KORUNMASI KANUNU (KVKK) KAPSAMINDA AYDINLATMA METNİ</span>
                    <span className="kvkk-doc-version">Sürüm: 2026.1-TR · Resmi Mevzuat Formatı</span>
                  </div>

                  <div className="kvkk-highlight-box">
                    <strong>Veri Sorumlusu Bilgilendirmesi:</strong> Pestneer Dijital Operasyon ve Biyosidal Takip Sistemleri (“Pestneer”) olarak; 6698 sayılı Kişisel Verilerin Korunması Kanunu (“KVKK”), Aydınlatma Yükümlülüğünün Yerine Getirilmesinde Uyulacak Usul ve Esaslar Hakkında Tebliğ ve Sağlık Bakanlığı Biyosidal Ürünler Yönetmeliği uyarınca, sistem kullanıcılarımızın, mesul müdürlerin, uygulayıcı teknisyenlerin ve müşteri yetkililerinin kişisel verilerinin korunması, gizliliği ve güvenliğine en üst düzeyde hassasiyet göstermekteyiz.
                  </div>

                  <section className="kvkk-section">
                    <h4><span>1</span> Veri Sorumlusunun Kimliği</h4>
                    <p>
                      KVKK’nın 10. maddesi kapsamında veri sorumlusu sıfatıyla hareket eden Pestneer Platform İşletmecisi (“Pestneer”), sistem üzerinden toplanan kişisel verileri aşağıda belirtilen amaçlar ve yasal dayanaklar doğrultusunda, hukuka ve dürüstlük kurallarına uygun olarak işlemekte, saklamakta ve korumaktadır.
                    </p>
                  </section>

                  <section className="kvkk-section">
                    <h4><span>2</span> Alınan ve İşlenen Kişisel Verilerin Eksiksiz Dökümü</h4>
                    <p>Pestneer platformu üzerinden doğrudan kullanıcıdan, mobil cihaz sensörlerinden, QR tarayıcıdan ve sistem etkileşimlerinden toplanan verilerin açık dökümü aşağıdadır:</p>
                    <ul>
                      <li>
                        <strong>1. Kimlik ve Kimlik Doğrulama Verileri:</strong>
                        <br />Ad, soyadı, T.C. kimlik numarası (Sağlık Bakanlığı Biyosidal Ürünler Yönetmeliği gereği EK-1 servis formlarında ve Mesul Müdür/Uygulayıcı izin belgelerinde zorunlu olması durumunda), unvan, firma çalışan kodu, sistem kullanıcı kimliği (UUID), tuzlanmış tek yönlü parola hash özetleri (PBKDF2/Argon2) ve dokunmatik imza pedi ile alınan dijital ıslak imza örnekleri.
                      </li>
                      <li>
                        <strong>2. İletişim ve Adres Verileri:</strong>
                        <br />Kurumsal ve şahsi e-posta adresi, cep telefonu numarası, görev yapılan işletme/şube açık adresi, fatura ve tebligat adresi.
                      </li>
                      <li>
                        <strong>3. Mesleki Yeterlilik ve Ruhsat Verileri:</strong>
                        <br />Sağlık Bakanlığı Biyosidal Ürün Uygulayıcı İzin Belgesi numarası ve geçerlilik tarihi, Biyosidal Mesul Müdürlük Sertifikası, TMMOB Ziraat/Kimya Mühendisliği veya Biyologlar Odası sicil kayıt numarası, teknisyen yetkilendirme seviyeleri.
                      </li>
                      <li>
                        <strong>4. Saha, Coğrafi Konum (GPS) ve Cihaz Sensör Verileri:</strong>
                        <br />İş emrine varış ve iş emrinden ayrılış anlık GPS coğrafi koordinatları (enlem/boylam), istasyon QR kod okutma anındaki kesin konum ve zaman damgası (timestamp), rota doğrulama verileri, dijital tesis yerleşim krokisi (Site Plan) üzerindeki istasyon koordinatları (X, Y eksenleri).
                      </li>
                      <li>
                        <strong>5. Görsel, İşitsel ve Saha İnceleme Verileri:</strong>
                        <br />Saha denetimleri esnasında teknisyen kamerasıyla çekilen haşere aktivite fotoğrafları, riskli alan/yalıtım eksikliği görselleri, istasyon içi fotoğrafları, sesli saha ses kayıtları (sesli not modülü kullanıldığında) ve teknisyen saha açıklama metinleri.
                      </li>
                      <li>
                        <strong>6. Biyosidal Kimyasal Tüketim ve Uygulama Verileri:</strong>
                        <br />Kullanılan biyosidal ürünün Sağlık Bakanlığı ruhsat tarihi/numarası, ticari adı, aktif madde adı, konsantrasyonu, formülasyon tipi, uygulanan net miktar (gr/ml/adet), seyreltme oranı, uygulama yöntemi, hedef zararlı türü ve uygulama yapılan spesifik oda/alan bilgisi.
                      </li>
                      <li>
                        <strong>7. İşlem Güvenliği, Siber Güvenlik ve Sistem Log Verileri (5651 Sayılı Kanun):</strong>
                        <br />İstemci gerçek IP adresi, kaynak port numarası, oturum açma/kapama zaman damgaları, yapılan her türlü veri ekleme/güncelleme/silme işlem kaydı (Audit Trail), cihaz türü (mobil/tablet/masaüstü), işletim sistemi, ekran çözünürlüğü ve tarayıcı kullanıcı aracısı (User-Agent) bilgileri.
                      </li>
                      <li>
                        <strong>8. Müşteri ve Tesis Temsilcisi Verileri:</strong>
                        <br />Hizmet alan müşteri şirket ticari unvanı, VKN/vergi dairesi, tesis şube sorumlusu ad-soyadı, unvanı, iletişim telefonu ve servis formu teslim onay imzası.
                      </li>
                    </ul>
                  </section>

                  <section className="kvkk-section">
                    <h4><span>3</span> Kişisel Verilerin İşlenme Amaçları ve Hukuki Sebepleri</h4>
                    <p>
                      Toplanan kişisel verileriniz, KVKK’nın 5. ve 6. maddelerinde belirtilen kişisel veri işleme şartları dahilinde aşağıdaki amaçlarla işlenmektedir:
                    </p>
                    <ul>
                      <li><strong>Yasal Zorunluluk (KVKK m.5/2-a, ç):</strong> Sağlık Bakanlığı Biyosidal Ürünlerin Kullanım Usul ve Esasları Hakkında Yönetmelik gereği resmi EK-1 Uygulama Belgelerinin tanzimi, Mesul Müdür denetim raporlarının oluşturulması ve 5651 sayılı İnternet Ortamında Yapılan Yayınların Düzenlenmesi Kanunu gereği sistem erişim ve denetim loglarının (audit logs) tutulması.</li>
                      <li><strong>Sözleşmenin İfası (KVKK m.5/2-c):</strong> Pestneer SaaS platform üyelik hizmetlerinin sunulması, kullanıcı oturumlarının kimlik doğrulamasının yapılması, iş emirlerinin oluşturulması, atanması ve takibi.</li>
                      <li><strong>Meşru Menfaat (KVKK m.5/2-f):</strong> Platform güvenliğinin, veri bütünlüğünün sağlanması, servis performansının optimize edilmesi, siber saldırıların tespiti ve önlenmesi.</li>
                    </ul>
                  </section>

                  <section className="kvkk-section">
                    <h4><span>4</span> Kişisel Verilerin Aktarılması</h4>
                    <p>
                      Toplanan verileriniz; kanunen yetkili kamu kurum ve kuruluşlarına (Sağlık Bakanlığı, İl Sağlık Müdürlükleri, adli merciler), firmanızın sözleşmeli hizmet sunduğu yetkili müşteri temsilcilerine (yalnızca ilgili tesise ait servis formu ve raporlar kapsamında) ve platformun barındırıldığı ISO 27001 sertifikalı bulut altyapı sağlayıcılarımıza KVKK’nın 8. ve 9. maddeleri uyarınca aktarılabilmektedir.
                    </p>
                  </section>

                  <section className="kvkk-section">
                    <h4><span>5</span> İlgili Kişinin (Veri Sahibinin) Hakları</h4>
                    <p>
                      KVKK’nın 11. maddesi uyarınca; verilerinizin işlenip işlenmediğini öğrenme, işlenmişse bilgi talep etme, işlenme amacına uygun kullanılıp kullanılmadığını öğrenme, yurt içinde/yurt dışında aktarıldığı 3. kişileri bilme, eksik/yanlış işlenmişse düzeltilmesini isteme haklarına sahipsiniz. Başvurularınızı <code>kvkk@pestneer.com</code> e-posta adresine iletebilirsiniz.
                    </p>
                  </section>
                </div>
              )}

              {activeViewerDoc === 'terms' && (
                <div className="kvkk-reader-doc-content">
                  <div className="kvkk-doc-title">
                    <span>PESTNEER KULLANICI, LİSANS VE HİZMET SÖZLEŞMESİ</span>
                    <span className="kvkk-doc-version">Sürüm: 2026.1-TR · SaaS Hizmet Şartları</span>
                  </div>

                  <section className="kvkk-section">
                    <h4><span>1</span> Sözleşmenin Konusu ve Taraflar</h4>
                    <p>
                      İşbu sözleşme; Pestneer platformu üzerinden sunulan bulut tabanlı haşere kontrol, biyosidal takip, dijital servis formu ve saha yönetim yazılımının kullanım şartlarını, tarafların hak ve yükümlülüklerini düzenler. Sisteme giriş yapan her kullanıcı bu sözleşmeyi kabul etmiş sayılır.
                    </p>
                  </section>

                  <section className="kvkk-section">
                    <h4><span>2</span> Hesap Güvenliği ve Kullanıcı Yükümlülükleri</h4>
                    <ul>
                      <li>Kullanıcı, hesabına erişim için kullanılan şifre ve kimlik bilgilerinin güvenliğinden bizzat sorumludur.</li>
                      <li>Kullanıcı hesapları kişiye özel olup üçüncü kişilere devredilemez veya ortak kullanılamaz.</li>
                      <li>Saha teknisyenleri ve mesul müdürler tarafından sisteme girilen kimyasal tüketim, aktif madde ve dozaj verilerinin teknik doğruluğundan kullanıcı ve bağlı bulunduğu firma sorumludur.</li>
                    </ul>
                  </section>

                  <section className="kvkk-section">
                    <h4><span>3</span> Fikri Mülkiyet ve Ticari Sırlar</h4>
                    <p>
                      Pestneer yazılımının tüm kaynak kodları, arayüz tasarımları, algoritmaları, istasyon QR kod mimarisi ve veri modelleri Pestneer’in münhasır mülkiyetindedir. Tersine mühendislik yapılması, kopyalanması veya kaynak kodlarının çıkarılması kesinlikle yasaktır.
                    </p>
                  </section>

                  <section className="kvkk-section">
                    <h4><span>4</span> Hizmet Sürekliliği ve Sorumluluk Sınırı</h4>
                    <p>
                      Pestneer, sistemin kesintisiz ve güvenli çalışması için makul endüstri standardı tedbirleri (%99.5 uptime hedefi) almaktadır. Ancak mücbir sebepler, telekomünikasyon kesintileri veya kullanıcı donanım arızalarından kaynaklanan dolaylı zararlardan sorumlu tutulamaz.
                    </p>
                  </section>

                  <section className="kvkk-section">
                    <h4><span>5</span> Uyuşmazlıkların Çözümü</h4>
                    <p>
                      İşbu sözleşmenin uygulanmasından doğabilecek her türlü uyuşmazlığın çözümünde Türk Hukuku uygulanacak olup, İstanbul (Çağlayan) Mahkemeleri ve İcra Daireleri yetkilidir.
                    </p>
                  </section>
                </div>
              )}

              {activeViewerDoc === 'privacy' && (
                <div className="kvkk-reader-doc-content">
                  <div className="kvkk-doc-title">
                    <span>GİZLİLİK, ÇEREZ VE SİBER GÜVENLİK POLİTİKASI</span>
                    <span className="kvkk-doc-version">Sürüm: 2026.1-TR · Güvenlik Standardı</span>
                  </div>

                  <section className="kvkk-section">
                    <h4><span>1</span> Veri Güvenliği ve Kriptografik Önlemler</h4>
                    <p>
                      Pestneer platformunda saklanan tüm kurumsal ve operasyonel veriler, istirahat halinde (Data-at-Rest) AES-256 standardı ile, aktarım halinde (Data-in-Transit) ise güncel TLS 1.3 protokolü ile şifrelenmektedir. Parolalar hiçbir zaman açık metin olarak tutulmaz; tuzlanmış PBKDF2/Argon2 algoritmaları ile hashlenir.
                    </p>
                  </section>

                  <section className="kvkk-section">
                    <h4><span>2</span> Çerezler (Cookies) ve Oturum Yönetimi</h4>
                    <p>
                      Platformumuzda yalnızca sistemin güvenli çalışması ve kullanıcı oturumunun korunması için <strong>zorunlu teknik çerezler ve JWT oturum belirteçleri</strong> kullanılmaktadır. Üçüncü taraf reklam, izleme veya profil çıkarma çerezleri kesinlikle kullanılmaz.
                    </p>
                  </section>

                  <section className="kvkk-section">
                    <h4><span>3</span> Veri Saklama ve İmha Politikası</h4>
                    <p>
                      Resmi mevzuat gereği (Biyosidal Ürünler Yönetmeliği ve TTK) tanzim edilen servis formları, raporlar ve denetim logları yasal saklama süresi olan 10 yıl boyunca arşivlenir. Süre sonunda kişisel veriler KVKK Yönetmeliğine uygun olarak güvenli biçimde anonimleştirilir veya imha edilir.
                    </p>
                  </section>
                </div>
              )}
            </div>

            {/* Reader Footer */}
            <div className="kvkk-reader-footer">
              <button
                type="button"
                className="kvkk-reader-btn-done"
                onClick={() => {
                  if (activeViewerDoc === 'kvkk') setKvkkConsent(true);
                  if (activeViewerDoc === 'terms') setTermsConsent(true);
                  setActiveViewerDoc(null);
                }}
              >
                <CheckCircle2 size={16} /> Okudum ve Onayla (Kapat)
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
