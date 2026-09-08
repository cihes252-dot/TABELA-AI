(() => {
  const $=id=>document.getElementById(id);
  const live={running:false,busy:false,timer:null,last:null,stable:0,autoDetect:true,autoMetric:true,lastDetectedAt:0,metricPending:false,candidateKey:'',metricCandidateKey:'',preCaptureSeg:null,preCaptureType:null};
  const esc2=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function snapFrame(video,maxWidth=null,quality=.9){
    const scale=maxWidth&&video.videoWidth>maxWidth?maxWidth/video.videoWidth:1,c=document.createElement('canvas');
    c.width=Math.max(1,Math.round(video.videoWidth*scale));c.height=Math.max(1,Math.round(video.videoHeight*scale));
    c.getContext('2d').drawImage(video,0,0,c.width,c.height);
    return{data:c.toDataURL('image/jpeg',quality),width:c.width,height:c.height};
  }
  const snap=(video,maxWidth=null,quality=.9)=>snapFrame(video,maxWidth,quality).data;
  function normalizedBox(seg){
    const b=seg?.bbox,w=Number(seg?.__frameWidth||photo?.naturalWidth||photo?.width||video?.videoWidth||0),h=Number(seg?.__frameHeight||photo?.naturalHeight||photo?.height||video?.videoHeight||0);
    if(!b||!w||!h)return null;
    return{x:clamp(b.x/w,0,1),y:clamp(b.y/h,0,1),w:clamp(b.w/w,0,1),h:clamp(b.h/h,0,1)};
  }
  function iouNorm(a,b){if(!a||!b)return 0;const x1=Math.max(a.x,b.x),y1=Math.max(a.y,b.y),x2=Math.min(a.x+a.w,b.x+b.w),y2=Math.min(a.y+a.h,b.y+b.h),i=Math.max(0,x2-x1)*Math.max(0,y2-y1),u=a.w*a.h+b.w*b.h-i;return u?i/u:0}
  function candidateKey(seg){const b=normalizedBox(seg);if(!b)return'';return[seg.shapeType||'shape',Math.round(b.x*20),Math.round(b.y*20),Math.round(b.w*20),Math.round(b.h*20)].join(':')}
  function mountLiveUI(){
    const cam=document.querySelector('.camera');if(!cam||$('liveDetectBadge'))return;
    if(getComputedStyle(cam).position==='static')cam.style.position='relative';
    const box=document.createElement('div');box.id='liveBoundaryBox';box.style.cssText='display:none;position:absolute;z-index:7;border:3px solid #59dba8;border-radius:8px;pointer-events:none;box-shadow:0 0 0 1px rgba(0,0,0,.35) inset';cam.appendChild(box);
    const badge=document.createElement('div');badge.id='liveDetectBadge';badge.className='badge warn';badge.style.cssText='position:absolute;left:10px;top:10px;z-index:8;background:#5a4510;color:#ffdc72;max-width:68%;white-space:normal';badge.textContent='OTOMATİK TESPİT: kamera bekleniyor';cam.appendChild(badge);
    const metric=document.createElement('div');metric.id='liveMetricBadge';metric.className='badge warn';metric.style.cssText='position:absolute;left:10px;top:48px;z-index:8;background:#13233b;color:#c9dcf4;max-width:72%;white-space:normal';metric.textContent='ÖLÇÜ: tabela bekleniyor';cam.appendChild(metric);
    const mode=document.createElement('button');mode.id='autoCaptureToggle';mode.type='button';mode.textContent='👁️ ÖN TESPİT: AÇIK';mode.style.cssText='position:absolute;right:10px;top:10px;z-index:8;padding:8px 10px;font-size:10px';mode.onclick=e=>{e.stopPropagation();live.autoDetect=!live.autoDetect;mode.textContent='👁️ ÖN TESPİT: '+(live.autoDetect?'AÇIK':'KAPALI');if(live.autoDetect)startLive();else{stopLive();hideLiveBoundary();$('liveDetectBadge').textContent='OTOMATİK TESPİT: kapalı'}};cam.appendChild(mode);
    const metricToggle=document.createElement('button');metricToggle.id='autoMetricToggle';metricToggle.type='button';metricToggle.textContent='📐 AUTO ÖLÇÜ: AÇIK';metricToggle.style.cssText='position:absolute;right:10px;top:48px;z-index:8;padding:8px 10px;font-size:10px';metricToggle.onclick=e=>{e.stopPropagation();live.autoMetric=!live.autoMetric;metricToggle.textContent='📐 AUTO ÖLÇÜ: '+(live.autoMetric?'AÇIK':'KAPALI');metricToggle.className=live.autoMetric?'success':''};cam.appendChild(metricToggle);
    const hint=document.querySelector('.hint');if(hint)hint.textContent='OTOMATİK ÖN TESPİT + ÖLÇÜ → SEN FOTOĞRAF ÇEK → TÜRKÇE OCR';
    const b=$('snapBtn');if(b)b.textContent='📸 Fotoğraf Çek + OCR';
  }
  function hideLiveBoundary(){const box=$('liveBoundaryBox');if(box)box.style.display='none'}
  function showLiveBoundary(seg){
    const b=normalizedBox(seg),box=$('liveBoundaryBox');if(!b||!box)return;
    box.style.display='block';box.style.left=(b.x*100).toFixed(2)+'%';box.style.top=(b.y*100).toFixed(2)+'%';box.style.width=(b.w*100).toFixed(2)+'%';box.style.height=(b.h*100).toFixed(2)+'%';
  }
  async function previewType(data,seg){
    try{const r=await window.TabelaSignTaxonomy?.classify?.(data,{shape:seg});if(r){live.preCaptureType=r;return r}}catch{}
    return null;
  }
  function bboxMetricMeta(seg){
    const b=seg?.bbox,n=normalizedBox(seg),w=Number(seg?.__frameWidth||photo?.naturalWidth||photo?.width||video?.videoWidth||0),h=Number(seg?.__frameHeight||photo?.naturalHeight||photo?.height||video?.videoHeight||0);if(!b||!n||!w||!h)return null;
    return{captureWidth:w,captureHeight:h,bboxNormalized:n,pixelWidth:Math.round(b.w),pixelHeight:Math.round(b.h),frameWidthPct:Math.round(n.w*100),frameHeightPct:Math.round(n.h*100)};
  }
  function showVisualBoundary(seg){
    const m=bboxMetricMeta(seg),badge=$('liveMetricBadge');if(!m||!badge)return m;
    badge.className='badge warn';badge.textContent=`GÖRSEL SINIR • ${m.pixelWidth}×${m.pixelHeight} px • kadraj %${m.frameWidthPct}×%${m.frameHeightPct}`;return m;
  }
  function requestAutoMetric(seg,{preCapture=false}={}){
    const cap=window.TabelaMetric?.capability?.(),badge=$('liveMetricBadge'),meta=bboxMetricMeta(seg);live.metricPending=false;
    if(!live.autoMetric){if(badge){badge.className='badge warn';badge.textContent='AUTO ÖLÇÜ kapalı'}return false}
    if(!cap?.available){if(badge){badge.className='badge warn';badge.textContent='GERÇEK m: saf web tarayıcıda ARKit/LiDAR yok'}if(!preCapture)stage(6,false,'Web modunda metre üretilmedi • native 3D köprü gerekli');return false}
    const key=candidateKey(seg);if(preCapture&&key&&live.metricCandidateKey===key&&(live.metricPending||currentMeasure?.verified))return true;
    live.metricCandidateKey=key;live.metricPending=true;if(badge){badge.className='badge warn';badge.textContent=`GERÇEK ÖLÇÜ hazırlanıyor • ${cap.mode||cap.platform}`};if(!preCapture)stage(6,false,'Gerçek 3B ölçüm doğrulanıyor…');
    const ok=window.TabelaMetric.request({shapeType:seg?.shapeType||$('shapeSelect')?.value,bbox:seg?.bbox||null,bboxNormalized:meta?.bboxNormalized||null,captureWidth:meta?.captureWidth||null,captureHeight:meta?.captureHeight||null,ocr:$('ocr')?.value||'',autoMetric:true,fastField:true,preCapture,manualPhoto:true});
    if(!ok){live.metricPending=false;if(badge){badge.className='badge bad';badge.textContent='GERÇEK ÖLÇÜ başlatılamadı'}}return !!ok;
  }
  async function liveTick(){
    if(!live.running)return;const v=$('video');
    if(!live.busy&&v&&!v.classList.contains('hidden')&&v.readyState>=2&&v.videoWidth>0){
      live.busy=true;
      try{
        const frame=snapFrame(v,640,.70),seg=await window.TabelaSegmentation.detect(frame.data);seg.__frameWidth=frame.width;seg.__frameHeight=frame.height;
        if(seg?.boundaryDetected!==false&&Number(seg?.confidence)>=55){
          const prev=normalizedBox(live.last),now=normalizedBox(seg),overlap=iouNorm(prev,now);live.stable=(live.last&&overlap>.58)?live.stable+1:1;live.last=seg;live.lastDetectedAt=Date.now();
          if(live.stable>=2){
            live.preCaptureSeg=seg;showLiveBoundary(seg);const type=await previewType(frame.data,seg),key=candidateKey(seg),badge=$('liveDetectBadge');live.candidateKey=key;
            if(badge){badge.className='badge ok';badge.textContent=`TABELA HAZIR ✓ ${type?.label||seg.shapeLabel} • sınır %${seg.confidence} • FOTOĞRAF ÇEK`}
            showVisualBoundary(seg);if(live.autoMetric&&key&&live.metricCandidateKey!==key)requestAutoMetric(seg,{preCapture:true});
          }else{const badge=$('liveDetectBadge');if(badge){badge.className='badge warn';badge.textContent=`TABELA ADAYI • sabitleyin • %${seg.confidence}`}}
        }else{live.stable=0;live.last=null;live.preCaptureSeg=null;live.preCaptureType=null;live.candidateKey='';live.metricCandidateKey='';hideLiveBoundary();const badge=$('liveDetectBadge');if(badge){badge.className='badge warn';badge.textContent='OTOMATİK TESPİT: tabela aranıyor'}const mb=$('liveMetricBadge');if(mb&&!live.metricPending&&!currentMeasure?.verified)mb.textContent='ÖLÇÜ: tabela bekleniyor'}
      }catch{live.stable=0;live.last=null;hideLiveBoundary();const badge=$('liveDetectBadge');if(badge){badge.className='badge warn';badge.textContent='OTOMATİK TESPİT: yeniden aranıyor'}}
      finally{live.busy=false}
    }
    live.timer=setTimeout(liveTick,420);
  }
  function startLive(){if(live.running||!live.autoDetect)return;const v=$('video');if(!v?.srcObject||v.videoWidth<=0||v.classList.contains('hidden'))return;live.running=true;live.stable=0;live.last=null;liveTick()}
  function stopLive(){live.running=false;if(live.timer)clearTimeout(live.timer);live.timer=null;live.busy=false}
  function resumeLiveSoon(delay=220){setTimeout(()=>{const v=$('video');if(v?.srcObject&&!v.classList.contains('hidden')&&v.videoWidth>0){const b=$('snapBtn');if(b)b.disabled=false;startLive();$('scanStatus').textContent='Kamera hazır • tabela otomatik aranıyor. TABELA HAZIR görünce Fotoğraf Çek + OCR.'}},delay)}
  function patchStorageLifecycle(){
    const storage=window.TabelaStorage;if(!storage?.add||storage.add.__fastFieldLifecycle)return;const original=storage.add.bind(storage);
    const wrapped=async(record,photoData)=>{const result=await original(record,photoData);currentMeasure=null;live.metricCandidateKey='';live.preCaptureSeg=null;live.preCaptureType=null;hideLiveBoundary();resumeLiveSoon(300);return result};
    wrapped.__fastFieldLifecycle=true;storage.add=wrapped;
  }
  function renderTypeResult(r){
    const select=$('signType');if(!r||!select)return;if([...select.options].some(o=>o.value===r.label))select.value=r.label;
    let box=$('autoTypeBox');if(!box){box=document.createElement('div');box.id='autoTypeBox';box.className='quality';select.closest('.field')?.appendChild(box)}
    box.innerHTML=`<b>Otomatik tabela tipi: ${esc2(r.label)}</b> <span class="badge ${r.mode==='trained-model'&&r.confidence>=88?'ok':'warn'}">%${r.confidence}</span><div class="muted">${r.mode==='trained-model'?'eğitimli model':'görsel geometri + sektör tipolojisi • operatör kontrolü'}${r.reasons?.length?' • '+r.reasons.map(esc2).join(' • '):''}</div>`;select.dataset.autoTypeCode=r.code||'';select.dataset.autoTypeConfidence=String(r.confidence||0);
  }
  async function fastScan(){
    const v=$('video');if(!v||v.classList.contains('hidden')||v.readyState<2){$('scanStatus').textContent='Kamera hazır değil.';return}
    stopLive();duplicateOverride=false;$('saveBtn').disabled=true;live.metricPending=!!live.metricPending;
    $('scanStatus').textContent='Fotoğraf alındı • tabela sınırı doğrulanıyor…';stage(1,false,'Tek yüksek çözünürlüklü kare');
    const frame=snapFrame(v,null,.94),data=frame.data;bestData=data;frames=[{data,index:0}];
    const seg=await TabelaSegmentation.detect(data);seg.__frameWidth=frame.width;seg.__frameHeight=frame.height;
    if(seg?.boundaryDetected===false||Number(seg?.confidence)<52){$('scanStatus').textContent='Fotoğrafta güvenilir tabela sınırı bulunamadı. Kadrajı düzeltip tekrar çekin.';stage(2,false,'Tabela sınırı doğrulanmadı');resumeLiveSoon(200);return}
    const q=await TabelaQuality.analyze(data,seg.bbox);currentShape=seg;currentQuality=q;stage(1,q.pass,`Kalite %${q.score}`);$('qualityBox').classList.remove('hidden');$('qualityBox').innerHTML=`<b>Çekim kalitesi %${q.score}</b><div class="muted">${esc2(q.reasons?.join(' • ')||'Netlik / ışık / kontrast uygun')}</div>`;await draw(data,seg);
    if(!q.pass){$('scanStatus').textContent='Kalite yetersiz. Tabelaya yaklaşın ve yeniden çekin.';$('retryBtn').classList.remove('hidden');resumeLiveSoon(250);return}
    const preNorm=normalizedBox(live.preCaptureSeg),photoNorm=normalizedBox(seg),preMatch=iouNorm(preNorm,photoNorm);stage(2,true,`${seg.shapeLabel} • sınır %${seg.confidence}`);$('shapeSelect').value=seg.shapeType;$('shapeInfo').textContent=`${seg.shapeLabel} • sınır güven %${seg.confidence} • ${seg.mode||seg.boundarySource||'geometry'}`;showVisualBoundary(seg);
    const typePromise=window.TabelaSignTaxonomy.classify(data,{shape:seg});
    let metricStarted=false;if(currentMeasure?.verified&&preMatch>=.50){stage(6,true,`Ön ölçüm fotoğrafla eşleşti • IoU ${(preMatch*100).toFixed(0)}%`)}else{currentMeasure=null;live.metricCandidateKey='';metricStarted=requestAutoMetric(seg,{preCapture:false})}
    stage(3,false,'Türkçe OCR • tek tarama • 3 sn hedef');
    currentOCR=await window.TabelaFastOCR.run(data,seg,(p,s)=>{$('ocrBar').style.width=p+'%';$('st3').textContent=s},3000);
    const engine=currentOCR.engine==='apple-vision'?'Apple Vision TR':'Web Türkçe OCR';$('ocr').value=currentOCR.text||'';$('ocrConfidence').textContent=`${engine}: %${currentOCR.confidence||0} • ${currentOCR.elapsedMs||0} ms`;$('ocrBadge').textContent=currentOCR.validated?'OCR güçlü':'OCR kontrol gerekli';$('ocrBadge').className='badge '+(currentOCR.validated?'ok':'warn');$('ocrCandidates').innerHTML=currentOCR.text?`<div class="candidate">${esc2(currentOCR.text)} • ${engine} • ${currentOCR.elapsedMs} ms${currentOCR.targetMet?' • hız hedefi ✓':' • 3 sn hedef aşıldı'}</div>`:'<div class="candidate">OCR sonucu yok • metni manuel girin</div>';stage(3,!!currentOCR.text,currentOCR.text?`${currentOCR.text} • ${currentOCR.elapsedMs} ms`:'OCR manuel kontrol');
    const type=await typePromise;renderTypeResult(type);currentHash=await TabelaFingerprint.hash(data,seg.bbox);const records=await TabelaStorage.list();currentDup=TabelaDuplicate.analyze({gps,ocr:currentOCR.text,shapeType:seg.shapeType,signType:$('signType').value,visualHash:currentHash},records);$('dupBox').classList.remove('hidden');
    if(currentDup.duplicate){$('dupBox').innerHTML=`<span class="badge bad">Muhtemel tekrar %${currentDup.score}</span><div class="muted">GPS ${Number.isFinite(currentDup.meters)?Math.round(currentDup.meters)+' m':'—'} • yazı ${(currentDup.textSimilarity*100).toFixed(0)}% • görsel ${(currentDup.visualSimilarity*100).toFixed(0)}%</div><button id="overrideDup" style="margin-top:8px">Bu farklı tabela — kayda izin ver</button>`;stage(4,false,'Muhtemel tekrar');setTimeout(()=>{const b=$('overrideDup');if(b)b.onclick=()=>{duplicateOverride=true;$('dupBox').innerHTML='<span class="badge warn">Tekrar uyarısı operatör tarafından geçildi</span>';stage(4,true,'Operatör override');updateSave()}},0)}else{$('dupBox').innerHTML='<span class="badge ok">Yeni tabela adayı</span>';stage(4,true,'Tekrar kontrolü geçti')}
    currentMaterial=await TabelaMaterial.classify(data,{shape:seg,ocr:currentOCR});if(currentMaterial.mode==='trained-model'&&currentMaterial.label&&[...$('panel').options].some(o=>o.value===currentMaterial.label))$('panel').value=currentMaterial.label;const o=TabelaOrientation.read();if(gps&&!address)address=await TabelaAddress.reverse(gps);$('addressText').textContent='Adres: '+(address?.displayName||'—');stage(5,true,`${type?.label||'Tip kontrol'} • ${address?.road||address?.city||'GPS hazır'} • yön ${Number.isFinite(o.heading)?Math.round(o.heading)+'°':'—'}`);
    const cap=window.TabelaMetric?.capability?.();if(!cap?.available)stage(6,false,'Saf web: gerçek metre yok • fotoğraf/OCR/GPS kaydı hazır');
    $('scanStatus').textContent=`Fotoğraf tamamlandı • ${engine} ${currentOCR.elapsedMs||0} ms${currentMeasure?.verified?' • gerçek ölçü doğrulandı':metricStarted?' • gerçek ölçüm doğrulanıyor':' • ölçü mevcut değil'}. Sonucu kontrol edip kaydedin.`;$('retryBtn').classList.remove('hidden');updateSave();window.dispatchEvent(new CustomEvent('tabela:fast-scan-complete',{detail:{ocr:currentOCR,type,shape:seg,quality:q,metricStarted,preDetectionMatch:preMatch,manualPhoto:true}}));
  }
  function installMetricLifecycle(){
    window.addEventListener('tabela:measurement',e=>{live.metricPending=false;const d=e.detail||{},badge=$('liveMetricBadge');if(badge){badge.className='badge ok';badge.textContent=`GERÇEK ÖLÇÜ ✓ ${Number(d.widthM||0).toFixed(3)}×${Number(d.heightM||d.diameterM||0).toFixed(3)} m • ${Number(d.areaM2||0).toFixed(3)} m²`}stage(6,true,`${d.source||'3D'} • kalite %${Math.round(Number(d.measurementQualityScore||d.qualityScore||0))}`);$('scanStatus').textContent=$('photo')?.classList.contains('hidden')?'Ölçüm hazır ✓ Şimdi Fotoğraf Çek + OCR.':'Gerçek ölçüm doğrulandı. OCR ve tabela bilgisini kontrol edip kaydedin.'});
    window.addEventListener('tabela:measurement-error',e=>{live.metricPending=false;live.metricCandidateKey='';const badge=$('liveMetricBadge');if(badge){badge.className='badge bad';badge.textContent='GERÇEK ÖLÇÜ doğrulanmadı • yeniden deneyin'}const msg=e.detail?.message||'Gerçek 3D ölçüm tamamlanmadı';stage(6,false,msg)});
    window.addEventListener('tabela:measurement-unavailable',()=>{live.metricPending=false;const badge=$('liveMetricBadge');if(badge){badge.className='badge warn';badge.textContent='GERÇEK m: saf web tarayıcıda kullanılamaz'}});
    window.addEventListener('tabela:native-ar-end',async()=>{try{if(typeof startCamera==='function')await startCamera()}catch{};resumeLiveSoon(280)});
    const save=$('saveBtn');save?.addEventListener('click',e=>{const cap=window.TabelaMetric?.capability?.();if(cap?.available&&live.autoMetric&&!currentMeasure?.verified){e.preventDefault();e.stopImmediatePropagation();$('scanStatus').textContent='Native cihazda kayıt için gerçek 3B ölçümün doğrulanması bekleniyor.'}},true);
  }
  function init(){
    mountLiveUI();window.TabelaSignTaxonomy?.installSelect?.($('signType'));patchStorageLifecycle();installMetricLifecycle();const snapBtn=$('snapBtn'),startBtn=$('startCam'),retryBtn=$('retryBtn'),v=$('video');if(snapBtn)snapBtn.onclick=fastScan;
    if(startBtn?.onclick){const original=startBtn.onclick;startBtn.onclick=async e=>{await original.call(startBtn,e);window.TabelaFastOCR.prewarm().catch(()=>{});resumeLiveSoon(0)}}
    const onVideoReady=()=>{if(v?.srcObject&&!v.classList.contains('hidden')){window.TabelaFastOCR.prewarm().catch(()=>{});resumeLiveSoon(0)}};v?.addEventListener('playing',onVideoReady);v?.addEventListener('loadeddata',onVideoReady);retryBtn?.addEventListener('click',()=>resumeLiveSoon(100));document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')stopLive();else resumeLiveSoon(120)});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
  window.TabelaFastField={startLive,stopLive,resumeLiveSoon,fastScan,requestAutoMetric,state:live,version:'11.2.4-auto-predetect-premeasure-manual-photo-ocr'};
})();