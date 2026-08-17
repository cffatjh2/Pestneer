const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

let puppeteer;
try {
  puppeteer = require('../frontend/node_modules/puppeteer-core');
} catch (e) {
  try {
    puppeteer = require('puppeteer-core');
  } catch {}
}


const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const html = `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<title>Pestneer - Adım Adım Kullanım Kılavuzu</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

  @page {
    size: A4 portrait;
    margin: 0;
  }

  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  body {
    font-family: 'Plus Jakarta Sans', 'Segoe UI', system-ui, -apple-system, sans-serif;
    color: #1e293b;
    background: #f1f5f9;
    line-height: 1.45;
    font-size: 9pt;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* A4 Page Container: 210mm x 297mm */
  .a4-page {
    width: 210mm;
    height: 297mm;
    max-height: 297mm;
    margin: 0 auto;
    background: #ffffff;
    padding: 14mm 14mm 14mm 14mm;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    page-break-after: always;
    break-after: page;
    position: relative;
    overflow: hidden;
  }

  /* COVER PAGE */
  .cover-page {
    background: linear-gradient(135deg, #042f2e 0%, #0d9488 50%, #0284c7 100%);
    color: #ffffff;
    padding: 25mm 20mm 20mm 20mm;
  }

  .cover-brand {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 20px;
  }

  .cover-logo {
    width: 52px;
    height: 52px;
    background: #ffffff;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 26px;
    font-weight: 800;
    color: #0d9488;
    box-shadow: 0 8px 20px rgba(0,0,0,0.25);
  }

  .cover-brand-name {
    font-size: 32pt;
    font-weight: 800;
    letter-spacing: -0.5px;
    color: #ffffff;
  }

  .cover-tagline {
    font-size: 10.5pt;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: #5eead4;
    font-weight: 700;
    margin-bottom: 30px;
  }

  .cover-title {
    font-size: 26pt;
    font-weight: 800;
    line-height: 1.25;
    margin-bottom: 14px;
    color: #ffffff;
  }

  .cover-desc {
    font-size: 11.5pt;
    color: #ccfbf1;
    line-height: 1.6;
    max-width: 90%;
    margin-bottom: 35px;
  }

  .cover-pill-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-bottom: 35px;
  }

  .cover-pill {
    background: rgba(255, 255, 255, 0.12);
    border: 1px solid rgba(255, 255, 255, 0.22);
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 9.5pt;
    font-weight: 600;
  }

  .cover-footer {
    border-top: 1px solid rgba(255, 255, 255, 0.2);
    padding-top: 14px;
    display: flex;
    justify-content: space-between;
    font-size: 8.5pt;
    color: #99f6e4;
  }

  /* INNER HEADER & FOOTER */
  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 2px solid #0d9488;
    padding-bottom: 5px;
    margin-bottom: 10px;
  }

  .page-header .brand {
    font-size: 11pt;
    font-weight: 800;
    color: #0d9488;
  }

  .page-header .category {
    font-size: 8pt;
    font-weight: 600;
    color: #64748b;
    border-left: 1px solid #cbd5e1;
    padding-left: 8px;
    margin-left: 8px;
  }

  .page-header .meta {
    font-size: 7.5pt;
    font-weight: 600;
    color: #94a3b8;
  }

  .page-footer {
    border-top: 1px solid #e2e8f0;
    padding-top: 5px;
    display: flex;
    justify-content: space-between;
    font-size: 7.5pt;
    color: #94a3b8;
  }

  .page-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    gap: 8px;
  }

  /* HEADINGS */
  h1 {
    font-size: 13.5pt;
    font-weight: 800;
    color: #0f172a;
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }

  .badge-num {
    background: #0d9488;
    color: #ffffff;
    width: 24px;
    height: 24px;
    border-radius: 6px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 9pt;
    font-weight: 800;
  }

  h2 {
    font-size: 10pt;
    font-weight: 700;
    color: #0f766e;
    margin-top: 4px;
    margin-bottom: 2px;
  }

  /* STEP BOXES */
  .step-box {
    border: 1px solid #e2e8f0;
    border-radius: 7px;
    padding: 8px 11px;
    background: #f8fafc;
    border-left: 4px solid #0d9488;
  }

  .step-box.blue {
    border-left-color: #0284c7;
  }

  .step-box.purple {
    border-left-color: #7c3aed;
  }

  .step-box.amber {
    border-left-color: #d97706;
  }

  .step-box-title {
    font-size: 9.2pt;
    font-weight: 700;
    color: #0f172a;
    margin-bottom: 3px;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .step-tag {
    background: #0d9488;
    color: #ffffff;
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 7pt;
    font-weight: 700;
  }

  .step-tag.blue { background: #0284c7; }
  .step-tag.purple { background: #7c3aed; }
  .step-tag.amber { background: #d97706; }

  .step-box ol, .step-box ul {
    margin-left: 16px;
    margin-top: 2px;
    margin-bottom: 2px;
  }

  .step-box li {
    margin-bottom: 2px;
    color: #334155;
    font-size: 8.5pt;
  }

  .grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .callout {
    padding: 7px 10px;
    border-radius: 6px;
    font-size: 8.2pt;
    display: flex;
    gap: 6px;
    align-items: flex-start;
  }

  .callout-tip {
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    color: #166534;
  }

  .callout-warn {
    background: #fffbeb;
    border: 1px solid #fef08a;
    color: #854d0e;
  }

  .callout-info {
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    color: #1e40af;
  }

  .ui-badge {
    display: inline-block;
    padding: 1px 5px;
    border-radius: 3px;
    font-size: 7.5pt;
    font-weight: 600;
    background: #e2e8f0;
    color: #1e293b;
    border: 1px solid #cbd5e1;
  }

  .ui-btn {
    display: inline-block;
    padding: 1px 6px;
    border-radius: 3px;
    font-size: 7.5pt;
    font-weight: 700;
    background: #0d9488;
    color: #ffffff;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 8pt;
    margin-top: 4px;
  }

  th, td {
    border: 1px solid #cbd5e1;
    padding: 5px 7px;
    text-align: left;
  }

  th {
    background: #f1f5f9;
    font-weight: 700;
    color: #0f172a;
  }
</style>
</head>
<body>

<!-- PAGE 1: COVER -->
<div class="a4-page cover-page">
  <div>
    <div class="cover-brand">
      <div class="cover-logo">P</div>
      <div class="cover-brand-name">Pestneer</div>
    </div>
    <div class="cover-tagline">Akıllı Pest Kontrol ve İşletim Sistemi</div>
    <div class="cover-title">Adım Adım Pratik<br>Kullanım Kılavuzu</div>
    <div class="cover-desc">
      Yöneticiler, ofis personeli, saha teknisyenleri ve müşteriler için "Nereye tıklanır, hangi adımda ne yapılır?" rehberi.
    </div>

    <div class="cover-pill-grid">
      <div class="cover-pill">🏢 1. Yönetici & Ofis İşlemleri (Müşteri, Kroki, QR, İş Emri)</div>
      <div class="cover-pill">📱 2. Saha Teknisyeni Mobil Rehberi (İstasyon, Sayım, İmza)</div>
      <div class="cover-pill">📷 3. Zararlı Sayımı: Manuel Giriş veya AI Sayım Akışı</div>
      <div class="cover-pill">👥 4. Müşteri Portalı ve Sık Sorulan Sorular</div>
    </div>
  </div>

  <div class="cover-footer">
    <div><strong>Platform:</strong> Pestneer Web & Mobil v0.8.0</div>
    <div><strong>Erişim:</strong> https://pestneer.vercel.app</div>
    <div><strong>Standart:</strong> Sağlık Bakanlığı EK-1 & BRCGS Uyumlu</div>
  </div>
</div>

<!-- PAGE 2: YÖNETİCİ: MÜŞTERİ, ŞUBE VE PERSONEL -->
<div class="a4-page">
  <div class="page-header">
    <div>
      <span class="brand">Pestneer</span>
      <span class="category">Yönetici Kılavuzu: Kurulum & Tanımlar</span>
    </div>
    <div class="meta">Sayfa 2 / 7</div>
  </div>

  <div class="page-body">
    <h1><span class="badge-num">01</span> Firma Ayarları, Müşteri & Personel Tanımlama</h1>

    <div class="step-box">
      <div class="step-box-title"><span class="step-tag">ADIM 1</span> Firma Profilini ve Resmi Bilgileri Doldurma</div>
      <p style="font-size: 8.5pt;">Resmi EK-1 raporlarının eksiksiz çıkması için ilk kurulumda yapılması gerekenler:</p>
      <ol>
        <li>Sol menüden <span class="ui-badge">⚙️ Ayarlar</span> sekmesine tıklayın.</li>
        <li><strong>Firma Bilgileri:</strong> Ticari unvan, açık adres, telefon ve e-posta adresinizi girin.</li>
        <li><strong>Resmi Yetkililer:</strong> Sağlık Bakanlığı İzin Belge No, Mesul Müdür ve Ekip Sorumlusu isimlerini yazın.</li>
        <li><strong>Logo:</strong> Raporların üzerinde görünecek firma logonuzu (PNG/JPG) yükleyip <span class="ui-btn">Kaydet</span> deyin.</li>
      </ol>
    </div>

    <div class="step-box">
      <div class="step-box-title"><span class="step-tag">ADIM 2</span> Müşteri ve Şube Kaydı Oluşturma</div>
      <ol>
        <li>Sol menüden <span class="ui-badge">📋 İş Emirleri</span> sekmesine gidin, sağ üstteki <span class="ui-btn">+ Müşteri Ekle</span> butonuna basın.</li>
        <li><strong>Çatı Müşteri:</strong> Firma adını ve vergi bilgilerini yazın (Örn: <em>Anadolu Restoranları A.Ş.</em>).</li>
        <li><strong>Şube Ekle:</strong> <span class="ui-badge">+ Şube Ekle</span> butonuna basarak şube adını (Örn: <em>Kızılay Şubesi</em>) ve açık adresini girin.</li>
        <li><strong>Müşteri Şifresi:</strong> Müşterinin kendi portalına girip raporlarını görebilmesi için bir şifre belirleyin.</li>
        <li><span class="ui-btn">Kaydet</span> butonuna basın.</li>
      </ol>
    </div>

    <div class="step-box">
      <div class="step-box-title"><span class="step-tag">ADIM 3</span> Saha Teknisyeni Ekleme & Şifre Verme</div>
      <ol>
        <li>Sol menüden <span class="ui-badge">👥 Ekip</span> sekmesine gidin, sağ üstteki <span class="ui-btn">+ Yeni Personel</span> butonuna tıklayın.</li>
        <li>Teknisyenin Adı Soyadı, Telefonu, E-postası ve Biyosidal Uygulayıcı Belge No'sunu girin.</li>
        <li>Rol olarak <strong>Saha Teknisyeni</strong> seçin ve telefondan giriş yapacağı bir şifre belirleyin.</li>
      </ol>
    </div>

    <div class="callout callout-info">
      <strong>ℹ️ Teknisyen Girişi:</strong> Teknisyen telefonundan sisteme girerken <strong>Firma Kodu</strong> (Örn: <code>TURA-ANKARA</code>), <strong>E-posta</strong> ve belirlediğiniz <strong>Şifre</strong> ile girer.
    </div>
  </div>

  <div class="page-footer">
    <div>Pestneer Standart İşletim Prosedürü (SOP)</div>
    <div>Bölüm 1: Yönetici & Ofis Operasyonları</div>
  </div>
</div>

<!-- PAGE 3: KROKİ, İSTASYON VE QR KOD ETİKETLERİ -->
<div class="a4-page">
  <div class="page-header">
    <div>
      <span class="brand">Pestneer</span>
      <span class="category">Yönetici Kılavuzu: İstasyon & Kroki</span>
    </div>
    <div class="meta">Sayfa 3 / 7</div>
  </div>

  <div class="page-body">
    <h1><span class="badge-num">02</span> Kroki Çizimi, İstasyonlar ve QR Etiket Basımı</h1>

    <div class="step-box">
      <div class="step-box-title"><span class="step-tag">ADIM 4</span> Kat Planı (Kroki) Üzerine İstasyon Yerleştirme</div>
      <ol>
        <li>Sol menüden <span class="ui-badge">🗺️ Krokiler</span> sekmesine gidin, müşteriyi ve şubeyi seçin.</li>
        <li><span class="ui-btn">+ Yeni Kroki</span> diyerek müşterinin kat planı resmini (JPG/PNG/PDF) yükleyin.</li>
        <li>Sol araç çubuğundan cihaz türünü seçin:
          <span class="ui-badge">YM (Yemli İstasyon)</span>, 
          <span class="ui-badge">KM (Kemirgen Kapanı)</span>, 
          <span class="ui-badge">EFC (Sinek Cihazı)</span>, 
          <span class="ui-badge">YK (Yapışkan Kart)</span>.
        </li>
        <li>Kroki üzerinde istasyonun bulunduğu konuma tıklayın. Numara (Örn: <code>YM-01</code>) otomatik atanır.</li>
        <li>Tüm istasyonları yerleştirdikten sonra <span class="ui-btn">Krokiyi Kaydet</span> butonuna basın.</li>
      </ol>
    </div>

    <div class="step-box">
      <div class="step-box-title"><span class="step-tag">ADIM 5</span> Logolu & Karekodlu (QR) İstasyon Etiketlerini Basma</div>
      <ol>
        <li>Kroki ekranında sağ üstteki <span class="ui-btn">🖨️ QR Etiketleri İndir</span> butonuna basın.</li>
        <li>Açılan pencerede etiket şablonunu (A4 24'lü, 16'lı veya Tekli Rulo) seçin.</li>
        <li>Sistem; her kutu için <strong>Firma Logonuz</strong>, <strong>İstasyon Numarası</strong> ve <strong>Karekod (QR)</strong> içeren PDF'i anında üretir.</li>
        <li>Çıktıyı yapışkanlı etiket kağıdına basıp sahada kutuların üzerine yapıştırın.</li>
      </ol>
    </div>

    <div class="step-box blue">
      <div class="step-box-title"><span class="step-tag blue">ADIM 6</span> İş Emri Planlama & Teknisyene Gönderme</div>
      <ol>
        <li>Sol menüden <span class="ui-badge">📋 İş Emirleri</span> -> <span class="ui-btn">+ Yeni İş Emri</span> butonuna basın.</li>
        <li>Müşteri, Şube, Tarih, Saat ve atanacak Teknisyeni seçin.</li>
        <li><span class="ui-btn">Oluştur</span> dediğiniz anda iş teknisyenin telefonuna anında düşer.</li>
      </ol>
    </div>
  </div>

  <div class="page-footer">
    <div>Pestneer Standart İşletim Prosedürü (SOP)</div>
    <div>Bölüm 1: Kroki, QR ve Planlama</div>
  </div>
</div>

<!-- PAGE 4: TEKNİSYEN MOBİL GİRİŞ VE İSTASYON KONTROLÜ -->
<div class="a4-page">
  <div class="page-header">
    <div>
      <span class="brand">Pestneer</span>
      <span class="category">Saha Teknisyeni: Mobil Saha Rehberi</span>
    </div>
    <div class="meta">Sayfa 4 / 7</div>
  </div>

  <div class="page-body">
    <h1><span class="badge-num">03</span> Saha Teknisyeni: Mobil Giriş & İstasyon Kontrolü</h1>

    <div class="step-box blue">
      <div class="step-box-title"><span class="step-tag blue">ADIM 1</span> Telefondan Giriş ve Günün İş Rotası</div>
      <ol>
        <li>Telefonunuzdan <strong><code>https://pestneer.vercel.app</code></strong> adresini açın.</li>
        <li>Firma Kodu, E-postanız ve Şifrenizle giriş yapın.</li>
        <li>Bugün size atanmış işleri sırayla görürsünüz. Sıradaki işe tıklayın.</li>
        <li><span class="ui-btn">🗺️ Haritada Aç</span> diyerek navigasyonla müşteri adresine gidin.</li>
      </ol>
    </div>

    <div class="step-box blue">
      <div class="step-box-title"><span class="step-tag blue">ADIM 2</span> İstasyona Gelindiğinde Karekod (QR) Okutma</div>
      <ol>
        <li>İş emri detayından <span class="ui-btn">İstasyon Aktivasyon Listesi</span> butonuna basın.</li>
        <li>Sağ üstteki <span class="ui-btn">📷 QR Kod Okut</span> butonuna tıklayıp kamerayı istasyon kutusundaki karekoda tutun.</li>
        <li>Karekod okunduğu anda ilgili istasyon (Örn: <code>YM-03</code>) ekranda <strong>1 saniyede otomatik açılır</strong>.</li>
        <li><em>(Karekod yıpranmışsa arama kutusuna <code>YM-03</code> yazıp da seçebilirsiniz).</em></li>
      </ol>
    </div>

    <div class="step-box blue">
      <div class="step-box-title"><span class="step-tag blue">ADIM 3</span> İstasyon Durumunu Seçme</div>
      <p style="font-size: 8.5pt;">Kutuyu açıp kontrol ettikten sonra durum butonuna basın:</p>
      <ul>
        <li><span class="ui-badge" style="background:#dcfce7; color:#166534; font-weight:700;">🟢 Aktivite Yok</span> : Kutu temizse tek tıkla basın (Sıradaki istasyona geçer).</li>
        <li><span class="ui-badge" style="background:#fee2e2; color:#991b1b; font-weight:700;">🔴 Aktivite Var</span> : Böcek veya kemirgen varsa basın (Sayım adımına geçer).</li>
        <li><span class="ui-badge" style="background:#fef3c7; color:#92400e; font-weight:700;">🟡 Hasarlı / Kırık</span> : Kutu ezik veya kırıksa basın.</li>
        <li><span class="ui-badge" style="background:#f1f5f9; color:#475569; font-weight:700;">⚪ Ulaşılamadı</span> : Önü kapalıysa basın, nedenini seçin.</li>
      </ul>
    </div>
  </div>

  <div class="page-footer">
    <div>Pestneer Standart İşletim Prosedürü (SOP)</div>
    <div>Bölüm 2: Saha Teknisyeni İşlemleri</div>
  </div>
</div>

<!-- PAGE 5: ZARARLI SAYIMI: MANUEL VE AI SEÇENEKLERİ -->
<div class="a4-page">
  <div class="page-header">
    <div>
      <span class="brand">Pestneer</span>
      <span class="category">Saha Teknisyeni: Zararlı Sayım Akışı</span>
    </div>
    <div class="meta">Sayfa 5 / 7</div>
  </div>

  <div class="page-body">
    <h1><span class="badge-num">04</span> Zararlı Sayımı: Manuel Giriş veya AI ile Sayım</h1>

    <p style="font-size: 8.8pt;">İstasyonda <strong>"Aktivite Var"</strong> seçildiğinde zararlıları kaydetmek için <strong>2 yöntemden dilediğinizi</strong> seçebilirsiniz:</p>

    <div class="grid-2">
      <div class="step-box" style="border-left-color: #0d9488;">
        <div class="step-box-title"><span class="step-tag">YÖNTEM 1</span> Tamamen Manuel Sayım</div>
        <p style="font-size: 8.2pt;">Kamerayı hiç kullanmadan el ile girmek için:</p>
        <ol style="font-size: 8.2pt;">
          <li><strong>Zararlı Türü:</strong> Açılır listeden görülen zararlıyı (Örn: <em>Hamamböceği, Karasinek, Kemirgen</em>) seçin. Listede yoksa "Diğer" yazın.</li>
          <li><strong>Bulgu:</strong> <em>Yakalama, Görsel Tespit, Yenmiş Yem</em> seçin.</li>
          <li><strong>Adet Girişi:</strong>
            <ul>
              <li>İster klavyeden sayıyı yazın (Örn: <code>15</code>),</li>
              <li>İster <strong><code>+</code></strong> / <strong><code>−</code></strong> butonlarına basarak artırın.</li>
            </ul>
          </li>
          <li><strong>Levha Değişimi:</strong> Yapışkan kartı değiştirdiyseniz işaretleyin.</li>
          <li><span class="ui-btn">Kaydet</span> deyin.</li>
        </ol>
      </div>

      <div class="step-box purple">
        <div class="step-box-title"><span class="step-tag purple">YÖNTEM 2</span> Pestneer Vision (AI ile Sayım)</div>
        <p style="font-size: 8.2pt;">Kartta çok sayıda böcek varsa otomatik saydırmak için:</p>
        <ol style="font-size: 8.2pt;">
          <li><span class="ui-btn" style="background:#7c3aed;">📷 Fotoğraf Çek & AI ile Say</span> butonuna basın.</li>
          <li>Yapışkan kartın net bir fotoğrafını çekin.</li>
          <li><strong>AI Otomatik Sayar:</strong> Yapay zeka böcekleri bulup sayar (Örn: <em>12 Hamamböceği, 3 Sinek</em>).</li>
          <li><strong>Kontrol:</strong> Sayıları görürsünüz, gerekirse <strong><code>+</code> / <code>−</code></strong> ile düzeltebilirsiniz.</li>
          <li><span class="ui-btn" style="background:#7c3aed;">Sonuçları İstasyona Aktar</span> butonuna basın. Durum, tür, adet ve açıklama forma <strong>otomatik yazılır</strong>.</li>
        </ol>
      </div>
    </div>

    <div class="callout callout-tip" style="margin-top: 10px;">
      <strong>🎯 Otomatik İstatistik:</strong> Yapılan sayımlar resmi raporda tabloya dönüşür ve müşteri portalında aylık trend grafiklerini otomatik besler.
    </div>
  </div>

  <div class="page-footer">
    <div>Pestneer Standart İşletim Prosedürü (SOP)</div>
    <div>Bölüm 2: Zararlı Sayımı ve AI Akışı</div>
  </div>
</div>

<!-- PAGE 6: EK-1 FORMU VE DİJİTAL İMZA -->
<div class="a4-page">
  <div class="page-header">
    <div>
      <span class="brand">Pestneer</span>
      <span class="category">Saha Teknisyeni: Rapor & İmza</span>
    </div>
    <div class="meta">Sayfa 6 / 7</div>
  </div>

  <div class="page-body">
    <h1><span class="badge-num">05</span> Resmi EK-1 Formu, İlaç Sarfiyatı & Dijital İmza</h1>

    <div class="step-box blue">
      <div class="step-box-title"><span class="step-tag blue">ADIM 5</span> EK-1 Biyosidal Uygulama Formunu Doldurma</div>
      <ol>
        <li>İstasyonlar bittikten sonra iş detayından <span class="ui-btn">EK-1 Uygulama Formu</span> butonuna basın.</li>
        <li>Mahal türü (Örn: <em>Mutfak / Depo</em>), Alan (m²) ve Hedef Zararlıları işaretleyin.</li>
        <li>Alınan Güvenlik Önlemlerini (Örn: <em>Maske takıldı, İlaçlama sahası boşaltıldı</em>) seçin.</li>
      </ol>
    </div>

    <div class="step-box blue">
      <div class="step-box-title"><span class="step-tag blue">ADIM 6</span> Kullanılan İlacı Seçme (Otomatik Araç Stoğu Düşümü)</div>
      <ol>
        <li><span class="ui-badge">+ Stoktan Ürün Ekle</span> butonuna basın.</li>
        <li>Aracınızda bulunan ilacı (Örn: <em>Maxforce Prime Jel</em>) seçin ve uygulanan miktarı (Örn: <em>20 Gram</em>) yazın.</li>
        <li>İlacın Sağlık Bakanlığı ruhsat numarası ve aktif maddesi otomatik eklenir. Rapor onaylandığında araç stoğunuzdan otomatik düşer.</li>
      </ol>
    </div>

    <div class="step-box blue">
      <div class="step-box-title"><span class="step-tag blue">ADIM 7</span> Saha Fotoğrafları Yükleme</div>
      <ol>
        <li><span class="ui-badge">📷 Fotoğraf Ekle</span> diyerek uygulama yapılan kritik noktaların (öncesi/sonrası) fotoğraflarını çekin.</li>
      </ol>
    </div>

    <div class="step-box blue">
      <div class="step-box-title"><span class="step-tag blue">ADIM 8</span> Dokunmatik İmza ve Raporu Tamamlama</div>
      <ol>
        <li><strong>Uygulayıcı İmzası:</strong> Ekrana parmağınızla imzanızı atın.</li>
        <li><strong>Müşteri İmzası:</strong> Telefonu müşteri yetkilisine uzatıp ad-soyad ve dokunmatik imzasını alın.</li>
        <li>Yeşil <span class="ui-btn" style="background:#16a34a;">✔ EK-1 Formunu Onayla</span> butonuna basın.</li>
      </ol>
    </div>

    <div class="callout callout-tip">
      <strong>🚀 Anında Teslim:</strong> Onaylandığı anda Sağlık Bakanlığı formatındaki renkli PDF üretilir ve müşterinin e-postasına saniyesinde gönderilir.
    </div>
  </div>

  <div class="page-footer">
    <div>Pestneer Standart İşletim Prosedürü (SOP)</div>
    <div>Bölüm 2: Resmi Raporlama ve İmza</div>
  </div>
</div>

<!-- PAGE 7: MÜŞTERİ PORTALI VE SORUN ÇÖZÜMÜ -->
<div class="a4-page">
  <div class="page-header">
    <div>
      <span class="brand">Pestneer</span>
      <span class="category">Müşteri Portalı & Sorun Çözümü</span>
    </div>
    <div class="meta">Sayfa 7 / 7</div>
  </div>

  <div class="page-body">
    <h1><span class="badge-num">06</span> Müşteri Portalı & Sık Karşılaşılan Sorular</h1>

    <div class="step-box" style="border-left-color: #0284c7;">
      <div class="step-box-title">🏢 Müşteri Kendi Portalını Nasıl Kullanır?</div>
      <ol>
        <li>Müşteriniz <strong><code>https://pestneer.vercel.app</code></strong> adresine girer.</li>
        <li>Firma Kodu, Kendi E-postası ve Şifresiyle oturum açar.</li>
        <li><strong>Neler Yapabilir?</strong>
          <ul>
            <li><strong>Raporlar:</strong> Geçmiş tüm resmi EK-1 PDF raporlarını tek tıkla indirir.</li>
            <li><strong>Canlı Kroki:</strong> Fabrikasındaki istasyonların aktivite durumunu haritada renkli görür.</li>
            <li><strong>Talep Açma:</strong> Ekstra zararlı gördüğünde fotoğraflı servis talebi oluşturur.</li>
            <li><strong>DÖF Onayı:</strong> Açılan düzeltici faaliyetleri (Örn: Kapı altı fırçası takıldı) inceler ve kapatır.</li>
          </ul>
        </li>
      </ol>
    </div>

    <h2>Sık Karşılaşılan Durumlar ve Çözümleri (Troubleshooting)</h2>
    <table>
      <thead>
        <tr>
          <th style="width:32%;">Durum / Soru</th>
          <th style="width:68%;">Ne Yapılmalıdır?</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>İnternet çekmeyen bodrum katında çalışma:</strong></td>
          <td>Pestneer'da çalışmaya devam edin. Bilgiler telefona kaydedilir. İnternet çeken yere çıktığınızda tek tıkla sunucuya iletilir.</td>
        </tr>
        <tr>
          <td><strong>Karekod yıpranmış veya okunamıyorsa:</strong></td>
          <td>Arama kutusuna istasyon numarasını (Örn: <code>YM-04</code>) yazarak listeden istasyonu elle seçebilirsiniz.</td>
        </tr>
        <tr>
          <td><strong>Resmi Denetim Paketi (BRCGS/IFS) indirme:</strong></td>
          <td>Yönetici panelinde <span class="ui-badge">🛡️ Denetim Paketleri</span> sekmesine gidip tarih aralığını seçin ve <span class="ui-btn">Denetim Paketini İndir</span> deyin; tüm krokiler, MSDS'ler, raporlar tek ZIP olarak iner.</td>
        </tr>
        <tr>
          <td><strong>Sistem Admin Girişi:</strong></td>
          <td>Gizli yönetici paneli yolu: <code>/pestneer-system-control-9f4c2</code></td>
        </tr>
      </tbody>
    </table>

    <div class="callout callout-info" style="margin-top: 6px;">
      <strong>📞 Destek:</strong> Sorularınız ve destek için Pestneer yönetim panelindeki Destek sekmesini kullanabilirsiniz.
    </div>
  </div>

  <div class="page-footer">
    <div>Pestneer Standart İşletim Prosedürü (SOP)</div>
    <div>Bölüm 3 & 4: Müşteri Portalı ve Destek</div>
  </div>
</div>

</body>
</html>
`;

