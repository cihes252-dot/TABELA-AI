(() => {
  const classes=['Kompozit panel','Pleksi / akrilik','Metal','Cam + folyo','Vinil / branda','LED / dijital ekran','Ahşap','Panel yok / harf uygulaması'];
  async function classify(data,context={}){
    if(window.TabelaMaterialModel&&typeof window.TabelaMaterialModel.classify==='function'){
      try{const r=await window.TabelaMaterialModel.classify(data,context);if(r&&r.label)return{...r,mode:'trained-model',requiresReview:Number(r.confidence||0)<90,version:'11.0'}}catch(e){console.warn('Material model failed',e)}
    }
    return{label:'Belirlenmedi',confidence:0,mode:'review-required',requiresReview:true,note:'Eğitimli malzeme modeli yüklenmedi; fiziksel malzeme kullanıcı tarafından doğrulanmalıdır.',classes,version:'11.0'};
  }
  function capability(){return{trainedModel:!!(window.TabelaMaterialModel&&typeof window.TabelaMaterialModel.classify==='function'),classes}}
  window.TabelaMaterial={classify,capability,version:'11.0'};
})();