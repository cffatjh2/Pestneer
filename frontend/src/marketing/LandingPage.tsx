import {
  ArrowRight,
  BarChart3,
  BrainCircuit,
  CalendarCheck2,
  Check,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  Fingerprint,
  Layers3,
  MailCheck,
  MapPin,
  PackageCheck,
  Play,
  QrCode,
  Route,
  ShieldCheck,
  Signature,
  Sparkles,
  Store,
  UsersRound,
  WifiOff,
} from 'lucide-react';
import type { CSSProperties } from 'react';

type LandingPageProps = {
  onLogin: () => void;
};

const featureCards = [
  { icon: Route, title: 'Akıllı planlama & rota', text: 'Çok şubeli işleri ekiplere dağıtın; günlük rotayı, görevlileri ve ziyaret durumlarını tek akışta yönetin.', tone: 'blue' },
  { icon: WifiOff, title: 'Çevrimdışı saha modu', text: 'İnternet olmasa da iş emri, istasyon, fotoğraf ve imza kaydedilir; bağlantı gelince güvenle eşitlenir.', tone: 'green' },
  { icon: QrCode, title: 'QR istasyon turu', text: 'İstasyonu QR ile açın; aktivite, hasar, ürün ve miktar kayıtlarını hızlı saha ekranından tamamlayın.', tone: 'purple' },
  { icon: BrainCircuit, title: 'PestneerVision & Lens', text: 'Yapışkan kart fotoğraflarındaki zararlıları cihazda analiz edin, sonucu kontrol ederek trende aktarın.', tone: 'orange' },
  { icon: PackageCheck, title: 'Depo, araç ve sarf stoku', text: 'Depodan araca, uygulamadan tüketime kadar ürün hareketlerini ruhsat ve kritik seviye bağlantısıyla izleyin.', tone: 'cyan' },
  { icon: FileCheck2, title: 'Denetim & müşteri portalı', text: 'İmzalı PDF, trend, risk, kroki, ruhsat ve MSDS/GBF belgelerini yetkili müşterilerle güvenle paylaşın.', tone: 'emerald' },
];

