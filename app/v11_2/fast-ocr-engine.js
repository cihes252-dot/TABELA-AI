(() => {
  let worker=null,workerPromise=null;
  const TARGET_MS=3000;
  const TURKISH_ALPHABET="ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZQWX abcçdefgğhıijklmnoöprsştuüvyzqwx 0123456789&+.-/'\"";
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const load=src=>new Promise((ok,fail)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=fail;i.src=src});
  const nativeIOS=()=>!!window.webkit?.messageHandlers?.tabelaOCR;
  function clean(s){return String(s||'').replace(/[|_~`^]+/g,' ').replace(/[“”]/g,'\"').replace(/\s+/g,' ').replace(/^[^A-Za-zÇĞİÖŞÜçğıöşü0-9]+|[^A-Za-zÇĞİÖŞÜçğıöşü0-9]+$/g,'').trim()}
  function canvas(w,h){const c=document.createElement('canvas');c.width=Math.max(1,Math.round(w));c.height=Math.max(1,Math.round(h));return c}
  function safeBBox(img,bbox){
    if(!bbox)return null;
    const x=Number(bbox.x),y=Number(bbox.y),w=Number(bbox.w),h=Number(bbox.h);if(![x,y,w,h].every(Number.isFinite)||w<=0||h<=0)return null;
    const W=img.width,H=img.height,ratio=(w*h)/Math.max(1,W*H),touch=[x<=W*.02,y<=H*.02,x+w>=W*.98,y+h>=H*.98].filter(Boolean).length;
    if(ratio<.008||ratio>.72||w<W*.08||h<H*.04||touch>=2)return null;
    const px=w*.08,py=h*.16,nx=clamp(x-px,0,W-1),ny=clamp(y-py,0,H-1),rx=clamp(x+w+px,nx+1,W),ry=clamp(y+h+py,ny+1,H);
    return{x:nx,y:ny,w:rx-nx,h:ry-ny};
  }
  function cropForOCR(img,bbox){
    const good=safeBBox(img,bbox),fallback=!good;
    const b=good||{x:img.width*.04,y:img.height*.10,w:img.width*.92,h:img.height*.72};
    const x=clamp(Number(b.x)||0,0,img.width-1),y=clamp(Number(b.y)||0,0,img.height-1),bw=clamp(Number(b.w)||img.width,1,img.width-x),bh=clamp(Number(b.h)||img.height,1,img.height-y);
    const maxW=1400,maxH=850,scale=Math.min(1.8,maxW/bw,maxH/bh),c=canvas(bw*scale,bh*scale),ctx=c.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(img,x,y,bw,bh,0,0,c.width,c.height);
    const im=ctx.getImageData(0,0,c.width,c.height),d=im.data;let mean=0;for(let i=0;i<d.length;i+=4)mean+=.299*d[i]+.587*d[i+1]+.114*d[i+2];mean/=Math.max(1,d.length/4);
    for(let i=0;i<d.length;i+=4){let g=.299*d[i]+.587*d[i+1]+.114*d[i+2];g=clamp((g-mean)*1.72+128,0,255);d[i]=d[i+1]=d[i+2]=g}ctx.putImageData(im,0,0);return{canvas:c,fallback};
  }
  async function ensure(onProgress){
    if(worker)return worker;if(workerPromise)return workerPromise;if(!window.Tesseract)throw new Error('Tesseract web OCR yüklenemedi');
    workerPromise=Tesseract.createWorker('tur+eng',1,{logger:m=>{if(typeof m.progress==='number')onProgress?.(Math.round(m.progress*100),m.status||'OCR hazırlanıyor')}}).then(async w=>{
      await w.setParameters({preserve_interword_spaces:'1',user_defined_dpi:'300',tessedit_char_whitelist:TURKISH_ALPHABET,tessedit_pageseg_mode:'6'});worker=w;return w;
    }).catch(error=>{workerPromise=null;throw error});
    return workerPromise;
  }
  function nativeRecognize(roi,timeoutMs,onProgress){
    return new Promise((resolve,reject)=>{
      if(!nativeIOS())return reject(new Error('native_ocr_unavailable'));
      const requestId='ocr-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);let settled=false,timer;
      const done=(fn,value)=>{if(settled)return;settled=true;clearTimeout(timer);window.removeEventListener('tabela:native-ocr',listener);fn(value)};
      const listener=e=>{const d=e.detail||{};if(d.requestId!==requestId)return;if(d.error)return done(reject,new Error(d.error));done(resolve,d)};
      window.addEventListener('tabela:native-ocr',listener);
      timer=setTimeout(()=>done(reject,new Error('fast_ocr_timeout')),timeoutMs);
      try{onProgress?.(15,'Apple Vision • Türkçe OCR');window.webkit.messageHandlers.tabelaOCR.postMessage({requestId,dataUrl:roi.toDataURL('image/jpeg',.92)})}catch(error){done(reject,error)}
    });
  }
  async function prewarm(onProgress){
    if(nativeIOS()){onProgress?.(100,'Apple Vision Türkçe OCR hazır');return true}
    try{await ensure(onProgress);return true}catch(error){console.warn('Hızlı Türkçe OCR hazırlanamadı',error);return false}
  }
  function ready(){return nativeIOS()||!!worker}
  async function run(data,shape,onProgress,timeoutMs=TARGET_MS){
    const started=performance.now(),img=await load(data),prep=cropForOCR(img,shape?.bbox),roi=prep.canvas;
    if(nativeIOS()){
      try{
        const r=await nativeRecognize(roi,timeoutMs,onProgress),lines=Array.isArray(r?.lines)?r.lines:[],text=clean(r?.text||lines.map(x=>x.text).filter(Boolean).join(' ')||''),raw=Math.round(clamp(Number(lines[0]?.confidence)||0,0,100)),elapsed=Math.round(performance.now()-started),confidence=Math.round(clamp(raw+(text.length>=4?3:0),0,99)),validated=!!(text.length>=3&&raw>=86);
        onProgress?.(100,`Apple Vision • ${elapsed} ms`);
        return{text,confidence,rawConfidence:raw,validated,consensus:1,consensusFrames:1,candidates:lines.slice(0,8).map(x=>({text:clean(x.text),confidence:Math.round(Number(x.confidence)||0),engine:'apple-vision-tr'})).filter(x=>x.text),singlePass:true,language:'tr-TR+en-US',alphabet:'TR+Latin',engine:'apple-vision',elapsedMs:elapsed,targetMs:TARGET_MS,targetMet:elapsed<=TARGET_MS,roiFallback:prep.fallback,validationMode:validated?'native-single-high-confidence':'native-single-user-check',version:'11.2.6-roi-safe-tr-single'};
      }catch(error){
        if(error?.message==='fast_ocr_timeout'){const elapsed=Math.round(performance.now()-started);onProgress?.(100,'Apple Vision 3 sn hedefini aştı • manuel kontrol');return{text:'',confidence:0,rawConfidence:0,validated:false,consensus:0,consensusFrames:0,candidates:[],singlePass:true,timedOut:true,engine:'apple-vision',elapsedMs:elapsed,targetMs:TARGET_MS,targetMet:false,roiFallback:prep.fallback,validationMode:'native-timeout-manual',version:'11.2.6-roi-safe-tr-single'}}
        console.warn('Apple Vision OCR başarısız, web OCR yedeğine geçiliyor',error);
      }
    }
    const w=await ensure(onProgress),psm=prep.fallback?'11':shape?.shapeType==='vertical-rectangle'?'6':'7';
    await w.setParameters({tessedit_pageseg_mode:psm,preserve_interword_spaces:'1',user_defined_dpi:'300',tessedit_char_whitelist:TURKISH_ALPHABET});
    onProgress?.(12,prep.fallback?'Türkçe OCR • güvenli geniş ROI':'Türkçe OCR • tabela ROI');let timer;
    try{
      const recognition=w.recognize(roi),timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('fast_ocr_timeout')),timeoutMs)}),r=await Promise.race([recognition,timeout]);clearTimeout(timer);
      const text=clean(r?.data?.text),raw=Math.round(clamp(Number(r?.data?.confidence)||0,0,100)),elapsed=Math.round(performance.now()-started),confidence=Math.round(clamp(raw+(text.length>=4?4:0),0,98)),validated=!!(text.length>=3&&raw>=86);
      onProgress?.(100,`Tek OCR • ${elapsed} ms`);
      return{text,confidence,rawConfidence:raw,validated,consensus:1,consensusFrames:1,candidates:text?[{text,confidence:raw,engine:'tesseract-tur-eng-single'}]:[],singlePass:true,language:'tur+eng',alphabet:'TR+Latin',engine:'tesseract',elapsedMs:elapsed,targetMs:TARGET_MS,targetMet:elapsed<=TARGET_MS,roiFallback:prep.fallback,validationMode:validated?'single-pass-high-confidence':'single-pass-user-check',version:'11.2.6-roi-safe-tr-single'};
    }catch(error){
      clearTimeout(timer);const elapsed=Math.round(performance.now()-started);
      if(error?.message==='fast_ocr_timeout'){try{await w.terminate()}catch{}worker=null;workerPromise=null;onProgress?.(100,'OCR 3 sn hedefini aştı • manuel kontrol');return{text:'',confidence:0,rawConfidence:0,validated:false,consensus:0,consensusFrames:0,candidates:[],singlePass:true,timedOut:true,engine:'tesseract',elapsedMs:elapsed,targetMs:TARGET_MS,targetMet:false,roiFallback:prep.fallback,validationMode:'fast-timeout-manual',version:'11.2.6-roi-safe-tr-single'}}
      throw error;
    }
  }
  const legacy=window.TabelaOCR||{};
  window.TabelaOCR={...legacy,legacyPrewarm:legacy.prewarm,fastRun:run,prewarm,fastReady:ready,fastTargetMs:TARGET_MS,turkishAlphabet:TURKISH_ALPHABET,version:'11.2.6-roi-safe-tr-single'};
  window.TabelaFastOCR={run,prewarm,ready,targetMs:TARGET_MS,alphabet:TURKISH_ALPHABET,version:'11.2.6-roi-safe-tr-single'};
})();
