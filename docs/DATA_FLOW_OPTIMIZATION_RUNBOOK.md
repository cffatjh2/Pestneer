# Veri akışı optimizasyonu ölçüm ve yayın runbook'u

Bu belge Render API, Supabase PostgreSQL/Storage ve Vercel istemci akışındaki optimizasyonların güvenli biçimde ölçülmesi ve kademeli açılması içindir. Hesap, parola, e-posta, telefon, token, imza, dosya adı, ham URL/query ve istek/yanıt gövdeleri ölçüm kapsamı dışındadır.

## Üretim öncesi temel ölçüm

Supabase SQL Editor'da `pg_stat_statements` etkin değilse önce proje yöneticisi tarafından etkinleştirilmelidir. Aşağıdaki sorgu normalize SQL metnini veya parametreleri döndürmez; yalnız anonim `queryid` ve toplulaştırılmış maliyetleri gösterir.

```sql
select
  queryid,
  calls,
  round(total_exec_time::numeric, 2) as total_exec_ms,
  round(mean_exec_time::numeric, 2) as mean_exec_ms,
  rows,
  shared_blks_hit,
  shared_blks_read,
  temp_blks_read,
  temp_blks_written,
  wal_bytes
from pg_stat_statements
where dbid = (select oid from pg_database where datname = current_database())
order by total_exec_time desc
limit 20;
```

Tablo ve TOAST boyutları yalnız şema boyutunu ölçer; satır içeriklerini okumaz:

```sql
select
  relname as table_name,
  pg_total_relation_size(relid) as total_bytes,
  pg_relation_size(relid) as heap_bytes,
  pg_indexes_size(relid) as index_bytes
from pg_catalog.pg_statio_user_tables
order by total_bytes desc;
```

Render ölçümleri route şablonu, metot, durum, sıkıştırılmış istek/yanıt baytı, süre ve toplu EF sorgu sayısı/süresiyle sınırlıdır. Normal yanıtlar örneklenir; hata, 1 MiB üzeri yanıt ve 1 saniye üzeri istekler her zaman ölçülür. Log dışa aktarımında ham query, header veya body açılmamalıdır.

## Sorgu ve indeks kabulü

Bir indeks yalnız sorgu toplam veritabanı süresinin en az %1'ini kullanıyorsa, staging planında gereksiz geniş tarama görülüyorsa ve aday indeks p95 süresini en az %30 düşürüyorsa eklenir. Temsili fakat kişisel veri içermeyen staging parametreleriyle:

```sql
explain (analyze, buffers, wal, format json)
select /* incelenecek normalize sorgunun staging eşdeğeri */ 1;
```

Plan çıktısında gerçek müşteri/hesap değerleri saklanmamalıdır. PostgreSQL üretim indeksleri `CREATE INDEX CONCURRENTLY` ile ayrı rollout adımında oluşturulmalı; hesap ve üyelik tabloları bu optimizasyon kapsamında değiştirilmemelidir.

## Private Storage canary

1. Private bucket ve Render secret'ları `SUPABASE_PRIVATE_STORAGE.md` uyarınca hazırlanır.
2. İlk açılışta yalnız `SupabaseStorage__Enabled=true` yapılır. `BackfillEnabled`, `HybridDualWriteEnabled`, `HybridReadEnabled` ve `StorageOnlyWritesEnabled` false; `BackfillCompanyIds` ve `HybridCompanyIds` boş kalır. Bu durumda hiçbir tenant dosyası taşınmaz.
3. Demo şirket GUID'i yalnız Render secret/config içinde `SupabaseStorage__HybridCompanyIds__0` olarak eklenir. `HybridDualWriteEnabled=true` açılır; legacy byte her zaman önce yazılır. En az 48 saat checksum ve yetki uyuşmazlığı sıfır olmalıdır.
4. Aynı allowlist ile `HybridReadEnabled=true` açılır. Resource endpointlerinde Storage sonucu ve inline fallback hash/MIME/filename/Range/ETag karşılaştırılır.
5. `GET /api/v2/files/capabilities` demo owner için true, diğer tenantlar için false dönmelidir. Upload/complete ve `POST /api/v2/quality/documents/from-stored-object` yalnız demo şirkette denenir. Sonra `StorageOnlyWritesEnabled=true` açılarak yeni Quality ve audit kayıtlarında PostgreSQL blob azalması doğrulanır. SQLite bu aşamaya katılmaz.
6. Backfill için demo GUID ayrıca `SupabaseStorage__BackfillCompanyIds__0` içine yazılır; sonra `BackfillEnabled=true` gözetimli bakım penceresinde açılır. Worker yalnız listedeki şirketleri, tur başına en fazla 25 nesne ve 64 MiB işler; legacy byte kolonlarını silmez.
7. 48 saat boyunca checksum, 401/403, orphan ve indirme hatası sıfırsa allowlist tenantların %10'una genişletilir. Gerçek tenant GUID'leri loglara veya repoya yazılmaz.
8. Rollback'te önce `StorageOnlyWritesEnabled=false`, sonra dual-write/read flag'leri kapatılır. Mevcut Storage-only satırların zorunlu okumaları flag/allowlistten bağımsız sürer; bu nedenle `Enabled`, private bucket ve Render service-role bağlantısı korunur. Geçici Storage arızası içerik kaybı/404 yerine 503 üretir.
9. Eski kolonların veya unattached Ready nesnelerin silinmesi bu sürümün parçası değildir. Ready cleanup için ayrıca referans taraması, retention onayı, restore tatbikatı ve yeni canary gerekir.

## Yayın kapıları

- Backend Debug/Release ve frontend production build başarılı.
- Eski liste JSON alan/değer/sıralama snapshot'ları aynı.
- V2 cursor sayfalarında aynı snapshot altında tekrar veya eksik kayıt yok.
- Metadata listesi SQL'inde `FileData`, `Data`, `PdfData`, `ZipData`, imza ve vision JSON seçilmiyor.
- Dosya yükleme, doğrulama, indirme ve backfill SHA-256 değeri birebir aynı.
- PDF sayfa/metin/logo/imza/QR; ZIP entry adı ve hash kontrolleri başarılı.
- Owner/employee/customer ve şirket/şube erişim matrisi 401/403 dahil başarılı.
- Offline cold-start, autosave, kapanıp açılma ve yeniden senkronizasyon başarılı.
- p95 gerilemesi %5'in, hata artışı 0,1 yüzde puanın altında.

Rollback, veri silerek değil ilgili feature flag'i kapatıp legacy read fallback'e dönerek yapılır. Storage nesneleri ve eski kolonlar rollback sırasında korunur.
