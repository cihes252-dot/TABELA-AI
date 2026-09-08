(() => {
  const $=id=>document.getElementById(id);
  const state={ocrManual:false,shapeManual:false,wakeLock:null,lastPreflight:null,scanning:false,saving:false,cameraVerified:false};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function setScanStatus(message){const el=$('scanStatus');if(el)el.textContent=message}
  function stopEvent(event){event.preventDefault();event.stopPropagation();event.stopImmediatePropagation?.()}
  function gpsReady(){
    const text=$('gpsBadge')?.textContent||'';
    return /^GPS\s±\d+\s*m/i.test(text);
  }
  function gpsAccuracy(){
    const m=($('gpsBadge')?.textContent||'').match(/±\s*(\d+)/);
    return m?Number(m[1]):null;
  }
  function waitForVideo(video,timeoutMs=5000){
    if(video?.videoWidth>0&&video?.videoHeight>0&&video.readyState>=2)return Promise.resolve(true);
    return new Promise(resolve=>{
      let done=false;
      const finish=v=>{if(done)return;done=true;clearTimeout(timer);video?.removeEventListener('loadedmetadata',ready);video?.removeEventListener('canplay',ready);resolve(v)};
      const ready=()=>{if(video?.videoWidth>0&&video?.videoHeight>0)finish(true)};
      const timer=setTimeout(()=>finish(false),timeoutMs);
      video?.addEventListener('loadedmetadata',ready);
      video?.addEventListener('canplay',ready);
    });
  }

  async function requestWakeLock(){
    if(!navigator.wakeLock?.request)return false;
    try{
      state.wakeLock=await navigator.wakeLock.request('screen');
      state.wakeLock.addEventListener?.('release',()=>{state.wakeLock=null});
      return true;
    }catch{return false}
  }

  async function ensureServiceWorkerControl(){
    if(window.TabelaNativeBundle)return true;
    if(!('serviceWorker' in navigator))return false;
    try{
      await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(new Error('timeout')),4500))]);
      if(navigator.serviceWorker.controller)return true;
      await Promise.race([
        new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',()=>resolve(),{once:true})),
        new Promise(resolve=>setTimeout(resolve,1500))
      ]);
      return !!navigator.serviceWorker.controller;
    }catch{return false}
  }

  async function warmRemoteAssets(){
    if(!navigator.onLine)return{ok:false,offline:true};
    const urls=[
      'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
      'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
      'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'
    ];
    const results=await Promise.allSettled(urls.map(url=>fetch(url,{mode:'no-cors',cache:'reload'})));
    return{ok:results.every(x=>x.status==='fulfilled'),failed:results.filter(x=>x.status==='rejected').length};
  }

  async function verifyCameraAccess(){
    if(!navigator.mediaDevices?.getUserMedia)return false;
    if(state.cameraVerified)return true;
    try{
      const s=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
      const tracks=s.getVideoTracks();
      state.cameraVerified=tracks.some(t=>t.readyState==='live');
      tracks.forEach(t=>t.stop());
      return state.cameraVerified;
    }catch(error){
      state.cameraVerified=false;
      throw error;
    }
  }

  async function preflight({warmOCR=false,persist=false,verifyCamera=false}={}){
    const cameraAPI=!!navigator.mediaDevices?.getUserMedia;
    const result={secure:window.isSecureContext,camera:cameraAPI,cameraVerified:state.cameraVerified,gps:!!navigator.geolocation,gpsFix:gpsReady(),indexedDB:!!window.indexedDB,storage:false,storageLow:false,ocr:false,serviceWorker:true,online:navigator.onLine,details:[]};
    if(verifyCamera&&cameraAPI){
      try{result.cameraVerified=await verifyCameraAccess()}catch(error){result.cameraVerified=false;result.details.push('Kamera izni/akışı: '+(error?.name||error?.message||error))}
    }
    try{
      const h=await window.TabelaStorage?.health?.();result.storage=!!h?.ok;result.storageHealth=h;
      if(Number.isFinite(h?.quota)&&Number.isFinite(h?.usage)){
        const free=h.quota-h.usage;
        if(free<50*1024*1024){result.storageLow=true;result.details.push('Cihaz tarayıcı depolamasında 50 MB altında boş alan kaldı')}
      }
    }catch(error){result.details.push('Depolama: '+(error?.message||error))}
    result.serviceWorker=await ensureServiceWorkerControl();
    if(!result.serviceWorker)result.details.push('Offline motoru sayfayı henüz kontrol etmiyor; sayfayı bir kez yenileyip tekrar hazırlayın');
    if(warmOCR&&result.serviceWorker){
      const remote=await warmRemoteAssets();
      if(!remote.ok&&!remote.offline)result.details.push('Harita/OCR CDN önbelleğinde '+remote.failed+' dosya hazırlanamadı');
    }
    const nativeOCR=!!window.TabelaOCREnsemble?.nativeAvailable?.();
    const webOCR=!!window.TabelaOCREnsemble?.webAvailable?.();
    result.ocr=nativeOCR||webOCR;
    if(warmOCR&&webOCR){
      try{
        const ok=await window.TabelaOCR?.prewarm?.();
        result.ocr=!!ok||nativeOCR;
        if(!ok&&!nativeOCR)result.details.push('Web OCR dil/worker paketi indirilemedi')
      }catch(error){if(!nativeOCR){result.ocr=false;result.details.push('OCR: '+(error?.message||error))}}
    }
    if(persist){
      try{result.persistence=await window.TabelaStorage?.requestPersistentStorage?.()}catch(error){result.details.push('Kalıcı depolama: '+(error?.message||error))}
    }
    const previouslyPrepared=!!localStorage.getItem('tabela_ai_v11_1_field_ready_at');
    const cameraReady=verifyCamera?result.cameraVerified:(result.cameraVerified||previouslyPrepared);
    result.ready=!!(result.secure&&cameraAPI&&cameraReady&&result.gps&&result.gpsFix&&result.indexedDB&&result.storage&&!result.storageLow&&result.ocr&&result.serviceWorker&&(warmOCR||nativeOCR||previouslyPrepared));
    result.at=new Date().toISOString();
    state.lastPreflight=result;
    if(result.ready)localStorage.setItem('tabela_ai_v11_1_field_ready_at',result.at);
    return result;
  }

  function renderPreflight(result){
    const badge=$('fieldReadyBadge'),detail=$('fieldReadyDetail');
    if(!badge||!detail)return;
    badge.textContent=result.ready?'SAHA HAZIR':'SAHA KONTROL GEREKLİ';
    badge.className='badge '+(result.ready?'ok':'warn');
    const checks=[['HTTPS',result.secure],['Kamera',result.cameraVerified||false],['GPS API',result.gps],['GPS fix',result.gpsFix],['IndexedDB',result.indexedDB],['Depolama',result.storage&&!result.storageLow],['OCR',result.ocr],['Offline',result.serviceWorker]];
    detail.innerHTML=checks.map(([name,ok])=>`${esc(name)}: <b>${ok?'✓':'✗'}</b>`).join(' • ')+(result.details.length?'<br>'+result.details.map(esc).join(' • '):'');
  }

  async function runFieldPrepare(){
    const btn=$('fieldPrepareBtn');
    if(btn){btn.disabled=true;btn.textContent='Hazırlanıyor…'}
    const r=await preflight({warmOCR:true,persist:true,verifyCamera:true});
    renderPreflight(r);
    if(btn){btn.disabled=false;btn.textContent=r.ready?'✓ Saha paketi hazır':'↻ Saha kontrolünü tekrar çalıştır'}
    setScanStatus(r.ready?'Saha ön kontrolü tamam. Kamera, GPS fix, OCR, offline cache ve yerel kayıt hazır.':'Saha ön kontrolünde eksik var. Üstteki kontrol satırını düzeltmeden çekime başlamayın.');
  }

  function mountPreflight(){
    if($('fieldPreflight'))return;
    const top=document.querySelector('.top');
    if(!top)return;
    const card=document.createElement('div');
    card.id='fieldPreflight';card.className='card';
    card.innerHTML='<div class="row" style="justify-content:space-between"><div><b>SAHA ÖN KONTROLÜ</b><div id="fieldReadyDetail" class="muted" style="margin-top:5px">Kontrol ediliyor…</div></div><span id="fieldReadyBadge" class="badge warn">KONTROL</span></div><button id="fieldPrepareBtn" class="success" style="width:100%;margin-top:10px">🛡️ Saha için hazırla / offline OCR ısıt</button>';
    top.insertAdjacentElement('afterend',card);
    $('fieldPrepareBtn').onclick=runFieldPrepare;
    preflight().then(renderPreflight);
  }

  async function exportPhotoBackup(){
    const rows=await window.TabelaStorage?.list?.()||[];
    const out=[];
    for(const r of rows){
      let photoData=null;
      try{photoData=await window.TabelaStorage?.photo?.(r.id)}catch{}
      out.push({...r,photoData});
    }
    const blob=new Blob([JSON.stringify({format:'tabela-ai-field-backup',version:'11.1.2',createdAt:new Date().toISOString(),records:out},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='tabela_ai_v11_1_fotografli_yedek.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
  }

  function mountPhotoBackup(){
    if($('photoBackupBtn'))return;
    const row=$('csvBtn')?.parentElement;if(!row)return;
    const b=document.createElement('button');b.id='photoBackupBtn';b.textContent='📷 Fotoğraflı yedek';
    b.onclick=async()=>{b.disabled=true;b.textContent='Yedek hazırlanıyor…';try{await exportPhotoBackup();b.textContent='✓ Fotoğraflı yedek indirildi'}catch(error){b.textContent='Yedek hatası';setScanStatus('Fotoğraflı yedek oluşturulamadı: '+(error?.message||error))}finally{setTimeout(()=>{b.disabled=false;b.textContent='📷 Fotoğraflı yedek'},1600)}};
    row.appendChild(b);
  }

  function patchMultiFrame(){
    const mf=window.TabelaMultiFrame;if(!mf?.analyzeTop||mf.analyzeTop.__fieldHardened)return;
    const original=mf.analyzeTop.bind(mf);
    const wrapped=(frames,limit=3)=>original(frames,Math.min(5,Math.max(limit,frames?.length||0)));
    wrapped.__fieldHardened=true;mf.analyzeTop=wrapped;
  }

  function patchSegmentation(){
    const seg=window.TabelaSegmentation;if(!seg?.detect||seg.detect.__fieldHardened)return;
    const original=seg.detect.bind(seg);
    const wrapped=async data=>{
      const result=await original(data);
      if(result?.mode!=='trained-model'&&result?.boundaryDetected===false){
        throw new Error('Tabela sınırı güvenilir şekilde bulunamadı. Tabelaya yaklaşın ve yeniden çekin.');
      }
      return result;
    };
    wrapped.__fieldHardened=true;seg.detect=wrapped;
  }

  function patchStorageAdd(){
    const storage=window.TabelaStorage;if(!storage?.add||storage.add.__fieldHardened)return;
    const original=storage.add.bind(storage);
    const wrapped=async(record,photoData)=>{
      if(!record?.id)throw new Error('Kayıt kimliği yok');
      if(!Number.isFinite(record.gps?.lat)||!Number.isFinite(record.gps?.lng))throw new Error('GPS konumu alınmadan kayıt yapılamaz');
      if(!Number.isFinite(Number(record.gps?.accuracy))||Number(record.gps.accuracy)>50)throw new Error('GPS doğruluğu 50 m sınırının dışında; kayıt durduruldu');
      const gpsAt=Date.parse(record.gps?.at||'');
      if(!Number.isFinite(gpsAt)||Date.now()-gpsAt>60000)throw new Error('GPS konumu güncel değil; yeni konum bekleniyor');
      if(!photoData)throw new Error('Ana saha fotoğrafı yok; kayıt durduruldu');
      if(Number(record.qualityScore)<62)throw new Error('Çekim kalite kapısı geçilmeden kayıt yapılamaz');
      if(!String(record.ocr||'').trim())throw new Error('Tabela yazısı boş; OCR sonucunu kontrol edin veya manuel girin');
      if(!String(record.shapeType||'').trim())throw new Error('Tabela şekli seçilmeden kayıt yapılamaz');

      const ocr=$('ocr');
      if(state.ocrManual||ocr?.dataset.operatorEdited==='1'){
        record={...record,ocrValidated:false,ocrConfidence:0,ocrManual:true,ocrSource:'operator-correction'};
      }
      const shape=$('shapeSelect');
      if(state.shapeManual||shape?.dataset.operatorEdited==='1'){
        record={...record,shapeConfidence:0,shapeManual:true,segmentationMode:'operator-corrected'};
      }

      try{
        const a=record.address;
        const stale=!a||!Number.isFinite(a.lat)||!Number.isFinite(a.lng)||Math.abs(a.lat-record.gps.lat)>.00025||Math.abs(a.lng-record.gps.lng)>.00025;
        if(stale){const fresh=await window.TabelaAddress?.reverse?.(record.gps);if(fresh&&!fresh.error)record={...record,address:fresh}}
      }catch{}

      try{
        const rows=await storage.list();
        const d=window.TabelaDuplicate?.analyze?.({gps:record.gps,ocr:record.ocr,shapeType:record.shapeType,signType:record.signType,visualHash:record.visualHash},rows);
        if(d){
          record={...record,duplicateScore:d.score||0,duplicateDistanceM:Number.isFinite(d.meters)?d.meters:null,duplicateTextSimilarity:d.textSimilarity||0,duplicateVisualSimilarity:d.visualSimilarity||0};
          if(d.duplicate&&!record.duplicateOverride)throw new Error('Muhtemel tekrar tabela yeniden yakalandı. Tekrar kontrolünü onaylamadan kayıt yapılmadı.');
        }
      }catch(error){
        if(/Muhtemel tekrar/.test(String(error?.message||error)))throw error;
      }
      return original(record,photoData);
    };
    wrapped.__fieldHardened=true;storage.add=wrapped;
  }

  function installGuards(){
    const video=$('video'),snap=$('snapBtn'),start=$('startCam'),save=$('saveBtn'),ocr=$('ocr'),shape=$('shapeSelect'),signType=$('signType'),retry=$('retryBtn'),measure=$('measureBtn');

    snap?.addEventListener('click',event=>{
      if(state.scanning){stopEvent(event);setScanStatus('Tarama zaten devam ediyor. Sonucun tamamlanmasını bekleyin.');return}
      if(!video?.videoWidth||!video?.videoHeight||video.readyState<2){stopEvent(event);setScanStatus('Kamera görüntüsü henüz hazır değil. 1–2 saniye bekleyip tekrar deneyin.');return}
      if(!gpsReady()){stopEvent(event);setScanStatus('GPS henüz alınmadı. Konum rozeti GPS ±… m olunca taramayı başlatın.');return}
      state.ocrManual=false;state.shapeManual=false;if(ocr)ocr.dataset.operatorEdited='0';if(shape)shape.dataset.operatorEdited='0';
    },true);

    if(snap?.onclick){
      const original=snap.onclick;
      snap.onclick=async event=>{
        if(state.scanning)return;
        state.scanning=true;snap.disabled=true;
        try{await original.call(snap,event)}catch(error){
          setScanStatus(error?.message||'Tarama tamamlanamadı. Yeniden deneyin.');
          $('retryBtn')?.classList.remove('hidden');
        }finally{state.scanning=false}
      };
    }

    if(start?.onclick){
      const original=start.onclick;
      start.onclick=async event=>{
        if(snap)snap.disabled=true;
        await original.call(start,event);
        const ready=await waitForVideo(video,5000);
        if(ready){state.cameraVerified=true;if(snap)snap.disabled=false;await requestWakeLock();setScanStatus('Kamera hazır. GPS rozeti de hazırsa 5 kare taramayı başlatın.')}else{if(snap)snap.disabled=true;setScanStatus('Kamera izin aldı fakat görüntü akışı başlamadı. Tarayıcıyı yenileyip tekrar deneyin.')}
      };
    }

    save?.addEventListener('click',event=>{
      if(state.saving){stopEvent(event);return}
      if(!gpsReady()){stopEvent(event);setScanStatus('GPS konumu alınmadan kayıt yapılmadı. GPS rozeti hazır olunca tekrar Kaydet seçin.');return}
      const acc=gpsAccuracy();if(Number.isFinite(acc)&&acc>50){stopEvent(event);setScanStatus('GPS doğruluğu ±'+acc+' m. Daha açık bir noktada birkaç saniye bekleyin; 50 m altına inmeden kayıt yapılmadı.');return}
    },true);

    if(save?.onclick){
      const original=save.onclick;
      save.onclick=async event=>{
        if(state.saving)return;
        state.saving=true;save.disabled=true;
        try{await original.call(save,event)}catch(error){
          setScanStatus('Kayıt yapılmadı: '+(error?.message||error));
          save.disabled=false;
        }finally{state.saving=false}
      };
    }

    ocr?.addEventListener('input',()=>{
      state.ocrManual=true;ocr.dataset.operatorEdited='1';
      const badge=$('ocrBadge'),conf=$('ocrConfidence');if(badge){badge.textContent='Operatör düzeltmesi';badge.className='badge warn'}if(conf)conf.textContent='Doğrulama: manuel düzenlendi';
    });
    shape?.addEventListener('change',()=>{state.shapeManual=true;shape.dataset.operatorEdited='1'});
    signType?.addEventListener('change',()=>{const box=$('dupBox');if(box&&!box.classList.contains('hidden'))box.insertAdjacentHTML('beforeend','<div class="muted">Tabela türü değişti; kayıt anında tekrar kontrolü yeniden yapılacaktır.</div>')});
    retry?.addEventListener('click',()=>{state.ocrManual=false;state.shapeManual=false;state.scanning=false;if(ocr)ocr.dataset.operatorEdited='0';if(shape)shape.dataset.operatorEdited='0';if(snap)snap.disabled=false},true);

    const cap=window.TabelaMetric?.capability?.();
    if(measure&&cap&&!cap.available){measure.disabled=true;measure.textContent='📐 Web sürümü • native 3D ölçüm yok';const s=$('st6');if(s)s.textContent='Web modunda ölçüm yok • kayıt ölçümsüz yapılabilir'}
  }

  function init(){
    mountPreflight();mountPhotoBackup();patchMultiFrame();patchSegmentation();patchStorageAdd();installGuards();
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&!state.wakeLock)requestWakeLock()});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
  window.TabelaFieldHardening={preflight,exportPhotoBackup,version:'11.1.2-field-hardened'};
})();
