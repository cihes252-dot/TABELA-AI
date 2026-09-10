(() => {
  const base = window.TabelaFastOCR;
  if(!base || typeof base.run !== 'function' || base.__roiGuardInstalled) return;

  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const load=src=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=src});

  function expandedShape(shape,imgW,imgH){
    const b=shape?.bbox;
    if(!b || !imgW || !imgH) return shape;
    const x=Number(b.x), y=Number(b.y), w=Number(b.w), h=Number(b.h);
    if(![x,y,w,h].every(Number.isFinite) || w<=0 || h<=0) return shape;

    const area=(w*h)/(imgW*imgH);
    const aspect=w/Math.max(1,h);
    // Canlı sınır bazen yalnız tabelanın sağ/sol parçasını yakalıyor. OCR için
    // tabela yazısının komşu bölümünü de tek OCR çağrısına dahil ediyoruz.
    let exX=area<0.18 ? 0.95 : area<0.35 ? 0.65 : 0.28;
    let exY=area<0.18 ? 0.55 : area<0.35 ? 0.38 : 0.20;
    if(aspect>2.2){exX=Math.max(exX,0.42);exY=Math.min(exY,0.28)}
    if(aspect<0.7){exX=Math.max(exX,0.85);exY=Math.max(exY,0.32)}

    let nx=x-w*exX, ny=y-h*exY, nr=x+w+w*exX, nb=y+h+h*exY;
    nx=clamp(nx,0,imgW-1); ny=clamp(ny,0,imgH-1); nr=clamp(nr,nx+1,imgW); nb=clamp(nb,ny+1,imgH);

    let nw=nr-nx, nh=nb-ny;
    // OCR ROI çok dar veya yanlış köşede kaldıysa orta ticari bant ile birleştir.
    // Bu, yalnız OCR kırpmasını etkiler; tabela sınırı/ölçüm geometrisini değiştirmez.
    const centerBand={x:imgW*0.16,y:imgH*0.18,w:imgW*0.68,h:imgH*0.48};
    const cx1=Math.min(nx,centerBand.x), cy1=Math.min(ny,centerBand.y);
    const cx2=Math.max(nx+nw,centerBand.x+centerBand.w), cy2=Math.max(ny+nh,centerBand.y+centerBand.h);
    if(area<0.12 || nw<imgW*0.24){
      nx=clamp(cx1,0,imgW-1); ny=clamp(cy1,0,imgH-1); nr=clamp(cx2,nx+1,imgW); nb=clamp(cy2,ny+1,imgH); nw=nr-nx; nh=nb-ny;
    }

    // fast-ocr-engine güvenlik filtresinin tam-kare fallback'e düşmemesi için
    // ROI'yi görüntünün en fazla %72'si ile sınırla.
    const maxArea=imgW*imgH*0.72;
    if(nw*nh>maxArea){
      const s=Math.sqrt(maxArea/(nw*nh));
      const cx=nx+nw/2, cy=ny+nh/2; nw*=s; nh*=s;
      nx=clamp(cx-nw/2,0,imgW-nw); ny=clamp(cy-nh/2,0,imgH-nh);
    }

    return {...shape,bbox:{x:nx,y:ny,w:nw,h:nh},__frameWidth:imgW,__frameHeight:imgH,ocrRoiExpanded:true,ocrRoiSource:'sign-expanded'};
  }

  const originalRun=base.run.bind(base);
  base.run=async function(data,shape,onProgress,timeoutMs){
    try{
      const img=await load(data);
      const s=expandedShape(shape,img.width,img.height);
      onProgress?.(8,'Türkçe OCR • tabela yazı alanı hazırlanıyor');
      const result=await originalRun(data,s,onProgress,timeoutMs);
      if(result){
        result.roiGuard=true;
        result.roiSource=s?.ocrRoiSource||'original';
        result.version=(result.version||'ocr')+'+roi-guard-11.2.11';
      }
      return result;
    }catch(error){
      console.warn('OCR ROI guard devre dışı kaldı, orijinal ROI deneniyor',error);
      return originalRun(data,shape,onProgress,timeoutMs);
    }
  };
  base.__roiGuardInstalled=true;
})();