(() => {
  const norm=s=>(s||'').toLocaleUpperCase('tr-TR').replace(/[^A-ZÇĞİÖŞÜ0-9]/g,'');
  function lev(a,b){a=a||'';b=b||'';const d=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){let prev=d[0];d[0]=i;for(let j=1;j<=b.length;j++){const tmp=d[j];d[j]=Math.min(d[j]+1,d[j-1]+1,prev+(a[i-1]===b[j-1]?0:1));prev=tmp}}return d[b.length]}
  const similarity=(a,b)=>{a=norm(a);b=norm(b);if(!a||!b)return 0;return 1-lev(a,b)/Math.max(a.length,b.length)};
  function distance(a,b){if(!a||!b||!Number.isFinite(a.lat)||!Number.isFinite(b.lat))return Infinity;const R=6371000,p=Math.PI/180,dlat=(b.lat-a.lat)*p,dlon=(b.lng-a.lng)*p,aa=Math.sin(dlat/2)**2+Math.cos(a.lat*p)*Math.cos(b.lat*p)*Math.sin(dlon/2)**2;return 2*R*Math.atan2(Math.sqrt(aa),Math.sqrt(1-aa))}
  function analyze(candidate,records){let best=null;for(const r of records||[]){const meters=distance(candidate.gps,r.gps),text=similarity(candidate.ocr,r.ocr),shape=candidate.shapeType&&r.shapeType&&candidate.shapeType===r.shapeType?1:0;let score=0;if(meters<=6)score+=48;else if(meters<=15)score+=34;else if(meters<=30)score+=18;if(text>=.92)score+=38;else if(text>=.78)score+=28;else if(text>=.6)score+=16;if(shape)score+=8;if(candidate.signType&&r.signType===candidate.signType)score+=6;score=Math.min(100,score);if(!best||score>best.score)best={record:r,score,meters,textSimilarity:text}}
    if(!best)return{duplicate:false,score:0};return{duplicate:best.score>=72,score:best.score,meters:best.meters,textSimilarity:best.textSimilarity,record:best.record};
  }
  window.TabelaDuplicate={analyze,similarity,distance,version:'10.0'};
})();