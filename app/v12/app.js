(() => {
  'use strict';
  const BUILD='12.1.0';
  const $=id=>document.getElementById(id);
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const TYPES=['Dükkan / mağaza tabelası','Bina cephe tabelası','Kutu harf / kanal harf','Işıklı kutu tabela','Çıkma / dik tabela','Totem','Pylon / direk tabelası','Çatı / parapet tabelası','LED / dijital ekran','Billboard / büyük pano','Raket / CLP','Yönlendirme tabelası','Durak reklamı','Branda / vinil','Vitrin uygulaması','Araç üzeri reklam','Şantiye / çit reklamı','A-frame / kaldırım tabelası','Kaçak / kayıt dışı','Diğer'];
  const state={stream:null,liveTimer:null,mode:'idle',liveStartedAt:0,capturedDataUrl:null,bbox:null,stableBBox:null,stableCount:0,ocr:null,metric:null,gps:null,db:null,records:[],drag:null};
  const workCanvas=document.createElement('canvas'),workCtx=workCanvas.getContext('2d',{willReadFrequently:true});

  function toast(msg){const t=$('toast');if(!t)return;t.textContent=msg;t.classList.remove('hidden');clearTimeout(toast._t);toast._t=setTimeout(()=>t.classList.add('hidden'),2600)}
  function pill(el,text,stateName=''){if(!el)return;el.textContent=text;el.className='status-pill'+(stateName?' '+stateName:'')}
  function fmt(n,d=2){return Number.isFinite(Number(n))?Number(n).toFixed(d):'—'}
  function cleanText(s){return String(s||'').replace(/[|_~`^]+/g,' ').replace(/\s+/g,' ').trim()}
  function normText(s){return cleanText(s).toLocaleLowerCase('tr-TR').replace(/[^a-z0-9çğıöşü ]/gi,' ').replace(/\s+/g,' ').trim()}
  function escapeHtml(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

  async function openDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open('tabela-ai-clean-field',1);r.onupgradeneeded=()=>{const db=r.result;if(!db.objectStoreNames.contains('records'))db.createObjectStore('records',{keyPath:'id'})};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
  async function dbAll(){if(!state.db)return[];return new Promise((resolve,reject)=>{const tx=state.db.transaction('records','readonly'),r=tx.objectStore('records').getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error)})}
  async function dbPut(rec){if(!state.db)throw new Error('Kayıt veritabanı hazır değil');return new Promise((resolve,reject)=>{const tx=state.db.transaction('records','readwrite');tx.objectStore('records').put(rec);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)})}

  function populateTypes(){const s=$('signType');if(s)s.innerHTML=TYPES.map(x=>`<option>${x}</option>`).join('')}
  function bind(){
    $('openCameraBtn').onclick=startCamera;$('uploadBtn').onclick=()=>$('fileInput').click();$('fileInput').onchange=loadFile;
    $('stopBtn').onclick=closeScanner;$('captureBtn').onclick=capture;$('retakeBtn').onclick=retake;$('newBtn').onclick=newSign;
    $('reanalyzeBtn').onclick=runOCR;$('manualMeasureBtn').onclick=()=>$('manualMetricBox').classList.toggle('hidden');$('applyManualMetricBtn').onclick=applyManualMetric;
    $('saveBtn').onclick=saveRecord;$('exportBtn').onclick=exportCSV;$('reportBtn').onclick=()=>{renderRecords();$('recordsCard').classList.remove('hidden');$('recordsCard').scrollIntoView({behavior:'smooth'})};
    $('backBtn').onclick=()=>history.length>1?history.back():newSign();setupOverlayEditing();
    window.addEventListener('tabela:measurement',e=>applyNativeMetric(e.detail||{}));
    window.addEventListener('tabela:measurement-error',e=>{state.metric=null;pill($('metricStatus'),'ÖLÇÜ REDDEDİLDİ','bad');$('metricSource').textContent=e.detail?.message||'3B ölçüm güven kapısından geçmedi.';renderMetric()});
  }

  async function init(){
    populateTypes();bind();
    try{state.db=await openDB();state.records=await dbAll();renderSummary();renderRecords()}catch(e){console.error(e);pill($('systemStatus'),'Kayıt sorunu','bad')}
    startGPS();refreshMetricCapability();setTimeout(prewarmOCR,220);
    if('serviceWorker'in navigator)navigator.serviceWorker.register(`./service-worker.js?b=${BUILD}`,{scope:'./',updateViaCache:'none'}).catch(()=>{});
    pill($('systemStatus'),'Saha hazır','');
  }

  async function prewarmOCR(){const out=$('ocrReady');if(!out)return;out.textContent='Hazırlanıyor…';try{const ok=window.TabelaFastOCR?.prewarm?await TabelaFastOCR.prewarm():!!window.Tesseract;out.textContent=ok?'Türkçe hazır':'Yüklenemedi'}catch(e){console.warn(e);out.textContent='İlk okumada yükle'}}
  function startGPS(){if(!navigator.geolocation){$('gpsBadge').textContent='GPS yok';return}navigator.geolocation.watchPosition(p=>{state.gps={lat:p.coords.latitude,lng:p.coords.longitude,accuracy:p.coords.accuracy,at:Date.now()};$('gpsBadge').textContent=`GPS ±${Math.round(p.coords.accuracy)} m`;$('locationText').textContent=`${p.coords.latitude.toFixed(6)}, ${p.coords.longitude.toFixed(6)} • ±${Math.round(p.coords.accuracy)} m`;},()=>{$('gpsBadge').textContent='GPS izni yok';$('locationText').textContent='Konum alınamadı';},{enableHighAccuracy:true,maximumAge:5000,timeout:12000})}
  function refreshMetricCapability(){let cap={available:false,platform:'web'};try{cap=window.TabelaMetric?.capability?.()||cap}catch{}const mb=$('metricBadge');if(cap.available){if(mb)mb.textContent=cap.platform==='ios'?(cap.caps?.lidar?'iOS • LiDAR hazır':'iOS • ARKit hazır'):'Android • ARCore hazır';$('metricSource').textContent='Gerçek 3B sensör köprüsü hazır.';pill($('metricStatus'),'3B HAZIR','')}else{if(mb)mb.textContent='WEB • metre kapalı';$('metricSource').textContent='Saf web tarayıcıda gerçek metre kaynağı yok. Pikselden metre üretilmez.';pill($('metricStatus'),'ÖLÇÜ YOK','warn')}}

  async function startCamera(){
    closeStream();resetAnalysis();
    try{
      const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}},audio:false});
      state.stream=stream;state.mode='live';state.liveStartedAt=Date.now();const v=$('video');v.srcObject=stream;v.classList.remove('hidden');$('photoCanvas').classList.add('hidden');$('scanner').classList.remove('hidden');$('retakeBtn').classList.add('hidden');$('captureBtn').classList.remove('hidden');$('captureBtn').disabled=true;$('captureBtn').textContent='📸 Fotoğraf Çek';
      await new Promise(resolve=>{if(v.readyState>=2)return resolve();v.onloadedmetadata=()=>resolve()});await v.play();setFrameRatio(v.videoWidth,v.videoHeight);syncOverlay(v.videoWidth,v.videoHeight);$('detectBadge').textContent='Tabela aranıyor…';liveTick();
    }catch(e){console.error(e);toast('Kamera açılamadı. Kamera iznini kontrol edin.');pill($('systemStatus'),'Kamera izni gerekli','bad')}
  }
  function closeStream(){if(state.liveTimer){clearTimeout(state.liveTimer);state.liveTimer=null}if(state.stream){state.stream.getTracks().forEach(t=>t.stop());state.stream=null}}
  function closeScanner(){closeStream();state.mode='idle';$('scanner').classList.add('hidden');$('resultCard').classList.add('hidden')}
  function setFrameRatio(w,h){if(w&&h)$('cameraFrame').style.aspectRatio=`${w}/${h}`}
  function syncOverlay(w,h){const o=$('overlayCanvas');o.width=w;o.height=h;drawOverlay()}
  function frameToWork(){const v=$('video'),maxW=420,scale=Math.min(1,maxW/Math.max(1,v.videoWidth)),w=Math.max(1,Math.round(v.videoWidth*scale)),h=Math.max(1,Math.round(v.videoHeight*scale));workCanvas.width=w;workCanvas.height=h;workCtx.drawImage(v,0,0,w,h);return{canvas:workCanvas,scaleBack:v.videoWidth/w}}
  function makeIntegral(arr,w,h){const I=new Float64Array((w+1)*(h+1));for(let y=1;y<=h;y++){let row=0;for(let x=1;x<=w;x++){row+=arr[(y-1)*w+x-1];I[y*(w+1)+x]=I[(y-1)*(w+1)+x]+row}}return I}
  function rectSum(I,w,x,y,rw,rh){const W=w+1,x2=x+rw,y2=y+rh;return I[y2*W+x2]-I[y*W+x2]-I[y2*W+x]+I[y*W+x]}

  function detectCandidate(canvas){
    const w=canvas.width,h=canvas.height,ctx=canvas.getContext('2d',{willReadFrequently:true}),d=ctx.getImageData(0,0,w,h).data,n=w*h,gray=new Float32Array(n),gxA=new Float32Array(n),gyA=new Float32Array(n),grad=new Float32Array(n),sq=new Float32Array(n);
    for(let i=0,p=0;i<n;i++,p+=4){const g=.299*d[p]+.587*d[p+1]+.114*d[p+2];gray[i]=g;sq[i]=g*g}
    for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x,gx=Math.abs(gray[i+1]-gray[i-1]),gy=Math.abs(gray[i+w]-gray[i-w]);gxA[i]=gx;gyA[i]=gy;grad[i]=Math.min(255,gx+gy)}
    const IG=makeIntegral(grad,w,h),IX=makeIntegral(gxA,w,h),IY=makeIntegral(gyA,w,h),IL=makeIntegral(gray,w,h),IS=makeIntegral(sq,w,h);let best=null;
    const wr=[.24,.32,.40,.50,.62,.74],hr=[.10,.14,.19,.25,.32,.40];
    for(const wf of wr)for(const hf of hr){
      const rw=Math.round(w*wf),rh=Math.round(h*hf),area=rw*rh,frac=area/n,aspect=rw/rh;if(frac<.028||frac>.52||aspect<.48||aspect>7.5)continue;
      const sx=Math.max(7,Math.round(rw*.15)),sy=Math.max(6,Math.round(rh*.18));
      for(let y=0;y+rh<=h;y+=sy)for(let x=0;x+rw<=w;x+=sx){
        const edge=rectSum(IG,w,x,y,rw,rh)/area,l=rectSum(IL,w,x,y,rw,rh)/area,l2=rectSum(IS,w,x,y,rw,rh)/area,std=Math.sqrt(Math.max(0,l2-l*l)),ix=x+Math.round(rw*.08),iy=y+Math.round(rh*.13),iw=Math.max(2,Math.round(rw*.84)),ih=Math.max(2,Math.round(rh*.74)),innerArea=iw*ih,inner=rectSum(IG,w,ix,iy,iw,ih)/innerArea,gx=rectSum(IX,w,ix,iy,iw,ih)/innerArea,gy=rectSum(IY,w,ix,iy,iw,ih)/innerArea,t=Math.max(2,Math.round(Math.min(rw,rh)*.05)),per=(rectSum(IG,w,x,y,rw,t)+rectSum(IG,w,x,y+rh-t,rw,t)+rectSum(IG,w,x,y,t,rh)+rectSum(IG,w,x+rw-t,y,t,rh))/Math.max(1,2*rw*t+2*rh*t),cx=(x+rw/2)/w,cy=(y+rh/2)/h,centerPenalty=(Math.abs(cx-.5)+Math.abs(cy-.48))*5.5,aspectBonus=aspect>=1.25&&aspect<=5.6?7:aspect<.9?3:1,borderPenalty=Math.max(0,per-inner*1.28)*.42,areaPenalty=frac>.40?(frac-.40)*30:0,interiorGain=Math.max(0,inner-edge*.68),score=inner*.72+gx*.18+gy*.06+std*.23+interiorGain*.42+aspectBonus-borderPenalty-centerPenalty-areaPenalty;
        if(inner<8.5||std<12)continue;if(!best||score>best.score)best={x,y,w:rw,h:rh,score,inner,std,aspect};
      }
    }
    if(!best||best.score<25)return null;best.confidence=Math.round(clamp((best.score-17)*2.45,45,96));return best;
  }
  function iou(a,b){if(!a||!b)return 0;const x1=Math.max(a.x,b.x),y1=Math.max(a.y,b.y),x2=Math.min(a.x+a.w,b.x+b.w),y2=Math.min(a.y+a.h,b.y+b.h),inter=Math.max(0,x2-x1)*Math.max(0,y2-y1),u=a.w*a.h+b.w*b.h-inter;return u?inter/u:0}
  function fuseBox(a,b){if(!a)return b;if(!b)return a;const k=.62;return{x:a.x*k+b.x*(1-k),y:a.y*k+b.y*(1-k),w:a.w*k+b.w*(1-k),h:a.h*k+b.h*(1-k),confidence:Math.round(Math.max(a.confidence||0,b.confidence||0))}}
  function detectOnCanvas(src,maxW=520){const r=resizeCanvas(src,maxW),c=detectCandidate(r.canvas);return c?{x:c.x*r.scaleBack,y:c.y*r.scaleBack,w:c.w*r.scaleBack,h:c.h*r.scaleBack,confidence:c.confidence}:null}

  function liveTick(){
    if(state.mode!=='live'||!state.stream)return;
    try{
      const {canvas,scaleBack}=frameToWork(),c=detectCandidate(canvas);
      if(c){const mapped={x:c.x*scaleBack,y:c.y*scaleBack,w:c.w*scaleBack,h:c.h*scaleBack,confidence:c.confidence};state.stableCount=iou(mapped,state.stableBBox)>.56?state.stableCount+1:1;state.stableBBox=mapped;if(state.stableCount>=2){state.bbox=mapped;$('captureBtn').disabled=false;$('captureBtn').textContent='📸 Fotoğraf Çek';$('detectBadge').textContent=`✓ Tabela bulundu • %${mapped.confidence}`;drawOverlay()}else $('detectBadge').textContent='Tabela doğrulanıyor…'}
      else{state.stableCount=0;state.stableBBox=null;if(Date.now()-state.liveStartedAt>4500){$('captureBtn').disabled=false;$('captureBtn').textContent='📸 Fotoğraf Çek';$('detectBadge').textContent='Tabela otomatik bulunamadı • çekim sonrası alanı düzelt'}else $('detectBadge').textContent='Tabela aranıyor…'}
    }catch(e){console.warn('live detect',e)}
    state.liveTimer=setTimeout(liveTick,520);
  }

  async function loadFile(e){
    const f=e.target.files?.[0];if(!f)return;closeStream();resetAnalysis();const data=await fileData(f),img=await imageFrom(data),c=$('photoCanvas');c.width=img.naturalWidth;c.height=img.naturalHeight;c.getContext('2d').drawImage(img,0,0);state.capturedDataUrl=c.toDataURL('image/jpeg',.96);state.mode='captured';setFrameRatio(c.width,c.height);syncOverlay(c.width,c.height);state.bbox=detectOnCanvas(c)||defaultBBox(c.width,c.height);$('scanner').classList.remove('hidden');$('video').classList.add('hidden');c.classList.remove('hidden');$('captureBtn').classList.add('hidden');$('retakeBtn').classList.remove('hidden');$('detectBadge').textContent=state.bbox.manual?'Alanı yeşil çerçeveyle düzeltin':`✓ Tabela alanı bulundu • %${state.bbox.confidence}`;drawOverlay();afterCapture();
  }
  function fileData(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej(r.error);r.readAsDataURL(file)})}
  function imageFrom(src){return new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=src})}
  function resizeCanvas(src,maxW){const scale=Math.min(1,maxW/src.width),c=document.createElement('canvas');c.width=Math.max(1,Math.round(src.width*scale));c.height=Math.max(1,Math.round(src.height*scale));c.getContext('2d').drawImage(src,0,0,c.width,c.height);return{canvas:c,scaleBack:src.width/c.width}}
  function defaultBBox(w,h){return{x:w*.14,y:h*.25,w:w*.72,h:h*.34,confidence:0,manual:true}}

  async function capture(){
    if(state.mode!=='live')return;const v=$('video'),c=$('photoCanvas');c.width=v.videoWidth;c.height=v.videoHeight;c.getContext('2d').drawImage(v,0,0,c.width,c.height);const post=detectOnCanvas(c);if(post){if(state.bbox&&iou(post,state.bbox)>.24)state.bbox=fuseBox(post,state.bbox);else if(!state.bbox||post.confidence>(state.bbox.confidence||0)+10)state.bbox=post}if(!state.bbox)state.bbox=defaultBBox(c.width,c.height);state.capturedDataUrl=c.toDataURL('image/jpeg',.96);state.mode='captured';closeStream();v.classList.add('hidden');c.classList.remove('hidden');$('captureBtn').classList.add('hidden');$('retakeBtn').classList.remove('hidden');$('detectBadge').textContent=state.bbox.manual?'Alanı yeşil çerçeveyle düzeltin':'✓ Tabela bulundu • alanı kontrol edin';syncOverlay(c.width,c.height);drawOverlay();afterCapture();
  }
  function retake(){if($('fileInput').value){$('fileInput').value='';newSign()}else startCamera()}
  function resetAnalysis(){state.capturedDataUrl=null;state.bbox=null;state.stableBBox=null;state.stableCount=0;state.ocr=null;state.metric=null;$('resultCard').classList.add('hidden');$('ocrText').value='';$('companyName').textContent='Firma/marka OCR ile belirlenecek';$('sectorText').textContent='Sektör: —';renderMetric()}
  function newSign(){closeStream();resetAnalysis();state.mode='idle';$('scanner').classList.add('hidden');$('photoCanvas').classList.add('hidden');$('video').classList.remove('hidden');$('captureBtn').classList.remove('hidden');$('captureBtn').disabled=true;$('retakeBtn').classList.add('hidden');$('fileInput').value='';window.scrollTo({top:0,behavior:'smooth'})}

  function drawOverlay(){const o=$('overlayCanvas'),ctx=o.getContext('2d');ctx.clearRect(0,0,o.width,o.height);const b=state.bbox;if(!b)return;ctx.save();ctx.strokeStyle='#45f2b2';ctx.lineWidth=Math.max(2,o.width/360);ctx.setLineDash(state.mode==='captured'?[12,7]:[]);ctx.strokeRect(b.x,b.y,b.w,b.h);if(state.mode==='captured'){ctx.fillStyle='rgba(69,242,178,.035)';ctx.fillRect(b.x,b.y,b.w,b.h);const r=Math.max(8,o.width/75);ctx.setLineDash([]);for(const p of handles(b)){ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle='#45f2b2';ctx.stroke()}}ctx.restore()}
  function handles(b){return[{k:'tl',x:b.x,y:b.y},{k:'tr',x:b.x+b.w,y:b.y},{k:'bl',x:b.x,y:b.y+b.h},{k:'br',x:b.x+b.w,y:b.y+b.h}]}
  function setupOverlayEditing(){const o=$('overlayCanvas');o.addEventListener('pointerdown',e=>{if(state.mode!=='captured'||!state.bbox)return;const p=overlayPoint(e),b=state.bbox,r=Math.max(16,o.width/45),hit=handles(b).find(h=>Math.hypot(p.x-h.x,p.y-h.y)<r);if(hit)state.drag={type:'resize',handle:hit.k,start:p,orig:{...b}};else if(p.x>=b.x&&p.x<=b.x+b.w&&p.y>=b.y&&p.y<=b.y+b.h)state.drag={type:'move',start:p,orig:{...b}};else return;o.setPointerCapture(e.pointerId);e.preventDefault()});o.addEventListener('pointermove',e=>{if(!state.drag)return;const p=overlayPoint(e),d=state.drag,dx=p.x-d.start.x,dy=p.y-d.start.y,b={...d.orig},minW=o.width*.08,minH=o.height*.05;if(d.type==='move'){b.x=clamp(d.orig.x+dx,0,o.width-d.orig.w);b.y=clamp(d.orig.y+dy,0,o.height-d.orig.h)}else{if(d.handle.includes('l')){b.x=clamp(d.orig.x+dx,0,d.orig.x+d.orig.w-minW);b.w=d.orig.w+(d.orig.x-b.x)}if(d.handle.includes('r'))b.w=clamp(d.orig.w+dx,minW,o.width-d.orig.x);if(d.handle.includes('t')){b.y=clamp(d.orig.y+dy,0,d.orig.y+d.orig.h-minH);b.h=d.orig.h+(d.orig.y-b.y)}if(d.handle.includes('b'))b.h=clamp(d.orig.h+dy,minH,o.height-d.orig.y)}b.manual=true;b.confidence=0;state.bbox=b;drawOverlay()});const end=()=>{if(state.drag){state.drag=null;$('detectBadge').textContent='Alan güncellendi • “Alanı tekrar oku” ile OCR yapın'}};o.addEventListener('pointerup',end);o.addEventListener('pointercancel',end)}
  function overlayPoint(e){const o=$('overlayCanvas'),r=o.getBoundingClientRect();return{x:(e.clientX-r.left)*o.width/r.width,y:(e.clientY-r.top)*o.height/r.height}}

  async function afterCapture(){$('resultCard').classList.remove('hidden');$('resultStatus').textContent='Tabela alanı hazır. Türkçe OCR okunuyor…';inferType();requestMetric();await runOCR();$('resultCard').scrollIntoView({behavior:'smooth',block:'start'})}
  function bboxShape(){const b=state.bbox;if(!b)return'horizontal-rectangle';const r=b.w/Math.max(1,b.h);return r>1.25?'horizontal-rectangle':r<.8?'vertical-rectangle':Math.abs(r-1)<.13?'square':'rectangle'}
  function inferType(){const b=state.bbox,c=$('photoCanvas'),r=b?b.w/Math.max(1,b.h):2,area=b?b.w*b.h/Math.max(1,c.width*c.height):0;let type='Dükkan / mağaza tabelası';if(r>4.2&&area>.14)type='Bina cephe tabelası';else if(r<.78&&area>.10)type='Totem';else if(area>.36)type='Billboard / büyük pano';$('signType').value=type}

  async function runOCR(){
    if(!state.capturedDataUrl||!state.bbox||runOCR.busy)return;runOCR.busy=true;$('ocrStatus').textContent='Türkçe OCR okunuyor…';$('ocrTime').textContent='';$('reanalyzeBtn').disabled=true;
    try{
      if(!window.TabelaFastOCR)throw new Error('Türkçe OCR motoru yüklenemedi');const shape={bbox:{x:state.bbox.x,y:state.bbox.y,w:state.bbox.w,h:state.bbox.h},manualOcrRoi:!!state.bbox.manual};
      const r=await TabelaFastOCR.run(state.capturedDataUrl,shape,(pct,status)=>{$('ocrStatus').textContent=status||`OCR %${pct}`},3000);state.ocr=r;const text=cleanText(r.text),candidate=cleanText(r.candidateText);$('ocrText').value=text;$('ocrTime').textContent=`${r.elapsedMs||0} ms`;
      if(text){$('ocrStatus').textContent=r.validated?'OCR güçlü ✓':'OCR bulundu • gözle kontrol edin';pill($('qualityBadge'),`OCR %${r.confidence||0}`,r.validated?'':'warn');analyzeCompany(text)}
      else{state.ocr={...r,text:''};$('ocrText').value='';$('ocrText').placeholder='Yazı doğrulanamadı — yeşil kutuyu yalnız tabelaya getirip tekrar okuyun';$('ocrStatus').textContent=candidate?'Gürültülü OCR reddedildi • yanlış metin kayda alınmadı':'Metin okunamadı • alanı düzeltip tekrar deneyin';pill($('qualityBadge'),'OCR YOK','warn');analyzeCompany('')}
    }catch(e){console.error(e);state.ocr=null;$('ocrStatus').textContent='OCR çalışmadı • internet/Türkçe modelini kontrol edin';pill($('qualityBadge'),'OCR HATA','bad')}
    finally{runOCR.busy=false;$('reanalyzeBtn').disabled=false;$('resultStatus').textContent='Sonucu kontrol edin ve kaydedin.'}
  }
  function analyzeCompany(text){const t=cleanText(text),lines=t.split(/\n| {2,}/).map(x=>x.trim()).filter(Boolean),name=(lines[0]||t||'Firma/marka belirlenemedi').slice(0,90),l=t.toLocaleLowerCase('tr-TR');let sector='Ticari işletme / hizmet';if(/eczane|medikal|sağlık|pharma/.test(l))sector='Sağlık / medikal';else if(/cafe|kafe|restoran|lokanta|kahve/.test(l))sector='Yeme / içme';else if(/market|gıda|bakkal/.test(l))sector='Perakende / gıda';else if(/otel|hotel/.test(l))sector='Konaklama';$('companyName').textContent=name;$('sectorText').textContent='Sektör: '+sector;const a=$('googleSearchLink');if(t){a.href='https://www.google.com/search?q='+encodeURIComponent(name+' firma');a.classList.remove('hidden')}else a.classList.add('hidden')}

  function requestMetric(){state.metric=null;renderMetric();let cap;try{cap=window.TabelaMetric?.capability?.()}catch{}if(!cap?.available)return;const c=$('photoCanvas'),b=state.bbox;if(!b||!c.width||!c.height)return;const payload={shapeType:bboxShape(),autoMetric:true,bboxNormalized:{x:b.x/c.width,y:b.y/c.height,w:b.w/c.width,h:b.h/c.height}};const ok=TabelaMetric.request(payload);if(ok){pill($('metricStatus'),'3B ÖLÇÜLÜYOR','warn');$('metricSource').textContent='AR/Depth sensörlerinden gerçek 3B ölçüm bekleniyor…'}}
  function applyNativeMetric(d){state.metric={width:Number(d.widthM),height:Number(d.heightM),area:Number(d.areaM2),quality:Number(d.measurementQualityScore||d.qualityScore)||0,source:String(d.source||'native-3d'),verified:true,manual:false};renderMetric();pill($('metricStatus'),'3B DOĞRULANDI','');$('metricSource').textContent=`${state.metric.source} • kalite %${state.metric.quality}`}
  function applyManualMetric(){const w=parseFloat(String($('manualWidth').value).replace(',','.')),h=parseFloat(String($('manualHeight').value).replace(',','.'));if(!(w>0&&h>0&&w<1000&&h<1000)){toast('Geçerli en ve boy girin.');return}state.metric={width:w,height:h,area:w*h,source:'operator-verified-manual',verified:true,manual:true,quality:null};renderMetric();pill($('metricStatus'),'MANUEL DOĞRULANDI','');$('metricSource').textContent='Operatör tarafından gerçek ölçü cihazı/manuel veriyle doğrulandı.';$('manualMetricBox').classList.add('hidden')}
  function renderMetric(){const m=state.metric;$('widthValue').textContent=m?fmt(m.width,3)+' m':'—';$('heightValue').textContent=m?fmt(m.height,3)+' m':'—';$('areaValue').textContent=m?fmt(m.area,3)+' m²':'—';if(!m)refreshMetricCapability()}

  function distanceM(a,b){if(!a||!b)return Infinity;const R=6371000,toRad=x=>x*Math.PI/180,dLat=toRad(b.lat-a.lat),dLon=toRad(b.lng-a.lng),la1=toRad(a.lat),la2=toRad(b.lat),q=Math.sin(dLat/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(q))}
  function textSimilarity(a,b){a=normText(a);b=normText(b);if(!a||!b)return 0;if(a===b)return 1;if(a.includes(b)||b.includes(a))return Math.min(a.length,b.length)/Math.max(a.length,b.length);const A=new Set(a.split(' ').filter(Boolean)),B=new Set(b.split(' ').filter(Boolean));let inter=0;A.forEach(x=>B.has(x)&&inter++);return inter/Math.max(1,new Set([...A,...B]).size)}
  function findDuplicate(text){if(!state.gps||!text)return null;return state.records.find(r=>distanceM(state.gps,r.gps)<25&&textSimilarity(text,r.ocrText)>.62)}
  async function makeThumb(){const src=$('photoCanvas'),w=Math.min(480,src.width),scale=w/src.width,c=document.createElement('canvas');c.width=w;c.height=Math.round(src.height*scale);c.getContext('2d').drawImage(src,0,0,c.width,c.height);return c.toDataURL('image/jpeg',.58)}
  async function saveRecord(){const text=cleanText($('ocrText').value),dup=findDuplicate(text);if(dup&&!confirm(`Yakında benzer kayıt var: ${dup.companyName||dup.ocrText||dup.id}. Yine de kaydedilsin mi?`))return;const rec={id:'TBL-'+Date.now().toString(36).toUpperCase(),createdAt:new Date().toISOString(),project:$('projectName').value.trim()||'SAHA-001',signType:$('signType').value,ocrText:text,ocrConfidence:Number(state.ocr?.confidence)||0,ocrEngine:state.ocr?.engine||'manual',companyName:text?$('companyName').textContent:'Firma/marka belirlenemedi',sector:$('sectorText').textContent.replace(/^Sektör:\s*/,''),bbox:state.bbox?{x:state.bbox.x,y:state.bbox.y,w:state.bbox.w,h:state.bbox.h}:null,gps:state.gps?{lat:state.gps.lat,lng:state.gps.lng,accuracy:state.gps.accuracy}:null,measurement:state.metric?{...state.metric}:null,thumbnail:await makeThumb()};try{await dbPut(rec);state.records.unshift(rec);renderSummary();renderRecords();toast('Tabela kaydedildi ✓');newSign()}catch(e){console.error(e);toast('Kayıt yapılamadı')}}
  function renderSummary(){$('recordCount').textContent=state.records.length;const total=state.records.reduce((s,r)=>s+(r.measurement?.verified&&Number.isFinite(Number(r.measurement.area))?Number(r.measurement.area):0),0);$('totalArea').textContent=total>0?total.toFixed(2)+' m²':'—'}
  function renderRecords(){const box=$('recordsList'),rs=[...state.records].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,12);if(!rs.length){$('recordsCard').classList.add('hidden');box.innerHTML='';return}$('recordsCard').classList.remove('hidden');box.innerHTML=rs.map(r=>`<div class="record-row"><strong>${escapeHtml(r.companyName||r.ocrText||r.id)}</strong><small>${escapeHtml(r.signType||'')} • ${new Date(r.createdAt).toLocaleString('tr-TR')}${r.measurement?.area?` • ${Number(r.measurement.area).toFixed(2)} m²`:''}</small></div>`).join('')}
  function exportCSV(){if(!state.records.length){toast('Kayıt yok');return}const rows=[['ID','Tarih','Proje','Tabela Türü','OCR','OCR Güven','En m','Boy m','Alan m2','Ölçüm Kaynağı','Enlem','Boylam','GPS ±m']];for(const r of state.records)rows.push([r.id,r.createdAt,r.project,r.signType,r.ocrText,r.ocrConfidence,r.measurement?.width??'',r.measurement?.height??'',r.measurement?.area??'',r.measurement?.source??'',r.gps?.lat??'',r.gps?.lng??'',r.gps?.accuracy??'']);const csv='\ufeff'+rows.map(row=>row.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(';')).join('\n'),blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='tabela-ai-saha-'+new Date().toISOString().slice(0,10)+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();