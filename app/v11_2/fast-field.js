(() => {
  const $=id=>document.getElementById(id);
  const live={running:false,busy:false,timer:null,last:null,stable:0,auto:false,autoMetric:true,autoTriggered:false,lastDetectedAt:0,metricPending:false};
  const esc2=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
  const gpsOk=()=>/^GPS\s±\d+\s*m/i.test($('gpsBadge')?.textContent||'');
  function iou(a,b){if(!a||!b)return 0;const x1=Math.max(a.x,b.x),y1=Math.max(a.y,b.y),x2=Math.min(a.x+a.w,b.x+b.w),y2=Math.min(a.y+a.h,b.y+b.h),i=Math.max(0,x2-x1)*Math.max(0,y2-y1),u=a.w*a.h+b.w*b.h-i;return u?i/u:0}
  function snap(video,maxWidth=null,quality=.9){
    const scale=maxWidth&&video.videoWidth>maxWidth?maxWidth/video.videoWidth:1,c=document.createElement('canvas');c.width=Math.max(1,Math.round(video.videoWidth*scale));c.height=Math.max(1,Math.round(video.videoHeight*scale));c.getContext('2d').drawImage(video,0,0,c.width,c.height);return c.toDataURL('image/jpeg',quality);
  }
  function mountLiveUI(){
    const cam=document.querySelector('.camera');if(!cam||$('liveDetectBadge'))return;
    const badge=document.createElement('div');badge.id='liveDetectBadge';badge.className='badge warn';badge.style.cssText='position:absolute;left:10px;top:10px;z-index:8;background:#5a4510;color:#ffdc72';badge.textContent='TABELA TESPİTİ: MANUEL';cam.appendChild(badge);
    const metric=document.createElement('div');metric.id='liveMetricBadge';metric.className='badge warn';metric.style.cssText='position:absolute;left:10px;top:48px;z-index:8;background:#13233b;color:#c9dcf4;max-width:72%;white-space:normal';metric.textContent='ÖLÇÜ: manuel tespit bekleniyor';cam.appendChild(metric);
    const toggle=document.createElement('button');toggle.id='autoCaptureToggle';toggle.type='button';toggle.textContent='🎯 TESPİT: MANUEL';toggle.style.cssText='position:absolute;right:10px;top:10px;z-index:8;padding:8px 10px;font-size:10px';toggle.onclick=e=>{e.stopPropagation();$('scanStatus').textContent='Tabela tespiti manuel. Tabelayı kadraja alın ve “Tabelayı tespit et” butonuna basın.'};cam.appendChild(toggle);
    const metricToggle=document.createElement('button');metricToggle.id='autoMetricToggle';metricToggle.type='button';metricToggle.textContent='📐 AUTO ÖLÇÜ: AÇIK';metricToggle.style.cssText='position:absolute;right:10px;top:48px;z-index:8;padding:8px 10px;font-size:10px';metricToggle.onclick=e=>{e.stopPropagation();live.autoMetric=!live.autoMetric;metricToggle.textContent='📐 AUTO ÖLÇÜ: '+(live.autoMetric?'AÇIK':'KAPALI');metricToggle.className=live.autoMetric?'success':''};cam.appendChild(metricToggle);
    const hint=document.querySelector('.hint');if(hint)hint.textContent='MANUEL TESPİT → ÖLÇÜ → TÜRKÇE OCR';
    const b=$('snapBtn');if(b)b.textContent='🎯 Tabelayı tespit et';
  }
  async function previewType(data,seg){
    try{const r=await window.TabelaSignTaxonomy?.classify?.(data,{shape:seg});if(r){const badge=$('liveDetectBadge');if(badge)badge.textContent=`TABELA ✓ ${r.label} • %${r.confidence}`;return r}}catch{}
    return null;
  }
  function bboxMetricMeta(seg){
    const b=seg?.bbox,w=Number(photo?.width||video?.videoWidth||0),h=Number(photo?.height||video?.videoHeight||0);if(!b||!w||!h)return null;
    const x=Math.max(0,Math.min(1,b.x/w)),y=Math.max(0,Math.min(1,b.y/h)),bw=Math.max(0,Math.min(1,b.w/w)),bh=Math.max(0,Math.min(1,b.h/h));
    return{captureWidth:w,captureHeight:h,bboxNormalized:{x,y,w:bw,h:bh},pixelWidth:Math.round(b.w),pixelHeight:Math.round(b.h),frameWidthPct:Math.round(bw*100),frameHeightPct:Math.round(bh*100)};
  }
  function showVisualBoundary(seg){
    const m=bboxMetricMeta(seg),badge=$('liveMetricBadge');if(!m||!badge)return m;
    badge.className='badge warn';badge.textContent=`GÖRSEL SINIR • ${m.pixelWidth}×${m.pixelHeight} px • kadraj %${m.frameWidthPct}×%${m.frameHeightPct}`;return m;
  }
  function requestAutoMetric(seg){
    const cap=window.TabelaMetric?.capability?.(),badge=$('liveMetricBadge'),meta=bboxMetricMeta(seg);live.metricPending=false;
    if(!live.autoMetric){if(badge){badge.className='badge warn';badge.textContent='AUTO ÖLÇÜ kapalı'}return false}
    if(!cap?.available){if(badge){badge.className='badge warn';badge.textContent='GERÇEK m: native AR/LiDAR gerekli'}stage(6,false,'Web modunda metre üretilmedi • native 3D gerekli');return false}
    live.metricPending=true;if(badge){badge.className='badge warn';badge.textContent=`GERÇEK ÖLÇÜ başlıyor • ${cap.mode||cap.platform}`};stage(6,false,'Otomatik gerçek 3D ölçüm başlatılıyor…');
    const ok=window.TabelaMetric.request({shapeType:seg?.shapeType||$('shapeSelect')?.value,bbox:seg?.bbox||null,bboxNormalized:meta?.bboxNormalized||null,captureWidth:meta?.captureWidth||null,captureHeight:meta?.captureHeight||null,ocr:$('ocr')?.value||'',autoMetric:true,fastField:true,manualDetection:true});
    if(!ok){live.metricPending=false;if(badge){badge.className='badge bad';badge.textContent='GERÇEK ÖLÇÜ başlatılamadı'}}return !!ok;
  }
  async function liveTick(){
    if(!live.running)return;
    const video=$('video');
    if(!live.busy&&video&&!video.classList.contains('hidden')&&video.readyState>=2&&video.videoWidth>0){
      live.busy=true;
      try{
        const data=snap(video,640,.72),seg=await window.TabelaSegmentation.detect(data);
        if(seg?.boundaryDetected!==false&&Number(seg?.confidence)>=52){
          const overlap=iou(live.last?.bbox,seg.bbox);live.stable=(live.last&&overlap>.52)?live.stable+1:1;live.last=seg;live.lastDetectedAt=Date.now();
          const type=await previewType(data,seg),badge=$('liveDetectBadge');if(badge){badge.className='badge '+(live.stable>=2?'ok':'warn');if(!type)badge.textContent=`TABELA ADAYI • ${seg.shapeLabel} • %${seg.confidence}`}
        }else{live.stable=0;live.last=null;const badge=$('liveDetectBadge');if(badge){badge.className='badge warn';badge.textContent='TABELA TESPİTİ: MANUEL'}}
      }catch{live.stable=0;live.last=null;const badge=$('liveDetectBadge');if(badge){badge.className='badge warn';badge.textContent='TABELA TESPİTİ: MANUEL'}}
      finally{live.busy=false}
    }
    live.timer=setTimeout(liveTick,420);
  }
  function startLive(){if(live.running||!live.auto)return;const video=$('video');if(!video?.srcObject||video.videoWidth<=0||video.classList.contains('hidden'))return;live.running=true;live.autoTriggered=false;live.stable=0;live.last=null;liveTick()}
  function stopLive(){live.running=false;if(live.timer)clearTimeout(live.timer);live.timer=null;live.busy=false}
  function readyForManualDetection(delay=120){
    setTimeout(()=>{const video=$('video'),b=$('snapBtn');if(video?.srcObject&&!video.classList.contains('hidden')&&video.videoWidth>0){if(b)b.disabled=false;const badge=$('liveDetectBadge');if(badge){badge.className='badge warn';badge.textContent='TABELA TESPİTİ: MANUEL'}$('scanStatus').textContent='Kamera hazır. Tabelayı kadraja alın ve “Tabelayı tespit et” butonuna basın.'}},delay);
  }
  function resumeLiveSoon(delay=320){readyForManualDetection(delay)}
  function patchStorageLifecycle(){
    const storage=window.TabelaStorage;if(!storage?.add||storage.add.__fastFieldLifecycle)return;
    const original=storage.add.bind(storage);
    const wrapped=async(record,photoData)=>{const result=await original(record,photoData);readyForManualDetection(300);return result};
    wrapped.__fastFieldLifecycle=true;storage.add=wrapped;
  }
  function renderTypeResult(r){
    const select=$('signType');if(!r||!select)return;
    if([...select.options].some(o=>o.value===r.label))select.value=r.label;
    let box=$('autoTypeBox');if(!box){box=document.createElement('div');box.id='autoTypeBox';box.className='quality';select.closest('.field')?.appendChild(box)}
    box.innerHTML=`<b>Otomatik tabela tipi: ${esc2(r.label)}</b> <span class="badge ${r.mode==='trained-model'&&r.confidence>=88?'ok':'warn'}">%${r.confidence}</span><div class="muted">${r.mode==='trained-model'?'eğitimli model':'görsel geometri + sektör tipolojisi • operatör kontrolü'}${r.reasons?.length?' • '+r.reasons.map(esc2).join(' • '):''}</div>`;
    select.dataset.autoTypeCode=r.code||'';select.dataset.autoTypeConfidence=String(r.confidence||0);
  }
  async function fastScan(){
    stopLive();live.autoTriggered=true;duplicateOverride=false;$('saveBtn').disabled=true;currentMeasure=null;live.metricPending=false;
    $('scanStatus').textContent='Manuel komut alındı • tabela tespit ediliyor…';stage(1,false,'Tek kare kalite kontrolü');
    const data=snap(video,null,.92);bestData=data;frames=[{data,index:0}];
    const seg=await TabelaSegmentation.detect(data),q=await TabelaQuality.analyze(data,seg.bbox);currentShape=seg;currentQuality=q;
    stage(1,q.pass,`Kalite %${q.score}`);$('qualityBox').classList.remove('hidden');$('qualityBox').innerHTML=`<b>Çekim kalitesi %${q.score}</b><div class="muted">${esc2(q.reasons?.join(' • ')||'Netlik / ışık / kontrast uygun')}</div>`;
    await draw(data,seg);if(!q.pass){$('scanStatus').textContent='Kalite yetersiz. Tabelaya yaklaşın ve yeniden çekin.';$('retryBtn').classList.remove('hidden');return}
    stage(2,true,`${seg.shapeLabel} • sınır %${seg.confidence}`);$('shapeSelect').value=seg.shapeType;$('shapeInfo').textContent=`${seg.shapeLabel} • sınır güven %${seg.confidence} • ${seg.mode||seg.boundarySource||'geometry'}`;showVisualBoundary(seg);
    const typePromise=window.TabelaSignTaxonomy.classify(data,{shape:seg});
    const metricStarted=requestAutoMetric(seg);
    stage(3,false,metricStarted?'Ölçüm sürerken Türkçe OCR hazırlanıyor…':'Türkçe OCR • tek tarama • 3 sn hedef');
    const ocrPromise=window.TabelaFastOCR.run(data,seg,(p,s)=>{$('ocrBar').style.width=p+'%';$('st3').textContent=s},3000);
    currentOCR=await ocrPromise;
    const engine=currentOCR.engine==='apple-vision'?'Apple Vision TR':'Web Türkçe OCR';
    $('ocr').value=currentOCR.text||'';$('ocrConfidence').textContent=`${engine}: %${currentOCR.confidence||0} • ${currentOCR.elapsedMs||0} ms`;$('ocrBadge').textContent=currentOCR.validated?'OCR güçlü':'OCR kontrol gerekli';$('ocrBadge').className='badge '+(currentOCR.validated?'ok':'warn');$('ocrCandidates').innerHTML=currentOCR.text?`<div class="candidate">${esc2(currentOCR.text)} • ${engine} • ${currentOCR.elapsedMs} ms${currentOCR.targetMet?' • hız hedefi ✓':' • 3 sn hedef aşıldı'}</div>`:'<div class="candidate">OCR sonucu yok • metni manuel girin</div>';stage(3,!!currentOCR.text,currentOCR.text?`${currentOCR.text} • ${currentOCR.elapsedMs} ms`:'OCR manuel kontrol');
    const type=await typePromise;renderTypeResult(type);
    currentHash=await TabelaFingerprint.hash(data,seg.bbox);const records=await TabelaStorage.list();currentDup=TabelaDuplicate.analyze({gps,ocr:currentOCR.text,shapeType:seg.shapeType,signType:$('signType').value,visualHash:currentHash},records);
    $('dupBox').classList.remove('hidden');
    if(currentDup.duplicate){$('dupBox').innerHTML=`<span class="badge bad">Muhtemel tekrar %${currentDup.score}</span><div class="muted">GPS ${Number.isFinite(currentDup.meters)?Math.round(currentDup.meters)+' m':'—'} • yazı ${(currentDup.textSimilarity*100).toFixed(0)}% • görsel ${(currentDup.visualSimilarity*100).toFixed(0)}%</div><button id="overrideDup" style="margin-top:8px">Bu farklı tabela — kayda izin ver</button>`;stage(4,false,'Muhtemel tekrar');setTimeout(()=>{const b=$('overrideDup');if(b)b.onclick=()=>{duplicateOverride=true;$('dupBox').innerHTML='<span class="badge warn">Tekrar uyarısı operatör tarafından geçildi</span>';stage(4,true,'Operatör override');updateSave()}},0)}
    else{$('dupBox').innerHTML='<span class="badge ok">Yeni tabela adayı</span>';stage(4,true,'Tekrar kontrolü geçti')}
    currentMaterial=await TabelaMaterial.classify(data,{shape:seg,ocr:currentOCR});if(currentMaterial.mode==='trained-model'&&currentMaterial.label&&[...$('panel').options].some(o=>o.value===currentMaterial.label))$('panel').value=currentMaterial.label;
    const o=TabelaOrientation.read();if(gps&&!address)address=await TabelaAddress.reverse(gps);$('addressText').textContent='Adres: '+(address?.displayName||'—');stage(5,true,`${type?.label||'Tip kontrol'} • ${address?.road||address?.city||'GPS hazır'} • yön ${Number.isFinite(o.heading)?Math.round(o.heading)+'°':'—'}`);
    if(!metricStarted)stage(6,false,'Gerçek metre için native AR/LiDAR gerekli');
    $('scanStatus').textContent=`Manuel tabela tespiti tamamlandı • ${engine} ${currentOCR.elapsedMs||0} ms${metricStarted?' • gerçek ölçüm akışı başlatıldı':''}. Sınır, OCR ve tipi kontrol edip kaydedin.`;$('retryBtn').classList.remove('hidden');updateSave();
    window.dispatchEvent(new CustomEvent('tabela:fast-scan-complete',{detail:{ocr:currentOCR,type,shape:seg,quality:q,metricStarted,manualDetection:true}}));
  }
  function installMetricLifecycle(){
    window.addEventListener('tabela:measurement',e=>{live.metricPending=false;const d=e.detail||{},badge=$('liveMetricBadge');if(badge){badge.className='badge ok';badge.textContent=`GERÇEK ÖLÇÜ ✓ ${Number(d.widthM||0).toFixed(3)}×${Number(d.heightM||d.diameterM||0).toFixed(3)} m • ${Number(d.areaM2||0).toFixed(3)} m²`}stage(6,true,`${d.source||'3D'} • kalite %${Math.round(Number(d.measurementQualityScore||d.qualityScore||0))}`);$('scanStatus').textContent='Gerçek ölçüm doğrulandı. Türkçe OCR ve tabela bilgilerini kontrol edip kaydedin.'});
    window.addEventListener('tabela:measurement-error',e=>{live.metricPending=false;const badge=$('liveMetricBadge');if(badge){badge.className='badge bad';badge.textContent='GERÇEK ÖLÇÜ doğrulanmadı • manuel AR kontrolü'}const msg=e.detail?.message||'Gerçek 3D ölçüm tamamlanmadı';stage(6,false,msg)});
    window.addEventListener('tabela:measurement-unavailable',()=>{live.metricPending=false;const badge=$('liveMetricBadge');if(badge){badge.className='badge warn';badge.textContent='GERÇEK m: native uygulama gerekli'}});
    window.addEventListener('tabela:native-ar-end',async()=>{try{if(typeof startCamera==='function')await startCamera()}catch{};setTimeout(()=>{if(!$('photo')?.classList.contains('hidden'))$('scanStatus').textContent=currentMeasure?.verified?'Gerçek ölçüm tamamlandı • kayıt için sınır/OCR kontrolü':'Ölçümden dönüldü • OCR ve sınır kontrolü'},250)});
    const save=$('saveBtn');save?.addEventListener('click',e=>{const cap=window.TabelaMetric?.capability?.();if(cap?.available&&live.autoMetric&&!currentMeasure?.verified){e.preventDefault();e.stopImmediatePropagation();$('scanStatus').textContent='Native cihazda kayıt için gerçek 3D ölçümün doğrulanması bekleniyor.'}},true);
  }
  function init(){
    mountLiveUI();window.TabelaSignTaxonomy?.installSelect?.($('signType'));patchStorageLifecycle();installMetricLifecycle();
    const snapBtn=$('snapBtn'),startBtn=$('startCam'),retryBtn=$('retryBtn'),video=$('video');
    if(snapBtn)snapBtn.onclick=fastScan;
    if(startBtn?.onclick){const original=startBtn.onclick;startBtn.onclick=async e=>{await original.call(startBtn,e);window.TabelaFastOCR.prewarm().catch(()=>{});readyForManualDetection(0)}}
    const onVideoReady=()=>{if(video?.srcObject&&!video.classList.contains('hidden')){window.TabelaFastOCR.prewarm().catch(()=>{});readyForManualDetection(0)}};
    video?.addEventListener('playing',onVideoReady);video?.addEventListener('loadeddata',onVideoReady);
    retryBtn?.addEventListener('click',()=>{live.autoTriggered=false;readyForManualDetection(100)});
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')stopLive();else readyForManualDetection(120)});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
  window.TabelaFastField={startLive,stopLive,resumeLiveSoon:readyForManualDetection,fastScan,requestAutoMetric,state:live,version:'11.2.3-manual-detect-auto-measure-ocr'};
})();