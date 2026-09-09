(() => {
  const $=id=>document.getElementById(id);
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function acceptedOCR(result){
    const text=String(result?.text||'').trim(),confidence=Number(result?.confidence)||0;
    const compact=text.replace(/\s+/g,''),letters=(text.match(/[A-Za-zÇĞİÖŞÜçğıöşü]/g)||[]).length,digits=(text.match(/[0-9]/g)||[]).length;
    const useful=compact.length>=3&&(letters+digits)>=3&&(letters+digits)/Math.max(1,compact.length)>=.55;
    return !!result?.validated||(confidence>=68&&useful);
  }

  function textQuality(result){
    const text=String(result?.text||result?.candidateText||'').trim(),confidence=Number(result?.confidence)||0;
    const compact=text.replace(/\s+/g,''),letters=(text.match(/[A-Za-zÇĞİÖŞÜçğıöşü]/g)||[]).length,digits=(text.match(/[0-9]/g)||[]).length;
    const usefulChars=letters+digits,garbage=Math.max(0,compact.length-usefulChars);
    return (acceptedOCR(result)?120:0)+confidence+Math.min(30,usefulChars*3)-garbage*5+(compact.length>=4?8:0);
  }

  async function refineShapeForOCR(data,shape){
    const b=shape?.bbox;if(!b)return{shape,refined:false};
    const x=Number(b.x),y=Number(b.y),w=Number(b.w),h=Number(b.h);
    if(![x,y,w,h].every(Number.isFinite)||w<=0||h<=0)return{shape,refined:false};
    const aspect=w/Math.max(1,h);
    if(aspect<1.12||w<100||h<48)return{shape,refined:false};

    // Saha tabelalarında ana marka/yazı çoğunlukla üst-orta bölgede bulunur.
    // Bu ROI SADECE tam tabela ROI'si zayıf kaldığında ikinci ve son deneme olarak kullanılır.
    // Böylece küçük afiş/fotoğraf sıralarının ana yazıyı bastırması önlenir.
    let top=.03,height=.68;
    if(aspect>=2.4){top=.02;height=.62}
    else if(aspect>=1.6){top=.025;height=.66}
    const side=w*.018;
    const nb={x:x+side,y:y+h*top,w:Math.max(1,w-side*2),h:Math.max(1,h*height)};
    return{shape:{...shape,bbox:nb,__ocrOriginalBBox:{x,y,w,h},__ocrHeadlineBand:true},refined:true,band:{yRatio:+top.toFixed(3),heightRatio:+height.toFixed(3),strategy:'headline-fallback'}};
  }

  function wrapOCR(){
    const fast=window.TabelaFastOCR;if(!fast?.run||fast.run.__accuracyWrapped)return;
    const original=fast.run.bind(fast);
    const wrapped=async(data,shape,onProgress,timeoutMs=3000)=>{
      const started=performance.now();

      // 1) Önce AI'nin bulduğu gerçek tabela kutusunun TAMAMINI oku.
      // Eski sürüm burada önce adaptif bant kesiyor ve bazı tabelalarda ana markayı kaçırıyordu.
      let first=await original(data,shape,onProgress,timeoutMs);
      let best=first,attempts=1,recovery=null;
      if(acceptedOCR(first)){
        return{...first,accepted:true,ocrAttempts:1,roiStrategy:'detected-sign-roi',version:'11.2.10-full-roi-first'};
      }

      // 2) İlk sonuç boş/zayıfsa toplam 3 saniyelik bütçe içinde SADECE bir headline ROI denemesi.
      const elapsed=performance.now()-started,remaining=Math.max(0,timeoutMs-elapsed);
      const prep=await refineShapeForOCR(data,shape);
      if(prep.refined&&remaining>=450&&!first?.timedOut){
        try{
          onProgress?.(55,'OCR zayıf • ana tabela yazısı doğrulanıyor');
          const second=await original(data,prep.shape,(p,s)=>onProgress?.(55+Math.round((Number(p)||0)*.45),s),remaining);
          attempts=2;recovery=second;
          if(textQuality(second)>textQuality(first))best=second;
        }catch(error){console.warn('OCR headline yedeği tamamlanamadı',error)}
      }

      const candidate=String(best?.text||'').trim(),accepted=acceptedOCR(best);
      return{
        ...best,
        text:accepted?candidate:'',
        candidateText:candidate,
        accepted,
        lowConfidenceRejected:!!candidate&&!accepted,
        roiStrategy:best===recovery?'headline-fallback-after-full-roi':'detected-sign-roi',
        ocrBand:best===recovery?prep?.band||null:null,
        ocrAttempts:attempts,
        recoveredByHeadline:best===recovery,
        totalElapsedMs:Math.round(performance.now()-started),
        version:'11.2.10-full-roi-first'
      };
    };
    wrapped.__accuracyWrapped=true;wrapped.__original=original;fast.run=wrapped;
  }

  function applyPostScanGuards(event){
    const detail=event?.detail||{},ocr=detail.ocr||{},type=detail.type||{};
    if(ocr.lowConfidenceRejected&&ocr.candidateText){
      const input=$('ocr'),badge=$('ocrBadge'),candidates=$('ocrCandidates'),status=$('scanStatus');
      if(input){input.value='';input.placeholder='Öneri: '+ocr.candidateText+' — doğrulanmadı'}
      if(badge){badge.textContent='OCR DOĞRULANMADI';badge.className='badge warn'}
      if(candidates)candidates.innerHTML=`<div class="candidate"><b>OCR önerisi:</b> ${esc(ocr.candidateText)} • güven %${Math.round(Number(ocr.confidence)||0)} • kayda otomatik alınmadı</div>`;
      if(status)status.textContent='Fotoğraf tamamlandı • OCR güveni düşük. Öneriyi kontrol edin veya doğru metni yazın; yanlış OCR otomatik kaydedilmeyecek.';
    }
    if(type.mode!=='trained-model'&&Number(type.confidence)<70){
      const select=$('signType'),box=$('autoTypeBox'),other='Diğer / kontrol gerekli';
      if(select&&[...select.options].some(o=>o.value===other))select.value=other;
      if(select){select.dataset.suggestedType=type.label||'';select.dataset.autoTypeConfidence=String(type.confidence||0)}
      if(box)box.innerHTML=`<b>Tabela tipi önerisi: ${esc(type.label||'—')}</b> <span class="badge warn">%${Math.round(Number(type.confidence)||0)}</span><div class="muted">Güven 70 altında • otomatik tip seçilmedi • operatör doğrulaması gerekli</div>`;
    }
  }

  function boot(){
    wrapOCR();document.addEventListener('tabela:fast-scan-complete',applyPostScanGuards);
    let n=0;const t=setInterval(()=>{wrapOCR();if(++n>24)clearInterval(t)},250);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.TabelaFieldAccuracy={acceptedOCR,refineShapeForOCR,textQuality,version:'11.2.10-full-roi-first'};
})();