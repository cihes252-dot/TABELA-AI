# TABELA AI V10 — Saha Test Planı

## 1. Şekil testi
Her sınıftan en az 10 gerçek örnek:
- yatay dikdörtgen
- dikey dikdörtgen
- kare
- daire
- oval
- üçgen
- çokgen
- serbest form

Kayıt: gerçek sınıf, uygulama sınıfı, güven, fotoğraf koşulu.

## 2. OCR testi
En az 100 tabela:
- Türkçe karakterli
- tek kelime / çok kelime
- eğik çekim
- gece / gündüz
- ışıklı tabela
- düşük kontrast
- yuvarlak/oval panel

Başarı metriği: tam kelime doğruluğu ve karakter hata oranı. Uygulamadaki `%100`, yalnız birden fazla bağımsız OCR varyantı aynı metinde uzlaştığında gösterilir; mutlak doğruluk garantisi değildir.

## 3. Tekrar tabela testi
Aynı tabela 3 farklı açıdan tekrar taranır. GPS + OCR + şekil eşleşmesi kontrol edilir. Yanlış pozitifler ayrıca kaydedilir.

## 4. GPS testi
Açık alan, dar sokak ve bina önü için `accuracy` değeri saklanır. Konum doğruluğu ölçüm doğruluğuyla karıştırılmaz.

## 5. Gerçek ölçüm testi
Her cihazda lazer metre/şerit metre referans ölçüsüyle karşılaştırın.
- 1–3 m mesafe
- 3–7 m mesafe
- 7 m üzeri
- önden ve açılı çekim

Kayıt: referans en/boy, AR en/boy, mutlak hata, yüzde hata, tracking durumu.

## 6. iPhone 11 kabul kuralı
LiDAR olmadığı için yalnız ARKit raycast/world tracking verisi kabul edilir. Dört köşe stabil değilse veya tracking normal değilse ölçüm reddedilir.

## 7. Veri/rapor testi
- kayıt
- arama
- CSV
- JSON
- harita marker
- rapor toplamları
- offline kayıt
- backend sync kuyruğu

## Release kabul kriteri
Kritik hata yok, kayıt kaybı yok, doğrulanmamış ölçü hiçbir zaman gerçek ölçü gibi gösterilmiyor ve duplicate uyarısı kayıt akışını bozmayacak şekilde çalışıyor.