async function buildPdf() {
  const outputPath = 'C:\\Users\\cffat\\OneDrive\\Masaüstü\\Pestneer_Adim_Adim_Kullanim_Kilavuzu.pdf';
  console.log('Generating Pixel-Perfect Practical PDF to:', outputPath);

  if (puppeteer) {
    try {
      const browser = await puppeteer.launch({
        executablePath: chromePath,
        headless: true,
        args: ['--no-sandbox', '--disable-gpu', '--disable-setuid-sandbox']
      });

      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });

      await page.pdf({
        path: outputPath,
        format: 'A4',
        printBackground: true,
        margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' }
      });

      await browser.close();

      const stats = fs.statSync(outputPath);
      console.log(`SUCCESS! Pixel-Perfect PDF generated successfully with Puppeteer at: ${outputPath}`);
      console.log(`File size: ${stats.size} bytes`);
      return;
    } catch (e) {
      console.warn('Puppeteer launch error, falling back to Chrome CLI:', e.message);
    }
  }

  const tempHtmlPath = path.join(__dirname, 'temp_practical_guide.html');
  fs.writeFileSync(tempHtmlPath, html, 'utf8');

  try {
    execSync(`"${chromePath}" --headless --disable-gpu --no-pdf-header-footer --print-to-pdf="${outputPath}" "${tempHtmlPath}"`, { stdio: 'inherit' });
    console.log('SUCCESS! Pixel-Perfect PDF generated successfully with Chrome CLI at:', outputPath);
    console.log('File size:', fs.statSync(outputPath).size, 'bytes');
  } catch (err) {
    console.error('Error during PDF creation:', err);
  } finally {
    if (fs.existsSync(tempHtmlPath)) {
      fs.unlinkSync(tempHtmlPath);
    }
  }
}

buildPdf().catch(console.error);

