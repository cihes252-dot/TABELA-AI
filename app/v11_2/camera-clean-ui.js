(() => {
  const $=id=>document.getElementById(id);
  const STYLE_ID='tabelaCameraCleanStyle';
  function installStyle(){
    if($(STYLE_ID))return;
    const s=document.createElement('style');s.id=STYLE_ID;s.textContent=`
      /* FIELD CAMERA: keep the image visible. No fixed oval/shape guide. */
      #scanframe,.scanframe,.camera .hint,#liveMetricBadge,#autoCaptureToggle,#autoMetricToggle{display:none!important}
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
      @media(max-width:600px){
        main{padding-left:10px!important;padding-right:10px!important}
        .camera{border-radius:12px!important;min-height:clamp(430px,64vh,560px)!important}
        .camera video,.camera canvas{height:clamp(430px,64vh,560px)!important;min-height:430px!important}
        #scan .card:has(.camera){padding:8px!important}
        #scan .card:has(.camera)>.row{margin-top:8px!important}
        #liveDetectBadge{font-size:10px!important;bottom:8px!important}
      }
    `;document.head.appendChild(s);
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
    const b=$('liveDetectBadge');if(!b)return;
    if(b.dataset.cleanWatch!=='1'){
      b.dataset.cleanWatch='1';
      let busy=false;
      new MutationObserver(()=>{if(busy)return;const next=compactStatusText(b.textContent);if(next!==b.textContent){busy=true;b.textContent=next;busy=false}}).observe(b,{childList:true,characterData:true,subtree:true});
    }
    const next=compactStatusText(b.textContent);if(next!==b.textContent)b.textContent=next;
  }
  function compactPreflight(){
    const card=$('fieldPreflight'),badge=$('fieldReadyBadge');if(!card||!badge)return;
    const ready=/SAHA HAZIR/i.test(badge.textContent||'');
    if(ready&&!card.classList.contains('field-expanded'))card.classList.add('field-compact');
    if(card.dataset.cleanToggle!=='1'){
      card.dataset.cleanToggle='1';
      card.addEventListener('click',e=>{
        if(e.target.closest('button'))return;
        if(!/SAHA HAZIR/i.test($('fieldReadyBadge')?.textContent||''))return;
        card.classList.toggle('field-expanded');card.classList.toggle('field-compact',!card.classList.contains('field-expanded'));
      });
      new MutationObserver(()=>compactPreflight()).observe(badge,{childList:true,characterData:true,subtree:true});
    }
  }
  function cameraActions(){
    const snap=$('snapBtn'),start=$('startCam'),video=$('video');
    if(snap){snap.classList.add('camera-capture');if(/Fotoğraf Çek/i.test(snap.textContent||''))snap.textContent='📸 Fotoğraf Çek';}
    if(video&&video.dataset.cleanCamera!=='1'){
      video.dataset.cleanCamera='1';
      const on=()=>{if(start)start.style.display='none';if(snap){snap.disabled=false;snap.textContent='📸 Fotoğraf Çek'}};
      video.addEventListener('playing',on);video.addEventListener('loadeddata',on);
    }
  }
  function clean(){installStyle();simplifyBadge();compactPreflight();cameraActions();}
  function boot(){clean();let n=0;const t=setInterval(()=>{clean();if(++n>30)clearInterval(t)},250);new MutationObserver(()=>clean()).observe(document.body,{childList:true,subtree:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
