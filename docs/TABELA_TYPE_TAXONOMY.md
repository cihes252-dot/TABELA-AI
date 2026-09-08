# TABELA AI V11.2 — Tabela tipolojisi ve hızlı saha akışı

Bu sürümün tip sözlüğü iki ana endüstri ailesini birleştirir:

- International Sign Association (ISA): wall/fascia, projecting, roof/parapet, sign band, window, pylon, post-and-panel ve digital sign gibi yapı ve montaj tipleri.
- Out of Home Advertising Association of America (OAAA): billboard, street furniture, transit, place-based ve bunların digital biçimleri; bulletin, poster, wall mural, bus shelter, mobile/truckside, rail/subway, airport ve shopping-mall/place-based örnekleri.

TABELA AI bu sözlüğü Türkiye saha terminolojisiyle eşler: bina/mağaza cephe, kanal/kutu harf, ışıklı kutu, çıkma/blade, awning, vitrin, çatı/parapet, totem, pylon/direk, monument/zemin, yönlendirme, kiosk, A-frame, billboard, poster/CLP/raket, wall mural, LED/dijital, durak, kent mobilyası, transit/araç, metro, havalimanı, AVM/place-based, branda, şantiye çiti ve bayrak/flama.

Önemli: V11.2 içinde özel eğitimli tabela-tip modeli henüz yoktur. `TabelaSignTypeModel.classify()` bağlanırsa eğitimli model öncelik kazanır. Model yokken `sign-taxonomy.js` kamera geometrisi, tabela sınırı, konum oranı ve basit görüntü sinyallerinden otomatik öneri üretir; bu önerinin güveni bilinçli olarak sınırlandırılır ve operatör kontrolü gerekir.

Hızlı OCR akışı 5 OCR taraması yapmaz. Saha hazırlığında `tur+eng` Tesseract worker önceden ısıtılır; çekimde tabela ROI'si bir kez tanınır. Hedef süre 3000 ms'dir. Hedef aşılırsa sistem aynı görüntüyü tekrar tekrar OCR'a sokmak yerine manuel kontrol ister.
