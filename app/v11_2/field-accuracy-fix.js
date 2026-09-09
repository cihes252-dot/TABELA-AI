(() => {
  const $=id=>document.getElementById(id);
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const load=src=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=src});

  function acceptedOCR(result){
    const text=String(result?.text||'').trim(),confidence=Number(result?.confidence)||0;
    const compact=text.replace(/\s+/g,''),letters=(text.match(/[A-Za-zÇĞİÖŞÜçğıöşü]/g)||[]).length,digits=(text.match(/[0-9]/g)||[]).length;
    const useful=compact.length>=4&&(letters+digits)>=3&&(letters+digits)/Math.max(1,compact.length)>=.55;
    return !!result?.validated||(confidence>=70&&useful);
  }

  function rowTextBandScore(ctx,w,h){
    const d=ctx.getImageData(0,0,w,h).data,gray=new Float32Array(w*h);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;gray[y*w+x]=.299*d[i]+.587*d[i+1]+.114*d[i+2]}
    const rows=new Float32Array(h);
    for(let y=1;y<h-1;y++){
      let hg=0,vg=0,n=0;
      for(let x=2;x<w-2;x++){
        const p=gray[y*w+x];hg+=Math.abs(p-gray[y*w+x-1]);vg+=Math.abs(p-gray[(y-1)*w+x]);n++;
      }
      rows[y]=n?Math.max(0,hg/n-.18*(vg/n)):0;
    }
    const smooth=new Float32Array(h);
    for(let y=0;y<h;y++){let s=0,n=0;for(let k=-2;k<=2;k++){const yy=y+k;if(yy>=0&&yy<h){s+=rows[yy];n++}}smooth[y]=n?s/n:0}
    return smooth;
  }

  async function refineShapeForOCR(data,shape){
    const b=shape?.bbox;if(!b)return{shape,refined:false};
    let img;try{img=await load(data)}catch{return{shape,refined:false}}
    const W=img.naturalWidth||img.width,H=img.naturalHeight||img.height;
    let x=Number(b.x),y=Number(b.y),w=Number(b.w),h=Number(b.h);
    if(![x,y,w,h].every(Number.isFinite)||w<=0||h<=0||W<=0||H<=0)return{shape,refined:false};
    x=clamp(x,0,W-1);y=clamp(y,0,H-1);w=clamp(w,1,W-x);h=clamp(h,1,H-y);
    const aspect=w/Math.max(1,h);
    if(aspect<1.15||h<42||w<90)return{shape:{...shape,bbox:{x,y,w,h}},refined:false};

    const sw=144,sh=84,c=document.createElement('canvas');c.width=sw;c.height=sh;
    const ctx=c.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(img,x,y,w,h,0,0,sw,sh);
    const rows=rowTextBandScore(ctx,sw,sh),full=Array.from(rows).slice(3,-3),fullAvg=full.reduce((a,v)=>a+v,0)/Math.max(1,full.length);
    let best={score:-Infinity,y:0,h:sh};
    for(const ratio of [.34,.44,.56,.68]){
      const wh=Math.max(16,Math.round(sh*ratio));
      for(let sy=2;sy+wh<sh-2;sy++){
        let s=0;for(let yy=sy;yy<sy+wh;yy++)s+=rows[yy];s/=wh;
        const center=(sy+wh/2)/sh,bias=.95+.08*Math.max(0,1-Math.abs(center-.44)/.56),score=s*bias;
        if(score>best.score)best={score,y:sy,h:wh};
      }
    }
    if(!Number.isFinite(best.score)||best.score<fullAvg*1.035)return{shape:{...shape,bbox:{x,y,w,h}},refined:false};
    const pad=Math.round(sh*.055),sy=clamp(best.y-pad,0,sh-1),ey=clamp(best.y+best.h+pad,sy+1,sh),ry=sy/sh,rh=(ey-sy)/sh;
    if(rh>.80)return{shape:{...shape,bbox:{x,y,w,h}},refined:false};
    const side=w*.012,nb={x:clamp(x+side,0,W-1),y:clamp(y+h*ry,0,H-1),w:clamp(w-side*2,1,W-(x+side)),h:clamp(h*rh,1,H-(y+h*ry))};
    return{shape:{...shape,bbox:nb,__ocrOriginalBBox:{x,y,w,h},__ocrTextBand:true},refined:true,band:{yRatio:+ry.toFixed(3),heightRatio:+rh.toFixed(3),gain:+(best.score/Math.max(.001,fullAvg)).toFixed(2)}};
  }

  function wrapOCR(){
    const fast=window.TabelaFastOCR;if(!fast?.run||fast.run.__accuracyWrapped)return;
    const original=fast.run.bind(fast);
    const wrapped=async(data,shape,onProgress,timeoutMs)=>{
      const prep=await refineShapeForOCR(data,shape),result=await original(data,prep.shape,onProgress,timeoutMs);
      const candidate=String(result?.text||'').trim(),accepted=acceptedOCR(result);
      return{...result,text:accepted?candidate:'',candidateText:candidate,accepted,lowConfidenceRejected:!!candidate&&!accepted,roiStrategy:prep.refined?'adaptive-single-pass-text-band':'detected-sign-roi',ocrBand:prep.band||null};
    };
    wrapped.__accuracyWrapped=true;wrapped.__original=original;fast.run=wrapped;
  }

  function applyPostScanGuards(event){
    const detail=event?.detail||{},ocr=detail.ocr||{},type=detail.type||{};
    if(ocr.lowConfidenceRejected&&ocr.candidateText){
      const input=$('ocr'),badge=$('ocrBadge'),candidates=$('ocrCandidates'),status=$('scanStatus');
      if(input){input.value='';input.placeholder='Öneri: '+ocr.candidateText+' — doğrulanmadı'}
      if(badge){badge.textContent='OCR DOĞRULANMADI';badge.className='badge warn'}
      if(candidates)candidates.innerHTML=`<div class="candidate"><b>OCR önerisi:</b> ${esc(ocr.candidateText)} • güven %${Math.round(Number(ocr.confidence)||0)} • kayda otomatik alınmadı</div>`;
      if(status)status.textContent='Fotoğraf tamamlandı • OCR güveni düşük. Öneriyi kontrol edin veya doğru metni yazın; yanlış OCR otomatik kaydedilmeyecek.';
    }
    if(type.mode!=='trained-model'&&Number(type.confidence)<70){
      const select=$('signType'),box=$('autoTypeBox'),other='Diğer / kontrol gerekli';
      if(select&&[...select.options].some(o=>o.value===other))select.value=other;
      if(select){select.dataset.suggestedType=type.label||'';select.dataset.autoTypeConfidence=String(type.confidence||0)}
      if(box)box.innerHTML=`<b>Tabela tipi önerisi: ${esc(type.label||'—')}</b> <span class="badge warn">%${Math.round(Number(type.confidence)||0)}</span><div class="muted">Güven 70 altında • otomatik tip seçilmedi • operatör doğrulaması gerekli</div>`;
    }
  }

  function boot(){
    wrapOCR();document.addEventListener('tabela:fast-scan-complete',applyPostScanGuards);
    let n=0;const t=setInterval(()=>{wrapOCR();if(++n>24)clearInterval(t)},250);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.TabelaFieldAccuracy={acceptedOCR,refineShapeForOCR,version:'11.2.9-single-pass-ocr-accuracy-guard'};
})();
