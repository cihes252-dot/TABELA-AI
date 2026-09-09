(() => {
  const $=id=>document.getElementById(id);
  const STYLE_ID='tabelaCameraCleanStyle';

  function installStyle(){
    if($(STYLE_ID))return;
    const s=document.createElement('style');
    s.id=STYLE_ID;
    s.textContent=`
      /* Presentation-only camera cleanup. Never removes DOM nodes used by field logic. */
      #scanframe,.scanframe,.camera .hint,#liveMetricBadge,#autoCaptureToggle,#autoMetricToggle{display:none!important}
      .camera svg,.camera .shape-overlay,.camera .contour-overlay{display:none!important}
      .camera{position:relative!important;min-height:clamp(420px,62vh,620px)!important;background:#030811}
      .camera video,.camera canvas{width:100%!important;height:clamp(420px,62vh,620px)!important;min-height:420px!important;object-fit:cover!important}
      #liveBoundaryBox{border:2px solid #59dba8!important;border-radius:5px!important;box-shadow:none!important;z-index:7!important}
      #liveDetectBadge{left:50%!important;right:auto!important;top:auto!important;bottom:10px!important;transform:translateX(-50%)!important;z-index:9!important;max-width:calc(100% - 24px)!important;width:auto!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;padding:7px 10px!important;font-size:11px!important;line-height:1.15!important;background:rgba(6,17,30,.82)!important;color:#eef5ff!important;border:1px solid rgba(89,219,168,.65)!important;backdrop-filter:blur(5px)}
      #fieldPreflight.field-compact{padding:8px 11px!important;margin:8px 0!important;border-radius:13px!important}
      #fieldPreflight.field-compact #fieldReadyDetail,#fieldPreflight.field-compact #fieldPrepareBtn{display:none!important}
      #fieldPreflight.field-compact .row{min-height:30px!important}
      #fieldPreflight.field-compact b{font-size:12px!important}
      #fieldPreflight.field-compact #fieldReadyBadge{font-size:10px!important;padding:5px 8px!important}
      #snapBtn.camera-capture{background:#2d7cff!important;color:#fff!important;flex:1 1 180px!important;font-size:15px!important;padding:13px 16px!important}
      .nav{bottom:calc(7px + env(safe-area-inset-bottom,0px))!important}
      main{padding-bottom:calc(145px + env(safe-area-inset-bottom,0px))!important}
      @media(max-width:600px){
        main{padding-left:10px!important;padding-right:10px!important;padding-bottom:calc(165px + env(safe-area-inset-bottom,0px))!important}
        .camera{border-radius:12px!important;min-height:clamp(430px,64vh,560px)!important}
        .camera video,.camera canvas{height:clamp(430px,64vh,560px)!important;min-height:430px!important}
        #scan .card:has(.camera){padding:8px!important}
        #scan .card:has(.camera)>.row{margin-top:8px!important}
        #liveDetectBadge{font-size:10px!important;bottom:8px!important}
        .nav{width:calc(100% - 16px)!important;gap:4px!important;padding:6px!important}
        .nav button{font-size:10px!important;padding:9px 2px!important}
      }
    `;
    document.head.appendChild(s);
  }

  function compactStatusText(text){
    const t=String(text||'');
    if(/TABELA HAZIR/i.test(t))return '✓ TABELA BULUNDU • FOTOĞRAF ÇEK';
    if(/TABELA ADAYI/i.test(t))return 'Tabela algılandı • sabit tut';
    if(/kapalı/i.test(t))return 'Ön tespit kapalı';
    if(/yeniden aranıyor/i.test(t))return 'Tabela yeniden aranıyor…';
    if(/kamera bekleniyor/i.test(t))return 'Kamera bekleniyor…';
    if(/aranıyor/i.test(t))return 'Tabela aranıyor…';
    return t.length>42?t.slice(0,39)+'…':t;
  }

  function simplifyBadge(){
    const b=$('liveDetectBadge');
    if(!b)return;
    if(b.dataset.cleanWatch!=='1'){
      b.dataset.cleanWatch='1';
      let internal=false;
      const apply=()=>{
        if(internal)return;
        const current=b.textContent||'';
        const next=compactStatusText(current);
        if(next!==current){internal=true;b.textContent=next;internal=false}
      };
      new MutationObserver(apply).observe(b,{childList:true,characterData:true,subtree:true});
      apply();
    }
  }

  function compactPreflight(){
    const card=$('fieldPreflight'),badge=$('fieldReadyBadge');
    if(!card||!badge)return;
    const ready=/SAHA HAZIR/i.test(badge.textContent||'');
    if(ready&&!card.classList.contains('field-expanded'))card.classList.add('field-compact');
    if(card.dataset.cleanToggle!=='1'){
      card.dataset.cleanToggle='1';
      card.addEventListener('click',e=>{
        if(e.target.closest('button'))return;
        if(!/SAHA HAZIR/i.test($('fieldReadyBadge')?.textContent||''))return;
        card.classList.toggle('field-expanded');
        card.classList.toggle('field-compact',!card.classList.contains('field-expanded'));
      });
      new MutationObserver(()=>{
        const nowReady=/SAHA HAZIR/i.test(badge.textContent||'');
        if(nowReady&&!card.classList.contains('field-expanded'))card.classList.add('field-compact');
      }).observe(badge,{childList:true,characterData:true,subtree:true});
    }
  }

  function decorateCaptureButton(){
    const snap=$('snapBtn');
    if(!snap)return;
    snap.classList.add('camera-capture');
    const wanted='📸 Fotoğraf Çek';
    if(/Fotoğraf Çek/i.test(snap.textContent||'')&&snap.textContent!==wanted)snap.textContent=wanted;
  }

  function cleanUnavailableMetricBadge(){
    const b=$('webxrBridgeBadge');if(!b)return;
    const t=b.textContent||'',unavailable=/gerçek metre kapalı|ARKit\/LiDAR tarayıcıdan|tarayıcı\/cihazda yok|WebXR kapalı/i.test(t);
    if(unavailable)b.style.setProperty('display','none','important');else b.style.removeProperty('display');
  }

  function drawCleanFrame(data){
    return new Promise(resolve=>{
      const canvas=$('photo');
      if(!canvas||!data){resolve();return}
      const img=new Image();
      img.onload=()=>{
        try{
          const w=img.naturalWidth||img.width,h=img.naturalHeight||img.height;
          if(w>0&&h>0){canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d');ctx.clearRect(0,0,w,h);ctx.drawImage(img,0,0,w,h)}
        }catch{}
        resolve();
      };
      img.onerror=()=>resolve();
      img.src=data;
    });
  }

  function installCleanDraw(){
    const original=window.draw;
    if(typeof original!=='function'||original.__cameraCleanWrapped)return;
    const wrapped=async function(data){
      const result=await original.apply(this,arguments);
      await drawCleanFrame(data);
      return result;
    };
    wrapped.__cameraCleanWrapped=true;
    wrapped.__cameraCleanOriginal=original;
    window.draw=wrapped;
  }

  function clean(){installStyle();simplifyBadge();compactPreflight();decorateCaptureButton();cleanUnavailableMetricBadge();installCleanDraw()}
  function boot(){
    clean();
    let n=0;
    const t=setInterval(()=>{clean();if(++n>=40)clearInterval(t)},250);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
