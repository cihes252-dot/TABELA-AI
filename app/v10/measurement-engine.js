(() => {
  function area(shape,p){const w=Number(p.widthM),h=Number(p.heightM),d=Number(p.diameterM);switch(shape){case'circle':{const dia=d>0?d:(w>0&&h>0?(w+h)/2:NaN);return dia>0?Math.PI*(dia/2)**2:null}case'oval':return w>0&&h>0?Math.PI*(w/2)*(h/2):null;case'triangle':return w>0&&h>0?.5*w*h:null;case'polygon':case'freeform':return Number.isFinite(Number(p.polygonAreaM2))?Number(p.polygonAreaM2):null;default:return w>0&&h>0?w*h:null}}
  function normalize(p){if(!p||p.verified!==true)throw new Error('Ölçüm yalnız doğrulanmış AR/Depth/LiDAR verisinden kabul edilir.');const shape=p.shapeType||'horizontal-rectangle';const calculated=area(shape,p);const a=calculated!=null?calculated:(Number.isFinite(Number(p.areaM2))?Number(p.areaM2):null);return{...p,shapeType:shape,areaM2:a,accepted:true,acceptedAt:new Date().toISOString()}}
  function submitVerified(p){const r=normalize(p);window.dispatchEvent(new CustomEvent('tabela:measurement',{detail:r}));return r}
  function capability(){
    const native=window.TabelaNativeCapabilities||{};
    if(window.webkit?.messageHandlers?.tabelaMetric)return{available:true,platform:'ios',lidar:!!native.lidar,sceneDepth:!!native.sceneDepth,mesh:!!native.mesh,source:native.source||(native.lidar?'LiDAR-ARKit-SceneDepth':'ARKit-Raycast')};
    if(window.TabelaAndroidMetric?.requestMeasurement)return{available:true,platform:'android',lidar:false,depth:true,source:native.source||'ARCore-Depth'};
    return{available:false,platform:'web',lidar:false,source:'web-no-real-metric'};
  }
  function request(payload={}){const c=capability();if(!c.available){window.dispatchEvent(new CustomEvent('tabela:measurement-unavailable',{detail:{reason:'native_bridge_required'}}));return false}const enriched={...payload,requestedCapability:c};if(c.platform==='ios'){window.webkit.messageHandlers.tabelaMetric.postMessage(enriched);return true}window.TabelaAndroidMetric.requestMeasurement(JSON.stringify(enriched));return true}
  window.TabelaMetric={area,normalize,submitVerified,request,capability,version:'10.1-lidar'};
})();