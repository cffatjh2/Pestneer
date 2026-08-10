# Pestneer Kalite, Uyum ve Denetim Yol Haritası

## Tasarım İlkeleri

- Her kayıt firma, çatı müşteri ve şube sınırları içinde tutulur.
- Öneriler serbest metinde kaybolmaz; sorumlu, termin, kanıt ve onay içeren iş akışına dönüşür.
- Puanlar açıklanabilir olmalı; kullanıcı toplam puanın hangi bileşenlerden geldiğini görebilmelidir.
- Denetim çıktıları değiştirilemez sürüm, belge numarası, oluşturma zamanı ve kaynak bağlantılarıyla arşivlenir.
- Kalite değerlendirmesi iş adedinden çok uygulama ve veri kalitesini ölçer.

## Faz 1 — Düzeltici Faaliyet Omurgası

Durum: Uygulandı.

- Manuel faaliyet oluşturma; saha raporu ve risk analizinden otomatik faaliyet üretme
- Sorun, kök neden, kalıcı faaliyet, müşteri/firma/ortak sorumluluk ve personel ataması
- Öncelik, termin, açık/çalışılıyor/müşteri bekleniyor/tamamlandı/doğrulandı akışı
- Öncesi ve sonrası fotoğraf kanıtı, işlem geçmişi ve müşteri kapanış onayı
- Aynı müşteri, şube ve bulgu anahtarında tekrar sayısı ve gecikme uyarısı
- Yönetici için `Kalite & Uyum`, müşteri için `Düzeltici Faaliyetler` ekranı

Kabul kriteri: Tamamlanan rapordaki düzeltici faaliyet metni kaybolmadan takip kaydına dönüşür; müşteri kapanışı onaylayabilir veya iade edebilir.

## Faz 2 — Kalite Kontrol ve Saha Denetimi

Durum: Uygulandı.

- Yayınlanmış saha raporunda rastgele, risk bazlı veya yönetici tarafından ikinci kontrol seçimi
- Kontrol türleri: rastgele örneklem, yönetici saha ziyareti, risk bazlı kontrol, şikâyet sonrası kontrol ve ikinci kontrol
- Ölçüm bileşenleri: istasyon tamamlama %25, ürün-doz doğruluğu %20, fotoğraf kalitesi %15, müşteri imzası %15, rapor bütünlüğü %15 ve zamanlama %10
- Fotoğraf eksikliği, hasarlı/ulaşılamayan istasyon ve yüksek aktivite için otomatik kontrol önerisi
- Personel kalite skoru; iş sayısı ayrı gösterilir ve kalite puanını şişirmez
- 70 puanın altındaki kontrol otomatik düzeltici faaliyete dönüşür; yönetici yeterli puanda da manuel faaliyet açabilir

Kabul kriteri: Firma sahibi belirli işi ikinci kontrole alabilir; kontrol sonucu gerekçeleriyle görünür ve personel kalite profiline yansır.

## Faz 3 — Şube Sağlık Skoru ve Atık/Bertaraf

Durum: Uygulandı.

Sağlık skoru 100 puandan başlayan açıklanabilir ceza modeliyle hesaplanır:

- Zararlı aktivitesi: 0-25 puan
- Açık yapısal uygunsuzluk ve düzeltici faaliyet: 0-20 puan
- İstasyon hasarı/kayıp: 0-10 puan
- Ulaşılamayan istasyon: 0-10 puan
- Hava ve mevsim riski: 0-10 puan
- Acil çağrı sıklığı: 0-10 puan
- Geciken müşteri aksiyonları: 0-10 puan
- Önceki döneme göre olumsuz trend: 0-5 puan

Müşteri her bileşenin etkisini görür. Dönemsel değişim yalnızca iki dönemde de yeterli saha verisi varsa gösterilir; veri yoksa karşılaştırma puana dahil edilmez ve veri güven seviyesi ayrıca belirtilir.

Atık kayıtları tamamen opsiyoneldir; iş emri, saha raporu veya hizmet tamamlama akışını engellemez. Kullanıldığında tür, miktar, birim, opsiyonel kaynak iş emri, tarih, geçici depolama, teslim alan, taşıyan/bertaraf kuruluşu, yöntem, belge numarası ve kanıt dosyası içerir. Ölü kemirgen, kullanılmış yem, boş kimyasal ambalaj, hasarlı istasyon, yapışkan plaka, UV lamba ve kontamine KKD ayrı sınıflandırılır.

Kabul kriteri: Şube skoru hesap dökümüyle görünür; yeterli geçmiş yoksa dönem değişimi dayatılmaz. İstenirse atığın oluşumdan teslim/bertarafa kadar kronolojik izi kanıtlanır, kayıt oluşturulmaması operasyonu durdurmaz.

## Faz 4 — Sözleşme ve Hizmet Paketi Otomasyonu

Durum: Uygulandı.

- Çatı müşteri sözleşmesinde başlangıç/bitiş, otomatik yenileme, yıllık fiyat artışı ve bitiş uyarısı
- Şube ve hizmet bazlı fiyat, aylık ziyaret sayısı, dahil hizmetler, ücretsiz acil çağrı hakkı, ekstra çağrı bedeli ve müdahale süresi taahhüdü
- Sözleşmeden aylık/haftalık iş emirlerini çakışma kontrolüyle otomatik üretme
- Talep ve iş emrinde `Sözleşme dahilinde`, `Ücretsiz hak`, `Sözleşme dışı ücretli` sınıflandırması
- Eksik hizmet, aşılan ücretsiz çağrı, SLA gecikmesi ve yenileme ihtimali uyarıları

Kabul kriteri: Aktif paket planlanan işleri üretir; sözleşme dışı operasyonlar ve fiyat etkisi açıkça ayrılır.

## Faz 5 — Tek Tık Denetim Dosyası

Durum: Uygulandı.

- Müşteri, şube, tarih aralığı ve BRCGS/IFS/FSSC/ISO 22000/EN 16636 gibi denetim profili seçimi
- Paket ön kontrolü: eksik sözleşme, süresi geçmiş personel belgesi, güncel olmayan kroki/GBF, imzasız rapor ve açık kritik faaliyet uyarısı
- İçindekiler ve kanıt manifesti olan tek PDF; özgün dosyaları içeren ZIP seçeneği
- Sözleşme/hizmet planı, firma-personel belgeleri, güncel kroki, istasyon listesi, raporlar, ürün/GBF, trend-risk analizleri, düzeltici faaliyetler, eğitim/yetkinlik ve atık kayıtları
- Her dosya için kaynak, belge numarası, revizyon, tarih, kapsam ve bütünlük özeti
- Oluşturulan paket `Belgeler / Denetim Dosyaları` arşivine ve yetkili müşteri portalına düşer

Kabul kriteri: Eksik içerikler paket oluşturulmadan görünür; üretilen PDF/ZIP aynı filtrelerle yeniden oluşturulabilir ve kayıt manifestiyle doğrulanabilir.

## Standart Uyumu İçin Notlar

- BRCGS yaklaşımında tekrarlayan uygunsuzluklar yalnızca anlık düzeltmeyle kapatılmaz; kök neden ve kalıcı faaliyet kaydı gerekir.
- EN 16636 uyumlu hizmette saha değerlendirmesi, izlenebilir uygulama kaydı, yetkin personel, öneri ve güvenli atık yönetimi birlikte ele alınmalıdır.
- Atık kayıtları miktar, nitelik/kaynak, hedef, taşıma ve işlem yöntemini kronolojik olarak saklayacak şekilde tasarlanır.
