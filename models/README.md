# TABELA AI V11 — Model Slotları

V11 sahte AI sonucu üretmez. Eğitimli model yoksa güvenli fallback kullanır ve ekranda bunu açıkça belirtir.

## 1. Tabela segmentation modeli
Web sözleşmesi:

```js
window.TabelaSegModel = {
  async detect(imageDataUrl) {
    return {
      bbox: {x,y,w,h},
      quad: [{x,y},{x,y},{x,y},{x,y}], // sol üst, sağ üst, sol alt, sağ alt
      contour: [{x,y}, ...],
      shapeType: 'horizontal-rectangle|vertical-rectangle|square|circle|oval|triangle|polygon|freeform',
      shapeLabel: '...',
      confidence: 0-100
    }
  }
}
```

Önerilen üretim formatları: ONNX (web), CoreML (iOS), TFLite (Android). Eğitim verisi gerçek tabela polygon/segmentation maskeleri içermelidir.

## 2. Malzeme / uygulama modeli

```js
window.TabelaMaterialModel = {
  async classify(imageDataUrl, context) {
    return {
      label: 'Kompozit panel',
      confidence: 0-100,
      alternatives: []
    }
  }
}
```

Sınıflar: kompozit, pleksi/akrilik, metal, cam+folyo, vinil/branda, LED/dijital ekran, ahşap, panel yok/harf uygulaması. Harf modeli ayrıca kutu harf, ışıklı kutu harf, folyo/baskı, pleksi harf, metal harf, LED piksel/ekran ve boyalı/kabartma sınıflarını kapsamalıdır.

## 3. Güvenlik kuralı
Model confidence düşükse sonuç otomatik kesinleştirilmez. Fiziksel malzeme ve gerçek ölçüm için kullanıcı/native sensör doğrulaması korunur.
