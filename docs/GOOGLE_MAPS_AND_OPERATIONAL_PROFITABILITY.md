# Google Maps ve operasyonel kârlılık kurulumu

Bu özellikler hesap, iletişim, giriş veya yetki verilerini değiştirmez. Konum bilgisi müşteri ya da şube kaydına isteğe bağlı olarak eklenir; stok alış maliyeti de isteğe bağlıdır.

## Google Maps'i Vercel'de açma

1. Google Cloud Console'da üretim için ayrı bir proje ve faturalandırma hesabı seçin.
2. **Maps JavaScript API** ile **Places API (New)** hizmetlerini etkinleştirin.
3. Bir tarayıcı API anahtarı oluşturun.
4. Anahtarın *Application restrictions* ayarını **Websites** yapın ve yalnız kullanılan adresleri ekleyin:
   - `https://alanadiniz.com/*`
   - `https://www.alanadiniz.com/*`
   - geçiş süresince kullanılan Vercel üretim adresi
   - yalnız geliştirme gerekiyorsa `http://localhost:5173/*`
5. *API restrictions* bölümünde anahtarı yalnız **Maps JavaScript API** ve **Places API (New)** ile sınırlandırın.
6. Vercel projesinin Production ortam değişkenlerine aşağıdaki değeri ekleyip yeniden deploy edin:

   ```text
   VITE_GOOGLE_MAPS_API_KEY=olusturdugunuz_tarayıcı_anahtarı
   ```

7. Google Cloud'da bir Map ID kullanılıyorsa ayrıca şu değişken eklenebilir; zorunlu değildir:

   ```text
   VITE_GOOGLE_MAPS_MAP_ID=map_id_degeri
   ```

`VITE_` ile başlayan değer tarayıcı paketinde görünür; bu Google Maps web anahtarları için beklenen davranıştır. Güvenlik, anahtarı gizlemeye değil web sitesi ve API kısıtlarını doğru uygulamaya dayanır. Bu anahtar Render'a veya Supabase'e eklenmez. Sunucu tarafındaki gizli anahtarlarla aynı anahtar kullanılmaz.

Anahtar henüz eklenmemiş olsa da ekranlar bozulmaz: konum bağlantısı, koordinatlar, günlük iş listesi ve Google Maps navigasyon bağlantıları kullanılmaya devam eder; yalnız gömülü harita yerine açıklayıcı görünüm gösterilir.

## Kullanım akışı

- Yeni müşteri veya şube eklerken haritada tıklayarak, işareti sürükleyerek, adres arayarak ya da mevcut Google Maps bağlantısını yapıştırarak konum seçilebilir.
- Bağlantı girmek zorunlu değildir. Kayıt sonrasında müşteri merkezi veya şube konumu ayrı ayrı düzenlenebilir.
- Yönetici iş emirleri veya takvim ekranında seçilen günün tüm konumlu işlerini görür.
- Personel Günün Rotası ekranında kendi günlük işlerini ve navigasyon sırasını görür.
- Planlanan işler mavi, sahadaki işler turuncu, tamamlanan işler yeşil onay işaretiyle gösterilir. Durum güncellendiğinde işaret de güncellenir.
- Telefon ekranında haritanın altında dokunması kolay iş listesi ve doğrudan navigasyon bağlantısı bulunur.

## Stok maliyeti ve aylık rapor

- Depoya ürün girerken birim maliyet isteğe bağlıdır. Girilmezse stok işlemi mevcut davranışıyla devam eder.
- Aynı stok partisine maliyetli giriş yapıldığında birim maliyet ağırlıklı ortalamayla güncellenir; maliyetsiz giriş mevcut fiyatı bozmaz.
- Depodan araca transferde ve personelin raporda ürün kullanımında o andaki maliyet hareket kaydına sabitlenir. Sonradan ürün fiyatı değişse bile geçmiş ayın maliyeti değişmez.
- Ticari yönetim ekranındaki aylık rapor; operasyon gelirini, ürün kullanım maliyetini, işçilik tahminini, net katkıyı ve marjı gösterir. Ay seçilebilir ve aynı görünüm PDF olarak indirilebilir.
- Maliyeti girilmemiş ürün kullanımı ayrıca uyarılır; sıfır maliyet sessizce kesin sonuç gibi sunulmaz.

Bu çıktı resmi muhasebe, vergi veya e-fatura raporu değildir. Operasyonel karar desteği içindir; resmi mali tablolar muhasebe kayıtlarıyla yürütülmeye devam eder.

## Yayın kontrolü

- Render açılışında PostgreSQL migration'ı yeni maliyet anlık görüntü alanlarını ekler.
- İlk üretim kontrolünde yeni müşteri konumu kaydedin, aynı gün için iş emri oluşturun ve hem yönetici hem personel ekranından işareti doğrulayın.
- Bir ürünü fiyatlı olarak depoya alın, araca aktarın ve tamamlanan saha raporunda kullanın. İlgili ayın operasyonel kârlılık ekranı ile PDF toplamlarını karşılaştırın.
- Google Cloud kullanım kotası ve bütçe uyarısı tanımlayın; anahtarın reddedilen isteklerini ve olağan dışı trafik artışlarını izleyin.
