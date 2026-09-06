(() => {
  async function detect(data){
    if(window.TabelaSegModel&&typeof window.TabelaSegModel.detect==='function'){
      try{const r=await window.TabelaSegModel.detect(data);if(r&&r.bbox&&r.shapeType)return{...r,mode:'trained-model',model:true,version:'11.0'}}catch(e){console.warn('Segmentation model failed',e)}
    }
    if(!window.TabelaShape?.detect)throw new Error('Tabela sınır motoru hazır değil');
    const r=await window.TabelaShape.detect(data);return{...r,mode:'geometry-fallback',model:false,requiresModelUpgrade:true,version:'11.0'};
  }
  function capability(){return{trainedModel:!!(window.TabelaSegModel&&typeof window.TabelaSegModel.detect==='function'),fallback:!!window.TabelaShape?.detect}}
  window.TabelaSegmentation={detect,capability,version:'11.0'};
})();