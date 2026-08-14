# Oracle Always Free demo kurulumu

Bu paket Pestneer API, PostgreSQL 17 ve Caddy HTTPS katmanını tek Oracle VM üzerinde çalıştırır. PostgreSQL dış ağa açılmaz; yalnızca Caddy üzerinden `80/443` portları yayınlanır.

## Önerilen VM

- Ubuntu 24.04 veya Oracle Linux 9
- `VM.Standard.A1.Flex` (ARM), demo için 2 OCPU / 12 GB RAM
- En az 50 GB boot volume
- Güvenlik listesinde yalnızca `22`, `80` ve `443` TCP; `443` UDP

## Kurulum

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
newgrp docker
git clone https://github.com/cffatjh2/Pesneer.git
cd Pesneer/deploy/oracle
cp .env.example .env
nano .env
docker compose up -d --build
docker compose ps
curl -fsS "https://${API_HOST}/api/health"
```

Cloudflare DNS üzerinde `api` kaydı VM'in sabit genel IPv4 adresine yönlendirilir. İlk sertifika alınırken kayıt DNS-only bırakılır; Caddy sertifikayı aldıktan sonra Cloudflare proxy açılır ve SSL/TLS modu `Full (strict)` yapılır.

## Cloudflare Pages

- Depo: `cffatjh2/Pesneer`
- Üretim dalı: `main`
- Kök dizin: `frontend`
- Derleme komutu: `npm ci && npm run build`
- Çıktı dizini: `dist`
- Ortam değişkeni: `API_ORIGIN=https://api.pestneer.com`

`frontend/functions/api/[[path]].js`, tarayıcıdaki aynı kaynaklı `/api/*` isteklerini API sunucusuna aktarır. Bu sayede mevcut PWA ve çevrimdışı saha akışı değişmeden kalır.

## Yedek

```bash
chmod +x scripts/backup-postgres.sh
./scripts/backup-postgres.sh
```

Demo süresince yüklenen fotoğraf ve belgeler PostgreSQL içinde tutulduğu için veritabanı yedeğine dahildir. `backups/` dizini yedi günlük döngüyle saklanır. Uzun süreli üretim geçişinde dosya gövdeleri Object Storage'a taşınmalıdır.

## Güncelleme

```bash
git pull --ff-only origin main
cd deploy/oracle
docker compose up -d --build
docker image prune -f
```
