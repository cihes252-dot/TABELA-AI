(() => {
  const $=id=>document.getElementById(id);
  function ensureScanFrame(){
    if($('scanframe'))return $('scanframe');
    const cam=document.querySelector('.camera');if(!cam)return null;
    const d=document.createElement('div');d.id='scanframe';d.className='scanframe hidden';d.style.display='none';d.setAttribute('aria-hidden','true');cam.appendChild(d);return d;
  }
  function installSafeDraw(){
    const current=window.draw;if(current?.__tabelaSafeDraw)return;
    const safe=function(data){
      return new Promise(resolve=>{
        const photo=$('photo'),video=$('video');ensureScanFrame();
        if(!photo||!data){resolve();return}
        const img=new Image();
        img.onload=()=>{
          try{photo.width=img.naturalWidth||img.width;photo.height=img.naturalHeight||img.height;const ctx=photo.getContext('2d');ctx.clearRect(0,0,photo.width,photo.height);ctx.drawImage(img,0,0);photo.classList?.remove('hidden');video?.classList?.add('hidden');$('scanframe')?.classList?.add('hidden')}catch(error){console.warn('safe draw',error)}
          resolve();
        };
        img.onerror=()=>resolve();img.src=data;
      });
    };
    safe.__tabelaSafeDraw=true;safe.__previous=current;window.draw=safe;
  }
  function gpsAccuracy(){const m=($('gpsBadge')?.textContent||'').match(/±\s*(\d+)/);return m?Number(m[1]):null}
  function enforceGPSReadiness(){
    const acc=gpsAccuracy(),ready=$('fieldReadyBadge'),detail=$('fieldReadyDetail');if(!ready)return;
    if(Number.isFinite(acc)&&acc>50){
      ready.textContent=`GPS ZAYIF • ±${Math.round(acc)} m • KAYIT BEKLER`;ready.className='badge warn';ready.dataset.gpsWeak='1';
      if(detail&&!/GPS doğruluğu/i.test(detail.textContent||''))detail.insertAdjacentHTML('beforeend',` • GPS doğruluğu: <b>⚠ ±${Math.round(acc)} m</b>`);
      return;
    }
    if(ready.dataset.gpsWeak==='1'){
      ready.dataset.gpsWeak='0';
      ready.textContent='SAHA HAZIR';ready.className='badge ok';
      if(detail)detail.innerHTML=detail.innerHTML.replace(/\s*•\s*GPS doğruluğu:[^•<]*(?:<b>.*?<\/b>)?/i,'');
    }
  }
  function observeGPS(){
    const gps=$('gpsBadge'),ready=$('fieldReadyBadge');if(gps&&gps.dataset.runtimeFix!=='1'){gps.dataset.runtimeFix='1';new MutationObserver(enforceGPSReadiness).observe(gps,{childList:true,characterData:true,subtree:true})}
    if(ready&&ready.dataset.runtimeFix!=='1'){ready.dataset.runtimeFix='1';new MutationObserver(()=>setTimeout(enforceGPSReadiness,0)).observe(ready,{childList:true,characterData:true,subtree:true})}
    enforceGPSReadiness();
  }
  function boot(){ensureScanFrame();installSafeDraw();observeGPS();let n=0;const t=setInterval(()=>{ensureScanFrame();installSafeDraw();observeGPS();if(++n>24)clearInterval(t)},250)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.TabelaFieldRuntimeFix={version:'11.2.9-clean-camera-gps-block-status'};
})();
