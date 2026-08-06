# Pesneer teknik mimarisi

## Ana yaklaşım

Pesneer, web, Android ve masaüstü istemcilerinin aynı iş kurallarını kullanacağı ASP.NET Core API üzerinde çalışan modüler monolit olarak başlar. Modüller ayrı sorumluluklara sahiptir; ürün büyüdüğünde bağımsız servislere ayrılabilecek sınırlar korunur.

## Kimlik modeli

Kimlik doğrulama ve firma üyeliği birbirinden ayrıdır:

- `Account`: e-posta, şifre özeti, aktiflik ve giriş portalı.
- `CompanyMembership`: firma sahibi ve çalışanların hangi firmaya, hangi rolle bağlı olduğunu belirler.
- `CustomerMembership`: müşteri kullanıcısını hem hizmet veren firmaya hem de yalnızca erişebileceği müşteri kaydına bağlar.
- JWT içindeki `company_id`, `portal`, `role` ve gerekiyorsa `customer_id` sunucu tarafından üretilir.

Firma kodu yalnızca doğru üyeliği seçmek için kullanılır. API, istek gövdesinden veya özel bir başlıktan gelen firma kimliğine güvenmez.

## Veri izolasyonu

1. Her operasyonel tablo `CompanyId` taşır.
2. Entity Framework global sorgu filtreleri yalnızca oturumdaki firmayı döndürür.
3. `SaveChangesAsync` öncesi güvenlik kontrolü, başka firmaya ait kayıt ekleme veya değiştirme denemesini reddeder.
4. Müşteri portalı, firma filtresine ek olarak token içindeki `customer_id` ile sınırlandırılır.
5. Sahip, çalışan ve müşteri uçları ayrı yetki politikaları ile korunur.
6. Üretim veritabanında ikinci savunma katmanı olarak PostgreSQL Row Level Security politikaları eklenecektir.

Bu yapı, bir firmanın işlerini, çalışanlarını, müşterilerini, stoklarını ve belgelerini başka bir firmanın sorgulamasını engeller. Büyük kurumsal müşteriler için ileride aynı arayüz arkasında ayrı şema veya ayrı veritabanı seçeneği desteklenebilir.

## Modüller

| Modül | Sorumluluk |
| --- | --- |
| Kimlik ve Yetki | Hesaplar, firma üyelikleri, müşteri erişimleri ve oturumlar |
| CRM | Müşteri, şube, adres, teklif, sözleşme ve talepler |
| Operasyon | İş emri, atama, kontrol listesi, fotoğraf ve saha akışı |
| Planlama | Takvim, tekrar eden hizmetler, rota ve bildirimler |
| Stok | Ürün, depo, lot, son kullanım ve saha tüketimi |
| Raporlama | Şablon, imza, doğrulama kodu, PDF ve belge geçmişi |
| Finans | Cari hesap, tahsilat, masraf, kârlılık ve fatura entegrasyonu |

## Güvenlik standardı

- Parolalar düz metin tutulmaz; ASP.NET Core parola özetleyicisi kullanılır.
- Erişim tokenları kısa ömürlüdür; üretim fazında yenileme tokenı HttpOnly ve Secure cookie olarak uygulanacaktır.
- Hassas yazma işlemleri denetim kaydı üretir.
- Dosyalar nesne depolamada, sahiplik bilgileri veritabanında tutulur.
- Üretim anahtarları kaynak koda yazılmaz.
