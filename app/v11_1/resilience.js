(() => {
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const mb=n=>Number.isFinite(n)?(n/1024/1024).toFixed(1)+' MB':'—';

  async function readStorageHealth(){
    try{return await window.TabelaStorage?.health?.()||{ok:false}}
    catch(error){return{ok:false,error:String(error?.message||error)}}
  }

  function metricText(){
    try{
      const c=window.TabelaMetric?.capability?.()||{};
      if(c.available)return `Native ${esc(c.platform||'AR')} hazır`;
      return 'Native ölçüm köprüsü yok';
    }catch{return 'Ölçüm motoru durumu alınamadı'}
  }

  async function renderDiagnostics(){
    const box=$('engineInfo');
    if(!box)return;
    const h=await readStorageHealth();
    const caps=window.TabelaNativeCapabilities||{};
    const nativeOCR=!!window.TabelaOCREnsemble?.nativeAvailable?.();
    const webOCR=!!window.TabelaOCREnsemble?.webAvailable?.();
    const camera=!!navigator.mediaDevices?.getUserMedia;
    const gps=!!navigator.geolocation;
    const map=!!window.L;
    const online=navigator.onLine;
    const storageLine=h.ok
      ? `${h.records} kayıt • ${h.photos} foto • ${h.queued} bekleyen senkron • ${mb(h.usage)} / ${mb(h.quota)}${h.persisted===true?' • kalıcı':h.persisted===false?' • geçici':''}`
      : `depolama kontrol edilemedi${h.error?' • '+esc(h.error):''}`;
    const sensor=[];
    if(caps.lidar)sensor.push('LiDAR');
    if(caps.sceneDepth)sensor.push('Scene Depth');
    if(caps.arkit)sensor.push('ARKit');
    if(caps.arcore)sensor.push('ARCore');
    if(caps.arcoreDepth)sensor.push('ARCore Depth');
    if(!sensor.length)sensor.push(caps.app?'AR yeteneği bekleniyor':'web modu');

    const base=`
      <b>V11.1.2 saha dayanıklılık kontrolü</b><br>
      Bağlantı: <b>${online?'çevrimiçi':'çevrimdışı'}</b><br>
      Kamera API: <b>${camera?'hazır':'yok'}</b> • GPS: <b>${gps?'hazır':'yok'}</b><br>
      OCR: native <b>${nativeOCR?'hazır':'yok'}</b> • web <b>${webOCR?'hazır':'yok'}</b><br>
      Harita motoru: <b>${map?'hazır':'çevrimdışı liste modu'}</b><br>
      Sensör: <b>${esc(sensor.join(' + '))}</b><br>
      Metric: <b>${metricText()}</b><br>
      Depolama: <b>${storageLine}</b>`;
    const old=box.dataset.coreInfo||box.innerHTML;
    if(!box.dataset.coreInfo)box.dataset.coreInfo=old;
    box.innerHTML=old+'<hr style="border:0;border-top:1px solid #263852;margin:12px 0">'+base;

    if(navigator.storage?.persist && h.persisted!==true && !$('persistStorageBtn')){
      const btn=document.createElement('button');
      btn.id='persistStorageBtn';
      btn.textContent='💾 Kalıcı saha depolaması iste';
      btn.style.marginTop='10px';
      btn.onclick=async()=>{
        btn.disabled=true;
        const r=await window.TabelaStorage?.requestPersistentStorage?.();
        btn.textContent=r?.persisted?'✓ Kalıcı depolama etkin':'Depolama kalıcılığı cihaz tarafından verilmedi';
        await renderDiagnostics();
      };
      box.appendChild(btn);
    }
  }

  async function renderOfflineMap(){
    const canvas=$('mapCanvas');
    if(!canvas)return;
    let rows=[];
    try{rows=await window.TabelaStorage?.list?.()||[]}catch{}
    const pts=rows.filter(r=>Number.isFinite(r.gps?.lat)&&Number.isFinite(r.gps?.lng)).reverse();
    canvas.style.height='auto';
    canvas.style.minHeight='300px';
    canvas.innerHTML=`<div style="padding:14px;background:#091424;border-radius:12px">
      <b>Çevrimdışı koordinat görünümü</b>
      <p class="muted">Harita kütüphanesi veya internet bağlantısı yok. Kayıtlar ve GPS koordinatları cihazda korunur; harita karoları bağlantı geldiğinde açılır.</p>
      ${pts.length?pts.map(r=>`<div class="item"><b>${esc(r.ocr||r.id)}</b><div class="muted">${Number(r.gps.lat).toFixed(6)}, ${Number(r.gps.lng).toFixed(6)} • ±${Math.round(Number(r.gps.accuracy)||0)} m</div><div class="muted">${esc(r.address?.displayName||'Adres çevrimdışı alınamamış olabilir')}</div></div>`).join(''):'<div class="muted">GPS koordinatlı kayıt yok.</div>'}
    </div>`;
  }

  function showRuntimeError(message){
    const s=$('scanStatus');
    if(s)s.textContent='İşlem tamamlanamadı: '+String(message||'bilinmeyen hata');
  }

  function init(){
    if(!navigator.mediaDevices?.getUserMedia){
      const b=$('startCam');
      if(b){b.disabled=true;b.textContent='Kamera API desteklenmiyor'}
      showRuntimeError('Bu tarayıcı kamera erişimini desteklemiyor. Native TABELA AI uygulamasını kullanın.');
    }
    renderDiagnostics();
  }

  document.addEventListener('click',async event=>{
    const mapButton=event.target.closest?.('[data-go="map"]');
    if(mapButton&&!window.L){
      event.preventDefault();
      event.stopImmediatePropagation();
      document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
      $('map')?.classList.add('active');
      await renderOfflineMap();
    }
  },true);

  window.addEventListener('online',renderDiagnostics);
  window.addEventListener('offline',renderDiagnostics);
  window.addEventListener('tabela:native-capabilities',renderDiagnostics);
  window.addEventListener('unhandledrejection',event=>{
    const reason=event.reason?.message||event.reason;
    if(reason)showRuntimeError(reason);
  });
  window.addEventListener('error',event=>{
    if(event?.message)showRuntimeError(event.message);
  });

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
  window.TabelaResilience={renderDiagnostics,renderOfflineMap,version:'11.1.2'};
})();
