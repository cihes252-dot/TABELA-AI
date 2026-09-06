# TABELA AI iOS Native

## Hedef
V10 web arayüzünü WKWebView içinde açıp ARKit / LiDAR ile gerçek 3B ölçüm üretmek.

## Ölçüm modları

### 1. LiDAR destekli cihaz
Uygulama cihaz desteğini otomatik kontrol eder.

Destek varsa:
- ARKit Scene Depth
- Smoothed Scene Depth
- Mesh reconstruction
- Mesh classification (cihaz destekliyorsa)
- Depth confidence map
- AR world tracking
- Raycast

birlikte kullanılır.

Her tabela köşesi için LiDAR derinlik örneği alınır. Confidence değeri en az `medium` seviyesinde değilse nokta kabul edilmez. Dört noktanın tamamı kalite kontrolünü geçmeden `verified=true` gönderilmez.

Ölçüm kaynağı:
`LiDAR-ARKit-SceneDepth`

### 2. LiDAR olmayan cihaz — örnek iPhone 11
- ARKit world tracking + raycast kullanılır.
- Dört tabela köşesi gerçek AR dünya koordinatına oturtulmadan `verified=true` gönderilmez.
- Tracking state `.normal` değilse nokta kabul edilmez.
- RGB fotoğraftan metre tahmini yapılmaz.

Ölçüm kaynağı:
`ARKit-Raycast`

## Dosyalar
- `TabelaLiDAREngine.swift`: Scene Depth, mesh ve confidence kalite katmanı.
- `TabelaARBridge.swift`: web/native ölçüm köprüsü ve dört gerçek 3B nokta toplama.
- `TabelaMetricEngine.swift`: gerçek dünya noktalarından en, boy, alan ve mesafe hesabı.
- `TabelaHostViewController.swift`: WKWebView + AR ölçüm ekranı ve cihaz yetenek bildirimi.

## Entegrasyon
1. Xcode iOS projesi oluşturun.
2. `ARKit`, `WebKit` ekleyin.
3. `NSCameraUsageDescription` ve `NSLocationWhenInUseUsageDescription` ekleyin.
4. Bu klasördeki Swift dosyalarını target'a ekleyin.
5. Ana controller olarak `TabelaHostViewController` kullanın.
6. Uygulama `https://cihes252-dot.github.io/TABELA-AI/app/v10/` adresini açar.
7. Web tarafındaki “Gerçek ölçümü başlat” isteği native AR/LiDAR ekranını açar.
8. Sol üst, sağ üst, sol alt, sağ alt noktaları seçilir.
9. LiDAR destekli cihazda her nokta Scene Depth confidence kontrolünden geçer.
10. Dört nokta doğrulanınca web uygulamasına `TabelaMetric.submitVerified(...)` gönderilir.

## Not
LiDAR olması tek başına sıfır hata garantisi değildir. Cam, ayna, çok parlak yüzey, çok uzak hedef, hareket bulanıklığı veya düşük confidence durumunda ölçüm reddedilmelidir. TABELA AI bu durumda kullanıcıya yeniden tarama yaptırır; ölçüm uydurmaz.
