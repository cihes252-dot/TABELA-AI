(() => {
  function assess(shape,ocr){
    const notes=[];if(shape?.shapeType==='circle'||shape?.shapeType==='oval')notes.push('Yuvarlak/oval form algılandı.');
    if(ocr?.text)notes.push('Tabela yazısı bulundu; harf ve panel tipi kullanıcı tarafından doğrulanmalı.');
    notes.push('Kompozit, pleksi, metal, vinil, kutu harf ve LED ayrımı ayrı eğitimli model gelene kadar kesin AI sonucu olarak verilmez.');
    return{panel:'Belirlenmedi',lettering:'Belirlenmedi',requiresReview:true,confidence:0,notes};
  }
  window.TabelaConstruction={assess,version:'10.0-safe'};
})();