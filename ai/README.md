# TABELA AI — Model Katmanı

V10 saha uygulaması model eğitimi için veri toplamaya hazırdır. Üretim modeli üç ayrı görev olarak tutulmalıdır:

1. **Tabela detection / segmentation** — tabelanın gerçek sınırını bulur.
2. **Text region + OCR** — tabela içindeki yazı bölgelerini bulur ve OCR motoruna verir.
3. **Material / lettering classifier** — kompozit, pleksi, metal, vinil, LED, kutu harf vb. sınıfları eğitim verisi oluşunca otomatik sınıflandırır.

## Etiketler
Saha kaydında şu metadata tutulur:
- signType
- shapeType
- OCR text + validation score
- panel / material
- lettering type
- GPS
- verified measurement

Panel ve lettering alanları V10'da kullanıcı doğrulamalıdır; bu seçimler daha sonra eğitim etiketi olarak kullanılabilir. Kamera görüntüsünden eğitim görmemiş bir modelle kesin malzeme sonucu üretilmez.

## Önerilen veri kalite kuralı
- bulanık/çok uzak kareleri eğitim setinden ayır
- aynı tabelanın ardışık karelerini tek örnek gibi grupla
- gece/gündüz ve açılı çekimleri ayrı dağıt
- train/val/test ayrımında aynı fiziksel tabela farklı kümelere düşmemeli
