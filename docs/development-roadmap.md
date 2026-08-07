# Pestneer Ürün Geliştirme Yol Haritası

Bu plan, canlı sistemdeki operasyon kayıplarını önce giderir; saha hizmeti, müşteri deneyimi ve analitik yeteneklerini birbirine bağımlı ve test edilebilir fazlar halinde geliştirir.

## Faz 1 — Canlı Sistem Stabilizasyonu

### Canlı inceleme bulguları

| Alan | Durum | Bulgu / karar |
| --- | --- | --- |
| Firma sahibi girişi | Çalışıyor | `TURA-ANKARA` hesabıyla canlıda doğrulandı. |
| Personel oluşturma | Kritik hata | PostgreSQL yeniden deneme stratejisiyle uyumsuz manuel işlem nedeniyle HTTP 500 oluşuyordu. |
| Çalışan girişi | Bloke | Canlı veritabanında çalışan kaydı oluşmadığı için giriş yapılamıyordu. Personel kaydı düzeldiğinde hesap doğrudan kullanılabilir. |
| Personel düzenleme | Hazır | Hesap bilgileri, rol, aktiflik ve yeni şifre güncellenebiliyor. |
| Çatı müşteri oluşturma | Kullanılabilirlik hatası | Arayüz en az bir şube zorunlu tuttuğu için yalnızca çatı müşteri kaydedilemiyordu. Şubesiz kayıt desteklenecek. |
| Toplu şube ekleme | Mevcut | Excel, CSV ve metin aktarımı; iletişim, adres, koordinat ve harita bağlantısı alanları var. |
| İş emri oluşturma | Mevcut | Çoklu şube seçimi ve personele atama var; tekrar planı ve iş türü Faz 2 kapsamındadır. |
| Takvim görevleri | Mevcut | Günlük not/görev, personele atama, düzenleme ve silme destekleniyor. Çalışan yalnızca kendisine atanan görevleri görüyor. |
| Mesai ve mola | Mevcut | Başlatma, mola, devam ve bitirme veritabanına kaydediliyor; sahip analiz ekranından izleyebiliyor. |
| Araç stok kontrolü | Mevcut | Son kontrol ve ürünler çalışan hesabına bağlı olarak kalıcı tutuluyor. |
| Depo stok girişi | Mevcut | Ürün ve lot bazlı giriş kalıcıdır. |
| Depo stok çıkışı | Eksik | Düğme herhangi bir işleme bağlı değildi; hareket kaydı ve stok düşümü eklenecek. |
| Kritik stok | Mevcut | Minimum eşik ve kritik/düşük/yeterli durumları hesaplanıyor. |
| Stok dışa aktarma | Eksik | Düğme herhangi bir işleme bağlı değildi; filtrelenmiş liste Excel olarak indirilecek. |
| Oturum devamlılığı | Eksik | Sayfa yenilendiğinde oturum kayboluyordu; sekme açık kaldığı sürece güvenli oturum saklama eklenecek. |
| Müşteri portalı | Demo | Gerçek müşteri hesabı ve veriye bağlı portal Faz 4 kapsamındadır. |
| İş raporu / PDF | Demo | Ekran örnek veri kullanıyor; gerçek saha raporu, trend ve risk veri modeli Faz 3 kapsamındadır. |
| Ayarlar, bildirim ve arama | Hazırlanmadı | Görsel öğeler mevcut, işlevleri sonraki fazlara ayrıldı. |

### Faz 1 teslim ölçütleri

- Firma sahibi canlıda personel oluşturabilir; oluşturulan çalışan anında giriş yapabilir.
- Çatı müşteri şubesiz veya toplu şubeleriyle kaydedilebilir.
- Stok girişi ve çıkışı kalıcı hareket olarak saklanır; yetersiz stok çıkışı engellenir.
- Kritik stoklar ve aylık çıkış işlem sayısı doğru görünür.
- Stok listesi Excel olarak dışa aktarılır.
- Temel sahip ve çalışan akışları canlı ortamda uçtan uca doğrulanır.
- Hatalar boş yanıt yerine kullanıcıya anlaşılır problem yanıtı döndürür.

## Faz 2 — İş Emri ve Saha Operasyonu

**Durum: Tamamlandı (07 Ağustos 2026)**

- İş emrinde atanmış personeli sonradan değiştirme.
- Aynı çatı müşterinin şubelerini farklı personele toplu dağıtma.
- Tek seferlik, haftalık, aylık ve manuel tekrar planları.
- Rutin, ekstra, ücretli acil çağrı ve ücretsiz acil çağrı sınıfları.
- Firma sahibinin personele kendi programını yapma ve kendine iş atama yetkisi vermesi.
- İş başlatma ve bitirmede açıklama, öneri ve fotoğraf ekleme.
- İş durum geçmişi ve denetlenebilir değişiklik kaydı.

### Faz 2 doğrulama özeti

- İki şubenin farklı personele atanması ve haftalık tekrar ile dört bağımsız iş emri oluşturulması doğrulandı.
- Planlanmış iş emrinin zamanı, hizmet türü, ticari türü ve atanmış personeli sonradan güncellendi.
- Firma sahibi tarafından verilen kendi planını oluşturma yetkisi çalışan portalında uygulandı.
- Çalışan hesabıyla iş başlatma, işlem açıklaması, öneri ve fotoğrafla tamamlama doğrulandı.
- Firma sahibinin saha kapanışını, fotoğrafı ve üç aşamalı durum geçmişini görmesi doğrulandı.
- SQLite geliştirme ve PostgreSQL canlı ortam şemaları için aynı veri geçişi üretildi.

