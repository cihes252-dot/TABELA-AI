# TABELA AI Android Native

## Hedef
V10 web arayüzünü Android WebView içinde açıp ARCore hit-test noktalarıyla gerçek 3B ölçüm üretmek.

## Entegrasyon
1. Android Studio projesi oluşturun.
2. ARCore dependency ve kamera/konum izinlerini ekleyin.
3. WebView JavaScript'i etkinleştirin.
4. `TabelaARBridge` nesnesini `TabelaAndroidMetric` adıyla `addJavascriptInterface` üzerinden ekleyin.
5. WebView'de `https://cihes252-dot.github.io/TABELA-AI/app/v10/` açın.
6. `onMeasurementRequested` geldiğinde AR ölçüm ekranını açın.
7. Sol üst, sağ üst, sol alt, sağ alt gerçek hit-test noktalarını `addPoint(frame,x,y)` ile gönderin.
8. Dört nokta doğrulanınca bridge `window.TabelaMetric.submitVerified(...)` çağırır.

## Kural
ARCore kamera `TRACKING` durumda değilse veya hit-test gerçek bir takip edilen yüzeye oturmuyorsa ölçüm sonucu üretilmez.

## Sonraki kalite katmanı
Raw Depth destekli cihazlarda confidence/depth görüntüsü, çoklu kare nokta stabilitesi ve planarity testleri eklenmelidir.
