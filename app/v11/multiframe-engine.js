(() => {
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  function snap(video,quality=.92){const c=document.createElement('canvas');c.width=video.videoWidth;c.height=video.videoHeight;c.getContext('2d').drawImage(video,0,0);return c.toDataURL('image/jpeg',quality)}
  async function capture(video,count=5,interval=110){const frames=[];for(let i=0;i<count;i++){const data=snap(video);let q=null;try{q=await window.TabelaQuality?.analyze?.(data,null)}catch{}frames.push({data,quality:q,index:i});if(i<count-1)await sleep(interval)}frames.sort((a,b)=>(b.quality?.score||0)-(a.quality?.score||0));return{frames,best:frames[0]||null,version:'11.0'}}
  async function analyzeTop(frames,limit=3){const out=[];for(const f of (frames||[]).slice(0,limit)){try{const seg=await window.TabelaSegmentation.detect(f.data);const q=await window.TabelaQuality.analyze(f.data,seg.bbox);out.push({...f,seg,quality:q})}catch(e){out.push({...f,error:e.message})}}out.sort((a,b)=>(b.quality?.score||0)-(a.quality?.score||0));return out}
  window.TabelaMultiFrame={capture,analyzeTop,version:'11.0'};
})();