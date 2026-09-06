# TABELA AI — Build & Release

## Web/PWA
GitHub Pages `main` branch kökünden yayınlanır. Ana `index.html` V10'a yönlendirir.

## iOS TestFlight
Gerekli hesap/ortam:
- Apple Developer hesabı
- macOS + Xcode
- bundle identifier ve signing team

Akış:
1. Native iOS host projesi oluştur.
2. `TabelaMetricEngine.swift` ve `TabelaARBridge.swift` ekle.
3. Kamera ve konum izinlerini Info.plist'e ekle.
4. WKWebView'de V10 URL'sini aç.
5. ARSCNView ölçüm overlay'ini bağla.
6. Gerçek cihazda iPhone 11 saha testi yap.
7. Archive → App Store Connect → TestFlight.

## Android APK/AAB
Gerekli ortam:
- Android Studio
- Android SDK + ARCore
- release keystore

Akış:
1. Native Android host projesi oluştur.
2. `TabelaMetricEngine.kt` ve `TabelaARBridge.kt` ekle.
3. Kamera/konum izinleri ve ARCore dependency ekle.
4. WebView JavascriptInterface'i `TabelaAndroidMetric` adıyla bağla.
5. Gerçek cihaz testi.
6. Signed APK/AAB üret.

## Release gate
İmzalı paket yayınlanmadan önce `docs/V10_TEST_PLAN.md` uygulanmalıdır. Ölçüm doğruluğu cihaz/model/mesafe bazında referans lazer metre ile raporlanmalıdır.
