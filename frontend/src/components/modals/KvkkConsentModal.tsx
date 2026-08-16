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
                <h4><span>3</span> Kişisel Verilerin İşlenme Amaçları</h4>
                <p>Toplanan kişisel verileriniz aşağıdaki amaçlarla işlenmektedir:</p>
                <ul>
                  <li>Sağlık Bakanlığı Biyosidal Ürünlerin Kullanım Usul ve Esasları Hakkında Yönetmelik gereği zorunlu olan EK-1 Uygulama Belgelerinin, dijital servis raporlarının ve kritik istasyon kontrol formlarının mevzuata tam uyumlu olarak tanzim edilmesi,</li>
                  <li>İş emirlerinin oluşturulması, saha teknisyenlerine rota atanması, servis varış/ayrılış saatlerinin doğrulanması ve operasyonel verimliliğin sağlanması,</li>
                  <li>Gıda güvenliği ve uluslararası kalite denetim standartları (HACCP, BRC, AIB, ISO 22000, ISO 9001) kapsamında geriye dönük izlenebilirlik kayıtlarının ve trend analizlerinin üretilmesi,</li>
                  <li>5651 sayılı İnternet Ortamında Yapılan Yayınların Düzenlenmesi Kanunu gereğince sistem işlem kütüklerinin (log) tutulması, bilgi güvenliğinin sağlanması ve yetkisiz erişimlerin engellenmesi,</li>
                  <li>Sözleşme süreçlerinin yürütülmesi, faturalandırma, cari hesap mutabakatları ve müşteri destek taleplerinin çözümlenmesi.</li>
                </ul>
              </section>

              <section className="kvkk-section">
                <h4><span>4</span> Kişisel Veri Toplamanın Hukuki Sebepleri</h4>
                <p>Kişisel verileriniz, KVKK’nın 5. ve 6. maddelerinde belirtilen aşağıdaki hukuki sebeplere dayanılarak işlenmektedir:</p>
                <ul>
                  <li><strong>Kanunlarda Açıkça Öngörülmesi (m.5/2-a):</strong> 5651 sayılı Kanun, Türk Ticaret Kanunu, Vergi Usul Kanunu ve Biyosidal Ürünler Yönetmeliği hükümleri.</li>
                  <li><strong>Sözleşmenin Kurulması veya İfası (m.5/2-c):</strong> Pestneer SaaS Platform Lisans Sözleşmesi’nin ifası, iş emirlerinin yürütülmesi ve kullanıcı hesaplarının yönetimi.</li>
                  <li><strong>Veri Sorumlusunun Hukuki Yükümlülüğü (m.5/2-ç):</strong> Yasal denetimlerde resmi formların ve arşiv kayıtlarının yetkili mercilere ibraz edilmesi.</li>
                  <li><strong>Meşru Menfaat (m.5/2-f):</strong> İlgili kişinin temel hak ve özgürlüklerine zarar vermemek kaydıyla; sistemin siber güvenliğinin sağlanması, performans analizi ve hizmet kalitesinin artırılması.</li>
                </ul>
              </section>

              <section className="kvkk-section">
                <h4><span>5</span> Kişisel Verilerin Aktarılması</h4>
                <p>Kişisel verileriniz, KVKK’nın 8. ve 9. maddeleri uyarınca yalnızca aşağıdaki taraflara aktarılmaktadır:</p>
                <ul>
                  <li><strong>Yetkili Kamu Kurum ve Kuruluşları:</strong> Sağlık Bakanlığı Halk Sağlığı Genel Müdürlüğü, İl/İlçe Sağlık Müdürlükleri, Tarım ve Orman Bakanlığı, adli ve idari yargı makamları (yasal zorunluluk halinde).</li>
                  <li><strong>Hizmet Alan Müşteriler ve Şube Yetkilileri:</strong> Servis raporunun ve EK-1 formunun tebliğ edilmesi gereken yetkili müşteri temsilcileri.</li>
                  <li><strong>Hizmet Sağlayıcıları ve Altyapı Ortakları:</strong> ISO 27001 sertifikalı güvenli bulut barındırma, veritabanı, e-posta gönderimi ve SMS altyapı sağlayıcıları.</li>
                </ul>
              </section>

              <section className="kvkk-section">
                <h4><span>6</span> Veri Sahibinin Hakları (KVKK Madde 11)</h4>
                <p>
                  KVKK’nın 11. maddesi uyarınca veri sahibi olarak; kişisel verilerinizin işlenip işlenmediğini öğrenme, işlenmişse bilgi talep etme, işlenme amacını ve amaca uygun kullanılıp kullanılmadığını öğrenme, yurt içinde veya yurt dışında aktarıldığı üçüncü kişileri bilme, eksik veya yanlış işlenmişse düzeltilmesini isteme, silinmesini veya yok edilmesini talep etme, kanuna aykırı işleme nedeniyle zarara uğramanız halinde zararın giderilmesini talep etme haklarına sahipsiniz.
                </p>
                <p>
                  Başvurularınızı Veri Sorumlusuna Başvuru Usul ve Esasları Hakkında Tebliğ’e uygun olarak <strong>kvkk@pestneer.com</strong> adresine veya şirketimizin resmi kayıtlı posta kanalına iletebilirsiniz. Başvurularınız en geç 30 (otuz) gün içerisinde ücretsiz olarak sonuçlandırılacaktır.
                </p>
              </section>
            </div>
          )}

          {activeTab === 'terms' && (
            <div>
              <div className="kvkk-doc-title">
                <span>PESTNEER PLATFORMU KULLANICI, LİSANS VE HİZMET SÖZLEŞMESİ</span>
                <span className="kvkk-doc-version">Sürüm: 2026.1-TR · Hizmet ve Sorumluluk Şartları</span>
              </div>

              <section className="kvkk-section">
                <h4><span>1</span> Taraflar ve Sözleşmenin Amacı</h4>
                <p>
                  Bu Kullanıcı ve Lisans Sözleşmesi (“Sözleşme”); Pestneer Dijital Haşere ve Biyosidal Takip Platformu (“Pestneer” veya “Lisans Veren”) ile platforma erişim sağlayan gerçek veya tüzel kişi kullanıcı (“Kullanıcı” veya “Lisans Alan”) arasında akdedilmiştir. Kullanıcı, platforma giriş yaparak ve onay butonunu işaretleyerek bu sözleşmedeki tüm maddeleri gayrikabili rücu kabul etmiş sayılır.
                </p>
              </section>

              <section className="kvkk-section">
                <h4><span>2</span> Hesap Güvenliği ve Kullanıcı Yükümlülükleri</h4>
                <ul>
                  <li><strong>Kimlik Gizliliği:</strong> Kullanıcı, kendisine tahsis edilen kullanıcı adı, parola, API anahtarı ve oturum belirteçlerini gizli tutmakla, üçüncü şahıslarla paylaşmamakla ve güvenliğini sağlamakla yükümlüdür.</li>
                  <li><strong>Hesap Sorumluluğu:</strong> Kullanıcı hesabı üzerinden gerçekleştirilen tüm iş emri onayları, servis raporu imzaları, ekipman eşleştirmeleri, pestisit dozaj kayıtları ve müşteri bildirimleri doğrudan Kullanıcı ve bağlı bulunduğu tüzel firmanın hukuki sorumluluğundadır.</li>
                  <li><strong>Yetkisiz Erişim Bildirimi:</strong> Hesabın yetkisiz kişilerce ele geçirildiğinden şüphelenilmesi halinde Kullanıcı, durumu derhal sistem yöneticisine bildirmekle yükümlüdür.</li>
                </ul>
              </section>

              <section className="kvkk-section">
                <h4><span>3</span> Biyosidal Veri Doğruluğu ve Yasal Sorumluluk Reddi</h4>
                <ul>
                  <li><strong>Teknik Veri Doğruluğu:</strong> Sisteme kaydedilen biyosidal ürünlerin Sağlık Bakanlığı ruhsat numaraları, etken madde isimleri, konsantrasyonları, hedef zararlı türleri, uygulama dozajları ve güvenlik tedbirlerinin gerçeğe ve mevzuata uygunluğu münhasıran uygulayıcı ve lisans sahibi firmanın sorumluluğundadır.</li>
                  <li><strong>Yazılım Sağlayıcısı Sorumluluk Sınırı:</strong> Pestneer, bir dijital kayıt ve raporlama altyapısı sağlayıcısı olup; sahada icra edilen fiili ilaçlama uygulamalarından, kimyasal zehirlenmelerden, çevreye verilen zararlardan, hedef dışı canlı etkilenmelerinden veya yanlış dozaj uygulamalarından ötürü hukuki, idari veya cezai olarak sorumlu tutulamaz.</li>
                </ul>
              </section>

              <section className="kvkk-section">
                <h4><span>4</span> Fikri ve Sınai Mülkiyet Hakları</h4>
                <p>
                  Pestneer yazılımının tüm kaynak kodları, veri tabanı yapıları, algoritma mimarisi, yapay zeka haşere teşhis modelleri, dijital yerleşim planı editörü, kullanıcı arayüzleri ve Pestneer tescilli markası münhasıran Lisans Veren’e aittir. Sistemin kopyalanması, tersine mühendislik yapılması, kaynak koda dönüştürülmesi (decompilation), otomatik veri çekme (scraping) araçlarıyla taranması veya yetkisiz çoğaltılması kesinlikle yasaktır.
                </p>
              </section>

              <section className="kvkk-section">
                <h4><span>5</span> Müşteri Verilerinin Mülkiyeti ve Gizlilik</h4>
                <p>
                  Firmanın ve Kullanıcı’nın platforma yüklediği müşteri portföyü, şube adresleri, sözleşme bedelleri ve operasyonel denetim kayıtları münhasıran ilgili firmanın ticari sırrı niteliğindedir. Pestneer, bu verileri gizli tutmayı, yasal merciler haricinde hiçbir üçüncü tarafla paylaşmamayı ve ticari amaçla satmamayı taahhüt eder.
                </p>
              </section>

              <section className="kvkk-section">
                <h4><span>6</span> Hizmet Seviyesi (SLA), Bakım ve Sorumluluk Sınırı</h4>
                <ul>
                  <li>Pestneer, sistemin 7/24 kesintisiz çalışması için %99.5 yıllık çalışma süresi (uptime) hedefler; planlı bakım çalışmaları önceden bildirilir.</li>
                  <li>Doğal afetler, global internet omurgası arızaları, telekomünikasyon kesintileri veya siber saldırılar gibi mücbir sebeplerden kaynaklanan geçici kesintilerden ötürü Pestneer’e kar kaybı veya dolaylı zarar tazminatı yüklenemez.</li>
                </ul>
              </section>

              <section className="kvkk-section">
                <h4><span>7</span> Yetkili Hukuk ve Uyuşmazlıkların Çözümü</h4>
                <p>
                  Bu Sözleşme Türkiye Cumhuriyeti Hukuku’na tabidir. Sözleşmenin uygulanmasından veya yorumlanmasından doğabilecek her türlü uyuşmazlıkta İstanbul (Çağlayan) Mahkemeleri ve İcra Daireleri münhasıran yetkilidir.
                </p>
              </section>
            </div>
          )}

          {activeTab === 'privacy' && (
            <div>
              <div className="kvkk-doc-title">
                <span>GİZLİLİK, ÇEREZ VE SİBER GÜVENLİK POLİTİKASI</span>
                <span className="kvkk-doc-version">Sürüm: 2026.1-TR · Bilgi Güvenliği Standartları</span>
              </div>

              <section className="kvkk-section">
                <h4><span>1</span> Siber Güvenlik Standartları ve Şifreleme</h4>
                <p>
                  Pestneer altyapısında; tüm veri transferleri endüstri standardı 256-bit TLS/SSL (HTTPS) protokolü ile şifrelenir. Kullanıcı parolaları tek yönlü kriptografik özetleme algoritmaları (PBKDF2/Argon2) ile tuzlanarak saklanır. Veritabanı ve yedekleme katmanında dinlenme halindeki veriler (Data-at-Rest) AES-256 standardında şifrelenmektedir.
                </p>
              </section>

              <section className="kvkk-section">
                <h4><span>2</span> Çerez Politikası ve Üçüncü Taraf Takip Reddi</h4>
                <ul>
                  <li><strong>Sıfır Pazarlama Takibi:</strong> Pestneer platformunda <strong>asla üçüncü taraf reklam, pazarlama, davranışsal hedefleme veya sosyal medya takip çerezleri kullanılmamaktadır</strong>.</li>
                  <li><strong>Zorunlu Teknik Çerezler:</strong> Yalnızca kullanıcının oturum güvenliğini sağlayan, kimlik doğrulama belirteçlerini (JWT) koruyan ve sistem ayarlarını hatırlayan birinci taraf teknik çerezler ve tarayıcı yerel depolama (Local/Session Storage) alanları kullanılmaktadır.</li>
                </ul>
              </section>

              <section className="kvkk-section">
                <h4><span>3</span> Veri Saklama, Arşivleme ve İmha Politikası</h4>
                <p>
                  Sağlık Bakanlığı Biyosidal Mevzuatı ve Türk Ticaret Kanunu uyarınca, gerçekleştirilen uygulamalara ait servis formları, kimyasal tüketim kayıtları ve denetim logları <strong>10 (on) yıllık yasal zamanaşımı süresi</strong> boyunca güvenli bulut arşivinde saklanır. Yasal saklama süresinin sona ermesi veya haklı imha talebi halinde veriler uluslararası standartlara (ISO 27001) uygun olarak geri döndürülemez şekilde silinir veya anonimleştirilir.
                </p>
              </section>

              <section className="kvkk-section">
                <h4><span>4</span> Loglama ve 5651 Sayılı Kanun Uyumu</h4>
                <p>
                  Platforma yapılan tüm erişimler, oturum açma/kapatma hareketleri, iş emri düzenlemeleri ve silme işlemleri zaman damgalı olarak denetim kütüklerinde (Audit Log) kaydedilmekte ve yetkisiz müdahalelere karşı kriptografik olarak korunmaktadır.
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
