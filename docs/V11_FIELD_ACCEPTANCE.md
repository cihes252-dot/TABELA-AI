# TABELA AI V11 — Saha Kabul Planı

## Zorunlu saha test seti
En az 50 tabela: yatay, dikey, kare, daire, oval, üçgen, totem, LED, kutu harf, vinil, cam üstü, gece/gündüz, yakın/uzak ve eğik açı.

## Kabul metrikleri
- Çekim kalite kapısı: bulanık/çok karanlık/aşırı parlak örneklerin en az %95'ini yeniden çekime yönlendirmeli.
- Tabela sınırı: eğitimli segmentation devreye girdikten sonra IoU hedefi >= 0.90.
- OCR: temiz tabela setinde karakter doğruluğu hedefi >= %99; düşük güvenli sonuçlar otomatik kesinleştirilmemeli.
- Duplicate: aynı tabelanın ikinci kaydını yüksek doğrulukla bulmalı; yanlış pozitifler operatör override ile audit'e yazılmalı.
- GPS: doğruluk değeri her kayıtta saklanmalı; >30 m kayıtlar raporda işaretlenmeli.
- LiDAR/AR: ölçüm yalnız verified=true + kalite kapısı ile kabul edilmeli.
- LiDAR doğrulama: bilinen ölçülü 20 tabela üzerinde hata dağılımı raporlanmalı; hedef cihaz/mesafe profiline göre tolerans ayrıca tanımlanmalı.
- Offline: ilk çevrimiçi kurulumdan sonra saha kayıtları internetsiz tutulmalı ve bağlantı gelince kuyruğa göre senkronize edilmeli.
- Veri kaybı: uygulama kapanması / ağ kesilmesi sonrası kayıt ve audit geçmişi korunmalı.

## Üretime geçmeden önce
1. Eğitimli sign segmentation modeli.
2. Eğitimli material/construction modeli.
3. iOS Vision + Android ML Kit native OCR ensemble.
4. İmzalı iOS/Android uygulaması ve native LiDAR/AR testleri.
5. PostgreSQL/PostGIS backend deploy.
6. Kimlik doğrulama, rol bazlı yetki ve HTTPS.
7. Fotoğraf/object storage ve yedekleme.
8. KVKK/veri saklama politikası ve saha personeli yetkilendirmesi.
9. İzleme/log/backup/restore testi.
10. Pilot saha kabul raporu.
