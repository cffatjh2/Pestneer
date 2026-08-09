# Pesneer

Pest kontrol ve ilaçlama firmaları için geliştirilen çok kiracılı operasyon ve işletme yönetim platformu.

## Mevcut kapsam

- Firma sahibi, firma çalışanı ve müşteri için ayrı giriş deneyimleri
- Rol bazlı, firma sınırına bağlı JWT yetkilendirmesi
- Operasyon merkezi, iş emirleri ve takvim
- Firma sahibinin temel bilgiler, görev ve şifreyle anında çalışan hesabı oluşturabildiği ekip yönetimi
- Çalışanların firma kodu, e-posta ve oluşturulan şifreyle ayrı portaldan girişi
- Çalışanların işe başlama, mola, işe devam ve mesai bitiş kayıtlarıyla net çalışma süresi takibi
- İlaç seçimi ve manuel ürün eklemeyi destekleyen araç stok kontrolü
- Firma sahibi için günlük ve son 7 günlük personel sürelerini gösteren Rapor & Analizler ekranı
- Stok yönetimi
- Dokunmatik cihazlarda imza alma
- EK-1 benzeri yazdırılabilir hizmet raporu
- Çalışan ve müşteri için ayrı portal görünümleri

Yapay zeka, görüntü tanıma ve tahmine dayalı analiz modülleri sonraki fazda ele alınacaktır.

## Teknoloji

- `frontend/`: React, TypeScript ve Vite
- `backend/`: ASP.NET Core 8, Entity Framework Core ve JWT
- Veritabanı: Üretimde PostgreSQL, yerel geliştirmede SQLite
- Mimari: modüler monolit, şirket bazlı veri izolasyonu

## Çalıştırma

Web arayüzü:

```powershell
cd frontend
pnpm install
pnpm run dev
```

API:

```powershell
cd backend/src/Pesneer.Api
dotnet run
```

Yeni bir geliştirme ortamında API ilk açılışta migration'ları uygular ve başlangıç firma sahibi hesabını oluşturur.

Yerel API, kurulum gerektirmeyen SQLite veritabanını `appsettings.Development.json` üzerinden kullanır. Üretimde `DATABASE_URL` bulunduğunda PostgreSQL otomatik seçilir ve migration'lar servis açılışında uygulanır.

## Railway dağıtımı

Kök dizindeki `Dockerfile`, React arayüzünü derler ve ASP.NET Core API ile aynı servisten sunar. `railway.json`, `/api/health` sağlık kontrolünü etkinleştirir.

Vercel dağıtımı `vercel.json` üzerinden React arayüzünü yayınlar; `/api` istekleri kalıcı PostgreSQL veritabanı kullanan Render API servisine güvenli biçimde yönlendirilir.

1. Railway projesine bir PostgreSQL servisi ekleyin.
2. Uygulama servisinde `DATABASE_URL=${{Postgres.DATABASE_URL}}` referans değişkenini tanımlayın.
3. En az 32 karakterli `Jwt__SigningKey` değeri oluşturun.
4. İlk firma sahibi için `BootstrapOwner__Email`, `BootstrapOwner__Password`, `BootstrapOwner__CompanyCode` ve `BootstrapOwner__CompanyName` değişkenlerini tanımlayın.
5. GitHub deposunu uygulama servisine bağlayın. Railway kök `Dockerfile` dosyasını otomatik kullanır.

PostgreSQL ayrı Railway servisi olduğu için uygulama yeniden dağıtılsa bile müşteri, personel, stok, takvim ve iş emri kayıtları korunur.

Teknik ayrıntılar için `docs/architecture.md`, ürün karşılaştırması için `docs/competitive-roadmap.md` dosyasına bakın.
