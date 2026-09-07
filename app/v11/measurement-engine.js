(() => {
  let pending={shapeType:null};
  const fixedPoints={triangle:3,circle:4,oval:4,'horizontal-rectangle':4,'vertical-rectangle':4,rectangle:4,square:4};
  const clamp=(n,min=0,max=100)=>Math.min(max,Math.max(min,n));
  const finitePositive=v=>Number.isFinite(Number(v))&&Number(v)>0;

  function area(shape,p={}){
    const nativeArea=Number(p.areaM2);
    if(Number.isFinite(nativeArea)&&nativeArea>0)return nativeArea;
    const polygonNative=Number(p.polygonAreaM2);
    if(['polygon','freeform'].includes(shape))return Number.isFinite(polygonNative)&&polygonNative>0?polygonNative:null;
    const w=Number(p.widthM),h=Number(p.heightM),d=Number(p.diameterM);
    if(shape==='circle'){
      const dia=d>0?d:(w>0&&h>0?(w+h)/2:NaN);
      return dia>0?Math.PI*(dia/2)**2:null;
    }
    if(shape==='oval')return w>0&&h>0?Math.PI*(w/2)*(h/2):null;
    // A triangle measured from arbitrary 3-D vertices must provide its native cross-product area.
    if(shape==='triangle')return null;
    return w>0&&h>0?w*h:null;
  }

  function quality(p){
    const q=Number(p?.qualityScore);
    return Number.isFinite(q)?Math.round(clamp(q)):0;
  }

  function validatePointProtocol(shape,p){
    const count=Number(p.pointCount);
    if(!Number.isInteger(count))throw new Error('Native 3D nokta sayısı eksik');
    if(['polygon','freeform'].includes(shape)){
      if(count<3||count>24)throw new Error('Çokgen/serbest form için 3–24 gerçek 3D nokta gerekli');
      return;
    }
    const expected=fixedPoints[shape]||4;
    if(count!==expected)throw new Error('Şekil için beklenen 3D nokta sayısı doğrulanamadı');
  }

  function normalize(p){
    if(!p||p.verified!==true)throw new Error('Doğrulanmamış ölçüm reddedildi');
    if(!Number.isFinite(Number(p.qualityScore)))throw new Error('Native ölçüm kalite skoru eksik');
    const shape=p.shapeType||pending.shapeType||'horizontal-rectangle';
    const q=quality(p);
    const source=String(p.source||'');
    if(!/arkit|arcore|lidar|depth|raycast|3d/i.test(source))throw new Error('Gerçek 3D ölçüm kaynağı doğrulanamadı');
    const reasons=Array.isArray(p.failureReasons)?p.failureReasons.filter(Boolean):[];
    if(reasons.length)throw new Error('Native ölçüm hata bayrağı içeriyor: '+reasons.join(', '));
    validatePointProtocol(shape,p);

    const depthAssisted=p.lidar===true||p.depthAssisted===true||p.arcoreDepth===true;
    const threshold=depthAssisted?88:80;
    if(q<threshold)throw new Error((depthAssisted?'LiDAR/Depth':'AR')+' ölçüm kalitesi yetersiz (%'+q+')');

    const w=Number(p.widthM),h=Number(p.heightM);
    if(!Number.isFinite(w)||!Number.isFinite(h)||w<=0.01||h<=0.01||w>1000||h>1000)throw new Error('Geçersiz 3D ölçüm geometrisi');
    const plane=Number(p.planeDeviationM);
    if(Number.isFinite(plane)&&plane<0)throw new Error('Geçersiz düzlemsellik değeri');

    const a=area(shape,p);
    if(!Number.isFinite(a)||a<=0||a>1e6)throw new Error('Gerçek 3D alan hesaplanamadı');
    return{
      ...p,
      shapeType:shape,
      areaM2:a,
      measurementQualityScore:q,
      measurementThreshold:threshold,
      accepted:true,
      acceptedAt:new Date().toISOString()
    };
  }

  function submitVerified(p){
    try{
      const r=normalize(p);
      window.dispatchEvent(new CustomEvent('tabela:measurement',{detail:r}));
      return r;
    }catch(error){
      window.dispatchEvent(new CustomEvent('tabela:measurement-error',{detail:{code:'web_validation_rejected',message:error?.message||String(error)}}));
      throw error;
    }
  }

  function capability(){
    const caps=window.TabelaNativeCapabilities||{};
    if(window.webkit?.messageHandlers?.tabelaMetric){
      if(caps.arkit===false)return{available:false,platform:'ios',reason:'arkit_unsupported_device',caps};
      return{available:true,platform:'ios',mode:caps.lidar?'lidar':(caps.arkit===true?'arkit':'native'),caps};
    }
    if(window.TabelaAndroidMetric?.requestMeasurement){
      if(caps.arcore===false)return{available:false,platform:'android',reason:'arcore_unsupported_device',caps};
      return{available:true,platform:'android',mode:caps.arcoreDepth?'depth':(caps.arcore===true?'arcore':'native'),caps};
    }
    return{available:false,platform:'web',reason:'native_bridge_required',caps};
  }

  function request(payload={}){
    pending={...payload};
    const c=capability();
    if(!c.available){
      window.dispatchEvent(new CustomEvent('tabela:measurement-unavailable',{detail:{reason:c.reason||'native_bridge_required',platform:c.platform,caps:c.caps}}));
      return false;
    }
    try{
      if(c.platform==='ios')window.webkit.messageHandlers.tabelaMetric.postMessage(payload);
      else window.TabelaAndroidMetric.requestMeasurement(JSON.stringify(payload));
      return true;
    }catch(error){
      window.dispatchEvent(new CustomEvent('tabela:measurement-error',{detail:{code:'native_bridge_call_failed',message:error?.message||String(error)}}));
      return false;
    }
  }

  function capabilityLabel(){
    const c=capability(),caps=c.caps||{};
    if(!c.available){
      if(c.reason==='arkit_unsupported_device')return{label:'Bu iPhone ARKit ölçümü desteklemiyor',state:'bad'};
      if(c.reason==='arcore_unsupported_device')return{label:'Bu Android ARCore ölçümü desteklemiyor',state:'bad'};
      return{label:'Gerçek ölçüm için native uygulama gerekli',state:'warn'};
    }
    if(c.platform==='ios'&&caps.lidar)return{label:caps.sceneDepth||caps.smoothedSceneDepth?'iOS • LiDAR + Scene Depth hazır':'iOS • LiDAR/mesh + ARKit hazır',state:'ok'};
    if(c.platform==='ios')return{label:'iOS • ARKit 3D hazır',state:'ok'};
    if(c.platform==='android'&&caps.arcoreDepth)return{label:'Android • ARCore Depth hazır',state:'ok'};
    if(c.platform==='android'&&caps.arcore===true)return{label:'Android • ARCore 3D hazır',state:'ok'};
    return{label:'Native 3D köprü hazır • sensör kontrolü ölçümde yapılır',state:'warn'};
  }

  function updateUI(message,state='warn'){
    const badge=document.getElementById('bridgeBadge');
    if(badge){badge.textContent=message;badge.className='badge '+state;}
  }
  function refreshCapabilityUI(){const x=capabilityLabel();updateUI(x.label,x.state);}

  window.addEventListener('tabela:native-capabilities',refreshCapabilityUI);
  window.addEventListener('tabela:measurement-unavailable',event=>{
    const reason=event.detail?.reason;
    const text=reason==='arkit_unsupported_device'?'ARKit yok • ölçüm üretilmedi':reason==='arcore_unsupported_device'?'ARCore yok • ölçüm üretilmedi':'Native AR/LiDAR uygulaması gerekli';
    updateUI(text,'bad');
    const stage=document.getElementById('st6');if(stage)stage.textContent=text;
  });
  window.addEventListener('tabela:measurement-error',event=>{
    const message=event.detail?.message||'Gerçek 3D ölçüm tamamlanmadı';
    updateUI(message,'bad');
    const stage=document.getElementById('st6');if(stage)stage.textContent=message;
  });
  window.addEventListener('tabela:measurement',event=>{
    const d=event.detail||{};
    const label=(d.lidar?'LiDAR':(d.arcoreDepth||d.depthAssisted?'Depth':'AR'))+' doğrulandı • %'+quality(d);
    updateUI(label,'ok');
  });
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',refreshCapabilityUI,{once:true});else refreshCapabilityUI();

  window.TabelaMetric={area,quality,normalize,submitVerified,capability,request,refreshCapabilityUI,version:'11.1-universal-native-strict'};
})();
