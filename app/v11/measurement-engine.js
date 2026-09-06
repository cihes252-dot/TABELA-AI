(() => {
  let pending={shapeType:null};
  function area(shape,p){const w=Number(p.widthM),h=Number(p.heightM),d=Number(p.diameterM);if(shape==='circle'){const dia=d>0?d:(w>0&&h>0?(w+h)/2:NaN);return dia>0?Math.PI*(dia/2)**2:null}if(shape==='oval')return w>0&&h>0?Math.PI*(w/2)*(h/2):null;if(shape==='triangle')return w>0&&h>0?.5*w*h:null;if(['polygon','freeform'].includes(shape))return Number.isFinite(Number(p.polygonAreaM2))?Number(p.polygonAreaM2):null;return w>0&&h>0?w*h:null}
  function quality(p){const q=Number(p?.qualityScore);return Number.isFinite(q)?Math.max(0,Math.min(100,Math.round(q))):0}
  function normalize(p){
    if(!p||p.verified!==true)throw new Error('Doğrulanmamış ölçüm reddedildi');
    if(!Number.isFinite(Number(p.qualityScore)))throw new Error('Native ölçüm kalite skoru eksik');
    const shape=p.shapeType||pending.shapeType||'horizontal-rectangle',q=quality(p);
    const source=String(p.source||'');
    if(!/arkit|arcore|lidar|depth|raycast|3d/i.test(source))throw new Error('Gerçek 3D ölçüm kaynağı doğrulanamadı');
    if(q<80)throw new Error('3D ölçüm kalitesi yetersiz (%'+q+')');
    if(p.lidar===true&&q<88)throw new Error('LiDAR ölçüm kalitesi yetersiz (%'+q+')');
    const w=Number(p.widthM),h=Number(p.heightM);
    if(!Number.isFinite(w)||!Number.isFinite(h)||w<=0.01||h<=0.01)throw new Error('Geçersiz 3D ölçüm geometrisi');
    const a=area(shape,p);
    if(!['polygon','freeform'].includes(shape)&&(!Number.isFinite(a)||a<=0))throw new Error('Alan hesaplanamadı');
    return{...p,shapeType:shape,areaM2:a,measurementQualityScore:q,accepted:true,acceptedAt:new Date().toISOString()}
  }
  function submitVerified(p){const r=normalize(p);window.dispatchEvent(new CustomEvent('tabela:measurement',{detail:r}));return r}
  function capability(){if(window.webkit?.messageHandlers?.tabelaMetric)return{available:true,platform:'ios'};if(window.TabelaAndroidMetric?.requestMeasurement)return{available:true,platform:'android'};return{available:false,platform:'web'}}
  function request(payload={}){pending={...payload};const c=capability();if(!c.available){window.dispatchEvent(new CustomEvent('tabela:measurement-unavailable',{detail:{reason:'native_bridge_required'}}));return false}if(c.platform==='ios')window.webkit.messageHandlers.tabelaMetric.postMessage(payload);else window.TabelaAndroidMetric.requestMeasurement(JSON.stringify(payload));return true}
  window.TabelaMetric={area,quality,normalize,submitVerified,capability,request,version:'11.0-quality-strict'};
})();