export default function LandingPage({ onLogin }: LandingPageProps) {
  return (
    <main className="landing-page">
      <div className="landing-aurora landing-aurora-one" />
      <div className="landing-aurora landing-aurora-two" />
      <header className="landing-header">
        <a className="landing-brand" href="#top" aria-label="Pestneer ana sayfa">
          <span className="landing-logo-shell"><img src="/pesneer-mark.jpeg" alt="Pestneer" /></span>
          <div><strong>Pestneer</strong><small>PEST KONTROL YÖNETİM SİSTEMİ</small></div>
        </a>
        <nav aria-label="Tanıtım menüsü"><a href="#features">Özellikler</a><a href="#workflow">Nasıl çalışır?</a><a href="#security">Güvenlik</a></nav>
        <button className="landing-login-button" onClick={onLogin}>Giriş Yap <ArrowRight size={17} /></button>
      </header>

      <section className="landing-hero" id="top">
        <div className="landing-hero-copy">
          <div className="landing-pill"><span><Sparkles size={14} /></span> Pest kontrol operasyonlarının yeni merkezi <i /></div>
          <h1>Saha hızlansın.<br /><span>Her kayıt kanıta dönüşsün.</span></h1>
          <p>Çevrimdışı saha turundan QR istasyon kontrolüne, araç stokundan imzalı PDF ve müşteri portalına kadar tüm operasyonunuzu tek bir profesyonel platformda yönetin.</p>
          <div className="landing-hero-actions">
            <button className="landing-primary" onClick={onLogin}>Operasyon merkezini aç <ArrowRight size={18} /></button>
            <a className="landing-secondary" href="#features"><span><Play size={15} fill="currentColor" /></span> Özellikleri keşfet</a>
          </div>
          <div className="landing-trust-row">
            <span><Check size={14} /> Firma bazlı veri izolasyonu</span>
            <span><Check size={14} /> Çevrimdışı kayıt ve senkronizasyon</span>
            <span><Check size={14} /> Yetkili belge ve müşteri erişimi</span>
          </div>
        </div>

        <div className="landing-product-stage" aria-label="Pestneer operasyon paneli önizlemesi">
          <div className="stage-orbit orbit-one"><i /></div><div className="stage-orbit orbit-two"><i /></div>
          <div className="product-window">
            <div className="product-window-top"><div><i /><i /><i /></div><span><ShieldCheck size={13} /> Canlı operasyon merkezi</span><em>07 AĞU 2026</em></div>
            <div className="product-window-body">
              <aside className="product-mini-sidebar"><span className="active"><Layers3 size={17} /></span><span><ClipboardCheck size={17} /></span><span><CalendarCheck2 size={17} /></span><span><PackageCheck size={17} /></span><span><BarChart3 size={17} /></span><i /></aside>
              <div className="product-dashboard">
                <div className="product-welcome"><div><small>OPERASYON ÖZETİ</small><strong>Günaydın, Elif</strong></div><button><MapPin size={13} /> Rotayı aç</button></div>
                <div className="product-metrics"><article><span>Bugünkü iş</span><strong>12</strong><small>3 saha ekibi</small></article><article><span>Tamamlanan</span><strong>8</strong><small>%67 ilerleme</small></article><article><span>Kritik stok</span><strong>2</strong><small>Kontrol gerekli</small></article></div>
                <div className="product-content-grid">
                  <section className="product-map-card"><div className="preview-title"><span><small>CANLI HARİTA</small><strong>Saha operasyonları</strong></span><em>8 aktif</em></div><div className="preview-map"><div className="map-road road-one" /><div className="map-road road-two" /><div className="map-road road-three" /><span className="map-pin pin-one"><i /></span><span className="map-pin pin-two"><i /></span><span className="map-pin pin-three"><i /></span><div className="map-route" /></div></section>
                  <section className="product-jobs-card"><div className="preview-title"><span><small>SIRADAKİ İŞLER</small><strong>Günlük rota</strong></span><ChevronRight size={14} /></div>{[['09:30','Maviova Gıda','Altındağ'],['11:00','Kuzey Hat Depo','Çankaya'],['14:30','Yelken Unlu Mamuller','Yenimahalle']].map(([time,name,location], index) => <div className={`preview-job ${index === 0 ? 'active' : ''}`} key={name}><time>{time}</time><i /><span><strong>{name}</strong><small>{location}</small></span></div>)}</section>
                </div>
              </div>
            </div>
          </div>
          <article className="floating-card floating-card-top"><span><Store size={17} /></span><div><small>ÇOK ŞUBELİ MÜŞTERİ</small><strong>NovaPerakende</strong><em>42 şube tek merkezde</em></div></article>
          <article className="floating-card floating-card-bottom"><span><Clock3 size={17} /></span><div><small>BUGÜN TOPLAM</small><strong>46s 20dk</strong><em><i /> 8 personel sahada</em></div></article>
          <div className="floating-success"><Check size={15} /> Rapor imzalandı</div>
        </div>
      </section>

      <div className="landing-marquee" aria-hidden="true"><div>{['OFFLINE PWA','QR İSTASYON TURU','PESTNEERVISION','AKILLI ROTA','ARAÇ STOKU','İMZALI PDF','MSDS / GBF','MÜŞTERİ PORTALI','OFFLINE PWA','QR İSTASYON TURU','PESTNEERVISION','AKILLI ROTA','ARAÇ STOKU','İMZALI PDF','MSDS / GBF','MÜŞTERİ PORTALI'].map((item, index) => <span key={`${item}-${index}`}><i />{item}</span>)}</div></div>

      <section className="landing-section landing-features" id="features">
        <div className="landing-section-heading"><p>TÜM OPERASYON, TEK PLATFORM</p><h2>Sahada hız, merkezde <span>tam kontrol.</span></h2><div>Günlük operasyon yükünü azaltan, veriyi düzenleyen ve büyümeye hazır profesyonel modüller.</div></div>
        <div className="landing-feature-grid">{featureCards.map(({ icon: Icon, title, text, tone }, index) => <article key={title} className={`landing-feature-card tone-${tone}`} style={{ '--feature-index': index } as CSSProperties}><div className="feature-icon"><Icon size={22} /></div><span>0{index + 1}</span><h3>{title}</h3><p>{text}</p><button onClick={onLogin}>Modülü keşfet <ArrowRight size={14} /></button></article>)}</div>
      </section>

      <section className="landing-intelligence" aria-label="Pestneer birleşik operasyon akışı">
        <div className="intelligence-copy">
          <p className="landing-kicker">BİRBİRİNE BAĞLI OPERASYON</p>
          <h2>Bir kayıt girin.<br /><span>Tüm sistem birlikte çalışsın.</span></h2>
          <p>İstasyonda kullanılan ürün araç stokundan düşer, ziyaret verisi trend analizine eklenir, son imza resmi raporu tamamlar ve belge yetkili müşteriyle paylaşılır.</p>
          <div className="intelligence-tags"><span><WifiOff size={16} /> Çevrimdışı hazır</span><span><BrainCircuit size={16} /> Yapay zekâ kontrollü</span><span><MailCheck size={16} /> Otomatik dağıtım</span></div>
        </div>
        <div className="intelligence-flow">
          <article><span><QrCode size={20} /></span><strong>QR kontrol</strong><small>İstasyon ve aktivite</small></article>
          <i><ArrowRight size={18} /></i>
          <article><span><PackageCheck size={20} /></span><strong>Stok hareketi</strong><small>Ürün ve sarf tüketimi</small></article>
          <i><ArrowRight size={18} /></i>
          <article><span><Signature size={20} /></span><strong>Tek imza</strong><small>Ziyaret kapanışı</small></article>
          <i><ArrowRight size={18} /></i>
          <article><span><FileCheck2 size={20} /></span><strong>PDF dağıtımı</strong><small>Portal ve e-posta</small></article>
        </div>
      </section>

      <section className="landing-section landing-workflow" id="workflow">
        <div className="workflow-visual">
          <div className="workflow-glow" />
          <div className="workflow-phone"><div className="phone-speaker" /><div className="phone-brand"><span className="phone-logo"><img src="/pesneer-mark.jpeg" alt="Pestneer" /></span><strong>Pestneer</strong><span>SAHA</span></div><div className="phone-greeting"><small>15 AĞUSTOS 2026</small><strong>Merhaba, Burak</strong><span>Bugün 4 görevin var</span></div><div className="phone-shift"><div><span>Çalışma süresi</span><strong>04:32:18</strong></div><button>Öğle Molası</button></div><div className="phone-job"><small>SIRADAKİ İŞ · 10:30</small><strong>Maviova Gıda</strong><span><MapPin size={11} /> Merkez Tesisi</span><button>İş emrini aç <ChevronRight size={13} /></button></div><div className="phone-home"><i /><i /><i /></div></div>
          <div className="workflow-scan-line" />
          <div className="workflow-badge badge-sign"><Signature size={18} /><span><strong>Dijital imza</strong><small>Sahada tamamlandı</small></span></div>
          <div className="workflow-badge badge-stock"><PackageCheck size={18} /><span><strong>Araç stoku</strong><small>Kontrol edildi</small></span></div>
        </div>
        <div className="workflow-copy"><p className="landing-kicker">SAHADAN MERKEZE KESİNTİSİZ AKIŞ</p><h2>Her adım kayıtlı.<br />Her ekip senkronize.</h2><p>Ofiste planlanan iş, çalışan ekranına anında düşer. Saha ekibi mesaisini başlatır, stok kontrolünü yapar, uygulamayı tamamlar ve imzalı raporu tek akışta oluşturur.</p><ol><li><span>01</span><div><strong>Müşteri ve şubeyi seçin</strong><small>Tek müşteri altında yüzlerce bağımsız lokasyon yönetin.</small></div></li><li><span>02</span><div><strong>Ekibi ve zamanı planlayın</strong><small>İşleri toplu oluşturun, doğru personele atayın.</small></div></li><li><span>03</span><div><strong>Sahadan raporu tamamlayın</strong><small>Ürün, uygulama ve imza bilgileriyle PDF çıktısını hazırlayın.</small></div></li></ol></div>
      </section>

      <section className="landing-security" id="security">
        <div><p><Fingerprint size={16} /> KURUMSAL GÜVENLİK MİMARİSİ</p><h2>Her firma kendi alanında.<br /><span>Her rol yalnızca ihtiyacını görür.</span></h2></div>
        <div className="security-points"><article><ShieldCheck size={20} /><span><strong>Firma bazlı izolasyon</strong><small>Şirket verileri veritabanı seviyesinde keskin biçimde ayrılır.</small></span></article><article><UsersRound size={20} /><span><strong>Üç ayrı kullanıcı portalı</strong><small>Firma sahibi, çalışan ve müşteri için özel yetki ve ekranlar.</small></span></article><article><FileCheck2 size={20} /><span><strong>Denetime hazır arşiv</strong><small>Rapor, kroki, trend, risk, ruhsat ve MSDS/GBF kayıtları yetkiye göre erişilir.</small></span></article></div>
      </section>

      <section className="landing-cta"><div className="cta-orb" /><div><span><i className="cta-logo"><img src="/pesneer-mark.jpeg" alt="Pestneer" /></i> PESTNEER OPERASYON MERKEZİ</span><h2>Pest kontrol şirketinizi<br />geleceğe hazırlayın.</h2><p>Daha düzenli ekipler, daha hızlı saha operasyonları ve daha güçlü müşteri deneyimi.</p></div><button onClick={onLogin}>Giriş yap ve sistemi keşfet <ArrowRight size={18} /></button></section>
      <footer className="landing-footer"><a className="landing-brand" href="#top"><span className="landing-logo-shell"><img src="/pesneer-mark.jpeg" alt="Pestneer" /></span><div><strong>Pestneer</strong><small>OPERASYONUN GÜVENLİ MERKEZİ</small></div></a><p>© 2026 Pestneer. Pest kontrol operasyon yönetim sistemi.</p><div><a href="#features">Özellikler</a><a href="#security">Güvenlik</a><button onClick={onLogin}>Giriş Yap</button></div></footer>
    </main>
  );
}
