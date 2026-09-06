(() => {
  function assess(shape,ocr){
    const result={panel:'Belirlenmedi',lettering:'Belirlenmedi',confidence:0,requiresReview:true,notes:[]};
    if(shape?.shapeType==='circle'||shape?.shapeType==='oval')result.notes.push('Yuvarlak/oval form doğrulandı; malzeme görüntüden kesinleştirilemez.');
    if(ocr?.text)result.notes.push('Yazı bölgesi bulundu. Harf tipi için ayrı sınıflandırma modeli gerekir.');
    result.notes.push('Kompozit, pleksi, metal, vinil, kutu harf ve LED ayrımı bu sürümde kesin sonuç olarak üretilmez.');
    return result;
  }
  window.TabelaConstruction={assess,version:'8.0-safe'};
})();