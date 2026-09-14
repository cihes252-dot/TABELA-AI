(() => {
  const base=window.TabelaFastOCR;
  if(!base||typeof base.run!=='function'||base.__roiGuardInstalled)return;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const load=src=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=src});

  function guardedShape(shape,imgW,imgH){
    const b=shape?.bbox;if(!b||!imgW||!imgH)return shape;
    const x=Number(b.x),y=Number(b.y),w=Number(b.w),h=Number(b.h);
    if(![x,y,w,h].every(Number.isFinite)||w<=0||h<=0)return shape;

    // Operatör kutuyu elle düzelttiyse seçimi aynen kullan. OCR motorunun kendi küçük
    // güvenlik payı dışında kutuyu büyütme; kullanıcı seçimi en yüksek önceliktedir.
    if(shape?.manualOcrRoi===true){
      return{...shape,ocrRoiExpanded:false,ocrRoiSource:'manual-operator-exact'};
    }

    const area=(w*h)/(imgW*imgH),wide=w>=imgW*.22,tall=h>=imgH*.055;
    // Normal boyutlu otomatik tabela kutusunda doğrudan tabela ROI'sini oku.
    if(area>=.075&&wide&&tall){
      return{...shape,ocrRoiExpanded:false,ocrRoiSource:'detected-sign-exact'};
    }

    // Yalnızca segmentation kutusu şüpheli derecede küçük/darsa komşu yazıyı kaçırmamak
    // için ölçülü genişletme yap. Eski sürümdeki büyük merkez-bant birleşimi kaldırıldı.
    const aspect=w/Math.max(1,h),exX=area<.03?.60:area<.06?.42:.28,exY=area<.03?.42:area<.06?.30:.20;
    let nx=clamp(x-w*exX,0,imgW-1),ny=clamp(y-h*exY,0,imgH-1),nr=clamp(x+w+w*exX,nx+1,imgW),nb=clamp(y+h+h*exY,ny+1,imgH);
    let nw=nr-nx,nh=nb-ny;
    if(aspect>2.4){const extra=Math.min(imgW*.06,w*.12);nx=clamp(nx-extra,0,imgW-1);nr=clamp(nr+extra,nx+1,imgW);nw=nr-nx}
    const maxArea=imgW*imgH*.58;
    if(nw*nh>maxArea){const s=Math.sqrt(maxArea/(nw*nh)),cx=nx+nw/2,cy=ny+nh/2;nw*=s;nh*=s;nx=clamp(cx-nw/2,0,imgW-nw);ny=clamp(cy-nh/2,0,imgH-nh)}
    return{...shape,bbox:{x:nx,y:ny,w:nw,h:nh},__frameWidth:imgW,__frameHeight:imgH,ocrRoiExpanded:true,ocrRoiSource:'small-sign-guarded-expand'};
  }

  const originalRun=base.run.bind(base);
  base.run=async function(data,shape,onProgress,timeoutMs){
    try{
      const img=await load(data),s=guardedShape(shape,img.width,img.height);
      onProgress?.(8,s?.manualOcrRoi?'Türkçe OCR • operatör seçili alan':s?.ocrRoiExpanded?'Türkçe OCR • küçük tabela ROI genişletildi':'Türkçe OCR • tam tabela ROI');
      const result=await originalRun(data,s,onProgress,timeoutMs);
      if(result){result.roiGuard=true;result.roiSource=s?.ocrRoiSource||'original';result.version=(result.version||'ocr')+'+roi-guard-11.2.12'}
      return result;
    }catch(error){console.warn('OCR ROI guard devre dışı kaldı, orijinal ROI deneniyor',error);return originalRun(data,shape,onProgress,timeoutMs)}
  };
  base.__roiGuardInstalled=true;
})();