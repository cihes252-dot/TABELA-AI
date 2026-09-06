# TABELA AI

Tabela saha tarama, OCR, konum, tekrar-kayıt kontrolü, raporlama ve doğrulanmış LiDAR/AR ölçüm projesi.

## Canlı sürüm
- Mobil saha uygulaması: `https://cihes252-dot.github.io/TABELA-AI/`
- Doğrudan V11: `https://cihes252-dot.github.io/TABELA-AI/app/v11/`
- Yönetim paneli: `https://cihes252-dot.github.io/TABELA-AI/admin/`

## V11 Hardened Field
- 5 karelik hızlı saha taraması ve en iyi kare seçimi
- Bulanıklık, ışık, kontrast, parlama ve tabela-kadraj oranı kalite kapısı
- Tabela segmentation model slotu + eğitimli model yoksa açıkça işaretlenen geometri fallback
- Perspektif düzeltme motoru (`quad` sınırı geldiğinde)
- Çoklu-kare OCR ensemble ve doğrulama
- iOS Apple Vision OCR ve Android ML Kit OCR native motor dosyaları
- GPS + OCR + şekil + görsel dHash ile tekrar tabela kontrolü
- Operatör duplicate override kaydı
- Pusula / kamera yönü kaydı
- OpenStreetMap Nominatim ile opsiyonel otomatik adres
- Malzeme AI model slotu + kullanıcı doğrulama fallback
- LiDAR Scene Depth / smoothed depth / mesh kalite kapısı
- LiDAR yoksa ARKit / ARCore raycast ölçüm yolu
- Ölçüm kalite puanı ve yalnız `verified=true` veriyi kabul eden Metric Engine
- Dikdörtgen, daire, oval, üçgen ve polygon alan hesabı
- IndexedDB tabanlı kayıt + fotoğraf + audit geçmişi
- OCR düzeltmelerini audit'e yazma
- Offline shell/cache ve senkronizasyon kuyruğu
- CSV / JSON dışa aktarım
- OpenStreetMap saha haritası
- Saha raporu ve yazdır/PDF akışı
- V11 uyumlu yönetim paneli
- PostgreSQL/PostGIS üretim backend şeması ve API scaffold
- Yapılandırılabilir mevzuat/kontrol motoru (hukuki karar vermez)

## Ölçüm ilkesi
TABELA AI genişlik, yükseklik, çap, mesafe veya m² değerini fotoğraftan uydurmaz. Web/PWA sürümünde native AR ölçüm köprüsü yoksa ölçüm alanları boş kalır. Native iOS/Android katmanı gerçek sensör/AR dünya noktaları üretip `verified=true` gönderdiğinde ölçüm kabul edilir.

iPhone 11 LiDAR içermez; native sürümde ARKit world tracking/raycast kullanılır. LiDAR destekli cihazlarda V11 native katmanı Scene Depth, smoothed Scene Depth ve mesh yeteneklerini kontrol eder ve düşük depth confidence olan köşe noktalarını reddeder.

## Model slotları
`models/README.md` segmentation ve malzeme modellerinin web/native entegrasyon sözleşmesini tanımlar. Eğitimli ağırlıklar repoda olmadığı sürece V11 bu iki konuda kesin AI sonucu üretmez.

## Backend
Demo JSON backend:

```bash
cd backend
npm start
```

PostgreSQL/PostGIS backend:

```bash
cd backend
npm install
psql "$DATABASE_URL" -f schema.sql
npm run start:pg
```

`API_TOKEN` tanımlanırsa PostGIS API Bearer token ister. Üretimde HTTPS, kullanıcı/rol yönetimi, object storage, yedekleme ve log/monitoring ayrıca deploy edilmelidir.

## Native
- `native/ios/TabelaMetricEngine.swift`
- `native/ios/TabelaLiDAREngine.swift`
- `native/ios/TabelaARBridge.swift`
- `native/ios/TabelaHostViewController.swift`
- `native/ios/TabelaVisionOCR.swift`
- `native/android/TabelaMetricEngine.kt`
- `native/android/TabelaARBridge.kt`
- `native/android/TabelaMlKitOCR.kt`

## Saha kabul
`docs/V11_FIELD_ACCEPTANCE.md` üretime geçmeden önce uygulanacak test setini ve kabul metriklerini tanımlar.

## Henüz fiziksel olarak üretilemeyen parçalar
İmzalı App Store/TestFlight ve Android APK/AAB için Apple Developer / Android signing anahtarları ile gerçek Xcode/Android Studio build ortamı gerekir. Eğitimli sign-segmentation ve material-classification ağırlıkları ise gerçek etiketli saha verisiyle eğitilmelidir. PostgreSQL/PostGIS backend de ayrıca bir sunucuya deploy edilmelidir.
