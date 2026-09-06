(() => {
  let worker = null;

  const $ = id => document.getElementById(id);
  const loadImage = src => new Promise((resolve, reject) => {
    const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = src;
  });
  const makeCanvas = (w,h) => { const c=document.createElement('canvas'); c.width=Math.max(1,Math.round(w)); c.height=Math.max(1,Math.round(h)); return c; };

  function crop(source,x,y,w,h,scale=2){
    const c=makeCanvas(w*scale,h*scale),ctx=c.getContext('2d');
    ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality='high';
    ctx.drawImage(source,x,y,w,h,0,0,c.width,c.height); return c;
  }

  function enhance(source,contrast=2,threshold=null){
    const c=makeCanvas(source.width,source.height),ctx=c.getContext('2d'); ctx.drawImage(source,0,0);
    const im=ctx.getImageData(0,0,c.width,c.height),d=im.data; let mean=0;
    for(let i=0;i<d.length;i+=4) mean+=.299*d[i]+.587*d[i+1]+.114*d[i+2]; mean/=Math.max(1,d.length/4);
    for(let i=0;i<d.length;i+=4){let g=.299*d[i]+.587*d[i+1]+.114*d[i+2];g=Math.max(0,Math.min(255,(g-mean)*contrast+128));if(threshold!==null)g=g>threshold?255:0;d[i]=d[i+1]=d[i+2]=g;}
    ctx.putImageData(im,0,0); return c;
  }

  function cleanText(s){return (s||'').replace(/[|_~`^]+/g,' ').replace(/[“”]/g,'"').replace(/\s+/g,' ').replace(/^[^A-Za-zÇĞİÖŞÜçğıöşü0-9]+|[^A-Za-zÇĞİÖŞÜçğıöşü0-9]+$/g,'').trim();}
  function normalizeSpaced(text){const t=cleanText(text),a=t.split(/\s+/).filter(Boolean);if(a.length>=3&&a.filter(x=>/^[A-Za-zÇĞİÖŞÜçğıöşü0-9]{1,2}$/.test(x)).length/a.length>=.75&&a.join('').length<=30)return a.join('');return t;}
  function key(text){return normalizeSpaced(text).toLocaleUpperCase('tr-TR').replace(/[^A-ZÇĞİÖŞÜ0-9]/g,'');}
  function quality(text,conf){const t=normalizeSpaced(text),k=key(t);if(k.length<3)return-999;let s=Number(conf||0);if(k.length>=4&&k.length<=26)s+=18;if(t.split(/\s+/).length<=4)s+=7;if(/^[A-ZÇĞİÖŞÜ0-9&+\- ]{4,30}$/.test(t.toLocaleUpperCase('tr-TR')))s+=8;return s;}

  async function getWorker(onProgress){
    if(worker)return worker;
    if(!window.Tesseract)throw new Error('OCR motoru yüklenemedi. İnternet bağlantısını kontrol edin.');
    worker=await Tesseract.createWorker('tur+eng',1,{logger:m=>{if(m&&typeof m.progress==='number'&&onProgress)onProgress(Math.round(m.progress*100),m.status||'');}});
    return worker;
  }

  async function recognize(w,canvas,psm){
    await w.setParameters({tessedit_pageseg_mode:String(psm),preserve_interword_spaces:'1',user_defined_dpi:'300',tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZÇĞİÖŞÜabcdefghijklmnopqrstuvwxyzçğıöşü0123456789&+-./ '});
    const r=await w.recognize(canvas),raw=cleanText(r?.data?.text||''),text=normalizeSpaced(raw),confidence=Number(r?.data?.confidence||0);
    return{text,raw,confidence,score:quality(text,confidence)};
  }

  function guideAlignedROI(img){
    const camera=document.querySelector('.camera'),guide=document.querySelector('.cross');
    if(!camera||!guide)return{x:img.width*.11,y:img.height*.30,w:img.width*.78,h:img.height*.40};
    const cr=camera.getBoundingClientRect(),gr=guide.getBoundingClientRect();
    if(!cr.width||!cr.height||!gr.width||!gr.height)return{x:img.width*.11,y:img.height*.30,w:img.width*.78,h:img.height*.40};
    const scale=Math.max(cr.width/img.width,cr.height/img.height),renderedW=img.width*scale,renderedH=img.height*scale,cropX=(renderedW-cr.width)/2,cropY=(renderedH-cr.height)/2;
    let x=(gr.left-cr.left+cropX)/scale,y=(gr.top-cr.top+cropY)/scale,w=gr.width/scale,h=gr.height/scale;
    x=Math.max(0,Math.min(img.width-1,x));y=Math.max(0,Math.min(img.height-1,y));w=Math.max(1,Math.min(img.width-x,w));h=Math.max(1,Math.min(img.height-y,h));return{x,y,w,h};
  }

  function detectTextBand(signCanvas){
    const maxW=900,scale=Math.min(1,maxW/signCanvas.width),w=Math.max(120,Math.round(signCanvas.width*scale)),h=Math.max(80,Math.round(signCanvas.height*scale));
    const c=makeCanvas(w,h),ctx=c.getContext('2d');ctx.drawImage(signCanvas,0,0,w,h);const im=ctx.getImageData(0,0,w,h),d=im.data,gray=new Float32Array(w*h);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;gray[y*w+x]=.299*d[i]+.587*d[i+1]+.114*d[i+2];}
    const row=new Float32Array(h);
    for(let y=1;y<h-1;y++){let sum=0;for(let x=1;x<w;x++){sum+=Math.abs(gray[y*w+x]-gray[y*w+x-1]);}row[y]=sum/(w-1);}
    const sm=new Float32Array(h);for(let y=0;y<h;y++){let s=0,n=0;for(let k=-3;k<=3;k++){const yy=y+k;if(yy>=0&&yy<h){s+=row[yy];n++;}}sm[y]=s/n;}
    let best={score:-1,y:Math.round(h*.25),hh:Math.round(h*.5)};
    for(const frac of [.22,.28,.34,.40,.48,.56]){const bh=Math.max(16,Math.round(h*frac));for(let y=Math.round(h*.04);y+bh<Math.round(h*.96);y+=Math.max(2,Math.round(h*.02))){let s=0;for(let yy=y;yy<y+bh;yy++)s+=sm[yy];s/=bh;const center=1-Math.min(1,Math.abs((y+bh/2)-h/2)/(h/2));s*=.82+.18*center;if(s>best.score)best={score:s,y,hh:bh};}}
    const pad=Math.round(best.hh*.12),y0=Math.max(0,best.y-pad),y1=Math.min(h,best.y+best.hh+pad);
    return{y:y0/h,h:(y1-y0)/h,edgeScore:best.score};
  }

  function setStage(text,kind='warn'){
    const b=$('detectBadge'); if(b){b.textContent=text;b.className='badge '+kind;}
  }

  async function run(photoData,onProgress){
    const img=await loadImage(photoData); onProgress?.(4,'1/4 tabela alanı'); setStage('Tabela alanı analiz ediliyor','warn');
    const gr=guideAlignedROI(img),sign=crop(img,gr.x,gr.y,gr.w,gr.h,1.7); onProgress?.(12,'1/4 tabela bulundu'); setStage('Tabela alanı bulundu','ok');

    const band=detectTextBand(sign); onProgress?.(20,'2/4 yazı bandı bulundu');
    const y=band.y*sign.height,hh=band.h*sign.height,textBand=crop(sign,0,y,sign.width,hh,2.1); setStage('Tabela + yazı bandı bulundu','ok');

    const w=await getWorker((p,s)=>{if(p<100)onProgress?.(20+Math.round(p*.18),'OCR motoru '+s);});
    const variants=[
      {canvas:textBand,psm:7,label:'orijinal'},
      {canvas:enhance(textBand,2.05,null),psm:7,label:'kontrast'},
      {canvas:enhance(textBand,2.2,145),psm:7,label:'eşik'}
    ];
    const results=[];
    for(let i=0;i<variants.length;i++){
      onProgress?.(40+i*18,`3/4 OCR ${i+1}/${variants.length}`);const out=await recognize(w,variants[i].canvas,variants[i].psm);if(key(out.text).length>=3)results.push(out);
      if(out.confidence>=90&&key(out.text).length>=4&&key(out.text).length<=26){onProgress?.(100,'4/4 hızlı doğrulandı');return{text:out.text,confidence:Math.round(out.confidence),consensus:1,candidates:[out],roiDataUrl:textBand.toDataURL('image/jpeg',.94),signDataUrl:sign.toDataURL('image/jpeg',.92),textBand:band,version:'7.0-staged'};}
      if(results.length>=2){const a=key(results[results.length-1].text),b=key(results[results.length-2].text);if(a&&a===b){const best=results.slice(-2).sort((x,y)=>y.score-x.score)[0];onProgress?.(100,'4/4 iki sonuç uyuştu');return{text:best.text,confidence:Math.max(82,Math.round(best.confidence)),consensus:2,candidates:results.slice().sort((x,y)=>y.score-x.score),roiDataUrl:textBand.toDataURL('image/jpeg',.94),signDataUrl:sign.toDataURL('image/jpeg',.92),textBand:band,version:'7.0-staged'};}}
    }
    results.sort((a,b)=>b.score-a.score);const chosen=results[0]||{text:'',confidence:0};onProgress?.(100,'4/4 tamamlandı');
    return{text:chosen.text,confidence:Math.max(0,Math.min(100,Math.round(chosen.confidence||0))),consensus:1,candidates:results.slice(0,3),roiDataUrl:textBand.toDataURL('image/jpeg',.94),signDataUrl:sign.toDataURL('image/jpeg',.92),textBand:band,version:'7.0-staged'};
  }

  window.addEventListener('DOMContentLoaded',()=>{
    const guide=document.querySelector('.cross');if(guide){guide.style.width='78%';guide.style.height='40%';guide.style.borderWidth='3px';}
    const label=document.querySelector('.guide');if(label)label.textContent='ÖNCE TABELAYI YEŞİL ÇERÇEVEYE AL';
    const width=$('width'),height=$('height');if(width){width.readOnly=true;width.inputMode='none';}if(height){height.readOnly=true;height.inputMode='none';}
    setTimeout(()=>getWorker(()=>{}).catch(()=>{}),900);
  });

  window.TabelaMetricBridge={applyMeasurement(m){if(!m||m.verified!==true)return false;const width=$('width'),height=$('height'),area=$('areaText'),distance=$('distanceText'),badge=$('measureBadge');if(width)width.value=Number(m.width_m).toFixed(3);if(height)height.value=Number(m.height_m).toFixed(3);if(area)area.textContent=(Number(m.width_m)*Number(m.height_m)).toFixed(3)+' m²';if(distance&&Number.isFinite(Number(m.distance_m)))distance.textContent=Number(m.distance_m).toFixed(2)+' m';if(badge){badge.textContent='Ölçüm doğrulandı • '+(m.source||'sensör');badge.className='badge ok';}return true;}};
  window.TabelaOCR={run,version:'7.0-staged'};
})();