(() => {
  const $=id=>document.getElementById(id);
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const state={shape:null,ocr:null,norm:null,mode:null,start:null,boxStart:null,open:false};

  function style(){
    if($('manualOcrRoiStyle'))return;
    const s=document.createElement('style');s.id='manualOcrRoiStyle';s.textContent=`
      #ocrRoiFixBtn{display:none;margin-top:8px;width:100%;background:#263f61;color:#eef5ff;border:1px solid #48698f}
      #ocrRoiEditor{display:none;position:absolute;inset:0;z-index:40;pointer-events:none}
      #ocrRoiEditor.open{display:block}
      #ocrRoiBox{position:absolute;border:3px solid #30f0a4;background:rgba(48,240,164,.08);box-shadow:0 0 0 9999px rgba(0,0,0,.22);pointer-events:auto;touch-action:none;box-sizing:border-box}
      #ocrRoiBox .ocr-handle{position:absolute;width:22px;height:22px;border-radius:50%;background:#fff;border:3px solid #30f0a4;box-sizing:border-box}
      #ocrRoiBox .tl{left:-12px;top:-12px}.tr{right:-12px;top:-12px}.bl{left:-12px;bottom:-12px}.br{right:-12px;bottom:-12px}
      #ocrRoiTools{position:absolute;left:8px;right:8px;bottom:8px;display:flex;gap:7px;z-index:42;pointer-events:auto}
      #ocrRoiTools button{flex:1;padding:11px 8px;font-size:12px;background:#13233b;color:#eef5ff;border:1px solid #365272}
      #ocrRoiTools #ocrRoiRead{background:#137b57;border-color:#30f0a4;font-weight:800}
      #photo.ocr-roi-editing{object-fit:contain!important;background:#02060b!important}
      @media(max-width:600px){#ocrRoiTools button{font-size:11px;padding:10px 6px}}
    `;document.head.appendChild(s);
  }

  function mount(){
    style();
    const candidates=$('ocrCandidates');
    if(candidates&&!$('ocrRoiFixBtn')){
      const b=document.createElement('button');b.id='ocrRoiFixBtn';b.type='button';b.textContent='✋ OCR alanını düzelt';b.onclick=openEditor;candidates.insertAdjacentElement('afterend',b);
    }
    const cam=document.querySelector('.camera');
    if(cam&&!$('ocrRoiEditor')){
      if(getComputedStyle(cam).position==='static')cam.style.position='relative';
      const e=document.createElement('div');e.id='ocrRoiEditor';e.innerHTML=`<div id="ocrRoiBox" aria-label="OCR alanı"><span class="ocr-handle tl" data-h="tl"></span><span class="ocr-handle tr" data-h="tr"></span><span class="ocr-handle bl" data-h="bl"></span><span class="ocr-handle br" data-h="br"></span></div><div id="ocrRoiTools"><button id="ocrRoiCancel" type="button">İptal</button><button id="ocrRoiRead" type="button">🔤 Bu alanı oku</button></div>`;cam.appendChild(e);
      $('ocrRoiCancel').onclick=closeEditor;$('ocrRoiRead').onclick=readManualROI;
      const box=$('ocrRoiBox');box.addEventListener('pointerdown',pointerDown);box.addEventListener('pointermove',pointerMove);box.addEventListener('pointerup',pointerUp);box.addEventListener('pointercancel',pointerUp);
      window.addEventListener('resize',renderBox,{passive:true});
    }
  }

  function sourceSize(){const p=$('photo');return{w:Number(p?.width)||0,h:Number(p?.height)||0}}
  function imageRect(){
    const p=$('photo'),cam=document.querySelector('.camera'),src=sourceSize();if(!p||!cam||!src.w||!src.h)return null;
    const pr=p.getBoundingClientRect(),cr=cam.getBoundingClientRect(),sa=src.w/src.h,ba=pr.width/Math.max(1,pr.height);let w,h,x,y;
    if(sa>=ba){w=pr.width;h=w/sa;x=pr.left-cr.left;y=pr.top-cr.top+(pr.height-h)/2}else{h=pr.height;w=h*sa;x=pr.left-cr.left+(pr.width-w)/2;y=pr.top-cr.top}
    return{x,y,w,h,clientLeft:cr.left+x,clientTop:cr.top+y,srcW:src.w,srcH:src.h};
  }
  function shapeNorm(shape){
    const b=shape?.bbox,W=Number(shape?.__frameWidth)||sourceSize().w,H=Number(shape?.__frameHeight)||sourceSize().h;if(!b||!W||!H)return null;
    const x=clamp(Number(b.x)/W,0,1),y=clamp(Number(b.y)/H,0,1),w=clamp(Number(b.w)/W,.04,1-x),h=clamp(Number(b.h)/H,.03,1-y);return{x,y,w,h};
  }
  function defaultNorm(){return shapeNorm(state.shape)||{x:.12,y:.22,w:.76,h:.32}}
  function renderBox(){
    if(!state.open)return;const r=imageRect(),b=$('ocrRoiBox');if(!r||!b||!state.norm)return;
    b.style.left=(r.x+state.norm.x*r.w)+'px';b.style.top=(r.y+state.norm.y*r.h)+'px';b.style.width=(state.norm.w*r.w)+'px';b.style.height=(state.norm.h*r.h)+'px';
  }
  function clientNorm(ev){const r=imageRect();if(!r)return null;return{x:clamp((ev.clientX-r.clientLeft)/r.w,0,1),y:clamp((ev.clientY-r.clientTop)/r.h,0,1)}}
  function pointerDown(ev){
    if(!state.open)return;const p=clientNorm(ev);if(!p)return;ev.preventDefault();ev.currentTarget.setPointerCapture?.(ev.pointerId);state.mode=ev.target?.dataset?.h||'move';state.start=p;state.boxStart={...state.norm};
  }
  function pointerMove(ev){
    if(!state.mode||!state.start||!state.boxStart)return;const p=clientNorm(ev);if(!p)return;ev.preventDefault();const s=state.boxStart,dx=p.x-state.start.x,dy=p.y-state.start.y,minW=.08,minH=.05;let n={...s};
    if(state.mode==='move'){n.x=clamp(s.x+dx,0,1-s.w);n.y=clamp(s.y+dy,0,1-s.h)}
    else{
      let x1=s.x,y1=s.y,x2=s.x+s.w,y2=s.y+s.h;
      if(state.mode.includes('l'))x1=clamp(s.x+dx,0,x2-minW);if(state.mode.includes('r'))x2=clamp(s.x+s.w+dx,x1+minW,1);if(state.mode.includes('t'))y1=clamp(s.y+dy,0,y2-minH);if(state.mode.includes('b'))y2=clamp(s.y+s.h+dy,y1+minH,1);n={x:x1,y:y1,w:x2-x1,h:y2-y1};
    }
    state.norm=n;renderBox();
  }
  function pointerUp(){state.mode=null;state.start=null;state.boxStart=null}

  function openEditor(){
    mount();const p=$('photo'),e=$('ocrRoiEditor');if(!p||!e||p.classList.contains('hidden')){const s=$('scanStatus');if(s)s.textContent='Önce fotoğraf çekin; sonra OCR alanını düzeltebilirsiniz.';return}
    state.norm=defaultNorm();state.open=true;p.classList.add('ocr-roi-editing');e.classList.add('open');$('liveBoundaryBox')?.style.setProperty('display','none','important');requestAnimationFrame(renderBox);
  }
  function closeEditor(){state.open=false;$('photo')?.classList.remove('ocr-roi-editing');$('ocrRoiEditor')?.classList.remove('open');$('liveBoundaryBox')?.style.removeProperty('display')}

  function setOCRUI(result){
    const accepted=!!(result?.accepted||result?.validated),candidate=String(result?.text||result?.candidateText||'').trim(),text=accepted?candidate:'';
    try{if(typeof currentOCR!=='undefined')currentOCR={...result,text};}catch{}
    const input=$('ocr');if(input){input.value=text;input.placeholder=text?'OCR sonucu':'Yazı doğrulanamadı — alanı tekrar düzeltin veya manuel girin'}
    const engine=result?.engine==='apple-vision'?'Apple Vision TR':'Web Türkçe OCR',confidence=Math.round(Number(result?.confidence)||0),elapsed=Math.round(Number(result?.elapsedMs||result?.totalElapsedMs)||0);
    if($('ocrConfidence'))$('ocrConfidence').textContent=`${engine}: %${confidence} • ${elapsed} ms • manuel ROI`;
    if($('ocrBadge')){$('ocrBadge').textContent=accepted?'OCR güçlü':'OCR kontrol gerekli';$('ocrBadge').className='badge '+(accepted?'ok':'warn')}
    if($('ocrCandidates'))$('ocrCandidates').innerHTML=candidate?`<div class="candidate"><b>${accepted?'OCR sonucu':'OCR önerisi'}:</b> ${candidate} • %${confidence} • manuel seçili alan</div>`:'<div class="candidate">Seçili alanda yazı bulunamadı • kutuyu yalnız tabela yazısının üstüne getirip tekrar deneyin</div>';
    const fix=$('ocrRoiFixBtn');if(fix)fix.style.display=accepted?'none':'block';
    if($('scanStatus'))$('scanStatus').textContent=accepted?'Manuel OCR alanı okundu ✓ Sonucu kontrol edip kaydedin.':'OCR hâlâ zayıf. Kutuyu yalnız yazının üzerine daraltın veya metni manuel girin.';
    try{if(typeof updateSave==='function')updateSave()}catch{}
  }

  async function refreshDuplicate(result){
    try{
      if(typeof currentDup==='undefined'||typeof currentHash==='undefined'||typeof gps==='undefined'||!window.TabelaDuplicate||!window.TabelaStorage)return;
      const records=await TabelaStorage.list(),shapeType=(state.shape?.shapeType)||(typeof currentShape!=='undefined'&&currentShape?.shapeType)||'';
      currentDup=TabelaDuplicate.analyze({gps,ocr:result?.text||'',shapeType,signType:$('signType')?.value||'',visualHash:currentHash},records);
      const box=$('dupBox');if(box){box.classList.remove('hidden');box.innerHTML=currentDup.duplicate?`<span class="badge bad">Muhtemel tekrar %${currentDup.score}</span><div class="muted">OCR alanı düzeltildikten sonra tekrar kontrol edildi</div>`:'<span class="badge ok">Yeni tabela adayı</span>'}
    }catch(error){console.warn('Manuel OCR sonrası duplicate yenilenemedi',error)}
  }

  async function readManualROI(){
    const p=$('photo'),src=sourceSize();if(!p||!src.w||!src.h||!state.norm||!window.TabelaFastOCR)return;
    const btn=$('ocrRoiRead');if(btn){btn.disabled=true;btn.textContent='🔤 Okunuyor…'}
    try{
      const data=p.toDataURL('image/jpeg',.96),n=state.norm,shape={...(state.shape||{}),bbox:{x:n.x*src.w,y:n.y*src.h,w:n.w*src.w,h:n.h*src.h},__frameWidth:src.w,__frameHeight:src.h,boundaryDetected:true,confidence:100,manualOcrRoi:true,ocrRoiSource:'manual-operator'};
      if($('ocrBar'))$('ocrBar').style.width='8%';if($('st3'))$('st3').textContent='Manuel tabela yazı alanı • Türkçe OCR';
      const result=await TabelaFastOCR.run(data,shape,(pct,status)=>{if($('ocrBar'))$('ocrBar').style.width=Math.max(8,Number(pct)||0)+'%';if($('st3'))$('st3').textContent=status||'Türkçe OCR'},3000);
      result.manualRoi=true;result.manualRoiNormalized={...n};result.version=(result.version||'ocr')+'+manual-roi-11.2.12';setOCRUI(result);await refreshDuplicate(result);window.dispatchEvent(new CustomEvent('tabela:ocr-manual-roi-complete',{detail:{ocr:result,shape}}));closeEditor();
    }catch(error){console.error('Manuel OCR alanı okunamadı',error);if($('scanStatus'))$('scanStatus').textContent='Manuel OCR tamamlanamadı. İnternet/OCR motorunu kontrol edip tekrar deneyin.'}
    finally{if(btn){btn.disabled=false;btn.textContent='🔤 Bu alanı oku'}}
  }

  function onScan(e){
    state.shape=e.detail?.shape||null;state.ocr=e.detail?.ocr||null;mount();const strong=!!(state.ocr?.accepted||state.ocr?.validated),fix=$('ocrRoiFixBtn');if(fix)fix.style.display=strong?'none':'block';
  }
  function boot(){mount();document.addEventListener('tabela:fast-scan-complete',onScan);let n=0;const t=setInterval(()=>{mount();if(++n>30)clearInterval(t)},250)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.TabelaManualOCRROI={open:openEditor,close:closeEditor,version:'11.2.12-manual-ocr-roi'};
})();