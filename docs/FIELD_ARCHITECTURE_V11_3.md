# TABELA AI — Saha Mimarisi V11.3

## Ana ilke
TABELA AI web-first çalışır. Kamera, tabela ön tespiti, Türkçe OCR, GPS, duplicate kontrolü, kayıt, harita ve rapor web katmanında çalışır. Fiziksel metre/m² yalnız doğrulanmış gerçek 3B sensör verisinden üretilir. Piksel, bounding-box veya tek fotoğraf derinlik tahmini metreye çevrilmez.

## Katman 1 — Kamera ve tabela ön tespiti
1. Kamera kullanıcı tarafından açılır.
2. Düşük çözünürlüklü canlı karelerde tabela adayı aranır.
3. Aday iki veya daha fazla kararlı karede aynı bölgede görülürse `TABELA HAZIR` olur.
4. Yeşil sınır operatöre gösterilir; fotoğraf otomatik çekilmez.
5. Tabela tipi ilk öneri olarak üretilir; eğitimli özel model yoksa sonuç `öneri` olarak işaretlenir.

## Katman 2 — Gerçek ölçüm sağlayıcıları
Sağlayıcı önceliği:

1. `native-ios-arkit-lidar`
   - Native iOS köprüsü varsa kullanılır.
   - LiDAR cihazda Scene Depth + ARKit raycast çapraz kontrolü.
   - LiDAR olmayan ARKit cihazda raycast/detected plane + çoklu 3B nokta.
2. `native-android-arcore-depth`
   - Native Android köprüsü varsa kullanılır.
   - ARCore Depth desteklenirse Depth hit; aksi halde detected plane.
3. `android-webxr-arcore`
   - Yalnız Android web tarayıcısı `immersive-ar + hit-test` gerçekten destekliyorsa opsiyonel sağlayıcı.
   - Depth Sensing verilirse hit-test ile çapraz kontrol.
4. `web-no-metric`
   - iPhone/iPad Safari dahil normal web.
   - Tabela sınırı ve piksel geometrisi gösterilir; metre/m² üretilmez.

### Kesin yasaklar
- iPhone Safari için WebXR/ARKit varmış gibi davranmak yok.
- Pikselden metre tahmini yok.
- Monoküler AI depth sonucunu gerçek ölçü diye kaydetmek yok.
- Kalite eşiğini geçmeyen 3B ölçümü kaydetmek yok.

## Katman 3 — Fotoğraf ve Türkçe OCR
1. Operatör `Fotoğraf Çek + OCR` düğmesine basar.
2. Tek yüksek çözünürlüklü kare alınır.
3. Fotoğraftaki tabela sınırı ön tespitle karşılaştırılır.
4. Aynı tabela doğrulanırsa ölçüm korunur; uyuşmazsa ölçüm geçersizleşir.
5. OCR tek geçiştir.
   - Native iOS: Apple Vision `tr-TR + en-US`.
   - Native Android: ML Kit Latin OCR.
   - Web: Tesseract `tur+eng`.
6. OCR hedefi 3 saniyedir; süre aşılırsa tekrar tekrar tarama yerine kullanıcı kontrolü istenir.

## Katman 4 — Kayıt güvenliği
Kayıt için:
- gerçek GPS fix,
- kabul edilebilir GPS doğruluğu,
- tabela sınırı doğrulaması,
- fotoğraf,
- OCR sonucu veya operatör düzeltmesi,
- duplicate kontrolü,
- ölçüm varsa doğrulanmış sağlayıcı + kalite skoru
saklanır.

Ölçüm yokluğu kaydı engellemez; ancak kayıt `ÖLÇÜ YOK / WEB` olarak açık işaretlenir. Native sensör bulunan modda ölçüm zorunlu yapılabilir.

## Katman 5 — Saha teşhis ekranı
Saha başlamadan şu durumlar görünür:
- kamera,
- GPS,
- OCR motoru,
- IndexedDB,
- offline cache,
- aktif ölçüm sağlayıcısı,
- ARKit/ARCore/LiDAR/Depth/WebXR gerçek destek durumu,
- uygulama sürümü.

## Saha akışı
`KAMERA AÇ → OTOMATİK TABELA ÖN TESPİT → GERÇEK ÖLÇÜM SAĞLAYICISINI SEÇ → FOTOĞRAF ÇEK → TEK TÜRKÇE OCR → FOTOĞRAF/ÖLÇÜ EŞLEŞTİR → GPS + DUPLICATE → KONTROL → KAYDET → SONRAKİ TABELA`

## Kabul kriteri
Bir saha sürümü ancak syntax, ölçüm güven testi, OCR akış testi, sağlayıcı yönlendirme testi ve GitHub Pages deploy testi başarılı olursa yayınlanır.
