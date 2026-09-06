# TABELA AI Backend

Bağımlılıksız Node.js 18+ REST servisidir.

## Çalıştır
```bash
node server.js
```
Varsayılan: `http://localhost:8787`

## Endpointler
- `GET /api/health`
- `GET /api/signs?q=&project=`
- `POST /api/signs`
- `DELETE /api/signs/:id`
- `GET /api/stats`

## Mobil uygulamaya bağlama
V10 → Ayarlar → Backend API adresi alanına sunucunun HTTPS kök adresini yazın. Örnek: `https://api.example.com`.

## Üretim notu
Bu örnek JSON dosyasına yazar. Çok kullanıcılı üretim için PostgreSQL/PostGIS, kullanıcı kimlik doğrulaması, rol bazlı yetki, obje depolama ve yedekleme eklenmelidir. Fotoğraflar mevcut V10 mobil kayıtta yalnız küçük thumbnail olarak yerel tutulur; üretimde orijinal medya obje depolamaya gönderilmelidir.
