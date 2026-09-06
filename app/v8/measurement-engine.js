(() => {
  function areaFrom(shape,p){const w=Number(p.widthM),h=Number(p.heightM),d=Number(p.diameterM);switch(shape){case'circle':{const dia=d>0?d:(w>0&&h>0?(w+h)/2:NaN);return dia>0?Math.PI*(dia/2)**2:null;}case'oval':return w>0&&h>0?Math.PI*(w/2)*(h/2):null;case'triangle':return w>0&&h>0?.5*w*h:null;case'polygon':case'freeform':return Number.isFinite(Number(p.polygonAreaM2))?Number(p.polygonAreaM2):null;default:return w>0&&h>0?w*h:null;}}
  function normalize(payload){if(!payload||payload.verified!==true)throw new Error('Ölçüm yalnız doğrulanmış sensör/AR verisinden kabul edilir.');const shape=payload.shapeType||'rectangle',area=areaFrom(shape,payload);return {...payload,shapeType:shape,areaM2:area,accepted:true,acceptedAt:new Date().toISOString()};}
  function submitVerified(payload){const result=normalize(payload);window.dispatchEvent(new CustomEvent('tabela:measurement',{detail:result}));return result;}
  window.TabelaMetric={submitVerified,areaFrom,version:'8.0'};
})();