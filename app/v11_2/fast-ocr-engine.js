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
    const W=img.width,H=img.height,ratio=(w*h)/Math.max(1,W*H),touch=[x<=W*.015,y<=H*.015,x+w>=W*.985,y+h>=H*.985].filter(Boolean).length;
    if(ratio<.004||ratio>.78||w<W*.06||h<H*.025||touch>=2)return null;
    const px=w*.018,py=h*.035,nx=clamp(x-px,0,W-1),ny=clamp(y-py,0,H-1),rx=clamp(x+w+px,nx+1,W),ry=clamp(y+h+py,ny+1,H);
    return{x:nx,y:ny,w:rx-nx,h:ry-ny};
  }
  function cropForOCR(img,bbox){
    const good=safeBBox(img,bbox),fallback=!good;
    const b=good||{x:img.width*.035,y:img.height*.08,w:img.width*.93,h:img.height*.78};
    const x=clamp(Number(b.x)||0,0,img.width-1),y=clamp(Number(b.y)||0,0,img.height-1),bw=clamp(Number(b.w)||img.width,1,img.width-x),bh=clamp(Number(b.h)||img.height,1,img.height-y);
    const maxW=1900,maxH=1150,scale=Math.max(.62,Math.min(3.35,maxW/bw,maxH/bh)),c=canvas(bw*scale,bh*scale),ctx=c.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(img,x,y,bw,bh,0,0,c.width,c.height);
    const im=ctx.getImageData(0,0,c.width,c.height),d=im.data;let mean=0,sum2=0,n=0;
    for(let i=0;i<d.length;i+=4){const g=.299*d[i]+.587*d[i+1]+.114*d[i+2];mean+=g;sum2+=g*g;n++}mean/=Math.max(1,n);const std=Math.sqrt(Math.max(0,sum2/Math.max(1,n)-mean*mean)),invert=mean<128,contrast=std<34?2.25:std<52?1.98:1.72;
    for(let i=0;i<d.length;i+=4){let g=.299*d[i]+.587*d[i+1]+.114*d[i+2];g=clamp((g-mean)*contrast+146,0,255);if(invert)g=255-g;d[i]=d[i+1]=d[i+2]=g}ctx.putImageData(im,0,0);
    return{canvas:c,fallback,darkBackground:invert,mean:Math.round(mean),std:Math.round(std),scale:+scale.toFixed(2),aspect:bw/Math.max(1,bh)};
  }
  async function ensure(onProgress){
    if(worker)return worker;if(workerPromise)return workerPromise;if(!window.Tesseract)throw new Error('Tesseract web OCR yüklenemedi');
    workerPromise=Tesseract.createWorker('tur+eng',1,{logger:m=>{if(typeof m.progress==='number')onProgress?.(Math.round(m.progress*100),m.status||'OCR hazırlanıyor')}}).then(async w=>{
      await w.setParameters({preserve_interword_spaces:'1',user_defined_dpi:'300',tessedit_char_whitelist:TURKISH_ALPHABET,tessedit_pageseg_mode:'6'});worker=w;return w;
    }).catch(error=>{workerPromise=null;throw error});
    return workerPromise;
  }
  function wordBox(w){
    const b=w?.bbox||w?.box||{};const x0=Number(b.x0??b.x??0),y0=Number(b.y0??b.y??0),x1=Number(b.x1??((b.x??0)+(b.w??0))),y1=Number(b.y1??((b.y??0)+(b.h??0)));
    return{x0,y0,x1,y1,w:Math.max(0,x1-x0),h:Math.max(0,y1-y0),cx:(x0+x1)/2,cy:(y0+y1)/2};
  }
  function normalizeWord(w){const text=clean(w?.text),confidence=Number(w?.confidence)||0,b=wordBox(w);return{text,confidence,...b}}
  function mergeLineWords(words){
    const sorted=[...words].sort((a,b)=>a.x0-b.x0),out=[];
    for(const w of sorted){
      if(!w.text)continue;
      const prev=out[out.length-1],smallCaps=/^[A-ZÇĞİÖŞÜ]{1,3}$/;
      if(prev&&smallCaps.test(prev.text)&&smallCaps.test(w.text)){
        const gap=w.x0-prev.x1,ref=Math.max(6,(prev.h+w.h)/2);
        if(gap>=-ref*.15&&gap<=ref*.9){prev.text+=w.text;prev.x1=w.x1;prev.w=prev.x1-prev.x0;prev.confidence=(prev.confidence+w.confidence)/2;continue}
      }
      out.push({...w});
    }
    return clean(out.map(x=>x.text).join(' '));
  }
  function dominantLines(data){
    const words=(Array.isArray(data?.words)?data.words:[]).map(normalizeWord).filter(w=>w.text&&w.confidence>=34&&(w.text.length>=2||/^\d{2,}$/.test(w.text))&&w.h>0&&w.w>0);
    if(!words.length)return{lines:[],text:'',wordConfidence:0,words:[]};
    const maxH=Math.max(...words.map(w=>w.h),1),minY=Math.min(...words.map(w=>w.y0)),maxY=Math.max(...words.map(w=>w.y1)),spanY=Math.max(1,maxY-minY),minX=Math.min(...words.map(w=>w.x0)),maxX=Math.max(...words.map(w=>w.x1)),spanX=Math.max(1,maxX-minX);
    const groups=[];
    for(const w of [...words].sort((a,b)=>a.cy-b.cy||a.x0-b.x0)){
      let best=null,bestD=Infinity;
      for(const g of groups){const d=Math.abs(w.cy-g.cy),tol=Math.max(10,Math.max(w.h,g.avgH)*.62);if(d<=tol&&d<bestD){best=g;bestD=d}}
      if(!best){groups.push({items:[w],cy:w.cy,avgH:w.h});continue}
      best.items.push(w);best.cy=best.items.reduce((s,x)=>s+x.cy,0)/best.items.length;best.avgH=best.items.reduce((s,x)=>s+x.h,0)/best.items.length;
    }
    const lines=groups.map(g=>{
      const items=[...g.items].sort((a,b)=>a.x0-b.x0),chars=items.reduce((s,x)=>s+x.text.replace(/\s/g,'').length,0),confWeight=items.reduce((s,x)=>s+x.confidence*Math.max(1,x.text.length),0),charWeight=items.reduce((s,x)=>s+Math.max(1,x.text.length),0),avgConf=charWeight?confWeight/charWeight:0,maxLineH=Math.max(...items.map(x=>x.h),1),heightRatio=maxLineH/maxH,x0=Math.min(...items.map(x=>x.x0)),x1=Math.max(...items.map(x=>x.x1)),widthRatio=(x1-x0)/spanX,oneChar=items.filter(x=>x.text.length===1).length,text=mergeLineWords(items);
      const score=avgConf*.48+heightRatio*72+Math.min(46,chars*3.1)+Math.min(22,widthRatio*22)-oneChar*7;
      return{items,text,avgConf,heightRatio,widthRatio,score,cy:g.cy,chars};
    }).filter(l=>l.text&&l.chars>=2).sort((a,b)=>b.score-a.score);
    if(!lines.length)return{lines:[],text:'',wordConfidence:0,words};
    const primary=lines[0],keep=[primary];
    for(const line of lines.slice(1)){
      if(keep.length>=2)break;
      if(line.score>=primary.score*.68&&line.heightRatio>=.48&&Math.abs(line.cy-primary.cy)>=Math.max(8,primary.items.reduce((s,x)=>s+x.h,0)/primary.items.length*.55))keep.push(line);
    }
    keep.sort((a,b)=>a.cy-b.cy);const text=clean(keep.map(x=>x.text).join(' ')),all=keep.flatMap(x=>x.items),weight=all.reduce((s,x)=>s+Math.max(1,x.text.length),0),wordConfidence=weight?all.reduce((s,x)=>s+x.confidence*Math.max(1,x.text.length),0)/weight:0;
    return{lines,text,wordConfidence:Math.round(wordConfidence),words:all};
  }
  function textScore(s){const t=clean(s),tokens=t.split(/\s+/).filter(Boolean),useful=tokens.filter(x=>x.length>=2),letters=(t.match(/[A-Za-zÇĞİÖŞÜçğıöşü]/g)||[]).length;return useful.length*5+Math.min(20,letters)+Math.min(12,t.length*.45)-tokens.filter(x=>x.length===1).length*3}
  function chooseText(data){
    const raw=clean(data?.text),dominant=dominantLines(data),dominantText=dominant.text;
    const text=dominantText&&textScore(dominantText)>=4?dominantText:raw;
    return{text:clean(text),wordConfidence:dominant.wordConfidence||0,words:dominant.words.slice(0,12),lines:dominant.lines.slice(0,4)};
  }
  function nativeRecognize(roi,timeoutMs,onProgress){
    return new Promise((resolve,reject)=>{
      if(!nativeIOS())return reject(new Error('native_ocr_unavailable'));
      const requestId='ocr-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);let settled=false,timer;
      const done=(fn,value)=>{if(settled)return;settled=true;clearTimeout(timer);window.removeEventListener('tabela:native-ocr',listener);fn(value)};
      const listener=e=>{const d=e.detail||{};if(d.requestId!==requestId)return;if(d.error)return done(reject,new Error(d.error));done(resolve,d)};
      window.addEventListener('tabela:native-ocr',listener);
      timer=setTimeout(()=>done(reject,new Error('fast_ocr_timeout')),timeoutMs);
      try{onProgress?.(15,'Apple Vision • Türkçe OCR');window.webkit.messageHandlers.tabelaOCR.postMessage({requestId,dataUrl:roi.toDataURL('image/jpeg',.94)})}catch(error){done(reject,error)}
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
        const r=await nativeRecognize(roi,timeoutMs,onProgress),lines=Array.isArray(r?.lines)?r.lines:[],text=clean(r?.text||lines.map(x=>x.text).filter(Boolean).join(' ')||''),raw=Math.round(clamp(Number(lines[0]?.confidence)||0,0,100)),elapsed=Math.round(performance.now()-started),confidence=Math.round(clamp(raw+(text.length>=4?3:0),0,99)),validated=!!(text.length>=3&&raw>=84);
        onProgress?.(100,`Apple Vision • ${elapsed} ms`);
        return{text,confidence,rawConfidence:raw,validated,consensus:1,consensusFrames:1,candidates:lines.slice(0,8).map(x=>({text:clean(x.text),confidence:Math.round(Number(x.confidence)||0),engine:'apple-vision-tr'})).filter(x=>x.text),singlePass:true,language:'tr-TR+en-US',alphabet:'TR+Latin',engine:'apple-vision',elapsedMs:elapsed,targetMs:TARGET_MS,targetMet:elapsed<=TARGET_MS,roiFallback:prep.fallback,roiEnhanced:true,darkBackground:prep.darkBackground,validationMode:validated?'native-single-high-confidence':'native-single-user-check',version:'11.2.8-dominant-sign-text-single'};
      }catch(error){
        if(error?.message==='fast_ocr_timeout'){const elapsed=Math.round(performance.now()-started);onProgress?.(100,'Apple Vision 3 sn hedefini aştı • manuel kontrol');return{text:'',confidence:0,rawConfidence:0,validated:false,consensus:0,consensusFrames:0,candidates:[],singlePass:true,timedOut:true,engine:'apple-vision',elapsedMs:elapsed,targetMs:TARGET_MS,targetMet:false,roiFallback:prep.fallback,validationMode:'native-timeout-manual',version:'11.2.8-dominant-sign-text-single'}}
        console.warn('Apple Vision OCR başarısız, web OCR yedeğine geçiliyor',error);
      }
    }
    const w=await ensure(onProgress),psm=prep.aspect>=2.2?'7':prep.aspect>=1.15?'6':'11';
    await w.setParameters({tessedit_pageseg_mode:psm,preserve_interword_spaces:'1',user_defined_dpi:'300',tessedit_char_whitelist:TURKISH_ALPHABET});
    onProgress?.(12,prep.fallback?'Türkçe OCR • geniş güvenli ROI':`Türkçe OCR • tabela ROI${prep.darkBackground?' • koyu zemin düzeltildi':''}`);let timer;
    try{
      const recognition=w.recognize(roi),timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('fast_ocr_timeout')),timeoutMs)}),r=await Promise.race([recognition,timeout]);clearTimeout(timer);
      const selected=chooseText(r?.data||{}),text=selected.text,rawOverall=Math.round(clamp(Number(r?.data?.confidence)||0,0,100)),raw=Math.max(rawOverall,selected.wordConfidence||0),elapsed=Math.round(performance.now()-started),confidence=Math.round(clamp(raw+(text.length>=4?4:0),0,98)),validated=!!(text.length>=3&&raw>=82);
      onProgress?.(100,`Tek OCR • ${elapsed} ms`);
      return{text,confidence,rawConfidence:raw,validated,consensus:1,consensusFrames:1,candidates:text?[{text,confidence:raw,engine:'tesseract-dominant-line'},...selected.words.slice(0,6).map(x=>({text:x.text,confidence:Math.round(x.confidence),engine:'tesseract-word'}))]:[],singlePass:true,language:'tur+eng',alphabet:'TR+Latin',engine:'tesseract',elapsedMs:elapsed,targetMs:TARGET_MS,targetMet:elapsed<=TARGET_MS,roiFallback:prep.fallback,roiEnhanced:true,darkBackground:prep.darkBackground,roiScale:prep.scale,psm,dominantLineSelection:true,validationMode:validated?'single-pass-high-confidence':'single-pass-user-check',version:'11.2.8-dominant-sign-text-single'};
    }catch(error){
      clearTimeout(timer);const elapsed=Math.round(performance.now()-started);
      if(error?.message==='fast_ocr_timeout'){try{await w.terminate()}catch{}worker=null;workerPromise=null;onProgress?.(100,'OCR 3 sn hedefini aştı • manuel kontrol');return{text:'',confidence:0,rawConfidence:0,validated:false,consensus:0,consensusFrames:0,candidates:[],singlePass:true,timedOut:true,engine:'tesseract',elapsedMs:elapsed,targetMs:TARGET_MS,targetMet:false,roiFallback:prep.fallback,validationMode:'fast-timeout-manual',version:'11.2.8-dominant-sign-text-single'}}
      throw error;
    }
  }
  const legacy=window.TabelaOCR||{};
  window.TabelaOCR={...legacy,legacyPrewarm:legacy.prewarm,fastRun:run,prewarm,fastReady:ready,fastTargetMs:TARGET_MS,turkishAlphabet:TURKISH_ALPHABET,version:'11.2.8-dominant-sign-text-single'};
  window.TabelaFastOCR={run,prewarm,ready,targetMs:TARGET_MS,alphabet:TURKISH_ALPHABET,version:'11.2.8-dominant-sign-text-single',__test:{chooseText,dominantLines,mergeLineWords,clean}};
})();
