(() => {
  const norm=s=>(s||'').toLocaleUpperCase('tr-TR').replace(/[^A-ZÇĞİÖŞÜ0-9]/g,'');
  function sim(a,b){a=norm(a);b=norm(b);if(!a||!b)return 0;const d=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){let p=d[0];d[0]=i;for(let j=1;j<=b.length;j++){const t=d[j];d[j]=Math.min(d[j]+1,d[j-1]+1,p+(a[i-1]===b[j-1]?0:1));p=t}}return 1-d[b.length]/Math.max(a.length,b.length)}

  function nativeAvailable(){
    return !!(window.webkit?.messageHandlers?.tabelaOCR || window.TabelaAndroidOCR?.recognize);
  }

  function nativeRun(dataUrl,timeoutMs=5500){
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

  function chooseNative(nativeResult,webResults){
    if(!nativeResult||nativeResult.error)return null;
    const lines=(nativeResult.lines||[]).map(x=>typeof x==='string'?{text:x}:x).filter(x=>norm(x.text).length>=2);
    if(!lines.length&&nativeResult.text)lines.push({text:nativeResult.text});
    if(!lines.length)return null;
    let best=lines[0],bestSim=0;
    for(const line of lines){
      for(const w of webResults){
        const s=sim(line.text,w.text);
        if(s>bestSim){bestSim=s;best=line}
      }
    }
    return{text:best.text,confidence:Number(best.confidence||0),validated:false,engine:nativeResult.engine||'native',nativeSimilarity:bestSim,lines};
  }

  async function run(frames,shape,onProgress){
    const chosen=(frames||[]).slice(0,2),webResults=[];
    if(!chosen.length)throw new Error('OCR için kare yok');
    for(let i=0;i<chosen.length;i++){
      onProgress?.(Math.round(i/chosen.length*72),`Web OCR kare ${i+1}/${chosen.length}`);
      const r=await window.TabelaOCR.run(chosen[i].data||chosen[i],shape,(p,s)=>onProgress?.(Math.min(72,Math.round((i+p/100)/chosen.length*72)),s));
      webResults.push({...r,engine:'tesseract-web'});
    }

    let nativeCandidate=null;
    if(nativeAvailable()){
      onProgress?.(76,'Native OCR kontrolü');
      const nativeResult=await nativeRun(chosen[0].data||chosen[0]);
      nativeCandidate=chooseNative(nativeResult,webResults);
    }

    let best=webResults.slice().sort((a,b)=>(b.confidence||0)-(a.confidence||0))[0];
    let consensusFrames=1,nativeConsensus=false,bestNativeSim=0;

    if(webResults.length>1){
      const s=sim(webResults[0].text,webResults[1].text);
      if(s>=.94){consensusFrames=2;best={...best,validated:true,confidence:100,ensembleSimilarity:s,validationMode:'web-multiframe'}}
      else if(s>=.82){best={...best,confidence:Math.max(best.confidence||0,92),ensembleSimilarity:s}}
    }

    if(nativeCandidate){
      let matchedWeb=null;
      for(const w of webResults){const s=sim(nativeCandidate.text,w.text);if(s>bestNativeSim){bestNativeSim=s;matchedWeb=w}}
      if(matchedWeb&&bestNativeSim>=.97&&Number(matchedWeb.confidence||0)>=90){
        nativeConsensus=true;
        best={...matchedWeb,text:matchedWeb.text,validated:true,confidence:100,nativeEngine:nativeCandidate.engine,nativeText:nativeCandidate.text,nativeSimilarity:bestNativeSim,validationMode:'native+web'};
      }else if(matchedWeb&&bestNativeSim>=.86){
        best={...best,nativeEngine:nativeCandidate.engine,nativeText:nativeCandidate.text,nativeSimilarity:bestNativeSim,confidence:Math.max(Number(best.confidence||0),94)};
      }
    }

    const candidates=[];
    const pushCandidate=c=>{if(c?.text&&!candidates.some(x=>norm(x.text)===norm(c.text)))candidates.push(c)};
    for(const r of webResults)for(const c of r.candidates||[])pushCandidate({...c,engine:'tesseract-web'});
    if(nativeCandidate){pushCandidate({text:nativeCandidate.text,confidence:nativeCandidate.confidence,engine:nativeCandidate.engine});for(const l of nativeCandidate.lines||[])pushCandidate({text:l.text,confidence:l.confidence||0,engine:nativeCandidate.engine})}

    onProgress?.(100,best.validated?(nativeConsensus?'native + web doğrulandı':'çoklu-kare doğrulandı'):'kullanıcı kontrolü');
    return{
      ...best,
      consensusFrames,
      nativeConsensus,
      nativeEngine:nativeCandidate?.engine||best.nativeEngine||null,
      nativeText:nativeCandidate?.text||best.nativeText||null,
      nativeSimilarity:nativeCandidate?bestNativeSim:(best.nativeSimilarity||0),
      frameResults:webResults.map(r=>({text:r.text,confidence:r.confidence,validated:r.validated,engine:r.engine})),
      candidates:candidates.slice(0,10),
      version:'11.1-native-ensemble'
    };
  }
  window.TabelaOCREnsemble={run,sim,nativeAvailable,version:'11.1'};
})();