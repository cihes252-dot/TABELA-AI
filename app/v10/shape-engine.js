(() => {
  const labels={
    'horizontal-rectangle':'Yatay dikdörtgen','vertical-rectangle':'Dikey dikdörtgen','square':'Kare',
    'circle':'Yuvarlak / daire','oval':'Oval','triangle':'Üçgen','polygon':'Çokgen','freeform':'Serbest form'
  };
  const load=src=>new Promise((ok,fail)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=fail;i.src=src});
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function canvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c}
  function dilate(src,w,h,passes=2){let a=src,b=new Uint8Array(src.length);for(let p=0;p<passes;p++){b.fill(0);for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){let on=0;for(let yy=-1;yy<=1&&!on;yy++)for(let xx=-1;xx<=1;xx++)if(a[(y+yy)*w+x+xx]){on=1;break}if(on)b[y*w+x]=1}const t=a;a=b;b=t}return a}
  function shapeStats(edge,w,h,b){let total=0,border=0,ellipse=0;const cx=b.x+b.w/2,cy=b.y+b.h/2,rx=b.w/2,ry=b.h/2,near=Math.max(2,Math.min(b.w,b.h)*.07);for(let y=b.y;y<b.y+b.h;y++)for(let x=b.x;x<b.x+b.w;x++){if(!edge[y*w+x])continue;total++;const db=Math.min(x-b.x,b.x+b.w-1-x,y-b.y,b.y+b.h-1-y);if(db<=near)border++;const rr=Math.sqrt(((x-cx)/rx)**2+((y-cy)/ry)**2);if(rr>.78&&rr<1.18)ellipse++}return{rect:border/Math.max(1,total),ellipse:ellipse/Math.max(1,total),edgeCount:total}}
  function rowSpans(edge,w,h,b){const f=[.12,.25,.5,.75,.88],out=[];for(const q of f){const y=clamp(Math.round(b.y+b.h*q),b.y,b.y+b.h-1);let mn=1e9,mx=-1;for(let x=b.x;x<b.x+b.w;x++)if(edge[y*w+x]){mn=Math.min(mn,x);mx=Math.max(mx,x)}out.push(mx>=mn?(mx-mn+1)/b.w:0)}return out}
  function touchesFrame(b,w,h,margin=.025){let n=0;if(b.x<=w*margin)n++;if(b.y<=h*margin)n++;if(b.x+b.w>=w*(1-margin))n++;if(b.y+b.h>=h*(1-margin))n++;return n}
  function candidateScore(b,w,h,count,source='edge-component'){
    const area=b.w*b.h,ratio=area/(w*h),cx=b.x+b.w/2,cy=b.y+b.h/2,center=1-Math.min(1,Math.hypot(cx-w/2,cy-h/2)/Math.hypot(w/2,h/2)),aspect=b.w/Math.max(1,b.h),touches=touchesFrame(b,w,h);
    if(ratio<.006||ratio>.72||b.w<w*.08||b.h<h*.045)return-1;
    if(touches>=2&&ratio>.035)return-1;
    const aspectPrior=(aspect>=.35&&aspect<=8)?1:.72,centerPrior=.62+.58*center,touchPenalty=touches===1?.78:1,sourceBoost=source==='text-cluster'?1.28:1;
    return count*aspectPrior*centerPrior*touchPenalty*sourceBoost*(1+Math.min(.42,ratio*.85));
  }
  function textClusterCandidate(edge,w,h){
    const cols=28,rows=18,cw=w/cols,ch=h/rows,active=new Uint8Array(cols*rows),density=new Float32Array(cols*rows);
    for(let gy=0;gy<rows;gy++)for(let gx=0;gx<cols;gx++){
      const x0=Math.floor(gx*cw),x1=Math.min(w,Math.ceil((gx+1)*cw)),y0=Math.floor(gy*ch),y1=Math.min(h,Math.ceil((gy+1)*ch));let on=0,total=0;
      for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){total++;if(edge[y*w+x])on++}
      const d=on/Math.max(1,total),i=gy*cols+gx;density[i]=d;if(d>.075)active[i]=1;
    }
    const seen=new Uint8Array(active.length),dirs=[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];let best=null;
    for(let gy=0;gy<rows;gy++)for(let gx=0;gx<cols;gx++){
      const s=gy*cols+gx;if(!active[s]||seen[s])continue;const q=[[gx,gy]];seen[s]=1;let qi=0,minx=gx,maxx=gx,miny=gy,maxy=gy,cells=0,weight=0;
      while(qi<q.length){const [x,y]=q[qi++];cells++;weight+=density[y*cols+x];minx=Math.min(minx,x);maxx=Math.max(maxx,x);miny=Math.min(miny,y);maxy=Math.max(maxy,y);for(const [dx,dy] of dirs){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=cols||ny>=rows)continue;const ni=ny*cols+nx;if(!active[ni]||seen[ni])continue;seen[ni]=1;q.push([nx,ny])}}
      if(cells<3)continue;const b={x:Math.floor(minx*cw),y:Math.floor(miny*ch),w:Math.ceil((maxx-minx+1)*cw),h:Math.ceil((maxy-miny+1)*ch)},aspect=b.w/Math.max(1,b.h);if(b.w<w*.14||b.h<h*.05)continue;
      const approxCount=Math.max(1,Math.round(weight*cw*ch)),score=candidateScore(b,w,h,approxCount,'text-cluster')*(aspect>=1.15?1.15:1);
      if(score>0&&(!best||score>best.score))best={...b,count:approxCount,score,source:'text-cluster'};
    }
    return best;
  }
  async function detect(data){
    const img=await load(data),scale=Math.min(1,420/img.width),w=Math.max(140,Math.round(img.width*scale)),h=Math.max(100,Math.round(img.height*scale));
    const c=canvas(w,h),x=c.getContext('2d',{willReadFrequently:true});x.drawImage(img,0,0,w,h);const d=x.getImageData(0,0,w,h).data,g=new Uint8Array(w*h);for(let i=0,p=0;i<d.length;i+=4,p++)g[p]=Math.round(.299*d[i]+.587*d[i+1]+.114*d[i+2]);
    const mag=new Uint16Array(w*h);let sum=0,sum2=0,n=0;for(let y=1;y<h-1;y++)for(let xx=1;xx<w-1;xx++){const p=y*w+xx,gx=-g[p-w-1]-2*g[p-1]-g[p+w-1]+g[p-w+1]+2*g[p+1]+g[p+w+1],gy=-g[p-w-1]-2*g[p-w]-g[p-w+1]+g[p+w-1]+2*g[p+w]+g[p+w+1],m=Math.min(1020,Math.abs(gx)+Math.abs(gy));mag[p]=m;sum+=m;sum2+=m*m;n++}
    const mean=sum/Math.max(1,n),std=Math.sqrt(Math.max(0,sum2/Math.max(1,n)-mean*mean)),thr=Math.max(105,mean+1.05*std);let edge=new Uint8Array(w*h);for(let i=0;i<edge.length;i++)edge[i]=mag[i]>thr?1:0;edge=dilate(edge,w,h,2);
    const seen=new Uint8Array(w*h),dirs=[-1,1,-w,w,-w-1,-w+1,w-1,w+1];let best=null;
    for(let y=2;y<h-2;y++)for(let xx=2;xx<w-2;xx++){
      const s=y*w+xx;if(!edge[s]||seen[s])continue;const q=[s];seen[s]=1;let qi=0,count=0,minx=xx,maxx=xx,miny=y,maxy=y;
      while(qi<q.length){const p=q[qi++],py=Math.floor(p/w),px=p-py*w;count++;minx=Math.min(minx,px);maxx=Math.max(maxx,px);miny=Math.min(miny,py);maxy=Math.max(maxy,py);for(const off of dirs){const np=p+off;if(np<0||np>=edge.length||seen[np]||!edge[np])continue;const ny=Math.floor(np/w),nx=np-ny*w;if(Math.abs(nx-px)>1||Math.abs(ny-py)>1)continue;seen[np]=1;q.push(np)}}
      const bw=maxx-minx+1,bh=maxy-miny+1;if(count<70)continue;const b={x:minx,y:miny,w:bw,h:bh},score=candidateScore(b,w,h,count,'edge-component');if(score>0&&(!best||score>best.score))best={...b,count,score,source:'edge-component'};
    }
    const textBest=textClusterCandidate(edge,w,h);if(textBest&&(!best||textBest.score>best.score*.92))best=textBest;
    const boundaryDetected=!!best;
    if(!best)best={x:Math.round(w*.08),y:Math.round(h*.13),w:Math.round(w*.84),h:Math.round(h*.72),count:0,score:0,source:'none'};
    let b=best,aspect=b.w/b.h,st=shapeStats(edge,w,h,b),sp=rowSpans(edge,w,h,b),type='freeform';const top=Math.max(sp[0],sp[1]),mid=sp[2],bottom=Math.max(sp[3],sp[4]);
    if(best.source==='text-cluster')type=aspect>.84&&aspect<1.18?'square':aspect>=1.18?'horizontal-rectangle':'vertical-rectangle';
    else if(Math.min(top,bottom)<Math.max(top,bottom)*.53&&mid>.42)type='triangle';
    else if(st.ellipse>st.rect+.08&&touchesFrame(b,w,h)===0)type=aspect>.83&&aspect<1.20?'circle':'oval';
    else if(st.rect>.19){type=aspect>.84&&aspect<1.18?'square':aspect>=1.18?'horizontal-rectangle':'vertical-rectangle'}
    else if(aspect>.62&&aspect<1.65)type='polygon';
    const pad=.045*Math.min(b.w,b.h);b={x:clamp(b.x-pad,0,w-1),y:clamp(b.y-pad,0,h-1),w:clamp(b.w+2*pad,1,w),h:clamp(b.h+2*pad,1,h)};b.w=Math.min(b.w,w-b.x);b.h=Math.min(b.h,h-b.y);
    const frameTouch=touchesFrame(b,w,h),sourceBonus=best.source==='text-cluster'?10:5,confidence=Math.round(clamp(50+Math.abs(st.rect-st.ellipse)*48+(best.count?sourceBonus:0)+(frameTouch===0?8:0),35,94));
    return{shapeType:type,shapeLabel:labels[type]||type,confidence,boundaryDetected,boundarySource:boundaryDetected?best.source:'fallback-box',bbox:{x:b.x/scale,y:b.y/scale,w:b.w/scale,h:b.h/scale},debug:{aspect:+aspect.toFixed(2),rect:+st.rect.toFixed(2),ellipse:+st.ellipse.toFixed(2),componentCount:best.count||0,frameTouches:frameTouch,candidateSource:best.source},version:'10.2-sign-candidate-guard'};
  }
  window.TabelaShape={detect,labels,version:'10.2-sign-candidate-guard'};
})();
