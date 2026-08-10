# PestneerVision

PestneerVision, yapışkan UV kartı fotoğraflarındaki zararlıları tarayıcıda saymak için YOLOX-Nano ve YOLOX-Tiny modellerini eğitir ve ONNX Runtime Web ile çalıştırır.

## Üretim ilkeleri

- Nesne sınıflandırma değil, kutu tabanlı nesne tespiti kullanılır; aynı karttaki her böcek ayrı sayılır.
- Veri önce kart bazında `train/val/test` olarak ayrılır. Aynı kartın döndürülmüş veya kırpılmış hali farklı bölümlere girmez.
- Eğitimde yatay çevirme, renk/ışık değişimi, Mosaic, MixUp ve hafif döndürme uygulanır.
- Yüksek çözünürlüklü kartlar 1280 px örtüşmeli parçalara ayrılır ve 640 px model girdisine ölçeklenir.
- Tarayıcıda WebGPU varsa Tiny, mobil veya WASM cihazlarda Nano seçilir.
- Model sonucu doğrudan resmî veri sayılmaz. Firma ayarına göre kullanıcı onayı zorunlu tutulur veya otomatik aktarılır.
- Onaylanan sınıf adetleri saha raporuna ve trend analizine işlenir; ham tahmin ve model sürümü denetim izi olarak saklanır.

## Sınıflar

| Kod | Pestneer etiketi | Kaynak taksonlar |
| --- | --- | --- |
| `fly` | Sinek | Diptera |
| `bee_wasp` | Arı / yaban arısı | Hymenoptera |
| `moth_butterfly` | Güve / kelebek | Lepidoptera |
| `beetle` | Kınkanatlı / depo böceği | Coleoptera |
| `cockroach` | Hamamböceği | Blattodea |
| `grasshopper_cricket` | Çekirge / cırcır | Orthoptera |
| `termite` | Termit | Isoptera |
| `other_insect` | Diğer / yabancı böcek | Diğer takımlar |

## Veri kaynakları

- Urban UV sticky-card dataset, 69 kart ve 24.758 uzman kutusu, CC BY 4.0.
- Coloured sticky-trap dataset, telefon/webcam/DSLR görüntüleri, CC BY 4.0.
- IP102 lisansı yalnız akademik kullanıma izin verdiği için üretim eğitimine otomatik alınmaz.

Kaynak, sürüm, lisans ve indirme adresleri `configs/datasets.json` içinde tutulur.

## Hızlı başlangıç

```powershell
# 1) YOLOX vendor + Windows yamaları
powershell -ExecutionPolicy Bypass -File scripts/setup_yolox.ps1

# 2) Ticari kullanıma uygun kart veri setlerini indir ve COCO formatına çevir
python scripts/download_datasets.py
python scripts/prepare_dataset.py

# 3) Nano + Tiny transfer öğrenimi (RTX 4050: Nano ~1 saat / 30 epoch)
powershell -ExecutionPolicy Bypass -File scripts/train_all.ps1 -NanoEpochs 30 -TinyEpochs 40

# 4) Tarayıcı ONNX modellerini frontend/public/models/pestneer-vision altına yaz
powershell -ExecutionPolicy Bypass -File scripts/export_onnx.ps1
```

Eğitim için CUDA destekli PyTorch gerekir. Bu bilgisayarda mevcut PyTorch kurulumu CUDA'yı gördüğü için yeniden kurulmaz.

Üretim ONNX dosyaları `frontend/public/models/pestneer-vision/` içindedir ve Docker imajına (wwwroot) kopyalanır. Ham veri, checkpoint ve YOLOX vendor klasörü git'e girmez.

## Çıktı sözleşmesi

Tarayıcı sonucu `schemas/vision-result.schema.json` biçimindedir. Her sonuçta:

- model adı ve sürümü,
- ham kutular ve güven değerleri,
- modelin önerdiği adet,
- kullanıcı tarafından onaylanan adet,
- onaylayan kullanıcı ve zaman,
- sonuç kaynağı (`Vision`, `VisionEdited`, `Manual`)

saklanır.

> PestneerVision bir yapay zeka modelidir ve hata yapabilir. Sonuçları kontrol edin.

