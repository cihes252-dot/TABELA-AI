(() => {
  const loadImage = src => new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=src;});
  const labels={
    'horizontal-rectangle':'Yatay dikdörtgen','vertical-rectangle':'Dikey dikdörtgen',
    'square':'Kare','circle':'Yuvarlak / daire','oval':'Oval','triangle':'Üçgen',
    'polygon':'Çokgen','freeform':'Serbest form','rectangle':'Dikdörtgen'
  };
  function canvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  function dilate(src,w,h,passes=2){let a=src,b=new Uint8Array(src.length);for(let p=0;p<passes;p++){b.fill(0);for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){let on=0;for(let yy=-1;yy<=1&&!on;yy++)for(let xx=-1;xx<=1;xx++)if(a[(y+yy)*w+x+xx]){on=1;break;}if(on)b[y*w+x]=1;}const t=a;a=b;b=t;}return a;}
  function spans(mask,w,h,box){const out=[];for(const frac of [0.12,0.25,0.5,0.75,0.88]){const y=Math.max(box.y,Math.min(box.y+box.h-1,Math.round(box.y+box.h*frac)));let mn=1e9,mx=-1;for(let x=box.x;x<box.x+box.w;x++)if(mask[y*w+x]){mn=Math.min(mn,x);mx=Math.max(mx,x);}out.push(mx>=mn?(mx-mn+1)/box.w:0);}return out;}
  function localMag(mags,w,h,x,y){x=Math.round(x);y=Math.round(y);let mx=0;for(let yy=-1;yy<=1;yy++)for(let xx=-1;xx<=1;xx++){const X=x+xx,Y=y+yy;if(X>=0&&X<w&&Y>=0&&Y<h)mx=Math.max(mx,mags[Y*w+X]||0);}return mx;}
  function refineEllipse(mags,w,h,b,type,thr){
    const cx0=b.x+b.w/2,cy0=b.y+b.h/2,minDim=Math.min(b.w,b.h);
    const cStep=Math.max(4,Math.round(minDim/24)),rStep=Math.max(4,Math.round(minDim/30));
    const ratios=type==='circle'?[1]:[0.68,0.82,1,1.22,1.45];
    let best=null;
    const x0=b.x+b.w*.24,x1=b.x+b.w*.76,y0=b.y+b.h*.24,y1=b.y+b.h*.76;
    for(let cy=y0;cy<=y1;cy+=cStep)for(let cx=x0;cx<=x1;cx+=cStep){
      const maxRx=Math.min(b.w*.49,cx-b.x,b.x+b.w-cx),maxRy=Math.min(b.h*.49,cy-b.y,b.y+b.h-cy);
      for(const ratio of ratios){
        const minRx=Math.max(20,minDim*.20),limit=Math.min(maxRx,maxRy*ratio);
        for(let rx=minRx;rx<=limit;rx+=rStep){
          const ry=rx/ratio;if(ry<18)continue;let sum=0,n=0;
          for(let i=0;i<64;i++){const a=i*Math.PI*2/64,x=cx+rx*Math.cos(a),y=cy+ry*Math.sin(a);if(x<1||x>=w-1||y<1||y>=h-1)continue;sum+=Math.min(1,localMag(mags,w,h,x,y)/Math.max(1,thr*2.25));n++;}
          if(n<48)continue;const ring=sum/n,center=1-Math.min(1,Math.hypot((cx-cx0)/(b.w/2),(cy-cy0)/(b.h/2))/1.414),size=Math.min(1,Math.sqrt(rx*ry)/(minDim*.36));
          let score=ring*.74+center*.18+size*.08;if(type==='circle')score-=Math.abs(rx-ry)/Math.max(rx,ry)*.20;
          if(!best||score>best.score)best={score,ring,cx,cy,rx,ry};
        }
      }
    }
    if(!best||best.ring<.28)return null;
    const pad=1.06,bb={x:best.cx-best.rx*pad,y:best.cy-best.ry*pad,w:best.rx*2*pad,h:best.ry*2*pad};
    bb.x=clamp(bb.x,0,w-1);bb.y=clamp(bb.y,0,h-1);bb.w=clamp(bb.w,1,w-bb.x);bb.h=clamp(bb.h,1,h-bb.y);
    return {bbox:bb,ringScore:best.ring,refineScore:best.score,aspect:best.rx/best.ry};
  }
  async function detect(photoData){
    const img=await loadImage(photoData),maxW=360,scale=Math.min(1,maxW/img.width),w=Math.max(120,Math.round(img.width*scale)),h=Math.max(90,Math.round(img.height*scale));
    const c=canvas(w,h),ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,w,h);const d=ctx.getImageData(0,0,w,h).data,g=new Uint8Array(w*h);
    for(let i=0,p=0;i<d.length;i+=4,p++)g[p]=Math.round(.299*d[i]+.587*d[i+1]+.114*d[i+2]);
    const mags=new Uint16Array(w*h);let sum=0,sum2=0,n=0;for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const p=y*w+x,gx=-g[p-w-1]-2*g[p-1]-g[p+w-1]+g[p-w+1]+2*g[p+1]+g[p+w+1],gy=-g[p-w-1]-2*g[p-w]-g[p-w+1]+g[p+w-1]+2*g[p+w]+g[p+w+1],m=Math.min(1020,Math.abs(gx)+Math.abs(gy));mags[p]=m;sum+=m;sum2+=m*m;n++;}
    const mean=sum/Math.max(1,n),std=Math.sqrt(Math.max(0,sum2/Math.max(1,n)-mean*mean)),thr=Math.max(110,mean+1.15*std);let rawEdge=new Uint8Array(w*h);for(let i=0;i<rawEdge.length;i++)rawEdge[i]=mags[i]>=thr?1:0;const edge=dilate(rawEdge,w,h,2);
    const seen=new Uint8Array(w*h),dirs=[-1,1,-w,w,-w-1,-w+1,w-1,w+1];let best=null;
    for(let y=2;y<h-2;y++)for(let x=2;x<w-2;x++){const start=y*w+x;if(!edge[start]||seen[start])continue;const q=[start];seen[start]=1;let qi=0,count=0,minx=x,maxx=x,miny=y,maxy=y;while(qi<q.length){const p=q[qi++],py=Math.floor(p/w),px=p-py*w;count++;minx=Math.min(minx,px);maxx=Math.max(maxx,px);miny=Math.min(miny,py);maxy=Math.max(maxy,py);for(const off of dirs){const np=p+off;if(np<0||np>=edge.length||seen[np]||!edge[np])continue;const ny=Math.floor(np/w),nx=np-ny*w;if(Math.abs(nx-px)>1||Math.abs(ny-py)>1)continue;seen[np]=1;q.push(np);}}
      const bw=maxx-minx+1,bh=maxy-miny+1;if(count<80||bw<28||bh<20)continue;const area=bw*bh,cx=(minx+maxx)/2,cy=(miny+maxy)/2,center=1-Math.min(1,Math.hypot(cx-w/2,cy-h/2)/Math.hypot(w/2,h/2)),size=Math.min(1,area/(w*h*.45)),score=count*(.65+.35*center)*(1+.25*size);if(!best||score>best.score)best={score,count,x:minx,y:miny,w:bw,h:bh};
    }
    if(!best)best={x:Math.round(w*.1),y:Math.round(h*.18),w:Math.round(w*.8),h:Math.round(h*.64),count:0,score:0};
    let b=best,aspect=b.w/b.h,near=Math.max(2,Math.round(Math.min(b.w,b.h)*.09)),rectHits=0,ellHits=0,total=0,cx=b.x+b.w/2,cy=b.y+b.h/2,rx=b.w/2,ry=b.h/2;
    for(let y=b.y;y<b.y+b.h;y++)for(let x=b.x;x<b.x+b.w;x++){if(!edge[y*w+x])continue;total++;const db=Math.min(x-b.x,b.x+b.w-1-x,y-b.y,b.y+b.h-1-y);if(db<=near)rectHits++;const rr=Math.sqrt(((x-cx)/rx)**2+((y-cy)/ry)**2);if(rr>.72&&rr<1.18)ellHits++;}
    const rectScore=rectHits/Math.max(1,total),ellipseScore=ellHits/Math.max(1,total),sp=spans(edge,w,h,b);let type='freeform';
    const top=Math.max(sp[0],sp[1]),bottom=Math.max(sp[3],sp[4]),mid=sp[2],tri=(Math.min(top,bottom)<.55*Math.max(top,bottom)&&mid>.45);
    if(tri)type='triangle';else if(ellipseScore>rectScore+.08)type=(aspect>.82&&aspect<1.22)?'circle':'oval';else if(rectScore>.24){if(aspect>.82&&aspect<1.22)type='square';else if(aspect>=1.22)type='horizontal-rectangle';else type='vertical-rectangle';}else if(aspect>.65&&aspect<1.6)type='polygon';
    let refine=null;if(type==='circle'||type==='oval'){refine=refineEllipse(mags,w,h,b,type,thr);if(refine){b=refine.bbox;aspect=b.w/b.h;if(type==='circle'&&(aspect<.80||aspect>1.25))type='oval';}}
    let confidence=Math.round(Math.max(35,Math.min(95,48+Math.abs(rectScore-ellipseScore)*55+(best.count?12:0))));if(refine)confidence=Math.max(confidence,Math.min(98,Math.round(55+refine.ringScore*48)));
    const rawBox={x:b.x/scale,y:b.y/scale,w:b.w/scale,h:b.h/scale};
    return {shapeType:type,shapeLabel:labels[type]||type,confidence,bbox:rawBox,debug:{aspect:+aspect.toFixed(2),rectScore:+rectScore.toFixed(2),ellipseScore:+ellipseScore.toFixed(2),ringScore:refine?+refine.ringScore.toFixed(2):null,refined:!!refine},version:'9.1-bounds'};
  }
  window.TabelaShape={detect,labels,version:'9.1-bounds'};
})();