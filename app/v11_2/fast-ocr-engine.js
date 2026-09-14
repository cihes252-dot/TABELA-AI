(() => {
  'use strict';
  let worker=null,workerPromise=null;
  const TARGET_MS=3000;
  const VERSION='11.2.13-sign-ocr-singlepass';
  const TURKISH_ALPHABET="ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZQWX abcçdefgğhıijklmnoöprsştuüvyzqwx 0123456789&+.-/'\":()@";
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const load=src=>new Promise((ok,fail)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=fail;i.src=src});
  const nativeIOS=()=>!!window.webkit?.messageHandlers?.tabelaOCR;
  const makeCanvas=(w,h)=>{const c=document.createElement('canvas');c.width=Math.max(1,Math.round(w));c.height=Math.max(1,Math.round(h));return c};

  function clean(s){
    return String(s||'')
      .replace(/[|_~`^]+/g,' ')
      .replace(/[“”]/g,'"')
      .replace(/\s+/g,' ')
      .replace(/^[^A-Za-zÇĞİÖŞÜçğıöşü0-9]+|[^A-Za-zÇĞİÖŞÜçğıöşü0-9]+$/g,'')
      .trim();
  }

  function safeBBox(img,bbox){
    if(!bbox)return null;
    const x=Number(bbox.x),y=Number(bbox.y),w=Number(bbox.w),h=Number(bbox.h);
    if(![x,y,w,h].every(Number.isFinite)||w<=0||h<=0)return null;
    const W=img.width,H=img.height,ratio=(w*h)/Math.max(1,W*H),touch=[x<=W*.01,y<=H*.01,x+w>=W*.99,y+h>=H*.99].filter(Boolean).length;
    if(ratio<.003||ratio>.86||w<W*.045||h<H*.018||touch>=3)return null;
    const px=Math.max(2,w*.025),py=Math.max(2,h*.045),nx=clamp(x-px,0,W-1),ny=clamp(y-py,0,H-1),rx=clamp(x+w+px,nx+1,W),ry=clamp(y+h+py,ny+1,H);
    return{x:nx,y:ny,w:rx-nx,h:ry-ny};
  }

  function dominantTextBand(base){
    if(!base?.width||!base?.height||base.width/base.height<1.05||base.height<42)return null;
    const maxW=320,scale=Math.min(1,maxW/base.width),w=Math.max(32,Math.round(base.width*scale)),h=Math.max(20,Math.round(base.height*scale)),c=makeCanvas(w,h),ctx=c.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(base,0,0,w,h);
    const d=ctx.getImageData(0,0,w,h).data,gray=new Float32Array(w*h),row=new Float32Array(h);
    for(let i=0,p=0;i<gray.length;i++,p+=4)gray[i]=.299*d[p]+.587*d[p+1]+.114*d[p+2];
    for(let y=1;y<h-1;y++){
      let e=0;
      for(let x=1;x<w-1;x++){
        const i=y*w+x;
        e+=Math.abs(gray[i+1]-gray[i-1])+.28*Math.abs(gray[i+w]-gray[i-w]);
      }
      row[y]=e/Math.max(1,w-2);
    }
    const smooth=new Float32Array(h),rad=Math.max(1,Math.round(h*.012));
    for(let y=0;y<h;y++){let s=0,n=0;for(let k=Math.max(0,y-rad);k<=Math.min(h-1,y+rad);k++){s+=row[k];n++}smooth[y]=s/Math.max(1,n)}
    const pref=new Float64Array(h+1);for(let y=0;y<h;y++)pref[y+1]=pref[y]+smooth[y];
    const full=(pref[h]-pref[0])/h;let best=null;
    for(const frac of [.18,.24,.32,.42,.54,.68,.82]){
      const bh=Math.max(12,Math.round(h*frac)),step=Math.max(2,Math.round(bh*.12));
      for(let y=0;y+bh<=h;y+=step){
        const avg=(pref[y+bh]-pref[y])/bh,center=Math.abs((y+bh/2)/h-.46),score=avg-center*.7;
        if(!best||score>best.score)best={y,h:bh,score,avg,frac};
      }
    }
    if(!best||best.frac>.8||best.avg<full*1.12)return null;
    const pad=Math.round(best.h*.17),y0=clamp(best.y-pad,0,h-1),y1=clamp(best.y+best.h+pad,y0+1,h),inv=base.height/h;
    return{y:y0*inv,h:(y1-y0)*inv,edgeGain:best.avg/Math.max(.001,full)};
  }

  function cropForOCR(img,bbox){
    const good=safeBBox(img,bbox),fallback=!good,b=good||{x:img.width*.025,y:img.height*.06,w:img.width*.95,h:img.height*.84};
    const x=clamp(Number(b.x)||0,0,img.width-1),y=clamp(Number(b.y)||0,0,img.height-1),bw=clamp(Number(b.w)||img.width,1,img.width-x),bh=clamp(Number(b.h)||img.height,1,img.height-y);
    const base=makeCanvas(bw,bh),bctx=base.getContext('2d',{willReadFrequently:true});bctx.drawImage(img,x,y,bw,bh,0,0,base.width,base.height);
    const band=dominantTextBand(base),sy=band?band.y:0,sh=band?band.h:base.height;
    const targetW=1900,targetH=820,scale=Math.max(1,Math.min(4.2,targetW/base.width,targetH/sh)),margin=Math.max(14,Math.round(18*scale)),c=makeCanvas(base.width*scale+margin*2,sh*scale+margin*2),ctx=c.getContext('2d',{willReadFrequently:true});
    ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(base,0,sy,base.width,sh,margin,margin,base.width*scale,sh*scale);
    const im=ctx.getImageData(margin,margin,c.width-margin*2,c.height-margin*2),d=im.data;let mean=0,sum2=0,n=0;
    for(let i=0;i<d.length;i+=4){const g=.299*d[i]+.587*d[i+1]+.114*d[i+2];mean+=g;sum2+=g*g;n++}
    mean/=Math.max(1,n);const std=Math.sqrt(Math.max(0,sum2/Math.max(1,n)-mean*mean)),invert=mean<125,contrast=std<28?2.18:std<48?1.88:1.58;
    for(let i=0;i<d.length;i+=4){let g=.299*d[i]+.587*d[i+1]+.114*d[i+2];g=clamp((g-mean)*contrast+150,0,255);if(invert)g=255-g;d[i]=d[i+1]=d[i+2]=g}
    ctx.putImageData(im,margin,margin);
    return{canvas:c,fallback,darkBackground:invert,mean:Math.round(mean),std:Math.round(std),scale:+scale.toFixed(2),aspect:base.width/Math.max(1,sh),textBand:!!band,textBandGain:band?+band.edgeGain.toFixed(2):1};
  }

  async function ensure(onProgress){
    if(worker)return worker;if(workerPromise)return workerPromise;if(!window.Tesseract)throw new Error('Tesseract web OCR yüklenemedi');
    workerPromise=Tesseract.createWorker(['tur','eng'],1,{logger:m=>{if(typeof m.progress==='number')onProgress?.(Math.round(m.progress*100),m.status||'OCR hazırlanıyor')}},{load_system_dawg:'0',load_freq_dawg:'0'}).then(async w=>{
      await w.setParameters({preserve_interword_spaces:'1',user_defined_dpi:'300',tessedit_char_whitelist:TURKISH_ALPHABET,tessedit_pageseg_mode:'11'});worker=w;return w;
    }).catch(error=>{workerPromise=null;throw error});
    return workerPromise;
  }

  function wordBox(w){
    const b=w?.bbox||w?.box||{};const x0=Number(b.x0??b.x??0),y0=Number(b.y0??b.y??0),x1=Number(b.x1??((b.x??0)+(b.w??0))),y1=Number(b.y1??((b.y??0)+(b.h??0)));
    return{x0,y0,x1,y1,w:Math.max(0,x1-x0),h:Math.max(0,y1-y0),cx:(x0+x1)/2,cy:(y0+y1)/2};
  }
  function normalizeWord(w){const text=clean(w?.text),confidence=Number(w?.confidence)||0,b=wordBox(w);return{text,confidence,...b}}
  function collectWords(data){
    if(Array.isArray(data?.words)&&data.words.length)return data.words;
    const out=[];
    for(const block of (data?.blocks||[]))for(const p of (block?.paragraphs||[]))for(const line of (p?.lines||[]))for(const word of (line?.words||[]))out.push(word);
    return out;
  }
  function mergeLineWords(words){
    const sorted=[...words].sort((a,b)=>a.x0-b.x0),out=[];
    for(const w of sorted){
      if(!w.text)continue;const prev=out[out.length-1],shortCaps=/^[A-ZÇĞİÖŞÜ]{1,3}$/;
      if(prev&&shortCaps.test(prev.text)&&shortCaps.test(w.text)){
        const gap=w.x0-prev.x1,ref=Math.max(6,(prev.h+w.h)/2);
        if(gap>=-ref*.15&&gap<=ref*.95){prev.text+=w.text;prev.x1=w.x1;prev.w=prev.x1-prev.x0;prev.confidence=(prev.confidence+w.confidence)/2;continue}
      }
      out.push({...w});
    }
    return clean(out.map(x=>x.text).join(' '));
  }
  function dominantLines(data){
    const words=collectWords(data).map(normalizeWord).filter(w=>w.text&&w.confidence>=28&&(w.text.length>=2||/^\d{2,}$/.test(w.text))&&w.h>0&&w.w>0);
    if(!words.length)return{lines:[],text:'',wordConfidence:0,words:[]};
    const maxH=Math.max(...words.map(w=>w.h),1),minX=Math.min(...words.map(w=>w.x0)),maxX=Math.max(...words.map(w=>w.x1)),spanX=Math.max(1,maxX-minX),groups=[];
    for(const w of [...words].sort((a,b)=>a.cy-b.cy||a.x0-b.x0)){
      let best=null,bestD=Infinity;
      for(const g of groups){const d=Math.abs(w.cy-g.cy),tol=Math.max(9,Math.max(w.h,g.avgH)*.62);if(d<=tol&&d<bestD){best=g;bestD=d}}
      if(!best){groups.push({items:[w],cy:w.cy,avgH:w.h});continue}
      best.items.push(w);best.cy=best.items.reduce((s,x)=>s+x.cy,0)/best.items.length;best.avgH=best.items.reduce((s,x)=>s+x.h,0)/best.items.length;
    }
    const lines=groups.map(g=>{
      const items=[...g.items].sort((a,b)=>a.x0-b.x0),chars=items.reduce((s,x)=>s+x.text.replace(/\s/g,'').length,0),weight=items.reduce((s,x)=>s+Math.max(1,x.text.length),0),avgConf=weight?items.reduce((s,x)=>s+x.confidence*Math.max(1,x.text.length),0)/weight:0,maxLineH=Math.max(...items.map(x=>x.h),1),heightRatio=maxLineH/maxH,x0=Math.min(...items.map(x=>x.x0)),x1=Math.max(...items.map(x=>x.x1)),widthRatio=(x1-x0)/spanX,singles=items.filter(x=>x.text.length===1).length,text=mergeLineWords(items),score=avgConf*.50+heightRatio*76+Math.min(48,chars*3.2)+Math.min(20,widthRatio*20)-singles*8;
      return{items,text,avgConf,heightRatio,widthRatio,score,cy:g.cy,chars};
    }).filter(l=>l.text&&l.chars>=2).sort((a,b)=>b.score-a.score);
    if(!lines.length)return{lines:[],text:'',wordConfidence:0,words};
    const primary=lines[0],keep=[primary];
    for(const line of lines.slice(1)){if(keep.length>=2)break;if(line.score>=primary.score*.72&&line.heightRatio>=.48)keep.push(line)}
    keep.sort((a,b)=>a.cy-b.cy);const text=clean(keep.map(x=>x.text).join(' ')),all=keep.flatMap(x=>x.items),weight=all.reduce((s,x)=>s+Math.max(1,x.text.length),0),wordConfidence=weight?all.reduce((s,x)=>s+x.confidence*Math.max(1,x.text.length),0)/weight:0;
    return{lines,text,wordConfidence:Math.round(wordConfidence),words:all};
  }
  function textScore(s){const t=clean(s),tokens=t.split(/\s+/).filter(Boolean),long=tokens.filter(x=>x.replace(/[^A-Za-zÇĞİÖŞÜçğıöşü0-9]/g,'').length>=3),medium=tokens.filter(x=>x.length>=2),letters=(t.match(/[A-Za-zÇĞİÖŞÜçğıöşü]/g)||[]).length,singles=tokens.filter(x=>x.length===1).length;return long.length*12+medium.length*4+Math.min(32,letters*2)-singles*7}
  function plausibility(text,confidence=0){
    const t=clean(text),tokens=t.split(/\s+/).filter(Boolean),letters=(t.match(/[A-Za-zÇĞİÖŞÜçğıöşü]/g)||[]).length,long=tokens.filter(x=>x.replace(/[^A-Za-zÇĞİÖŞÜçğıöşü0-9]/g,'').length>=3).length,medium=tokens.filter(x=>x.length>=2).length,singles=tokens.filter(x=>x.length===1).length;
    let score=Math.min(30,letters*2)+Math.min(22,Number(confidence||0)*.22)+long*18+Math.max(0,medium-long)*5-singles*9;
    if(tokens.length&&singles/tokens.length>.55)score-=18;if(!long&&medium<2)score-=18;if(letters<3)score-=18;
    return{score:Math.round(score),accepted:score>=42&&letters>=3};
  }
  function chooseText(data){
    const raw=clean(data?.text),dominant=dominantLines(data),dominantText=dominant.text,text=dominantText&&textScore(dominantText)>=8?dominantText:raw;
    return{text:clean(text),wordConfidence:dominant.wordConfidence||0,words:dominant.words.slice(0,12),lines:dominant.lines.slice(0,4)};
  }

  function nativeRecognize(roi,timeoutMs,onProgress){
    return new Promise((resolve,reject)=>{
      if(!nativeIOS())return reject(new Error('native_ocr_unavailable'));
      const requestId='ocr-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);let settled=false,timer;
      const done=(fn,value)=>{if(settled)return;settled=true;clearTimeout(timer);window.removeEventListener('tabela:native-ocr',listener);fn(value)};
      const listener=e=>{const d=e.detail||{};if(d.requestId!==requestId)return;if(d.error)return done(reject,new Error(d.error));done(resolve,d)};
      window.addEventListener('tabela:native-ocr',listener);timer=setTimeout(()=>done(reject,new Error('fast_ocr_timeout')),timeoutMs);
      try{onProgress?.(15,'Apple Vision • Türkçe OCR');window.webkit.messageHandlers.tabelaOCR.postMessage({requestId,dataUrl:roi.toDataURL('image/jpeg',.95)})}catch(error){done(reject,error)}
    });
  }
  async function prewarm(onProgress){if(nativeIOS()){onProgress?.(100,'Apple Vision Türkçe OCR hazır');return true}try{await ensure(onProgress);return true}catch(error){console.warn('Türkçe OCR hazırlanamadı',error);return false}}
  function ready(){return nativeIOS()||!!worker}

  async function run(data,shape,onProgress,timeoutMs=TARGET_MS){
    const started=performance.now(),img=await load(data),prep=cropForOCR(img,shape?.bbox),roi=prep.canvas;
    if(nativeIOS()){
      try{
        const r=await nativeRecognize(roi,timeoutMs,onProgress),lines=Array.isArray(r?.lines)?r.lines:[],text=clean(r?.text||lines.map(x=>x.text).filter(Boolean).join(' ')||''),raw=Math.round(clamp(Number(lines[0]?.confidence)||0,0,100)),pl=plausibility(text,raw),elapsed=Math.round(performance.now()-started),confidence=Math.round(clamp(raw+(text.length>=4?3:0),0,99)),validated=!!(pl.accepted&&raw>=82);
        onProgress?.(100,`Apple Vision • ${elapsed} ms`);
        return{text:pl.accepted?text:'',candidateText:text,confidence,rawConfidence:raw,accepted:pl.accepted,plausibilityScore:pl.score,validated,consensus:1,consensusFrames:1,candidates:lines.slice(0,8).map(x=>({text:clean(x.text),confidence:Math.round(Number(x.confidence)||0),engine:'apple-vision-tr'})).filter(x=>x.text),singlePass:true,language:'tr-TR+en-US',alphabet:'TR+Latin',engine:'apple-vision',elapsedMs:elapsed,targetMs:TARGET_MS,targetMet:elapsed<=TARGET_MS,roiFallback:prep.fallback,roiEnhanced:true,textBand:prep.textBand,textBandGain:prep.textBandGain,validationMode:validated?'native-single-high-confidence':pl.accepted?'native-single-user-check':'native-rejected-noise',version:VERSION};
      }catch(error){if(error?.message==='fast_ocr_timeout'){const elapsed=Math.round(performance.now()-started);return{text:'',candidateText:'',confidence:0,rawConfidence:0,accepted:false,validated:false,timedOut:true,singlePass:true,engine:'apple-vision',elapsedMs:elapsed,targetMs:TARGET_MS,targetMet:false,version:VERSION}}console.warn('Apple Vision OCR başarısız, web OCR yedeğine geçiliyor',error)}
    }
    const w=await ensure(onProgress),psm=shape?.manualOcrRoi&&prep.aspect>=2.0?'7':'11';
    await w.setParameters({tessedit_pageseg_mode:psm,preserve_interword_spaces:'1',user_defined_dpi:'300',tessedit_char_whitelist:TURKISH_ALPHABET});
    onProgress?.(12,prep.textBand?'Türkçe OCR • ana yazı bandı seçildi':'Türkçe OCR • tabela alanı');let timer;
    try{
      const recognition=w.recognize(roi,{rotateAuto:true},{text:true,blocks:true}),timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('fast_ocr_timeout')),timeoutMs)}),r=await Promise.race([recognition,timeout]);clearTimeout(timer);
      const selected=chooseText(r?.data||{}),candidate=selected.text,rawOverall=Math.round(clamp(Number(r?.data?.confidence)||0,0,100)),raw=Math.max(rawOverall,selected.wordConfidence||0),pl=plausibility(candidate,raw),text=pl.accepted?candidate:'',elapsed=Math.round(performance.now()-started),confidence=Math.round(clamp(raw+(text.length>=4?4:0),0,98)),validated=!!(pl.accepted&&raw>=78);
      onProgress?.(100,`Tek Türkçe OCR • ${elapsed} ms`);
      return{text,candidateText:candidate,confidence,rawConfidence:raw,accepted:pl.accepted,plausibilityScore:pl.score,validated,consensus:1,consensusFrames:1,candidates:candidate?[{text:candidate,confidence:raw,engine:'tesseract-dominant-line'},...selected.words.slice(0,6).map(x=>({text:x.text,confidence:Math.round(x.confidence),engine:'tesseract-word'}))]:[],singlePass:true,language:'tur+eng',alphabet:'TR+Latin',engine:'tesseract',elapsedMs:elapsed,targetMs:TARGET_MS,targetMet:elapsed<=TARGET_MS,roiFallback:prep.fallback,roiEnhanced:true,darkBackground:prep.darkBackground,roiScale:prep.scale,textBand:prep.textBand,textBandGain:prep.textBandGain,psm,dominantLineSelection:true,validationMode:validated?'single-pass-high-confidence':pl.accepted?'single-pass-user-check':'single-pass-rejected-noise',version:VERSION};
    }catch(error){
      clearTimeout(timer);const elapsed=Math.round(performance.now()-started);
      if(error?.message==='fast_ocr_timeout'){try{await w.terminate()}catch{}worker=null;workerPromise=null;onProgress?.(100,'OCR 3 sn hedefini aştı • manuel kontrol');return{text:'',candidateText:'',confidence:0,rawConfidence:0,accepted:false,validated:false,timedOut:true,singlePass:true,engine:'tesseract',elapsedMs:elapsed,targetMs:TARGET_MS,targetMet:false,version:VERSION}}
      throw error;
    }
  }

  const legacy=window.TabelaOCR||{};
  window.TabelaOCR={...legacy,legacyPrewarm:legacy.prewarm,fastRun:run,prewarm,fastReady:ready,fastTargetMs:TARGET_MS,turkishAlphabet:TURKISH_ALPHABET,version:VERSION};
  window.TabelaFastOCR={run,prewarm,ready,targetMs:TARGET_MS,alphabet:TURKISH_ALPHABET,version:VERSION,__test:{chooseText,dominantLines,mergeLineWords,collectWords,plausibility,clean}};
})();