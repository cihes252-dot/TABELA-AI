# TABELA AI iOS Native

## Hedef
V10 web arayüzünü WKWebView içinde açıp ARKit ile gerçek 3B ölçüm üretmek.

## iPhone 11
- LiDAR yoktur.
- ARKit world tracking + raycast kullanılır.
- Dört tabela köşesi gerçek AR dünya koordinatına oturtulmadan `verified=true` gönderilmez.
- Tracking state `.normal` değilse nokta kabul edilmez.

## Entegrasyon
1. Xcode iOS projesi oluşturun.
2. `ARKit`, `WebKit` ekleyin.
3. `NSCameraUsageDescription` ve `NSLocationWhenInUseUsageDescription` ekleyin.
4. `WKWebView` ile `https://cihes252-dot.github.io/TABELA-AI/app/v10/` açın.
5. Aynı ekranda/ölçüm modunda `ARSCNView` çalıştırın.
6. `TabelaARBridge(webView:arView:)` oluşturun.
7. `TabelaMeasurementRequested` bildirimi geldiğinde AR ölçüm overlay'ini açın.
8. Sol üst, sağ üst, sol alt, sağ alt noktaları `addPoint(screenPoint:)` ile gönderin.
9. Dört nokta doğrulanınca bridge web uygulamasına `TabelaMetric.submitVerified(...)` yollar.

## Üretim geliştirmesi
LiDAR destekli cihazlarda `sceneDepth` / mesh kalite kontrolü, otomatik köşe projeksiyonu ve çoklu-kare stabilite testi eklenmelidir.