## Faz 3 — Resmî İş Raporu, Trend ve Risk

**Durum: Tamamlandı (07 Ağustos 2026)**

- Saha çalışanı ve firma sahibi için yapılandırılmış iş raporu formu.
- İstasyon/cihaz numarası, alan, hedef zararlı, aktivite görülen istasyon, yakalanan adet, plaka değişimi ve cihaz durumu.
- Uygulama, kullanılan ürün, bulgu, düzeltici faaliyet, öneri, fotoğraf ve dijital imza.
- Şube, ay ve çeyrek bazlı trend grafikleri.
- Düşük/orta/yüksek aktivite eşikleri ve açıklanabilir risk puanı.
- Verilen Arçelik EFT ve canlı yakalama dosyalarına uygun profesyonel Excel/PDF çıktısı.

### Faz 3 doğrulama özeti

- Saha çalışanının taslak rapor kaydetmesi, iki dijital imzayla onaylaması ve onaylanan raporun çalışan tarafında kilitlenmesi doğrulandı.
- Firma sahibinin tamamlanmış raporu görmesi, yeniden düzenlemesi ve şube bazında filtrelemesi doğrulandı.
- EFT, canlı yakalama, kemirgen ve haşere monitörü istasyonları; aktivite, yakalama ve plaka değişimi bilgileriyle kalıcılaştırıldı.
- Örnek dosyalardaki eşiklere göre düşük, orta ve yüksek risk hesabı ile istilâ göstergesi API testinde doğrulandı.
- Aylık ve çeyreklik trend, zararlı dağılımı, müşteri/şube filtreleri ve açıklanabilir risk kartları eklendi.
- EK-1 saha formu PDF/yazdırma önizlemesi ile rapor ve trend için çok sayfalı Excel dışa aktarımı eklendi.

## Faz 4 — Müşteri Portalı ve Acil Çağrı

**Durum: Tamamlandı (07 Ağustos 2026)**

- Çatı müşteri veya şube oluşturulurken e-posta ve şifreyle müşteri hesabı açma.
- Müşterinin yalnızca yetkili olduğu çatı/şube verilerini görmesi.
- Yaklaşan işler, tamamlanan hizmetler, imzalı raporlar ve belgeler.
- Müşteri acil çağrı talebi; sahibine ve ilgili personele eş zamanlı düşmesi.
- Talep durumu, yanıt süresi ve işlem geçmişi.

### Faz 4 doğrulama özeti

- Çatı müşteri hesabının tüm şubeleri, şube hesabının ise yalnızca yetkili lokasyonu gördüğü API seviyesinde doğrulandı.
- Müşteri ve toplu şube oluşturma sırasında portal e-postası/geçici şifreyle giriş hesabı açılması sağlandı; Excel şablonu portal hesap alanlarıyla genişletildi.
- Müşteri portalındaki örnek veriler kaldırıldı; yaklaşan işler, tamamlanan hizmetler, imzalı raporlar ve acil çağrılar gerçek veritabanına bağlandı.
- Acil çağrının son sorumlu personele otomatik yönlendirilmesi, firma sahibi ekranına eş zamanlı düşmesi ve personelin çağrıyı kabul etmesi doğrulandı.
- Talep önceliği, ücret türü, atanan personel, kabul/tamamlanma zamanı, yanıt süresi ve işlem geçmişi kalıcı hale getirildi.
- Müşteri girişini bloke eden firma bağlamı filtresi düzeltilerek çatı ve şube hesaplarının oturum açması uçtan uca test edildi.

## Faz 5 — Hava Durumu ve Konum Bazlı Risk

- Koordinat veya Google Haritalar bağlantısından şube konumunu çözümleme.
- Güncel ve kısa dönem hava verisini şube bazında alma.
- Türkiye'deki hedef zararlılar için sıcaklık, nem ve yağışa bağlı açıklanabilir risk kuralları.
- Hamamböceği, sivrisinek, karasinek, kemirgen ve diğer türler için şube bazlı uyarılar.
- Müşteriye ve firma sahibine hava/risk bildirimi.

## Faz 6 — Belgeler, Bildirimler ve Kurumsal Kimlik

- PDF, Excel, Word, metin ve görsel dosyaları için firma/şube/iş emri bazlı belge arşivi.
- Firma logosu ve rapor şablonu yönetimi.
- Ürün adının kullanıcı arayüzünde Pesneer'den Pestneer'e kontrollü geçişi.
- İş tamamlanınca sahibine ve müşteriye opsiyonel bildirim.
- İşten bir gün önce müşteri ve personele hatırlatma.
- Bildirim tercihleri, teslim kayıtları, arama ve ayarlar modülü.

## Teknik İlkeler

- Her operasyon verisi `CompanyId` ile firma bazında izole edilir.
- Çatı müşteri, şube ve kullanıcı yetkileri birbirinden bağımsız modellenir.
- Kritik kayıtlar ilişkisel veritabanında tutulur; geçici tarayıcı verisine güvenilmez.
- Dosyalar nesne depolamada, metadata ve erişim yetkileri veritabanında saklanır.
- Her faz canlıya çıkmadan API, rol yetkisi, veri kalıcılığı ve temel tarayıcı akışlarıyla doğrulanır.
