(() => {
  const $=id=>document.getElementById(id);
  const ua=navigator.userAgent||'';
  const isIOS=/iPad|iPhone|iPod/i.test(ua);
  const isAndroid=/Android/i.test(ua);
  const clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,v));
  const state={secure:window.isSecureContext===true,api:!!navigator.xr,isIOS,isAndroid,allowed:isAndroid,immersiveAR:false,probing:false,active:false,depthSensingGranted:false,pendingPayload:null,runtime:isAndroid?'Android WebXR / ARCore':'WebXR kapalı',reason:null,lastError:null};
  let originalCapability=null,originalRequest=null,patched=false;
  let activeSession=null,hitSource=null,localSpace=null,viewerSpace=null,overlay=null,xrCanvas=null;
  let latestSamples=[],points=[],pointMeta=[],measurementPayload=null,captureLock=false;

  const v3=(x=0,y=0,z=0)=>({x:Number(x),y:Number(y),z:Number(z)});
  const sub=(a,b)=>v3(a.x-b.x,a.y-b.y,a.z-b.z);
  const add=(a,b)=>v3(a.x+b.x,a.y+b.y,a.z+b.z);
  const mul=(a,s)=>v3(a.x*s,a.y*s,a.z*s);
  const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
  const cross=(a,b)=>v3(a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x);
  const norm=a=>Math.hypot(a.x,a.y,a.z);
  const unit=a=>{const n=norm(a);return n>1e-9?mul(a,1/n):v3()};
  const dist=(a,b)=>norm(sub(a,b));
  const midpoint=(a,b)=>mul(add(a,b),.5);
  const median=arr=>{const a=arr.filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return NaN;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2};
  const medianPoint=arr=>v3(median(arr.map(p=>p.x)),median(arr.map(p=>p.y)),median(arr.map(p=>p.z)));
  const triangleArea=(a,b,c)=>norm(cross(sub(b,a),sub(c,a)))/2;

  function newellNormal(ps){let x=0,y=0,z=0;for(let i=0;i<ps.length;i++){const a=ps[i],b=ps[(i+1)%ps.length];x+=(a.y-b.y)*(a.z+b.z);y+=(a.z-b.z)*(a.x+b.x);z+=(a.x-b.x)*(a.y+b.y)}return v3(x,y,z)}
  function centroid(ps){return mul(ps.reduce((s,p)=>add(s,p),v3()),1/ps.length)}
  function planeDeviation(ps){if(ps.length<4)return 0;const n=unit(newellNormal(ps));if(norm(n)<.5)return Infinity;const c=centroid(ps);return Math.max(...ps.map(p=>Math.abs(dot(sub(p,c),n))))}
  function maxSpan(ps){let m=0;for(let i=0;i<ps.length;i++)for(let j=i+1;j<ps.length;j++)m=Math.max(m,dist(ps[i],ps[j]));return m}
  function project2D(ps){
    const n=unit(newellNormal(ps));if(norm(n)<.5)throw new Error('3B yüzey normali oluşturulamadı');
    let u=unit(sub(ps[1],ps[0]));if(norm(u)<.5)throw new Error('3B yüzey ekseni oluşturulamadı');
    let vv=unit(cross(n,u));if(norm(vv)<.5)throw new Error('3B yüzey düzlemi oluşturulamadı');
    const o=ps[0];return ps.map(p=>({x:dot(sub(p,o),u),y:dot(sub(p,o),vv)}));
  }
  function orient(a,b,c){return (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x)}
  function segIntersect(a,b,c,d){const e=1e-9,o1=orient(a,b,c),o2=orient(a,b,d),o3=orient(c,d,a),o4=orient(c,d,b);return ((o1>e&&o2<-e)||(o1<-e&&o2>e))&&((o3>e&&o4<-e)||(o3<-e&&o4>e))}
  function selfIntersects(poly){const n=poly.length;for(let i=0;i<n;i++){const a=poly[i],b=poly[(i+1)%n];for(let j=i+1;j<n;j++){if(j===i||j===(i+1)%n||i===(j+1)%n)continue;if(i===0&&j===n-1)continue;const c=poly[j],d=poly[(j+1)%n];if(segIntersect(a,b,c,d))return true}}return false}
  function shoelace(poly){let s=0;for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length];s+=a.x*b.y-b.x*a.y}return Math.abs(s)/2}
  function basisExtents(ps){const p=project2D(ps),xs=p.map(x=>x.x),ys=p.map(x=>x.y);return{width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)}}
  function angleOrthogonality(a,b){const na=norm(a),nb=norm(b);if(na<1e-6||nb<1e-6)return 1;return Math.abs(dot(a,b)/(na*nb))}
  function validatePlanarity(ps){const dev=planeDeviation(ps),span=maxSpan(ps),limit=Math.max(.025,Math.min(.08,Math.max(span,.1)*.01));if(!Number.isFinite(dev)||dev>limit)throw new Error(`3B noktalar yeterince düz değil (${(dev*100).toFixed(1)} cm)`);return{dev,limit}}

  function geometry(shape,ps){
    if(!Array.isArray(ps)||ps.length<3)throw new Error('Yeterli gerçek 3B nokta yok');
    const {dev:plane}=validatePlanarity(ps);let width=0,height=0,area=0,diameter=null,gq=100;
    if(['horizontal-rectangle','vertical-rectangle','rectangle','square'].includes(shape)){
      if(ps.length!==4)throw new Error('Dikdörtgen için 4 gerçek 3B nokta gerekli');
      const [tl,tr,bl,br]=ps,w1=dist(tl,tr),w2=dist(bl,br),h1=dist(tl,bl),h2=dist(tr,br),d1=dist(tl,br),d2=dist(tr,bl);
      width=(w1+w2)/2;height=(h1+h2)/2;area=triangleArea(tl,tr,br)+triangleArea(tl,br,bl);
      const edgePenalty=((Math.abs(w1-w2)/Math.max(width,.001))+(Math.abs(h1-h2)/Math.max(height,.001)))*45;
      const diagPenalty=Math.abs(d1-d2)/Math.max((d1+d2)/2,.001)*35;
      const orthoPenalty=angleOrthogonality(sub(tr,tl),sub(bl,tl))*55;
      const squarePenalty=shape==='square'?Math.abs(width-height)/Math.max((width+height)/2,.001)*45:0;
      gq=clamp(100-edgePenalty-diagPenalty-orthoPenalty-squarePenalty);
    }else if(shape==='circle'||shape==='oval'){
      if(ps.length!==4)throw new Error('Daire/oval için 4 gerçek 3B nokta gerekli');
      const [l,r,t,b]=ps,c1=midpoint(l,r),c2=midpoint(t,b);width=dist(l,r);height=dist(t,b);diameter=shape==='circle'?(width+height)/2:null;area=shape==='circle'?Math.PI*(diameter/2)**2:Math.PI*(width/2)*(height/2);
      const centerPenalty=dist(c1,c2)/Math.max((width+height)/2,.001)*80,orthoPenalty=angleOrthogonality(sub(r,l),sub(b,t))*55,circlePenalty=shape==='circle'?Math.abs(width-height)/Math.max((width+height)/2,.001)*55:0;gq=clamp(100-centerPenalty-orthoPenalty-circlePenalty);
    }else if(shape==='triangle'){
      if(ps.length!==3)throw new Error('Üçgen için 3 gerçek 3B nokta gerekli');area=triangleArea(ps[0],ps[1],ps[2]);const ex=basisExtents(ps);width=ex.width;height=ex.height;gq=area>.0001?96:0;
    }else{
      if(ps.length<3||ps.length>24)throw new Error('Çokgen/serbest form için 3–24 gerçek 3B nokta gerekli');const p2=project2D(ps);if(selfIntersects(p2))throw new Error('Çokgen kendi kendini kesiyor');area=shoelace(p2);const ex=basisExtents(ps);width=ex.width;height=ex.height;gq=area>.0001?96:0;
    }
    if(!Number.isFinite(width)||!Number.isFinite(height)||width<=.01||height<=.01||!Number.isFinite(area)||area<=.0001)throw new Error('3B geometri geçersiz');
    const planeQ=clamp(100-plane*1200);gq=Math.round(.72*gq+.28*planeQ);return{widthM:width,heightM:height,areaM2:area,diameterM:diameter,planeDeviationM:plane,geometryQualityScore:gq};
  }

  function pointProtocol(shape){if(['horizontal-rectangle','vertical-rectangle','rectangle','square'].includes(shape))return['Sol üst köşe','Sağ üst köşe','Sol alt köşe','Sağ alt köşe'];if(shape==='circle'||shape==='oval')return['Sol uç','Sağ uç','Üst uç','Alt uç'];if(shape==='triangle')return['1. köşe','2. köşe','3. köşe'];return[]}
  function mountStatusUI(){
    const cam=document.querySelector('.camera');if(!cam)return;if(getComputedStyle(cam).position==='static')cam.style.position='relative';
    if(!$('#webxrBridgeBadge')){const b=document.createElement('div');b.id='webxrBridgeBadge';b.className='badge warn';b.style.cssText='position:absolute;left:10px;top:86px;z-index:9;background:#1b1f35;color:#d4ddff;max-width:76%;white-space:normal';cam.appendChild(b)}
    if(!$('#webxrMeasureBtn')){const btn=document.createElement('button');btn.id='webxrMeasureBtn';btn.type='button';btn.textContent='📐 Android WebXR Ölçü';btn.style.cssText='display:none;position:absolute;right:10px;top:86px;z-index:10;padding:9px 10px;font-size:10px;font-weight:800';btn.onclick=async e=>{e.preventDefault();e.stopPropagation();if(state.pendingPayload)await beginMeasurement(state.pendingPayload)};cam.appendChild(btn)}renderStatus();
  }
  function renderStatus(){const b=$('webxrBridgeBadge'),btn=$('webxrMeasureBtn');if(!b)return;if(state.active){b.className='badge warn';b.textContent='Android WebXR 3B ölçüm aktif';return}if(isIOS){b.className='badge warn';b.textContent='iOS WEB • gerçek metre kapalı • ARKit/LiDAR için native sensör köprüsü';if(btn)btn.style.display='none';return}if(!isAndroid){b.className='badge warn';b.textContent='WEB • gerçek metre kapalı';if(btn)btn.style.display='none';return}if(state.immersiveAR){b.className='badge ok';b.textContent='Android WebXR / ARCore hazır';if(btn&&state.pendingPayload)btn.style.display='block';return}b.className='badge warn';b.textContent=state.reason==='insecure'?'WebXR için HTTPS gerekli':'Android WebXR immersive-ar bu tarayıcı/cihazda yok';if(btn)btn.style.display='none'}

  async function probe(){
    if(state.probing)return state;state.probing=true;mountStatusUI();
    try{if(!isAndroid){state.immersiveAR=false;state.reason=isIOS?'ios_webxr_disabled':'non_android_webxr_disabled'}else if(!state.secure){state.immersiveAR=false;state.reason='insecure'}else if(!navigator.xr?.isSessionSupported){state.immersiveAR=false;state.reason='api_missing'}else{state.immersiveAR=!!await navigator.xr.isSessionSupported('immersive-ar');state.reason=state.immersiveAR?null:'immersive_ar_unsupported'}state.lastError=null}catch(error){state.immersiveAR=false;state.reason='probe_failed';state.lastError=error?.message||String(error)}finally{state.probing=false;patchMetric();renderStatus();window.dispatchEvent(new CustomEvent('tabela:webxr-capabilities',{detail:{...state}}))}return state;
  }

  function patchMetric(){
    const metric=window.TabelaMetric;if(!metric||patched)return false;originalCapability=metric.capability.bind(metric);originalRequest=metric.request.bind(metric);
    metric.capability=()=>{const native=originalCapability();if(native?.available)return native;if(isAndroid&&state.immersiveAR)return{available:true,platform:'android-web',mode:state.depthSensingGranted?'webxr-depth-hit-test':'webxr-hit-test',caps:{webxr:true,arcoreWeb:true,depthSensing:state.depthSensingGranted}};return native};
    metric.request=payload=>{const native=originalCapability();if(native?.available)return originalRequest(payload);if(!(isAndroid&&state.immersiveAR))return originalRequest(payload);state.pendingPayload={...payload,webxrRequested:true};mountStatusUI();renderStatus();const mb=$('liveMetricBadge');if(mb){mb.className='badge warn';mb.textContent='ANDROID WEBXR ÖLÇÜ HAZIR • 📐 butonuna dokun'}window.dispatchEvent(new CustomEvent('tabela:webxr-measurement-ready',{detail:{payload:state.pendingPayload,runtime:state.runtime}}));return true};
    metric.__webxrBridge='android-only';patched=true;return true;
  }

  function buildOverlay(shape){
    overlay=document.createElement('div');overlay.id='tabelaWebXROverlay';overlay.style.cssText='position:fixed;inset:0;z-index:2147483646;pointer-events:none;font-family:system-ui,-apple-system,sans-serif;color:white';
    const top=document.createElement('div');top.style.cssText='position:absolute;left:12px;right:12px;top:12px;background:rgba(4,10,20,.82);border-radius:12px;padding:12px;pointer-events:auto';top.innerHTML='<b>TABELA AI • ANDROID WEBXR GERÇEK 3B ÖLÇÜM</b><div id="wxrStatus" style="margin-top:5px;font-size:13px">Yüzey aranıyor…</div><div id="wxrQuality" style="margin-top:3px;font-size:11px;color:#c9d8ea"></div>';overlay.appendChild(top);
    const crosshair=document.createElement('div');crosshair.id='wxrCrosshair';crosshair.style.cssText='position:absolute;left:50%;top:50%;width:34px;height:34px;transform:translate(-50%,-50%);border:2px solid #ffdc72;border-radius:50%;pointer-events:none';overlay.appendChild(crosshair);
    const controls=document.createElement('div');controls.style.cssText='position:absolute;left:12px;right:12px;bottom:18px;display:grid;grid-template-columns:1fr 1fr;gap:8px;pointer-events:auto';
    const addBtn=document.createElement('button');addBtn.id='wxrAdd';addBtn.textContent='＋ Nokta Ekle';addBtn.style.cssText='grid-column:1/3;padding:15px;font-weight:900';const undo=document.createElement('button');undo.textContent='↶ Geri';const finish=document.createElement('button');finish.id='wxrFinish';finish.textContent='✓ Bitir';const cancel=document.createElement('button');cancel.textContent='✕ İptal';cancel.style.cssText='grid-column:1/3;padding:10px';[addBtn,undo,finish,cancel].forEach(x=>controls.appendChild(x));overlay.appendChild(controls);document.body.appendChild(overlay);
    const proto=pointProtocol(shape);finish.style.display=proto.length?'none':'block';finish.disabled=true;addBtn.onclick=e=>{e.preventDefault();capturePoint()};undo.onclick=e=>{e.preventDefault();if(points.length){points.pop();pointMeta.pop();updatePrompt(shape)}};finish.onclick=e=>{e.preventDefault();finalizeMeasurement(shape)};cancel.onclick=e=>{e.preventDefault();abortMeasurement('Kullanıcı iptal etti')};updatePrompt(shape);
  }
  function updatePrompt(shape){const s=$('wxrStatus'),f=$('wxrFinish'),proto=pointProtocol(shape),next=proto[points.length];if(s)s.textContent=proto.length?(next?`${next}: nişangahı hedefe getirip Nokta Ekle (${points.length}/${proto.length})`:'Noktalar tamamlandı'):`Çevre noktası ekleyin (${points.length}/24) • en az 3 nokta`;if(f&&!proto.length)f.disabled=points.length<3}
  async function pauseCamera(){try{window.TabelaFastField?.stopLive?.()}catch{}const v=$('video');if(v?.srcObject){try{v.srcObject.getTracks().forEach(t=>t.stop())}catch{};try{v.srcObject=null}catch{}}}
  async function resumeCamera(){try{if(typeof window.startCamera==='function')await window.startCamera()}catch{};setTimeout(()=>{try{window.TabelaFastField?.resumeLiveSoon?.(100)}catch{}},180)}

  async function beginMeasurement(payload={}){
    if(state.active)return false;if(!(isAndroid&&state.immersiveAR)){emitError('Android WebXR immersive-ar desteklenmiyor');return false}state.active=true;measurementPayload={...payload};points=[];pointMeta=[];latestSamples=[];captureLock=false;mountStatusUI();renderStatus();buildOverlay(payload.shapeType||'horizontal-rectangle');await pauseCamera();
    try{const init={requiredFeatures:['hit-test'],optionalFeatures:['dom-overlay','depth-sensing'],domOverlay:{root:overlay},depthSensing:{usagePreference:['cpu-optimized','gpu-optimized'],dataFormatPreference:['float32','luminance-alpha']}};activeSession=await navigator.xr.requestSession('immersive-ar',init);state.depthSensingGranted=!!activeSession.enabledFeatures?.includes?.('depth-sensing');localSpace=await activeSession.requestReferenceSpace('local');viewerSpace=await activeSession.requestReferenceSpace('viewer');hitSource=await activeSession.requestHitTestSource({space:viewerSpace});setupXRLayer(activeSession);activeSession.addEventListener('end',onSessionEnded,{once:true});activeSession.addEventListener('select',()=>capturePoint());const q=$('wxrQuality');if(q)q.textContent=`ARCore hit-test${state.depthSensingGranted?' + Depth Sensing çapraz kontrol':''}`;activeSession.requestAnimationFrame(onXRFrame);return true}catch(error){state.lastError=error?.message||String(error);emitError('WebXR oturumu açılamadı: '+state.lastError);await cleanup(false);return false}
  }
  function setupXRLayer(session){try{if(!window.XRWebGLLayer)return;xrCanvas=document.createElement('canvas');xrCanvas.style.cssText='position:fixed;inset:0;width:100%;height:100%;z-index:2147483645;pointer-events:none';document.body.appendChild(xrCanvas);const gl=xrCanvas.getContext('webgl',{alpha:true,antialias:false});if(!gl)return;Promise.resolve(gl.makeXRCompatible?gl.makeXRCompatible():undefined).then(()=>{if(activeSession===session)session.updateRenderState({baseLayer:new XRWebGLLayer(session,gl,{alpha:true,depth:false,stencil:false,antialias:false})})}).catch(()=>{});xrCanvas.__gl=gl}catch{}}
  function onXRFrame(_time,frame){if(!state.active||!activeSession)return;activeSession.requestAnimationFrame(onXRFrame);try{const viewerPose=frame.getViewerPose(localSpace),hits=frame.getHitTestResults(hitSource);let depth=NaN,cam=null;const view=viewerPose?.views?.[0];if(view){const p=view.transform.position;cam=v3(p.x,p.y,p.z);if(state.depthSensingGranted&&typeof frame.getDepthInformation==='function'){try{const di=frame.getDepthInformation(view),d=di?.getDepthInMeters?.(.5,.5);if(Number.isFinite(d)&&d>.05&&d<50)depth=d}catch{}}}if(hits.length){const pose=hits[0].getPose(localSpace);if(pose){const p=pose.transform.position,hit=v3(p.x,p.y,p.z),cameraDistance=cam?dist(hit,cam):NaN,depthError=Number.isFinite(depth)&&Number.isFinite(cameraDistance)?Math.abs(depth-cameraDistance):NaN;latestSamples.push({t:performance.now(),hit,cameraDistance,depth,depthError});latestSamples=latestSamples.filter(x=>performance.now()-x.t<=650).slice(-24);const c=$('wxrCrosshair');if(c)c.style.borderColor='#59dba8'}}else{const c=$('wxrCrosshair');if(c)c.style.borderColor='#ff6b7a'}}catch{}}
  function capturePoint(){if(captureLock||!state.active)return;captureLock=true;setTimeout(()=>captureLock=false,420);const now=performance.now(),recent=latestSamples.filter(x=>now-x.t<=420),status=$('wxrStatus');if(recent.length<4){if(status)status.textContent='Yüzey kararlı değil • telefonu sabit tutun';return}const p=medianPoint(recent.map(x=>x.hit)),spread=Math.max(...recent.map(x=>dist(x.hit,p))),cameraDistance=median(recent.map(x=>x.cameraDistance)),tol=Math.max(.025,Math.min(.08,(Number.isFinite(cameraDistance)?cameraDistance:3)*.01));if(!Number.isFinite(spread)||spread>tol){if(status)status.textContent=`3B nokta oynuyor (${(spread*100).toFixed(1)} cm)`;return}const depth=median(recent.map(x=>x.depth)),depthError=Number.isFinite(depth)&&Number.isFinite(cameraDistance)?Math.abs(depth-cameraDistance):NaN,crossLimit=Number.isFinite(depth)?Math.max(.05,Math.min(.20,depth*.03)):NaN;if(state.depthSensingGranted&&Number.isFinite(depth)&&Number.isFinite(depthError)&&depthError>crossLimit){if(status)status.textContent=`Depth/hit-test uyuşmuyor (${(depthError*100).toFixed(1)} cm)`;return}points.push(p);pointMeta.push({spreadM:spread,cameraDistanceM:cameraDistance,depthM:depth,depthHitErrorM:depthError});const shape=measurementPayload?.shapeType||'horizontal-rectangle';updatePrompt(shape);const proto=pointProtocol(shape);if(proto.length&&points.length===proto.length)setTimeout(()=>finalizeMeasurement(shape),120)}
  async function finalizeMeasurement(shape){try{const g=geometry(shape,points),avgSpread=pointMeta.reduce((s,x)=>s+(Number.isFinite(x.spreadM)?x.spreadM:.08),0)/Math.max(1,pointMeta.length),stability=clamp(100-avgSpread*900),allDepth=pointMeta.length===points.length&&pointMeta.every(x=>Number.isFinite(x.depthM)&&Number.isFinite(x.depthHitErrorM)),depthAssisted=state.depthSensingGranted&&allDepth,quality=Math.round((depthAssisted?.62:.58)*stability+(depthAssisted?.38:.42)*g.geometryQualityScore),source=depthAssisted?'WebXR-HitTest+Depth-Sensing-3D':'WebXR-HitTest-3D',payload={...measurementPayload,verified:true,source,shapeType:shape,pointCount:points.length,points3D:points.map(p=>[p.x,p.y,p.z]),widthM:g.widthM,heightM:g.heightM,areaM2:g.areaM2,qualityScore:quality,geometryQualityScore:g.geometryQualityScore,planeDeviationM:g.planeDeviationM,cameraDistanceM:median(pointMeta.map(x=>x.cameraDistanceM)),depthAssisted,webxr:true,webxrPlatform:'android',hitStabilitySpreadM:pointMeta.map(x=>x.spreadM),webxrDepthSamplesM:pointMeta.map(x=>x.depthM),webxrDepthHitErrorM:pointMeta.map(x=>x.depthHitErrorM),failureReasons:[]};if(Number.isFinite(g.diameterM))payload.diameterM=g.diameterM;window.TabelaMetric.submitVerified(payload);state.pendingPayload=null;const btn=$('webxrMeasureBtn');if(btn)btn.style.display='none';await activeSession?.end?.()}catch(error){emitError(error?.message||String(error));const s=$('wxrStatus');if(s)s.textContent='Ölçüm doğrulanmadı: '+(error?.message||String(error))}}
  function emitError(message){window.dispatchEvent(new CustomEvent('tabela:measurement-error',{detail:{code:'webxr_measurement_failed',message}}))}
  async function abortMeasurement(message='WebXR ölçümü iptal edildi'){state.lastError=message;try{await activeSession?.end?.()}catch{};if(state.active)await cleanup(true)}
  async function onSessionEnded(){await cleanup(true)}
  async function cleanup(resume=true){state.active=false;try{hitSource?.cancel?.()}catch{};hitSource=null;activeSession=null;localSpace=null;viewerSpace=null;latestSamples=[];points=[];pointMeta=[];measurementPayload=null;try{overlay?.remove()}catch{};overlay=null;try{xrCanvas?.remove()}catch{};xrCanvas=null;renderStatus();if(resume)await resumeCamera();window.dispatchEvent(new CustomEvent('tabela:webxr-session-end',{detail:{...state}}))}
  function init(){mountStatusUI();patchMetric();probe()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
  window.TabelaWebXR={state,probe,beginMeasurement,geometry,patchMetric,version:'11.2.6-android-only-webxr-truth-gated'};
})();
