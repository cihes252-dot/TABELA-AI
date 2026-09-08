(() => {
  const $=id=>document.getElementById(id);
  const live={running:false,busy:false,timer:null,last:null,stable:0,auto:true,autoTriggered:false,lastDetectedAt:0};
  const esc2=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const gpsOk=()=>/^GPS\s±\d+\s*m/i.test($('gpsBadge')?.textContent||'');
  function iou(a,b){if(!a||!b)return 0;const x1=Math.max(a.x,b.x),y1=Math.max(a.y,b.y),x2=Math.min(a.x+a.w,b.x+b.w),y2=Math.min(a.y+a.h,b.y+b.h),i=Math.max(0,x2-x1)*Math.max(0,y2-y1),u=a.w*a.h+b.w*b.h-i;return u?i/u:0}
  function snap(video,maxWidth=null,quality=.9){
    const scale=maxWidth&&video.videoWidth>maxWidth?maxWidth/video.videoWidth:1,c=document.createElement('canvas');c.width=Math.max(1,Math.round(video.videoWidth*scale));c.height=Math.max(1,Math.round(video.videoHeight*scale));c.getContext('2d').drawImage(video,0,0,c.width,c.height);return c.toDataURL('image/jpeg',quality);
  }
  function mountLiveUI(){
    const cam=document.querySelector('.camera');if(!cam||$('liveDetectBadge'))return;
    const badge=document.createElement('div');badge.id='liveDetectBadge';badge.className='badge warn';badge.style.cssText='position:absolute;left:10px;top:10px;z-index:8;background:#5a4510;color:#ffdc72';badge.textContent='CANLI TABELA: bekliyor';cam.appendChild(badge);
    const toggle=document.createElement('button');toggle.id='autoCaptureToggle';toggle.type='button';toggle.textContent='⚡ OTOMATİK YAKALA: AÇIK';toggle.style.cssText='position:absolute;right:10px;top:10px;z-index:8;padding:8px 10px;font-size:10px';toggle.onclick=e=>{e.stopPropagation();live.auto=!live.auto;toggle.textContent='⚡ OTOMATİK YAKALA: '+(live.auto?'AÇIK':'KAPALI');toggle.className=live.auto?'success':''};cam.appendChild(toggle);
    const hint=document.querySelector('.hint');if(hint)hint.textContent='CANLI TESPİT • TEK KARE • TEK OCR • ≤3 SN HEDEF';
    const b=$('snapBtn');if(b)b.textContent='⚡ Hızlı tara • 1 OCR';
  }
  async function previewType(data,seg){
    try{const r=await window.TabelaSignTaxonomy?.classify?.(data,{shape:seg});if(r){const badge=$('liveDetectBadge');if(badge)badge.textContent=`TABELA ✓ ${r.label} • %${r.confidence}`;return r}}catch{}
    return null;
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
          const type=await previewType(data,seg);
          const badge=$('liveDetectBadge');if(badge){badge.className='badge '+(live.stable>=2?'ok':'warn');if(!type)badge.textContent=`TABELA ADAYI • ${seg.shapeLabel} • %${seg.confidence}`}
          if(live.stable>=2&&live.auto&&!live.autoTriggered&&gpsOk()){
            live.autoTriggered=true;setTimeout(()=>{const b=$('snapBtn');if(live.running&&!$('video')?.classList.contains('hidden')&&b&&!b.disabled)b.click()},250);
          }
        }else{live.stable=0;live.last=null;const badge=$('liveDetectBadge');if(badge){badge.className='badge warn';badge.textContent='CANLI TABELA: aranıyor'}}
      }catch{live.stable=0;live.last=null;const badge=$('liveDetectBadge');if(badge){badge.className='badge warn';badge.textContent='CANLI TABELA: aranıyor'}}
      finally{live.busy=false}
    }
    live.timer=setTimeout(liveTick,520);
  }
  function startLive(){if(live.running)return;const video=$('video');if(!video?.srcObject||video.videoWidth<=0||video.classList.contains('hidden'))return;live.running=true;live.autoTriggered=false;live.stable=0;live.last=null;const badge=$('liveDetectBadge');if(badge){badge.className='badge warn';badge.textContent='CANLI TABELA: aranıyor'}liveTick()}
  function stopLive(){live.running=false;if(live.timer)clearTimeout(live.timer);live.timer=null;live.busy=false}
  function resumeLiveSoon(delay=320){
    setTimeout(()=>{const video=$('video');if(video?.srcObject&&!video.classList.contains('hidden')&&video.videoWidth>0){live.autoTriggered=false;startLive();const b=$('snapBtn');if(b)b.disabled=false;$('scanStatus').textContent='Yeni tabela için canlı algılama yeniden başladı.'}},delay);
  }
  function patchStorageLifecycle(){
    const storage=window.TabelaStorage;if(!storage?.add||storage.add.__fastFieldLifecycle)return;
    const original=storage.add.bind(storage);
    const wrapped=async(record,photoData)=>{const result=await original(record,photoData);resumeLiveSoon(500);return result};
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
    stopLive();live.autoTriggered=true;duplicateOverride=false;$('saveBtn').disabled=true;currentMeasure=null;
    $('scanStatus').textContent='Hızlı tek kare alınıyor…';stage(1,false,'Tek kare kalite kontrolü');
    const data=snap(video,null,.92);bestData=data;frames=[{data,index:0}];
    const seg=await TabelaSegmentation.detect(data),q=await TabelaQuality.analyze(data,seg.bbox);currentShape=seg;currentQuality=q;
    stage(1,q.pass,`Kalite %${q.score}`);$('qualityBox').classList.remove('hidden');$('qualityBox').innerHTML=`<b>Çekim kalitesi %${q.score}</b><div class="muted">${esc2(q.reasons?.join(' • ')||'Netlik / ışık / kontrast uygun')}</div>`;
    await draw(data,seg);if(!q.pass){$('scanStatus').textContent='Kalite yetersiz. Tabelaya yaklaşın ve yeniden çekin.';$('retryBtn').classList.remove('hidden');return}
    stage(2,true,`${seg.shapeLabel} • sınır %${seg.confidence}`);$('shapeSelect').value=seg.shapeType;$('shapeInfo').textContent=`${seg.shapeLabel} • sınır güven %${seg.confidence} • ${seg.mode||seg.boundarySource||'geometry'}`;
    const typePromise=window.TabelaSignTaxonomy.classify(data,{shape:seg});
    stage(3,false,'Türkçe OCR • tek tarama • 3 sn hedef');
    currentOCR=await window.TabelaFastOCR.run(data,seg,(p,s)=>{$('ocrBar').style.width=p+'%';$('st3').textContent=s},3000);
    $('ocr').value=currentOCR.text||'';$('ocrConfidence').textContent=`Tek OCR: %${currentOCR.confidence||0} • ${currentOCR.elapsedMs||0} ms`;$('ocrBadge').textContent=currentOCR.validated?'OCR güçlü':'OCR kontrol gerekli';$('ocrBadge').className='badge '+(currentOCR.validated?'ok':'warn');$('ocrCandidates').innerHTML=currentOCR.text?`<div class="candidate">${esc2(currentOCR.text)} • tek Türkçe OCR • ${currentOCR.elapsedMs} ms${currentOCR.targetMet?' • hız hedefi ✓':' • 3 sn hedef aşıldı'}</div>`:'<div class="candidate">OCR sonucu yok • metni manuel girin</div>';stage(3,!!currentOCR.text,currentOCR.text?`${currentOCR.text} • ${currentOCR.elapsedMs} ms`:'OCR manuel kontrol');
    const type=await typePromise;renderTypeResult(type);
    currentHash=await TabelaFingerprint.hash(data,seg.bbox);const records=await TabelaStorage.list();currentDup=TabelaDuplicate.analyze({gps,ocr:currentOCR.text,shapeType:seg.shapeType,signType:$('signType').value,visualHash:currentHash},records);
    $('dupBox').classList.remove('hidden');
    if(currentDup.duplicate){$('dupBox').innerHTML=`<span class="badge bad">Muhtemel tekrar %${currentDup.score}</span><div class="muted">GPS ${Number.isFinite(currentDup.meters)?Math.round(currentDup.meters)+' m':'—'} • yazı ${(currentDup.textSimilarity*100).toFixed(0)}% • görsel ${(currentDup.visualSimilarity*100).toFixed(0)}%</div><button id="overrideDup" style="margin-top:8px">Bu farklı tabela — kayda izin ver</button>`;stage(4,false,'Muhtemel tekrar');setTimeout(()=>{const b=$('overrideDup');if(b)b.onclick=()=>{duplicateOverride=true;$('dupBox').innerHTML='<span class="badge warn">Tekrar uyarısı operatör tarafından geçildi</span>';stage(4,true,'Operatör override');updateSave()}},0)}
    else{$('dupBox').innerHTML='<span class="badge ok">Yeni tabela adayı</span>';stage(4,true,'Tekrar kontrolü geçti')}
    currentMaterial=await TabelaMaterial.classify(data,{shape:seg,ocr:currentOCR});if(currentMaterial.mode==='trained-model'&&currentMaterial.label&&[...$('panel').options].some(o=>o.value===currentMaterial.label))$('panel').value=currentMaterial.label;
    const o=TabelaOrientation.read();if(gps&&!address)address=await TabelaAddress.reverse(gps);$('addressText').textContent='Adres: '+(address?.displayName||'—');stage(5,true,`${type?.label||'Tip kontrol'} • ${address?.road||address?.city||'GPS hazır'} • yön ${Number.isFinite(o.heading)?Math.round(o.heading)+'°':'—'}`);stage(6,false,'Web sürümünde gerçek 3D ölçüm yok');
    $('scanStatus').textContent=`Analiz tamamlandı • tek OCR ${currentOCR.elapsedMs||0} ms. Tabela tipini, OCR'ı ve yeşil sınırı kontrol edin.`;$('retryBtn').classList.remove('hidden');updateSave();
    window.dispatchEvent(new CustomEvent('tabela:fast-scan-complete',{detail:{ocr:currentOCR,type,shape:seg,quality:q}}));
  }
  function init(){
    mountLiveUI();window.TabelaSignTaxonomy?.installSelect?.($('signType'));patchStorageLifecycle();
    const snapBtn=$('snapBtn'),startBtn=$('startCam'),retryBtn=$('retryBtn'),video=$('video');
    if(snapBtn)snapBtn.onclick=fastScan;
    if(startBtn?.onclick){const original=startBtn.onclick;startBtn.onclick=async e=>{await original.call(startBtn,e);window.TabelaFastOCR.prewarm().catch(()=>{});if(video?.videoWidth>0){startLive();setTimeout(()=>{$('scanStatus').textContent='Canlı tabela algılama açık. Tabela sabitlenince otomatik tek kare + tek OCR çalışır.'},0)}}}
    const onVideoReady=()=>{if(video?.srcObject&&!video.classList.contains('hidden')){startLive();window.TabelaFastOCR.prewarm().catch(()=>{});$('scanStatus').textContent='Canlı tabela algılama açık. Tabela sabitlenince otomatik tek kare + tek OCR çalışır.'}};
    video?.addEventListener('playing',onVideoReady);video?.addEventListener('loadeddata',onVideoReady);
    retryBtn?.addEventListener('click',()=>{live.autoTriggered=false;resumeLiveSoon(100)});
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')stopLive();else resumeLiveSoon(120)});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
  window.TabelaFastField={startLive,stopLive,resumeLiveSoon,fastScan,state:live,version:'11.2.1-live-single-ocr-continuous'};
})();