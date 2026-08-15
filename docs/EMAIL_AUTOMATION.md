# Gmail OAuth e-posta otomasyonu

Pestneer, firma sahibinin Gmail hesabını bir kez yetkilendirmesiyle imzalı saha raporlarını otomatik gönderir. Gmail parolası uygulamada tutulmaz. Google tarafından verilen yenileme anahtarı şifrelenerek firma bazında saklanır.

## Canlı ortam kurulumu

1. Google Cloud Console'da Gmail API etkinleştirilir.
2. OAuth izin ekranı hazırlanır ve uygulama test kullanıcıları tanımlanır.
3. `Web application` türünde OAuth istemcisi oluşturulur.
4. Yetkili yönlendirme adresi olarak aşağıdaki adres eklenir:

   `https://pesneer.onrender.com/api/company/branding/email/google/callback`

5. Render servisinde şu gizli ortam değişkenleri tanımlanır:

   - `Email__GoogleClientId`
   - `Email__GoogleClientSecret`

6. Backend yeniden dağıtıldıktan sonra firma sahibi **Ayarlar > E-posta otomasyonu** alanından **Gmail hesabını bağla** seçeneğini kullanır.
7. Aynı karttaki test gönderimiyle bağlantı doğrulanır.

## Otomatik teslimat akışı

- EK-1 saha raporu imzalanıp tamamlandığında teslimat kayıtları aynı işlem içinde oluşturulur.
- Firma bildirim adresi ile firma sahibi/yönetici hesapları alıcı listesine eklenir.
- Çatı müşteri e-postası ve müşteri portal hesapları eklenir.
- Şube e-postası ve şube portal hesapları eklenir.
- Formda belirtilen opsiyonel e-posta adresleri eklenir.
- Her alıcıya firma logolu PDF rapor gönderilir.
- Başarısız teslimatlar artan bekleme süreleriyle yeniden denenir; sekiz denemeden sonra hata durumuna alınır.
- Firma sahibi Ayarlar ekranından başarısız veya bekleyen teslimatları yeniden çalıştırabilir.

## Güvenlik ve süreklilik

- Gmail parolası istenmez ve kaydedilmez.
- OAuth bağlantısı firma bazında ayrıdır; bir firma diğerinin gönderen hesabını kullanamaz.
- Yenileme anahtarı `Jwt__SigningKey` tabanlı AES-GCM korumasıyla veritabanında şifreli saklanır.
- Teslimat anahtarları sabittir; yeniden denemelerde aynı iletinin gereksiz çoğalması azaltılır.
- Gmail bağlantısı kaldırıldığında firma SMTP veya Resend yapılandırmasına geri dönebilir.

Render ücretsiz servis uykuya geçtiğinde arka plan kuyruğu geçici olarak durur. API yeniden uyandığında bekleyen iletiler otomatik işlenir; kayıt kaybı olmaz.
