(() => {
  const $=id=>document.getElementById(id);
  const ua=navigator.userAgent||'';
  const isIOS=/iPad|iPhone|iPod/i.test(ua);
  const isAndroid=/Android/i.test(ua);
  const state={version:'11.2.9',last:null};
  async function permission(name){try{return (await navigator.permissions?.query?.({name})).state||'unknown'}catch{return'unknown'}}
  async function inspect(){
    const nativeIOS=!!window.webkit?.messageHandlers?.tabelaMetric;
    const nativeAndroid=!!window.TabelaAndroidMetric?.requestMeasurement;
    const metric=window.TabelaMetric?.capability?.()||{available:false,platform:'web',reason:'metric_engine_missing'};
    const webxr=window.TabelaWebXR?.state||{};
    let storage='unknown';try{if(!indexedDB)storage='missing';else{await new Promise((resolve,reject)=>{const r=indexedDB.open('tabela-ai-diagnostic',1);r.onupgradeneeded=()=>r.result.createObjectStore('t');r.onsuccess=()=>{r.result.close();resolve()};r.onerror=()=>reject(r.error)});storage='ok'}}catch{storage='error'}
    let sw='missing';try{sw='serviceWorker'in navigator?(navigator.serviceWorker.controller?'active':'registered/not-controlling'):'unsupported'}catch{}
    const cameraPermission=await permission('camera'),geoPermission=await permission('geolocation');
    let provider='web-no-metric',providerLabel='WEB • gerçek metre kapalı';
    if(nativeIOS){provider='native-ios-arkit-lidar';providerLabel=metric.caps?.lidar?'iOS Native • ARKit + LiDAR/Scene Depth':'iOS Native • ARKit'}
    else if(nativeAndroid){provider='native-android-arcore-depth';providerLabel=metric.caps?.arcoreDepth?'Android Native • ARCore Depth':'Android Native • ARCore'}
    else if(isAndroid&&webxr.immersiveAR){provider='android-webxr-arcore';providerLabel='Android WEB • WebXR/ARCore hit-test'}
    else if(isIOS)providerLabel='iOS WEB • ARKit/LiDAR tarayıcıdan açılmıyor';
    state.last={version:state.version,secureContext:window.isSecureContext===true,platform:isIOS?'ios-web':isAndroid?'android-web':'web',cameraAPI:!!navigator.mediaDevices?.getUserMedia,cameraPermission,geolocationAPI:!!navigator.geolocation,geolocationPermission:geoPermission,indexedDB:storage,serviceWorker:sw,ocr:!!window.TabelaFastOCR,segmentation:!!window.TabelaSegmentation,nativeIOS,nativeAndroid,webxrAndroidOnly:!!(isAndroid&&webxr.immersiveAR),measurementProvider:provider,measurementProviderLabel:providerLabel,measurementAvailable:!!metric.available,measurementReason:metric.reason||null};
    window.dispatchEvent(new CustomEvent('tabela:field-diagnostics',{detail:state.last}));return state.last;
  }
  function mark(v){return v===true||v==='ok'||v==='granted'||v==='active'?'✅':v===false||v==='missing'||v==='error'||v==='denied'?'❌':'⚠️'}
  function render(d){
    let panel=$('fieldDiagnosticsPanel');if(!panel){panel=document.createElement('div');panel.id='fieldDiagnosticsPanel';panel.style.cssText='display:none;position:fixed;inset:12px;z-index:2147483600;background:#08111e;color:#eef5ff;border:1px solid #2d415d;border-radius:14px;padding:16px;overflow:auto;font-family:system-ui,-apple-system,sans-serif;box-shadow:0 12px 50px rgba(0,0,0,.55)';document.body.appendChild(panel)}
    const rows=[['Sürüm',d.version,'✅'],['HTTPS / güvenli bağlam',d.secureContext,mark(d.secureContext)],['Kamera API',d.cameraAPI,mark(d.cameraAPI)],['Kamera izni',d.cameraPermission,mark(d.cameraPermission)],['GPS API',d.geolocationAPI,mark(d.geolocationAPI)],['GPS izni',d.geolocationPermission,mark(d.geolocationPermission)],['IndexedDB',d.indexedDB,mark(d.indexedDB)],['Service Worker',d.serviceWorker,mark(d.serviceWorker)],['Tabela tespit motoru',d.segmentation,mark(d.segmentation)],['Türkçe OCR motoru',d.ocr,mark(d.ocr)],['Ölçüm sağlayıcısı',d.measurementProviderLabel,d.measurementAvailable?'✅':'⚠️']];
    const ready=d.secureContext&&d.cameraAPI&&d.geolocationAPI&&d.indexedDB==='ok'&&d.segmentation&&d.ocr;
    panel.innerHTML=`<div style="display:flex;justify-content:space-between;gap:10px;align-items:center"><div><div style="font-size:20px;font-weight:900">TABELA AI • SAHA TEŞHİS</div><div style="margin-top:3px;color:#93a6bf">${ready?'TEMEL SAHA SİSTEMİ HAZIR':'KONTROL GEREKİYOR'} • ${d.measurementProviderLabel}</div></div><button id="diagClose" style="padding:9px 12px">Kapat</button></div><div style="margin-top:14px">${rows.map(([k,v,i])=>`<div style="display:grid;grid-template-columns:24px 1fr;gap:8px;padding:8px 0;border-bottom:1px solid #18263a"><span>${i}</span><div><b>${k}</b><div style="color:#b8c8dc;font-size:12px">${String(v)}</div></div></div>`).join('')}</div><div style="margin-top:14px;padding:11px;border-radius:10px;background:#101d2d;font-size:12px;line-height:1.5">${d.measurementAvailable?'Gerçek ölçüm sağlayıcısı aktif. Ölçüm yine kalite kapısından geçmeden kaydedilmez.':'Web saha kaydı çalışır; ancak bu cihaz/tarayıcı kombinasyonunda gerçek metre/m² üretilmez.'}</div>`;
    panel.style.display='block';$('diagClose').onclick=()=>panel.style.display='none';
  }
  function mount(){
    if($('fieldDiagBtn'))return;
    const host=document.querySelector('#settings .card')||document.querySelector('#settings')||document.body;
    const btn=document.createElement('button');btn.id='fieldDiagBtn';btn.type='button';btn.textContent='🧪 Saha Teşhis';btn.style.cssText='margin-top:12px;width:100%;padding:11px 12px;border-radius:10px;font-weight:800';btn.onclick=async()=>render(await inspect());host.appendChild(btn);
  }
  function init(){mount();setTimeout(()=>inspect().catch(()=>{}),500)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
  window.TabelaFieldDiagnostics={inspect,render,state,version:'11.2.9-provider-diagnostics-settings'};
})();
