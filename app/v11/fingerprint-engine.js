(() => {
  const load=src=>new Promise((ok,fail)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=fail;i.src=src});
  async function hash(data,bbox){const img=await load(data),c=document.createElement('canvas'),w=9,h=8;c.width=w;c.height=h;const x=c.getContext('2d',{willReadFrequently:true});const b=bbox||{x:0,y:0,w:img.width,h:img.height};x.drawImage(img,b.x,b.y,b.w,b.h,0,0,w,h);const d=x.getImageData(0,0,w,h).data,g=[];for(let i=0;i<d.length;i+=4)g.push(Math.round(.299*d[i]+.587*d[i+1]+.114*d[i+2]));let bits='';for(let y=0;y<h;y++)for(let xx=0;xx<8;xx++)bits+=g[y*w+xx]>g[y*w+xx+1]?'1':'0';return BigInt('0b'+bits).toString(16).padStart(16,'0')}
  function similarity(a,b){if(!a||!b||a.length!==b.length)return 0;let x=BigInt('0x'+a)^BigInt('0x'+b),n=0;while(x){n+=Number(x&1n);x>>=1n}return 1-n/64}
  function best(hashValue,records){let out=null;for(const r of records||[]){if(!r.visualHash)continue;const s=similarity(hashValue,r.visualHash);if(!out||s>out.similarity)out={record:r,similarity:s}}return out}
  window.TabelaFingerprint={hash,similarity,best,version:'11.0'};
})();