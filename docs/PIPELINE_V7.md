# TABELA AI V7 Pipeline

1. **Tabela alanı**: önce fiziksel tabela yüzeyi/kılavuz alanı seçilir.
2. **Yazı bandı**: tabela alanı içindeki en güçlü metin bandı kenar yoğunluğu ile bulunur.
3. **OCR doğrulama**: yalnız yazı bandında hızlı OCR çalışır; güçlü sonuç erken kabul edilir, orta güvenli sonuç ikinci varyantla doğrulanır.
4. **Panel / malzeme**: kompozit, metal, vinil vb. malzeme sınıflandırması için ayrı görsel model eklenecektir. Mevcut sürüm malzemeyi tahmin edip doğrulanmış veri diye kaydetmez.
5. **Gerçek ölçüm**: iOS ARKit veya Android ARCore/Depth katmanından gelen dört gerçek 3B köşe noktası kullanılır. PWA tarafındaki genişlik/yükseklik alanları artık salt okunurdur ve yalnız `TabelaMetricBridge.applyMeasurement(...)` ile doğrulanmış ölçüm kabul eder.
6. **Kayıt**: GPS, fotoğraf, OCR, tabela tipi ve doğrulanmış ölçüm birlikte tutulur.

## Güven kuralı
- OCR yüksek güven: hızlı kabul.
- Orta güven: iki bağımsız görüntü varyantı aynı sonucu vermeli.
- Düşük güven: kullanıcıdan yeniden çekim istenir.
- Ölçüm: doğrulanmış 3B veri yoksa m² üretilmez.
