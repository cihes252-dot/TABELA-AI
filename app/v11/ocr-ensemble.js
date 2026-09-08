(() => {
  const norm=s=>(s||'').toLocaleUpperCase('tr-TR').replace(/[^A-ZÇĞİÖŞÜ0-9]/g,'');
  function sim(a,b){a=norm(a);b=norm(b);if(!a||!b)return 0;const d=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){let p=d[0];d[0]=i;for(let j=1;j<=b.length;j++){const t=d[j];d[j]=Math.min(d[j]+1,d[j-1]+1,p+(a[i-1]===b[j-1]?0:1));p=t}}return 1-d[b.length]/Math.max(a.length,b.length)}
  const clamp=(n,min=0,max=100)=>Math.max(min,Math.min(max,Number(n)||0));

  function nativeAvailable(){
    return !!(window.webkit?.messageHandlers?.tabelaOCR || window.TabelaAndroidOCR?.recognize);
  }

  function webAvailable(){
    return !!(window.Tesseract && window.TabelaOCR?.run);
  }

  function nativeRun(dataUrl,timeoutMs=6500){
    if(!nativeAvailable()||!dataUrl)return Promise.resolve(null);
    const requestId='ocr-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7);
    return new Promise(resolve=>{
      let done=false;
      const finish=v=>{if(done)return;done=true;window.removeEventListener('tabela:native-ocr',listener);clearTimeout(timer);resolve(v)};
      const listener=e=>{const d=e?.detail;if(d?.requestId===requestId)finish(d)};
      window.addEventListener('tabela:native-ocr',listener);
      const timer=setTimeout(()=>finish(null),timeoutMs);
      try{
        if(window.webkit?.messageHandlers?.tabelaOCR){
          window.webkit.messageHandlers.tabelaOCR.postMessage({requestId,dataUrl});
        }else if(window.TabelaAndroidOCR?.recognize){
          window.TabelaAndroidOCR.recognize(dataUrl,requestId);
        }else finish(null);
      }catch{finish(null)}
    });
  }

  function nativeLines(result){
    if(!result||result.error)return[];
    const lines=(result.lines||[]).map(x=>typeof x==='string'?{text:x,confidence:0}:x)
      .filter(x=>norm(x?.text).length>=2)
      .map(x=>({text:String(x.text||'').trim(),confidence:clamp(x.confidence),engine:result.engine||'native'}));
    if(!lines.length&&norm(result.text).length>=2)lines.push({text:String(result.text).trim(),confidence:0,engine:result.engine||'native'});
    lines.sort((a,b)=>(b.confidence-a.confidence)||(norm(b.text).length-norm(a.text).length));
    return lines;
  }

  function bestNativePair(nativeResults){
    let best=null;
    for(let i=0;i<nativeResults.length;i++){
      const a=nativeLines(nativeResults[i]);
      for(let j=i+1;j<nativeResults.length;j++){
        const b=nativeLines(nativeResults[j]);
        for(const x of a.slice(0,8))for(const y of b.slice(0,8)){
          const similarity=sim(x.text,y.text);
          const score=similarity*100+Math.min(x.confidence,y.confidence)*0.08+Math.min(norm(x.text).length,norm(y.text).length)*0.05;
          if(!best||score>best.score)best={a:x,b:y,similarity,score};
        }
      }
    }
    return best;
  }

  function chooseNativeAgainstWeb(nativeResults,webResults){
    let best=null;
    for(const nr of nativeResults){for(const line of nativeLines(nr)){for(const w of webResults){const similarity=sim(line.text,w.text);if(!best||similarity>best.similarity)best={line,web:w,similarity}}}}
    return best;
  }

  async function collectNative(chosen,onProgress){
    const out=[];
    if(!nativeAvailable())return out;
    for(let i=0;i<chosen.length;i++){
      onProgress?.(Math.round((i/chosen.length)*34),`Native OCR kare ${i+1}/${chosen.length}`);
      const r=await nativeRun(chosen[i].data||chosen[i]);
      if(r&&!r.error&&nativeLines(r).length)out.push(r);
    }
    return out;
  }

  async function collectWeb(chosen,shape,onProgress){
    const out=[];
    if(!webAvailable())return out;
    for(let i=0;i<chosen.length;i++){
      try{
        onProgress?.(40+Math.round((i/chosen.length)*40),`Web OCR kare ${i+1}/${chosen.length}`);
        const r=await window.TabelaOCR.run(chosen[i].data||chosen[i],shape,(p,s)=>onProgress?.(Math.min(80,40+Math.round((i+p/100)/chosen.length*40)),s));
        if(r&&norm(r.text).length)out.push({...r,engine:'tesseract-web'});
      }catch(error){
        console.warn('Web OCR atlandı',error);
      }
    }
    return out;
  }

  function nativeOnlyResult(nativeResults){
    const pair=bestNativePair(nativeResults);
    const allLines=nativeResults.flatMap(nativeLines);
    if(!allLines.length)return null;
    let best=allLines[0],confidence=Math.round(clamp(best.confidence));
    const stable=!!(pair&&pair.similarity>=.97);
    if(pair){
      best=(pair.a.confidence>=pair.b.confidence?pair.a:pair.b);
      if(pair.similarity>=.97)confidence=Math.max(confidence,98);
      else if(pair.similarity>=.88)confidence=Math.max(confidence,94);
      else if(pair.similarity>=.80)confidence=Math.max(confidence,88);
    }
    if(!confidence)confidence=pair?Math.round(70+pair.similarity*20):70;
    return{
      text:best.text,
      confidence:Math.round(clamp(confidence,0,98)),
      rawConfidence:Math.round(clamp(best.confidence)),
      validated:false,
      consensusFrames:stable?2:1,
      nativeConsensus:stable,
      nativeEngine:best.engine,
      nativeText:best.text,
      nativeSimilarity:pair?.similarity||0,
      validationMode:stable?'native-multiframe-stable':'native-only-user-check',
      frameResults:nativeResults.map((r,i)=>({frame:i+1,text:nativeLines(r)[0]?.text||'',confidence:nativeLines(r)[0]?.confidence||0,engine:r.engine||'native'})),
      candidates:allLines.filter((x,i,a)=>a.findIndex(y=>norm(y.text)===norm(x.text))===i).slice(0,10),
      version:'11.1-independent-verify'
    };
  }

  function manualFallback(){
    return{
      text:'',
      confidence:0,
      rawConfidence:0,
      validated:false,
      consensusFrames:0,
      nativeConsensus:false,
      nativeEngine:null,
      nativeText:null,
      nativeSimilarity:0,
      validationMode:'manual-required-no-ocr-engine',
      frameResults:[],
      candidates:[],
      unavailable:true,
      version:'11.1.2-resilient-ocr'
    };
  }

  async function run(frames,shape,onProgress){
    const chosen=(frames||[]).slice(0,2);
    if(!chosen.length)throw new Error('OCR için kare yok');

    const nativeResults=await collectNative(chosen,onProgress);
    const webResults=await collectWeb(chosen,shape,onProgress);

    if(!webResults.length){
      const nativeOnly=nativeOnlyResult(nativeResults);
      if(nativeOnly){onProgress?.(100,nativeOnly.nativeConsensus?'native OCR kararlı • ikinci motor doğrulaması gerekli':'native OCR • kullanıcı kontrolü');return nativeOnly}
      const fallback=manualFallback();
      onProgress?.(100,'OCR motoru çevrimdışı • metni manuel girin');
      return fallback;
    }

    let best=webResults.slice().sort((a,b)=>(b.confidence||0)-(a.confidence||0))[0];
    let consensusFrames=1,nativeConsensus=false,bestNativeSim=0;

    if(webResults.length>1){
      const s=sim(webResults[0].text,webResults[1].text);
      if(s>=.94){
        consensusFrames=2;
        best={...best,validated:false,confidence:Math.min(97,Math.max(Number(best.confidence||0),97)),ensembleSimilarity:s,validationMode:'web-multiframe-stable'};
      }else if(s>=.82){
        best={...best,validated:false,confidence:Math.min(94,Math.max(Number(best.confidence||0),92)),ensembleSimilarity:s};
      }
    }

    const nativeMatch=chooseNativeAgainstWeb(nativeResults,webResults);
    if(nativeMatch){
      bestNativeSim=nativeMatch.similarity;
      if(bestNativeSim>=.97&&Number(nativeMatch.web.confidence||0)>=90){
        nativeConsensus=true;
        best={...nativeMatch.web,text:nativeMatch.web.text,validated:true,confidence:100,nativeEngine:nativeMatch.line.engine,nativeText:nativeMatch.line.text,nativeSimilarity:bestNativeSim,validationMode:'native+web-independent'};
      }else if(bestNativeSim>=.86){
        best={...best,validated:false,nativeEngine:nativeMatch.line.engine,nativeText:nativeMatch.line.text,nativeSimilarity:bestNativeSim,confidence:Math.min(98,Math.max(Number(best.confidence||0),94))};
      }
    }

    const nativePair=bestNativePair(nativeResults);
    if(!best.validated&&nativePair?.similarity>=.97){
      const line=nativePair.a.confidence>=nativePair.b.confidence?nativePair.a:nativePair.b;
      if(Number(best.confidence||0)<90){best={...best,text:line.text}}
      best={...best,validated:false,confidence:Math.min(98,Math.max(Number(best.confidence||0),98)),nativeEngine:line.engine,nativeText:line.text,nativeSimilarity:nativePair.similarity,validationMode:'native-multiframe-stable'};
      nativeConsensus=true;
      consensusFrames=Math.max(consensusFrames,2);
    }

    const candidates=[];
    const pushCandidate=c=>{if(c?.text&&!candidates.some(x=>norm(x.text)===norm(c.text)))candidates.push(c)};
    for(const r of webResults){pushCandidate({text:r.text,confidence:r.confidence,engine:r.engine});for(const c of r.candidates||[])pushCandidate({...c,engine:'tesseract-web'})}
    for(const nr of nativeResults)for(const line of nativeLines(nr))pushCandidate(line);

    onProgress?.(100,best.validated?'bağımsız OCR doğrulaması tamam':'OCR sonucu • kullanıcı kontrolü');
    return{
      ...best,
      consensusFrames,
      nativeConsensus,
      nativeEngine:best.nativeEngine||nativeLines(nativeResults[0])[0]?.engine||null,
      nativeText:best.nativeText||nativeLines(nativeResults[0])[0]?.text||null,
      nativeSimilarity:best.nativeSimilarity||bestNativeSim||0,
      frameResults:webResults.map(r=>({text:r.text,confidence:r.confidence,validated:r.validated,engine:r.engine})),
      candidates:candidates.slice(0,10),
      version:'11.1.2-resilient-ocr'
    };
  }

  window.TabelaOCREnsemble={run,sim,nativeAvailable,webAvailable,version:'11.1.2-resilient-ocr'};
})();
