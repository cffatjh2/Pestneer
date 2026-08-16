const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const htmlContent = `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<title>Pestneer - Kapsamlı Kullanıcı Kılavuzu ve Özellik Rehberi</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');

  @page {
    size: A4;
    margin: 14mm 12mm 14mm 12mm;
  }

  @page :first {
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
    background: #ffffff;
    line-height: 1.55;
    font-size: 10.5pt;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* Page Break Utilities */
  .page-break {
    page-break-before: always;
    break-before: page;
  }

  .avoid-break {
    page-break-inside: avoid;
    break-inside: avoid;
  }

  /* COVER PAGE */
  .cover-page {
    width: 210mm;
    height: 297mm;
    background: linear-gradient(135deg, #091e3a 0%, #0f3d4c 45%, #0d5f56 100%);
    color: #ffffff;
    padding: 50mm 25mm 30mm 25mm;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    position: relative;
    overflow: hidden;
  }

  .cover-pattern {
    position: absolute;
    top: -50px;
    right: -50px;
    width: 400px;
    height: 400px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(20, 184, 166, 0.18) 0%, rgba(20, 184, 166, 0) 70%);
  }

  .cover-pattern-2 {
    position: absolute;
    bottom: -100px;
    left: -100px;
    width: 500px;
    height: 500px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(14, 165, 233, 0.15) 0%, rgba(14, 165, 233, 0) 70%);
  }

  .cover-brand {
    display: flex;
    align-items: center;
    gap: 15px;
    margin-bottom: 20px;
  }

  .cover-logo-box {
    width: 60px;
    height: 60px;
    background: linear-gradient(135deg, #0d9488, #14b8a6);
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 28px;
    font-weight: 800;
    color: #ffffff;
    box-shadow: 0 10px 25px rgba(13, 148, 136, 0.4);
  }

  .cover-brand-name {
    font-size: 32pt;
    font-weight: 800;
    letter-spacing: -0.5px;
    background: linear-gradient(90deg, #ffffff, #a5f3fc);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .cover-tagline {
    font-size: 11pt;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: #5eead4;
    font-weight: 700;
    margin-bottom: 30px;
  }

  .cover-title {
    font-size: 27pt;
    font-weight: 800;
    line-height: 1.2;
    margin-bottom: 18px;
    color: #ffffff;
  }

  .cover-subtitle {
    font-size: 13pt;
    color: #cbd5e1;
    line-height: 1.6;
    max-width: 90%;
    font-weight: 400;
    margin-bottom: 40px;
  }

  .cover-badges {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 40px;
  }

  .cover-badge {
    background: rgba(255, 255, 255, 0.12);
    border: 1px solid rgba(255, 255, 255, 0.2);
    padding: 8px 16px;
    border-radius: 30px;
    font-size: 9.5pt;
    font-weight: 600;
    color: #f1f5f9;
  }

  .cover-footer {
    border-top: 1px solid rgba(255, 255, 255, 0.15);
    padding-top: 20px;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    font-size: 9.5pt;
    color: #94a3b8;
  }

  .cover-footer strong {
    color: #ffffff;
    display: block;
    font-size: 10pt;
    margin-bottom: 3px;
  }

  /* INNER PAGES LAYOUT */
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 2px solid #0f766e;
    padding-bottom: 8px;
    margin-bottom: 20px;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .header-logo {
    font-weight: 800;
    color: #0f766e;
    font-size: 14pt;
    letter-spacing: -0.5px;
  }

  .header-category {
    font-size: 8.5pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #64748b;
    border-left: 1px solid #cbd5e1;
    padding-left: 10px;
  }

  .header-right {
    font-size: 8.5pt;
    font-weight: 600;
    color: #0d9488;
    background: #f0fdfa;
    padding: 3px 10px;
    border-radius: 12px;
  }

  .footer {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    display: flex;
    justify-content: space-between;
    font-size: 8pt;
    color: #94a3b8;
    border-top: 1px solid #e2e8f0;
    padding-top: 6px;
  }

  /* TYPOGRAPHY */
  h1 {
    font-size: 18pt;
    font-weight: 800;
    color: #0f172a;
    letter-spacing: -0.5px;
    margin-bottom: 12px;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  h1 .section-num {
    background: #0f766e;
    color: #ffffff;
    font-size: 11pt;
    padding: 3px 10px;
    border-radius: 8px;
    font-weight: 800;
  }

  h2 {
    font-size: 13pt;
    font-weight: 700;
    color: #0f766e;
    margin-top: 18px;
    margin-bottom: 8px;
    border-left: 3.5px solid #0d9488;
    padding-left: 8px;
  }

  h3 {
    font-size: 11pt;
    font-weight: 700;
    color: #1e293b;
    margin-top: 12px;
    margin-bottom: 6px;
  }

  p {
    margin-bottom: 10px;
    color: #334155;
    text-align: justify;
  }

  /* CARDS & CONTAINERS */
  .grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-bottom: 14px;
  }

  .grid-3 {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 10px;
    margin-bottom: 14px;
  }

  .card {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 12px;
    margin-bottom: 12px;
  }

  .card-teal {
    background: #f0fdfa;
    border: 1px solid #ccfbf1;
  }

  .card-blue {
    background: #f0f9ff;
    border: 1px solid #e0f2fe;
  }

  .card-amber {
    background: #fffbeb;
    border: 1px solid #fef3c7;
  }

  .card-header {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 700;
    font-size: 10.5pt;
    color: #0f172a;
    margin-bottom: 6px;
  }

  .card-icon {
    width: 24px;
    height: 24px;
    border-radius: 6px;
    background: #0f766e;
    color: #ffffff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 11pt;
    font-weight: 800;
  }

  /* CALLOUT BOXES */
  .callout {
    padding: 10px 14px;
    border-radius: 8px;
    margin: 12px 0;
    font-size: 9.5pt;
    display: flex;
    gap: 10px;
    align-items: flex-start;
  }

  .callout-tip {
    background: #f0fdf4;
    border-left: 4px solid #22c55e;
    color: #15803d;
  }

  .callout-info {
    background: #eff6ff;
    border-left: 4px solid #3b82f6;
    color: #1e40af;
  }

  .callout-warning {
    background: #fffbeb;
    border-left: 4px solid #f59e0b;
    color: #b45309;
  }

  .callout-icon {
    font-size: 13pt;
    font-weight: 800;
    line-height: 1;
  }

  /* STEP WIZARD LIST */
  .step-list {
    margin: 10px 0 14px 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .step-item {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    padding: 8px 12px;
    border-radius: 8px;
  }

  .step-number {
    background: #0f766e;
    color: #ffffff;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 9pt;
    font-weight: 800;
    flex-shrink: 0;
    margin-top: 1px;
  }

  .step-content strong {
    color: #0f172a;
    display: block;
    font-size: 9.5pt;
    margin-bottom: 2px;
  }

  .step-content span {
    font-size: 9pt;
    color: #475569;
  }

  /* TABLES */
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 10px 0 14px 0;
    font-size: 9pt;
  }

  th, td {
    border: 1px solid #cbd5e1;
    padding: 7px 10px;
    text-align: left;
  }

  th {
    background: #0f766e;
    color: #ffffff;
    font-weight: 700;
    font-size: 9pt;
  }

  tr:nth-child(even) {
    background: #f8fafc;
  }

  /* BADGES & TAGS */
  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 8pt;
    font-weight: 700;
    text-transform: uppercase;
  }

  .badge-green { background: #dcfce7; color: #166534; }
  .badge-blue { background: #dbeafe; color: #1e40af; }
  .badge-amber { background: #fef3c7; color: #92400e; }
  .badge-red { background: #fee2e2; color: #991b1b; }
  .badge-purple { background: #f3e8ff; color: #6b21a8; }

  /* TOC (TABLE OF CONTENTS) */
  .toc-container {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 16px 20px;
    margin: 15px 0 20px 0;
  }

  .toc-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 0;
    border-bottom: 1px dashed #cbd5e1;
    font-size: 9.5pt;
  }

  .toc-item:last-child {
    border-bottom: none;
  }

  .toc-title {
    font-weight: 600;
    color: #1e293b;
    display: flex;
    gap: 8px;
  }

  .toc-title span.num {
    color: #0f766e;
    font-weight: 800;
  }

  .toc-page {
    font-weight: 700;
    color: #0f766e;
  }

  ul, ol {
    margin-left: 18px;
    margin-bottom: 10px;
    color: #334155;
    font-size: 9.5pt;
  }

  li {
    margin-bottom: 4px;
  }
</style>
</head>
<body>

<!-- ========================================================================= -->
<!-- COVER PAGE -->
<!-- ========================================================================= -->
<div class="cover-page">
  <div class="cover-pattern"></div>
  <div class="cover-pattern-2"></div>

  <div>
    <div class="cover-brand">
      <div class="cover-logo-box">P</div>
      <div class="cover-brand-name">Pestneer</div>
    </div>
    <div class="cover-tagline">Dijital Pest Kontrol & Operasyon Yönetim Platformu</div>

    <div class="cover-title">KULLANICI KILAVUZU &<br>MODÜLER ÖZELLİK REHBERİ</div>
    <div class="cover-subtitle">
      Pest kontrol firmaları, saha personelleri ve kurumsal müşteriler için tasarlanmış; operasyon, interaktif kroki, yapay zeka destekli analiz, kalite-denetim ve ticari süreçleri kapsayan uçtan uca kullanım dokümanı.
    </div>

    <div class="cover-badges">
      <div class="cover-badge">✨ Yönetici & Operasyon Paneli</div>
      <div class="cover-badge">📱 Saha Personeli Mobil Portalı</div>
      <div class="cover-badge">🏢 7/24 Şeffaf Müşteri Portalı</div>
      <div class="cover-badge">🗺️ İnteraktif Kroki & QR İstasyon</div>
      <div class="cover-badge">🔍 Pestneer Vision Yapay Zeka</div>
      <div class="cover-badge">🛡️ BRCGS / IFS / ISO 22000 Uyumlu</div>
    </div>
  </div>

  <div class="cover-footer">
    <div>
      <strong>Hedef Kitle:</strong> Firma Sahipleri, Saha Teknisyenleri, Operasyon Sorumluları ve Tesis Yöneticileri
    </div>
    <div style="text-align: right;">
      <strong>Sürüm:</strong> v2.4 Enterprise Edition<br>
      <strong>Tarih:</strong> Ağustos 2026
    </div>
  </div>
</div>

<!-- ========================================================================= -->
<!-- PAGE 2: İÇİNDEKİLER VE PLATFORMA GENEL BAKIŞ -->
<!-- ========================================================================= -->
<div class="page-break"></div>

<div class="header">
  <div class="header-left">
    <span class="header-logo">Pestneer</span>
    <span class="header-category">Genel Bakış & İçindekiler</span>
  </div>
  <div class="header-right">Kullanıcı Rehberi</div>
</div>

<h1><span class="section-num">1</span> Platforma Genel Bakış ve İçindekiler</h1>

<p>
  <strong>Pestneer</strong>, pest kontrol (ilaçlama) sektöründe faaliyet gösteren firmaların saha operasyonlarını, müşteri ilişkilerini, yasal uyumluluklarını, stok hareketlerini ve denetim süreçlerini tek bir çatı altında dijitalleştiren yeni nesil bir bulut yönetim platformudur.
</p>
<p>
  Geleneksel kağıt formları, kaybolan servis fişlerini, Excel karmaşasını ve denetim öncesi yaşanan stresli dosya hazırlıklarını ortadan kaldırarak; <strong>Firma Yöneticisi</strong>, <strong>Saha Teknisyeni</strong> ve <strong>Hizmet Alan Müşteri</strong> arasında kesintisiz ve şeffaf bir dijital köprü kurar.
</p>

<div class="grid-3" style="margin-top: 15px;">
  <div class="card card-teal">
    <div class="card-header"><span class="card-icon">👑</span> Firma Yöneticisi</div>
    <p style="font-size: 8.5pt; margin: 0;">Tüm müşteriler, sözleşmeler, araç stokları, takvim, personel mesaileri, DÖF ve kalite denetimlerinin merkezi kontrolü.</p>
  </div>
  <div class="card card-blue">
    <div class="card-header"><span class="card-icon">👷</span> Saha Teknisyeni</div>
    <p style="font-size: 8.5pt; margin: 0;">Mobil uyumlu portal ile rota takibi, QR ile hızlı istasyon kontrolü, harcanan ilaç kaydı, dijital imza ve AI zararlı sayımı.</p>
  </div>
  <div class="card card-amber">
    <div class="card-header"><span class="card-icon">🏢</span> Tesis & Kalite Müdürü</div>
    <p style="font-size: 8.5pt; margin: 0;">Canlı tesis sağlık skoru, interaktif istasyon haritası, geçmiş servis raporları (EK-1), DÖF onaylama ve tek tıkla denetim arşivi.</p>
  </div>
</div>

<div class="toc-container">
  <div style="font-weight: 800; font-size: 11pt; color: #0f172a; margin-bottom: 8px; border-bottom: 2px solid #0f766e; padding-bottom: 4px;">
    📘 REHBER İÇİNDEKİLER TABLOSU
  </div>
  <div class="toc-item"><div class="toc-title"><span class="num">Bölüm 1:</span> Platforma Genel Bakış & Çoklu Rol Mimarisi</div><div class="toc-page">Sayfa 2</div></div>
  <div class="toc-item"><div class="toc-title"><span class="num">Bölüm 2:</span> Operasyon Merkezi (Canlı Yönetici Paneli)</div><div class="toc-page">Sayfa 3</div></div>
  <div class="toc-item"><div class="toc-title"><span class="num">Bölüm 3:</span> İş Emirleri & Uçtan Uca Saha Hizmet Akışı (EK-1)</div><div class="toc-page">Sayfa 4</div></div>
  <div class="toc-item"><div class="toc-title"><span class="num">Bölüm 4:</span> İnteraktif Kroki & QR İstasyon Yönetim Merkezi</div><div class="toc-page">Sayfa 5</div></div>
  <div class="toc-item"><div class="toc-title"><span class="num">Bölüm 5:</span> Pestneer Vision: Yapay Zeka Destekli Zararlı Tanıma</div><div class="toc-page">Sayfa 6</div></div>
  <div class="toc-item"><div class="toc-title"><span class="num">Bölüm 6:</span> Takvim, Akıllı Randevu & Rota Planlama</div><div class="toc-page">Sayfa 7</div></div>
  <div class="toc-item"><div class="toc-title"><span class="num">Bölüm 7:</span> Stok, Araç Depoları & Biyosidal Kimyasal Yönetimi</div><div class="toc-page">Sayfa 8</div></div>
  <div class="toc-item"><div class="toc-title"><span class="num">Bölüm 8:</span> Ticari Yönetim, Hizmet Paketleri & SLA Sözleşmeleri</div><div class="toc-page">Sayfa 9</div></div>
  <div class="toc-item"><div class="toc-title"><span class="num">Bölüm 9:</span> Kalite, Uyum & Denetim Merkezi (DÖF, Sağlık Skoru, Atık)</div><div class="toc-page">Sayfa 10</div></div>
  <div class="toc-item"><div class="toc-title"><span class="num">Bölüm 10:</span> Tek Tıkla Denetim Paketi (Audit Package Center)</div><div class="toc-page">Sayfa 11</div></div>
  <div class="toc-item"><div class="toc-title"><span class="num">Bölüm 11:</span> Raporlar, Trend Analizleri & Otomatik E-Posta Bültenleri</div><div class="toc-page">Sayfa 12</div></div>
  <div class="toc-item"><div class="toc-title"><span class="num">Bölüm 12:</span> Talep Merkezi, Ekip Yönetimi & Özel Portallar Rehberi</div><div class="toc-page">Sayfa 13</div></div>
</div>

<div class="callout callout-info">
  <div class="callout-icon">💡</div>
  <div>
    <strong>Kullanıcı Odaklı Tasarım:</strong> Bu kılavuz teknik yazılım terimlerinden arındırılmış olup, sistemin sahada ve ofiste günlük operasyonlarda nasıl en verimli şekilde kullanılacağını adım adım anlatmaktadır.
  </div>
</div>

<!-- ========================================================================= -->
<!-- PAGE 3: OPERASYON MERKEZİ (DASHBOARD) -->
<!-- ========================================================================= -->
<div class="page-break"></div>

<div class="header">
  <div class="header-left">
    <span class="header-logo">Pestneer</span>
    <span class="header-category">Modül 1: Operasyon Merkezi</span>
  </div>
  <div class="header-right">Yönetim Paneli</div>
</div>

<h1><span class="section-num">2</span> Operasyon Merkezi (Canlı Dashboard)</h1>

<p>
  <strong>Operasyon Merkezi</strong>, işletme yöneticisinin güne başlarken açtığı ana kontrol ekranıdır. Şirketin o günkü tüm saha faaliyetlerini, teknisyen durumlarını, bekleyen acil çağrıları ve kritik uyarıları tek bir bakışta gösterir.
</p>

<div class="grid-2">
  <div class="card">
    <div class="card-header"><span class="card-icon">📊</span> Günlük İş ve Saha Sayaçları</div>
    <ul style="font-size: 8.8pt; margin-left: 14px; margin-bottom: 0;">
      <li><strong>Bugünkü İş Emirleri:</strong> Planlanan toplam ziyaret sayısı.</li>
      <li><strong>Tamamlanan Ziyaretler:</strong> Sahadan onaylanıp raporu düşen işler.</li>
      <li><strong>Devam Eden / Yoldaki Ekipler:</strong> Sahada aktif çalışan personeller.</li>
      <li><strong>Bekleyen Acil Çağrılar:</strong> Müşteriden gelen müdahale bekleyen talepler.</li>
    </ul>
  </div>
  <div class="card">
    <div class="card-header"><span class="card-icon">⚡</span> Akıllı Uyarı Sistemi (Alarmlar)</div>
    <ul style="font-size: 8.8pt; margin-left: 14px; margin-bottom: 0;">
      <li><strong>Kritik Aktivite Uyarısı:</strong> Yüksek popülasyon saptanan tesisler.</li>
      <li><strong>Geciken DÖF / Terminler:</strong> Müşteri veya firma aksiyonları.</li>
      <li><strong>Kritik Stok Seviyesi:</strong> Tükenmek üzere olan biyosidal ilaçlar.</li>
      <li><strong>Süresi Dolan Belgeler:</strong> Personel sağlık veya yetki belgeleri.</li>
    </ul>
  </div>
</div>

<h2>Operasyon Merkezinde Neler Yapabilirsiniz?</h2>

<div class="step-list">
  <div class="step-item">
    <div class="step-number">1</div>
    <div class="step-content">
      <strong>Canlı Saha Durumunu İzleme</strong>
      <span>Hangi personelin hangi müşteride olduğunu, işe ne zaman başladığını ve kaç istasyon kontrol ettiğini gerçek zamanlı takip edin.</span>
    </div>
  </div>
  <div class="step-item">
    <div class="step-number">2</div>
    <div class="step-content">
      <strong>Hızlı İş Emri Başlatma</strong>
      <span>Ekranın sağ üstündeki "Yeni İş Emri" butonuna tıklayarak saniyeler içinde acil veya planlı bir görev oluşturup teknisyene yönlendirin.</span>
    </div>
  </div>
  <div class="step-item">
    <div class="step-number">3</div>
    <div class="step-content">
      <strong>Finansal ve Operasyonel Özetleri Görme</strong>
      <span>Aylık tamamlanma oranları, en çok ziyaret edilen şubeler ve sözleşme kotalarının doluluk oranları otomatik grafiklerle özetlenir.</span>
    </div>
  </div>
</div>

<div class="callout callout-tip">
  <div class="callout-icon">⭐</div>
  <div>
    <strong>Yönetici İpucu:</strong> Operasyon Merkezindeki sayaç kartlarına tıkladığınızda sistem sizi otomatik olarak ilgili filtrelenmiş listeye (Örn: "Bekleyen İşler"e tıkladığınızda yalnızca tamamlanmamış iş emirlerine) yönlendirir.
  </div>
</div>

<!-- ========================================================================= -->
<!-- PAGE 4: İŞ EMİRLERİ VE SAHA UYGULAMA AKIŞI -->
<!-- ========================================================================= -->
<div class="page-break"></div>

<div class="header">
  <div class="header-left">
    <span class="header-logo">Pestneer</span>
    <span class="header-category">Modül 2: İş Emirleri & Hizmet Raporu</span>
  </div>
  <div class="header-right">Saha Operasyonları</div>
</div>

<h1><span class="section-num">3</span> İş Emirleri & Saha Hizmet Akışı (EK-1)</h1>

<p>
  Pestneer'de her ilaçlama ve kontrol faaliyeti bir <strong>İş Emri</strong> üzerinden yürütülür. İş emri oluşturulduğu anda teknisyenin mobil portalına düşer ve adım adım resmi bir hizmet raporuna (EK-1 Belgesi) dönüşür.
</p>

<h2>Uçtan Uca Saha Ziyaret Süreci (5 Adım)</h2>

<div class="step-list">
  <div class="step-item">
    <div class="step-number">1</div>
    <div class="step-content">
      <strong>İş Emri Planlama ve Görevlendirme</strong>
      <span>Yönetici; müşteri, tesis şubesi, hedef zararlı (kemirgen, yürüyen haşere vb.), ziyaret türü ve teknisyeni seçerek iş emrini oluşturur.</span>
    </div>
  </div>
  <div class="step-item">
    <div class="step-number">2</div>
    <div class="step-content">
      <strong>Sahaya Varış ve QR Kodlu İstasyon Kontrolü</strong>
      <span>Teknisyen tesise vardığında "İşe Başla" butonuna basar. Sahadaki yem istasyonları ve UV sinek tutucuların üzerindeki QR kodları kamerayla okutarak anında tüketim ve aktivite girişi yapar.</span>
    </div>
  </div>
  <div class="step-item">
    <div class="step-number">3</div>
    <div class="step-content">
      <strong>Kullanılan Biyosidal Ürün ve Dozaj Kaydı</strong>
      <span>Uygulanan kimyasal ürünler araç stok listesinden seçilir; miktar, dozaj, aktif madde ve uygulama yöntemi (pülverizasyon, ULV, jel vb.) sisteme kaydedilir.</span>
    </div>
  </div>
  <div class="step-item">
    <div class="step-number">4</div>
    <div class="step-content">
      <strong>Saha Bulguları ve Fotoğraf Kanıtları</strong>
      <span>Fiziksel yalıtım açıkları, açık çöp konteynerleri veya su sızıntıları gibi riskler fotoğraflanır ve rapora not olarak eklenir.</span>
    </div>
  </div>
  <div class="step-item">
    <div class="step-number">5</div>
    <div class="step-content">
      <strong>Çift Taraflı Dijital İmza ve Otomatik EK-1</strong>
      <span>Ziyaret sonunda Tesis Sorumlusu ve Teknisyen dokunmatik ekranda imza atar. Sistem Sağlık Bakanlığı onaylı resmi EK-1 formatında PDF raporunu üretir ve müşteriye anında iletir.</span>
    </div>
  </div>
</div>

<div class="card card-teal avoid-break">
  <div class="card-header"><span class="card-icon">📄</span> Resmi EK-1 Servis Raporunda Neler Yer Alır?</div>
  <div class="grid-2" style="font-size: 8.8pt; margin-bottom: 0;">
    <div>
      • İlaçlama firması ruhsat & mesul müdür bilgileri<br>
      • Müşteri tesis adı, şube adresi ve yetkili kişi<br>
      • Uygulama tarihi, başlama ve bitiş saatleri<br>
      • Hedeflenen zararlı türleri ve uygulama alanları
    </div>
    <div>
      • Kullanılan biyosidal ürün adı, ruhsat no, LOT & aktif madde<br>
      • İstasyon kontrol sonuçları ve zararlı yoğunluk tablosu<br>
      • Yapısal öneriler ve düzeltici faaliyet notları<br>
      • Müşteri ve uygulayıcı teknisyen dijital ıslak imzaları
    </div>
  </div>
</div>

<!-- ========================================================================= -->
<!-- PAGE 5: İNTERAKTİF KROKİ VE İSTASYON MERKEZİ -->
<!-- ========================================================================= -->
<div class="page-break"></div>

<div class="header">
  <div class="header-left">
    <span class="header-logo">Pestneer</span>
    <span class="header-category">Modül 3: Kroki & İstasyon Merkezi</span>
  </div>
  <div class="header-right">Harita & İstasyon</div>
</div>

<h1><span class="section-num">4</span> İnteraktif Kroki & QR İstasyon Yönetimi</h1>

<p>
  Tesislerdeki onlarca veya yüzlerce istasyonun takibini kolaylaştıran <strong>Kroki & İstasyon Merkezi</strong>, mimari kat planları üzerinde istasyonları canlı olarak görselleştiren gelişmiş bir haritalama sistemidir.
</p>

<div class="grid-2">
  <div class="card">
    <div class="card-header"><span class="card-icon">🗺️</span> Sürükle-Bırak Kat Planı Tasarımı</div>
    <p style="font-size: 8.8pt;">Fabrika, depo, otel veya restoranın kat planı görseli sisteme yüklenir. Yem istasyonları, yapışkanlı tuzaklar ve sinek cihazları farenin ucuyla sürüklenip tam yerine bırakılır.</p>
  </div>
  <div class="card">
    <div class="card-header"><span class="card-icon">🔥</span> Canlı Aktivite Isı Haritası (Heatmap)</div>
    <p style="font-size: 8.8pt;">Hangi istasyonda yüksek kemirgen veya haşere popülasyonu olduğu kat planında renklerle parlar: <strong>Yeşil (Temiz)</strong>, <strong>Sarı (Hafif)</strong>, <strong>Kırmızı (Kritik Risk)</strong>.</p>
  </div>
</div>

<h2>Desteklenen İstasyon Türleri ve Özellikleri</h2>

<table>
  <thead>
    <tr>
      <th>İstasyon Türü</th>
      <th>Simge / Kod</th>
      <th>Kullanım Alanı</th>
      <th>Kontrol Kriterleri</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>Kemirgen Yem İstasyonu</strong></td>
      <td>KYİ-01..</td>
      <td>Dış çevre, bahçe, bina etrafı</td>
      <td>Yem tüketim %, blok değişimi, sağlamlık</td>
    </tr>
    <tr>
      <td><strong>Canlı Yakalama Kapanı</strong></td>
      <td>CYK-01..</td>
      <td>İç mekan, gıda üretim, depo</td>
      <td>Canlı/ölü yakalama adedi, mekanizma testi</td>
    </tr>
    <tr>
      <td><strong>Feromonlu Yapışkan Levha</strong></td>
      <td>FYL-01..</td>
      <td>Hammadde ambarı, unlu mamul</td>
      <td>Güve/kınkanatlı popülasyon sayımı</td>
    </tr>
    <tr>
      <td><strong>UV Işıklı Sinek Tutucu (EFK)</strong></td>
      <td>EFK-01..</td>
      <td>Giriş kapıları, restoran, mutfak</td>
      <td>Tüp UV verimi, yapışkan levha doluluk %</td>
    </tr>
  </tbody>
</table>

<div class="callout callout-tip">
  <div class="callout-icon">📲</div>
  <div>
    <strong>Hızlı QR İstasyon Aktivasyonu:</strong> Sahadaki istasyonların üzerine yapıştırılan QR barkodlar, teknisyen tarafından cep telefonu kamerasıyla okutulduğu anda dijital krokideki istasyon ile anında eşleşir. Bir daha istasyon numarası aramakla vakit kaybedilmez.
  </div>
</div>

<!-- ========================================================================= -->
<!-- PAGE 6: PESTNEER VISION YAPAY ZEKA -->
<!-- ========================================================================= -->
<div class="page-break"></div>

<div class="header">
  <div class="header-left">
    <span class="header-logo">Pestneer</span>
    <span class="header-category">Modül 4: Yapay Zeka & Görüntü Tanıma</span>
  </div>
  <div class="header-right">Pestneer Vision</div>
</div>

<h1><span class="section-num">5</span> Pestneer Vision: Yapay Zeka ile Zararlı Analizi</h1>

<p>
  <strong>Pestneer Vision</strong>, sahada teknisyenlerin yapışkan plaka ve tuzaklardan çektiği fotoğrafları saniyeler içinde analiz eden yapay zeka destekli görüntü işleme motorudur.
</p>

<div class="grid-2">
  <div class="card card-teal">
    <div class="card-header"><span class="card-icon">🧠</span> Otomatik Tür Teşhisi</div>
    <p style="font-size: 8.8pt;">Karasinek, sivrisinek, Alman hamamböceği, Doğu hamamböceği, un güvesi ve tatarcık gibi onlarca zararlı türünü milisaniyeler içinde teşhis eder.</p>
  </div>
  <div class="card card-blue">
    <div class="card-header"><span class="card-icon">🔢</span> Popülasyon Sayımı & Yoğunluk</div>
    <p style="font-size: 8.8pt;">Gözle sayması zor olan onlarca sinek veya böceği tek tek işaretleyerek sayar ve risk eşik değerine göre (Düşük / Orta / Kritik) derecelendirir.</p>
  </div>
</div>

<h2>Pestneer Vision Nasıl Kullanılır?</h2>

<div class="step-list">
  <div class="step-item">
    <div class="step-number">1</div>
    <div class="step-content">
      <strong>Tuzağın Net Bir Fotoğrafını Çekin</strong>
      <span>Saha personeli cep telefonundan EFK yapışkan levhasının veya zemin tuzağının aydınlık bir fotoğrafını sisteme yükler.</span>
    </div>
  </div>
  <div class="step-item">
    <div class="step-number">2</div>
    <div class="step-content">
      <strong>Yapay Zeka Otomatik Analiz Başlatsın</strong>
      <span>"Görüntüyü Analiz Et" butonuna basıldığında yapay zeka her zararlının etrafına renkli kutucuklar koyarak türünü ve sayısını ekrana döker.</span>
    </div>
  </div>
  <div class="step-item">
    <div class="step-number">3</div>
    <div class="step-content">
      <strong>Sonuçları Tek Tıkla Rapora Aktarın</strong>
      <span>Teknisyen çıkan sonucu onayladığında; tespit edilen türler ve sayımlar doğrudan o istasyonun servis raporuna ve grafiklerine işlenir.</span>
    </div>
  </div>
</div>

<div class="callout callout-info">
  <div class="callout-icon">📊</div>
  <div>
    <strong>Denetimlerde Prestij Sağlar:</strong> BRCGS, IFS ve ISO 22000 denetçileri yapay zekanın işaretlediği yüksek çözünürlüklü fotoğraflı analizleri gördüklerinde tesisin dijital izleme yeteneğine tam puan verirler.
  </div>
</div>

<!-- ========================================================================= -->
<!-- PAGE 7: TAKVİM VE RANDEVU PLANLAMA -->
<!-- ========================================================================= -->
<div class="page-break"></div>

<div class="header">
  <div class="header-left">
    <span class="header-logo">Pestneer</span>
    <span class="header-category">Modül 5: Takvim & Planlama</span>
  </div>
  <div class="header-right">Zaman Çizelgesi</div>
</div>

<h1><span class="section-num">6</span> Takvim, Akıllı Randevu & Rota Planlama</h1>

<p>
  İlaçlama operasyonlarında zamanlama her şeydir. Pestneer <strong>Takvim Modülü</strong>, sözleşmeli periyodik ziyaretleri otomatik takvime işlerken, acil randevuları çakışma yaşamadan teknisyenlere paylaştırır.
</p>

<div class="grid-3">
  <div class="card">
    <div class="card-header"><span class="card-icon">📅</span> Çoklu Görünüm</div>
    <p style="font-size: 8.5pt;">Aylık genel takvim, haftalık iş yükü dağılımı ve günlük detaylı saat çizelgesi.</p>
  </div>
  <div class="card">
    <div class="card-header"><span class="card-icon">🚗</span> Personel & Araç Filtresi</div>
    <p style="font-size: 8.5pt;">Hangi teknisyenin ve hangi hizmet aracının günün hangi saatinde nerede olduğunu görün.</p>
  </div>
  <div class="card">
    <div class="card-header"><span class="card-icon">🔄</span> Otomatik Periyot</div>
    <p style="font-size: 8.5pt;">"Her ayın 1. ve 3. Çarşambası" gibi tekrarlayan sözleşmeli işleri tek tıkla 1 yıllık planlayın.</p>
  </div>
</div>

<h2>Takvim Üzerinde Hızlı İşlemler</h2>
<ul>
  <li><strong>Sürükle & Bırak ile Güncelleme:</strong> Ertelenen veya tarihi değişen bir randevuyu tutup yeni güne bırakmanız yeterlidir.</li>
  <li><strong>Akıllı Çakışma Önleme:</strong> Aynı teknisyene aynı saatte iki farklı randevu verildiğinde sistem yöneticiyi uyarır.</li>
  <li><strong>Renk Kodları ile Anında Ayrım:</strong>
    <span class="badge badge-blue">Mavi: Rutin Ziyaret</span>
    <span class="badge badge-red">Kırmızı: Acil Çağrı</span>
    <span class="badge badge-purple">Mor: Kalite Denetimi</span>
    <span class="badge badge-green">Yeşil: Tamamlandı</span>
  </li>
</ul>

<!-- ========================================================================= -->
<!-- PAGE 8: STOK VE BİYOSİDAL KİMYASAL YÖNETİMİ -->
<!-- ========================================================================= -->
<div class="page-break"></div>

<div class="header">
  <div class="header-left">
    <span class="header-logo">Pestneer</span>
    <span class="header-category">Modül 6: Stok & Kimyasal Yönetimi</span>
  </div>
  <div class="header-right">Depo & Biyosidal</div>
</div>

<h1><span class="section-num">7</span> Stok, Araç Depoları & Kimyasal Yönetimi</h1>

<p>
  Pest kontrol operasyonlarında Sağlık Bakanlığı onaylı biyosidal ilaçların, sarf malzemelerin ve tuzakların takibi yasal bir zorunluluktur. Pestneer, <strong>Ana Depo</strong> ve <strong>Araç/Mobil Depoları</strong> anlık olarak senkronize eder.
</p>

<div class="grid-2">
  <div class="card card-teal">
    <div class="card-header"><span class="card-icon">🏢</span> Ana Merkez Depo</div>
    <p style="font-size: 8.8pt;">Toptan alınan kimyasallar, ekipmanlar, istasyonlar, LOT numaraları, parti tarihleri ve son kullanma süreleriyle (SKT) kayıt altına alınır.</p>
  </div>
  <div class="card card-blue">
    <div class="card-header"><span class="card-icon">🚐</span> Araç / Teknisyen Depoları</div>
    <p style="font-size: 8.8pt;">Merkez depodan servis araçlarına transfer edilen ürünler teknisyenin zimmetine geçer. Sahada kullanılan miktar rapordan otomatik düşer.</p>
  </div>
</div>

<h2>Biyosidal Ürün Güvenliği ve Mevzuat Uyumu</h2>
<table>
  <thead>
    <tr>
      <th>Takip Edilen Parametre</th>
      <th>Sağladığı Fayda</th>
      <th>Kullanıcı Deneyimi</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>LOT / Parti No & SKT</strong></td>
      <td>Süresi geçmiş ilaçların kullanılmasını önler.</td>
      <td>SKT yaklaşınca sistem otomatik turuncu alarm verir.</td>
    </tr>
    <tr>
      <td><strong>Kritik Stok Uyarısı</strong></td>
      <td>Sahada ürün bitmesi riskini sıfıra indirir.</td>
      <td>Minimum seviyenin altına inen ürünler sipariş listesine düşer.</td>
    </tr>
    <tr>
      <td><strong>Güvenlik Bilgi Formu (GBF)</strong></td>
      <td>Denetimlerde MSDS belgesini anında sunar.</td>
      <td>Her ilacın yanındaki PDF butonundan GBF tek tıkla indirilir.</td>
    </tr>
    <tr>
      <td><strong>Araçtan Araca Transfer</strong></td>
      <td>Saha ekipleri arasında malzeme takasını izler.</td>
      <td>İki teknisyen aralarında onay vererek ürün devredebilir.</td>
    </tr>
  </tbody>
</table>

<!-- ========================================================================= -->
<!-- PAGE 9: TİCARİ YÖNETİM VE SÖZLEŞMELER -->
<!-- ========================================================================= -->
<div class="page-break"></div>

<div class="header">
  <div class="header-left">
    <span class="header-logo">Pestneer</span>
    <span class="header-category">Modül 7: Ticari Yönetim & CRM</span>
  </div>
  <div class="header-right">Sözleşmeler & Paketler</div>
</div>

<h1><span class="section-num">8</span> Ticari Yönetim, Sözleşmeler & Hizmet Paketleri</h1>

<p>
  Pestneer, sadece saha yönetimini değil, işletmenizin ticari karlılığını ve sözleşme taahhütlerini de güvenceye alır. Müşteri bazında tanımlanan <strong>Hizmet Paketleri</strong> sayesinde operasyon otomatikleşir.
</p>

<div class="grid-3">
  <div class="card">
    <div class="card-header"><span class="card-icon">🏛️</span> Çatı Müşteri & Şube</div>
    <p style="font-size: 8.5pt;">Tek bir holding veya zincir marka altında 50 farklı fabrikayı/şubeyi tek merkezden yönetin.</p>
  </div>
  <div class="card">
    <div class="card-header"><span class="card-icon">📜</span> Hizmet Paketleri</div>
    <p style="font-size: 8.5pt;">Aylık ziyaret adedi, ücretsiz acil çağrı hakkı ve ekstra çağrı ücret tarifesi tanımlayın.</p>
  </div>
  <div class="card">
    <div class="card-header"><span class="card-icon">⏱️</span> SLA Taahhüdü</div>
    <p style="font-size: 8.5pt;">"Acil çağrılarda 4 saatte müdahale" gibi taahhütlerin yerine getirilme oranını ölçün.</p>
  </div>
</div>

<h2>Sözleşme Otomasyonunun Sağladığı Avantajlar</h2>
<div class="step-list">
  <div class="step-item">
    <div class="step-number">1</div>
    <div class="step-content">
      <strong>Otomatik İş Emri Üretimi:</strong>
      <span>Sözleşmesi aktif olan müşterilerin aylık rutin işleri ay başında otomatik olarak takvime dökülür; iş unutulması riski biter.</span>
    </div>
  </div>
  <div class="step-item">
    <div class="step-number">2</div>
    <div class="step-content">
      <strong>Ücretsiz Hak / Ücretli Ayrımı:</strong>
      <span>Müşteri acil çağrı açtığında, paketindeki ücretsiz hakkı bitmişse sistem otomatik olarak "Sözleşme Dışı Ek Hizmet" uyarısı verir.</span>
    </div>
  </div>
  <div class="step-item">
    <div class="step-number">3</div>
    <div class="step-content">
      <strong>Yıllık TÜFE/ÜFE Fiyat Artışı & Bitiş Uyarıları:</strong>
      <span>Sözleşme süresi dolmadan 30 gün önce sistem yenileme hatırlatması yapar ve yıllık enflasyon artış oranını hesaplar.</span>
    </div>
  </div>
</div>

<!-- ========================================================================= -->
<!-- PAGE 10: KALİTE, UYUM VE DÖF MERKEZİ -->
<!-- ========================================================================= -->
<div class="page-break"></div>

<div class="header">
  <div class="header-left">
    <span class="header-logo">Pestneer</span>
    <span class="header-category">Modül 8: Kalite & Uyum Merkezi</span>
  </div>
  <div class="header-right">Kalite & DÖF (CAPA)</div>
</div>

<h1><span class="section-num">9</span> Kalite, Uyum & Düzeltici Faaliyetler (DÖF)</h1>

<p>
  Uluslararası gıda güvenliği standartları (BRCGS, IFS, AIB, FSSC 22000, ISO 22000), ilaçlama raporlarında yazılan tavsiyelerin havada kalmamasını, takip edilebilir bir <strong>Düzeltici ve Önleyici Faaliyet (DÖF / CAPA)</strong> akışına dönüşmesini şart koşar.
</p>

<div class="grid-2">
  <div class="card card-amber">
    <div class="card-header"><span class="card-icon">⚠️</span> DÖF Yaşam Döngüsü (Kapanış Akışı)</div>
    <p style="font-size: 8.8pt;">
      <strong>1. Bulgu:</strong> Sahada sorun tespit edilir (Örn: Kapı altı fırça contası yırtık).<br>
      <strong>2. Atama:</strong> Sorumlu (Müşteri / Firma) ve termin tarihi belirlenir.<br>
      <strong>3. Aksiyon & Kanıt:</strong> Sorun giderilip "Sonrası Fotoğrafı" yüklenir.<br>
      <strong>4. Onay:</strong> Müşteri portaldan inceleyip faaliyeti onaylar ve kapatır.
    </p>
  </div>
  <div class="card card-teal">
    <div class="card-header"><span class="card-icon">🎯</span> İkinci Göz Saha Denetimi (Skorlama)</div>
    <p style="font-size: 8.8pt;">
      Yönetici veya kalite uzmanı tamamlanmış bir işi habersiz 2. kontrole alabilir. 6 kriterde (İstasyon %25, Dozaj %20, Fotoğraf %15, İmza %15, Bütünlük %15, Zamanlama %10) puanlanır. 70 puan altı işlerde otomatik kalite düzeltmesi açılır.
    </p>
  </div>
</div>

<h2>Şube Sağlık Skoru Nasıl Hesaplanır? (100 Puanlık Model)</h2>
<p style="font-size: 9pt;">
  Pestneer, tesisin biyolojik risk durumunu 100 puandan başlayan şeffaf bir ceza puanı algoritmasıyla hesaplar:
</p>

<table>
  <thead>
    <tr>
      <th>Değerlendirme Kriteri</th>
      <th>Maksimum Ceza</th>
      <th>Puanın Düşme Nedeni</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>Zararlı Aktivitesi</strong></td>
      <td>-25 Puan</td>
      <td>İstasyonlarda yüksek kemirgen/böcek yoğunluğu</td>
    </tr>
    <tr>
      <td><strong>Açık DÖF ve Yapısal Kusurlar</strong></td>
      <td>-20 Puan</td>
      <td>Giderilmeyen yalıtım eksiklikleri ve açık tavsiyeler</td>
    </tr>
    <tr>
      <td><strong>Hasarlı / Kayıp İstasyonlar</strong></td>
      <td>-10 Puan</td>
      <td>Kırılmış veya yeri değiştirilmiş yem kutuları</td>
    </tr>
    <tr>
      <td><strong>Ulaşılamayan İstasyonlar</strong></td>
      <td>-10 Puan</td>
      <td>Önüne palet çekildiği için kontrol edilemeyen noktalar</td>
    </tr>
    <tr>
      <td><strong>Mevsimsel & Çevresel Risk</strong></td>
      <td>-10 Puan</td>
      <td>Hava durumu, aşırı yağış veya ani sıcaklık artışları</td>
    </tr>
  </tbody>
</table>

<!-- ========================================================================= -->
<!-- PAGE 11: TEK TIKLA DENETİM PAKETİ -->
<!-- ========================================================================= -->
<div class="page-break"></div>

<div class="header">
  <div class="header-left">
    <span class="header-logo">Pestneer</span>
    <span class="header-category">Modül 9: Denetim Paketi Merkezi</span>
  </div>
  <div class="header-right">Denetim Arşivi</div>
</div>

<h1><span class="section-num">10</span> Tek Tıkla Denetim Paketi (Audit Package)</h1>

<p>
  Denetim sabahı saatlerce evrak, imza, kroki ve güvenlik bilgi formu aramaya son! Pestneer, gıda ve sanayi denetimlerine yönelik tüm resmi evrakları <strong>Tek Tıkla Denetim Dosyası</strong> haline getirir.
</p>

<div class="grid-2">
  <div class="card card-teal">
    <div class="card-header"><span class="card-icon">📋</span> Desteklenen Denetim Standartları</div>
    <ul style="font-size: 8.8pt; margin-left: 14px; margin-bottom: 0;">
      <li><strong>BRCGS Global Food Safety:</strong> Ambalaj ve gıda standardı</li>
      <li><strong>IFS Food:</strong> Uluslararası gıda denetim standardı</li>
      <li><strong>FSSC 22000 & ISO 22000:</strong> Gıda güvenliği yönetim sistemi</li>
      <li><strong>AIB International:</strong> Konsolide temizlik & pest standartları</li>
      <li><strong>EN 16636:</strong> Avrupa Pest Kontrol Hizmet Standardı</li>
    </ul>
  </div>
  <div class="card card-blue">
    <div class="card-header"><span class="card-icon">⚡</span> Akıllı Paket Ön Kontrolü</div>
    <p style="font-size: 8.8pt; margin: 0;">
      Dosya üretilmeden önce sistem otomatik denetim yapar:<br>
      • <em>"3 nolu raporda müşteri imzası eksik!"</em><br>
      • <em>"Teknisyen Ahmet'in biyosidal belgesi güncel değil!"</em><br>
      • <em>"Kroki son 6 aydır revize edilmemiş!"</em><br>
      Eksikler önceden tamamlanarak sıfır hata ile denetime girilir.
    </p>
  </div>
</div>

<h2>Denetim Paketinde Neler Yer Alır?</h2>
<div class="step-list">
  <div class="step-item">
    <div class="step-number">1</div>
    <div class="step-content">
      <strong>Resmi Firma ve Personel Belgeleri:</strong>
      <span>Hizmet firması çalışma ruhsatı, Mesul Müdür belgesi, uygulayıcı teknisyen sertifikaları ve sağlık raporları.</span>
    </div>
  </div>
  <div class="step-item">
    <div class="step-number">2</div>
    <div class="step-content">
      <strong>Güncel İstasyon Krokisi ve Listesi:</strong>
      <span>Tüm tesisin numaralı istasyon yerleşim planı, türleri, yerleri ve barkod dökümü.</span>
    </div>
  </div>
  <div class="step-item">
    <div class="step-number">3</div>
    <div class="step-content">
      <strong>Tarih Aralıklı EK-1 Servis Raporları:</strong>
      <span>Seçilen dönemdeki (Örn: Son 1 yıl) tüm imzalı resmi uygulama raporları.</span>
    </div>
  </div>
  <div class="step-item">
    <div class="step-number">4</div>
    <div class="step-content">
      <strong>Biyosidal Ürün GBF (MSDS) ve Ruhsat Dosyaları:</strong>
      <span>Sahada kullanılan her ilacın güncel Güvenlik Bilgi Formu ve Sağlık Bakanlığı izin belgesi.</span>
    </div>
  </div>
  <div class="step-item">
    <div class="step-number">5</div>
    <div class="step-content">
      <strong>Trend ve Popülasyon Analiz Grafikleri:</strong>
      <span>Aylık aktivite değişimleri, tür dağılımları ve DÖF kapanış oranlarını gösteren resmi denetim özet grafikleri.</span>
    </div>
  </div>
</div>

<!-- ========================================================================= -->
<!-- PAGE 12: RAPORLAR VE ANALİTİKLER -->
<!-- ========================================================================= -->
<div class="page-break"></div>

<div class="header">
  <div class="header-left">
    <span class="header-logo">Pestneer</span>
    <span class="header-category">Modül 10: Raporlar & Analizler</span>
  </div>
  <div class="header-right">İleri Seviye Analitik</div>
</div>

<h1><span class="section-num">11</span> Raporlar, Trend Analizleri & Otomasyon</h1>

<p>
  Veriye dayalı yönetim! Pestneer, sahada toplanan binlerce kontrol verisini anlamlı grafiklere, karşılaştırmalı tablolara ve otomatik e-posta bültenlerine dönüştürür.
</p>

<div class="grid-2">
  <div class="card">
    <div class="card-header"><span class="card-icon">📈</span> Zararlı Popülasyon Trendleri</div>
    <p style="font-size: 8.8pt;">Aylar bazında kemirgen veya haşere aktivitesinin artış/azalış eğrisi. Yapılan ilaçlamaların etkinliğini kanıtlayan en somut göstergedir.</p>
  </div>
  <div class="card">
    <div class="card-header"><span class="card-icon">🏢</span> Şube Karşılaştırma Matrisi</div>
    <p style="font-size: 8.8pt;">Zincir müşteriler için tüm şubelerin sağlık skorlarını yan yana kıyaslar; hangi şubenin daha riskli olduğunu anında ortaya çıkarır.</p>
  </div>
</div>

<div class="grid-2">
  <div class="card">
    <div class="card-header"><span class="card-icon">⏱️</span> Personel Mesai & Verimlilik</div>
    <p style="font-size: 8.8pt;">Teknisyenlerin günlük net çalışma süreleri, mola kayıtları, ortalama istasyon başına harcanan süre ve müşteri memnuniyet oranları.</p>
  </div>
  <div class="card">
    <div class="card-header"><span class="card-icon">📧</span> Otomatik E-Posta Raporlama</div>
    <p style="font-size: 8.8pt;">Müşteri kalite yöneticilerine her ayın 1'inde otomatik olarak geçmiş ayın trend analizini ve servis özetini PDF bülteni olarak e-postalar.</p>
  </div>
</div>

<div class="callout callout-tip">
  <div class="callout-icon">💡</div>
  <div>
    <strong>Özelleştirilebilir Filtreler:</strong> Rapor ekranında istediğiniz müşteri, şube, tarih aralığı, zararlı türü veya personeli seçerek özel analizler üretebilir ve Excel / PDF olarak dışa aktarabilirsiniz.
  </div>
</div>

<!-- ========================================================================= -->
<!-- PAGE 13: TALEP, EKİP VE PORTALLAR REHBERİ -->
<!-- ========================================================================= -->
<div class="page-break"></div>

<div class="header">
  <div class="header-left">
    <span class="header-logo">Pestneer</span>
    <span class="header-category">Modül 11 & 12: Portallar & Ekip</span>
  </div>
  <div class="header-right">Kullanıcı Rehberi</div>
</div>

<h1><span class="section-num">12</span> Talep Merkezi, Ekip Yönetimi & Portallar</h1>

<h2>1. Müşteri Talep Merkezi</h2>
<p>
  Müşteriler beklenmedik bir haşere gördüğünde veya istasyon kırıldığında telefon aramak yerine <strong>Müşteri Portalı</strong> üzerinden tek tıkla talep açarlar. Fotoğraf ekleyebilir ve aciliyet durumunu belirtebilirler. Yönetici bu talebi inceler, onaylar ve tek tuşla saha teknisyenine iş emri olarak yönlendirir.
</p>

<h2>2. Ekip ve Mesai Yönetimi</h2>
<ul>
  <li><strong>Personel Kartları:</strong> İletişim bilgileri, zimmetli araç, mesul müdür veya uygulayıcı rolü.</li>
  <li><strong>Mobil Mesai Kaydı:</strong> Teknisyen işe başlarken mobil ekranda "Mesai Başlat"a basar. Mola, işe devam ve gün sonu hareketleriyle net mesai otomatik hesaplanır.</li>
  <li><strong>Sertifika Hatırlatıcıları:</strong> Biyosidal uygulayıcı belgesi, SRC belgesi ve sağlık raporu bitiş tarihleri 30 gün önceden yöneticiye bildirilir.</li>
</ul>

<h2>3. Özel Kullanıcı Portalları Özeti</h2>

<div class="grid-2" style="margin-top: 10px;">
  <div class="card card-teal">
    <div class="card-header"><span class="card-icon">📱</span> Saha Teknisyeni Portalı</div>
    <ul style="font-size: 8.5pt; margin-left: 12px; margin-bottom: 0;">
      <li>Bugünün atanmış iş rotasını sırayla görme</li>
      <li>Müşteri adresine tek tıkla harita/navigasyon açma</li>
      <li>QR kod tarayarak 3 saniyede istasyon kaydı</li>
      <li>Araçtaki ilaç stoğundan anında sarfiyat düşme</li>
      <li>Müşteri yetkilisinden dokunmatik imza alma</li>
    </ul>
  </div>
  <div class="card card-blue">
    <div class="card-header"><span class="card-icon">🏢</span> Müşteri & Tesis Portalı</div>
    <ul style="font-size: 8.5pt; margin-left: 12px; margin-bottom: 0;">
      <li>Tesisin anlık Sağlık Skoru (100 üzerinden)</li>
      <li>İnteraktif kat planında istasyonların son durumu</li>
      <li>Geçmiş tüm EK-1 servis raporlarını PDF indirme</li>
      <li>Açık DÖF tavsiyelerini görüp onaylama / kapatma</li>
      <li>7/24 Kimyasal GBF ve şirket ruhsatlarına erişim</li>
    </ul>
  </div>
</div>

<div class="callout callout-info" style="margin-top: 15px;">
  <div class="callout-icon">🛡️</div>
  <div>
    <strong>Veri Güvenliği ve Şirket İzolasyonu:</strong> Pestneer platformunda her firmanın ve müşterinin verisi tamamen izole bir güvenlik katmanında saklanır. Hiçbir müşteri bir başka müşterinin verisine veya krokisine erişemez.
  </div>
</div>

<div style="margin-top: 25px; padding: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; text-align: center; font-size: 9pt; color: #64748b;">
  <strong>Pestneer Dijital Operasyon Platformu</strong> — Sorularınız ve destek talepleriniz için sistem içerisindeki Destek Merkezi'ni kullanabilirsiniz.
</div>

</body>
</html>
`;

const tempHtmlPath = path.join(__dirname, 'temp_user_guide.html');
fs.writeFileSync(tempHtmlPath, htmlContent, 'utf8');

// Target desktop PDF path
const desktopPath = 'C:\\Users\\cffat\\OneDrive\\Masaüstü\\Pestneer_Kullanici_Kilavuzu_ve_Ozellik_Rehberi.pdf';
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

console.log('Generating PDF to:', desktopPath);

try {
  execSync(`"${chromePath}" --headless --disable-gpu --no-pdf-header-footer --print-to-pdf="${desktopPath}" "${tempHtmlPath}"`, { stdio: 'inherit' });
  console.log('SUCCESS! PDF generated successfully at:', desktopPath);
  console.log('File size:', fs.statSync(desktopPath).size, 'bytes');
} catch (err) {
  console.error('Error during PDF creation:', err);
} finally {
  if (fs.existsSync(tempHtmlPath)) {
    fs.unlinkSync(tempHtmlPath);
  }
}
