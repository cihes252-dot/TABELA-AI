# TABELA AI

Tabela saha tarama, OCR, konum, tekrar-kayıt kontrolü, raporlama ve doğrulanmış AR ölçüm projesi.

## Canlı sürüm
- Mobil saha uygulaması: `https://cihes252-dot.github.io/TABELA-AI/`
- Doğrudan V10: `https://cihes252-dot.github.io/TABELA-AI/app/v10/`
- Yönetim paneli: `https://cihes252-dot.github.io/TABELA-AI/admin/`

## V10 Field Release
- Kamera ve yüksek çözünürlüklü fotoğraf tarama
- GPS ve doğruluk kaydı
- Yatay, dikey, kare, dikdörtgen, yuvarlak, oval, üçgen, çokgen ve serbest form tespiti
- Tabela alanına odaklı Türkçe + İngilizce OCR
- Çoklu OCR denemesi ve doğrulama skoru
- GPS + OCR + şekil ile tekrar tabela kontrolü
- Panel / harf yapısı için güvenli kullanıcı doğrulama alanı
- Ölçümde yalnız `verified=true` native AR verisini kabul eden Metric Engine
- Dikdörtgen, daire, oval, üçgen ve polygon alan hesabı
- Yerel kayıt, arama, CSV ve JSON dışa aktarım
- OpenStreetMap/Leaflet saha haritası
- Saha raporu ve yazdır/PDF akışı
- Offline cache ve senkronizasyon kuyruğu
- Sıfır bağımlılıklı Node.js REST backend örneği
- Ayrı yönetim paneli
- iOS ARKit ve Android ARCore WebView ölçüm köprüleri

## Ölçüm ilkesi
TABELA AI genişlik, yükseklik, çap, mesafe veya m² değerini fotoğraftan uydurmaz. Web/PWA sürümünde native AR ölçüm köprüsü yoksa ölçüm alanları boş kalır. Native iOS/Android katmanı gerçek AR dünya noktaları üretip `verified=true` gönderdiğinde ölçüm kabul edilir.

iPhone 11 LiDAR içermez. iPhone 11 native sürümünde ARKit world tracking/raycast kullanılabilir; yeterli kararlı AR noktası oluşmazsa ölçüm reddedilmelidir. LiDAR destekli cihazlarda sonraki geliştirmede scene depth/mesh de eklenebilir.

## Backend
`backend/` klasörü Node.js 18+ ile bağımlılıksız çalışır:

```bash
cd backend
npm start
```

Varsayılan port `8787`.

API:
- `GET /api/health`
- `GET /api/signs`
- `POST /api/signs`
- `DELETE /api/signs/:id`
- `GET /api/stats`

## Native
- `native/ios/TabelaMetricEngine.swift`
- `native/ios/TabelaARBridge.swift`
- `native/android/TabelaMetricEngine.kt`
- `native/android/TabelaARBridge.kt`

Bu dosyalar mobil uygulama hostuna bağlandığında web arayüzündeki `Gerçek ölçümü başlat` düğmesi native AR akışını çağırır.

## Üretime geçişte kalan hesap-bağımlı işler
Kaynak proje V10 seviyesinde bir araya getirilmiştir. Gerçek App Store TestFlight ve imzalı Android APK/AAB üretimi için Apple Developer / Android signing anahtarları ve Xcode/Android Studio build ortamı gerekir. Backend'i internete açık kullanmak için ayrıca bir sunucuya deploy edilmelidir.
