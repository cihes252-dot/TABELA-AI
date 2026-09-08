(() => {
  let last=null,lastAt=0,pending=null,pendingGps=null,lastAttemptAt=0,lastAttemptGps=null,lastError=null;
  const close=(a,b)=>!!(a&&b&&Number.isFinite(a.lat)&&Number.isFinite(a.lng)&&Number.isFinite(b.lat)&&Number.isFinite(b.lng)&&Math.abs(a.lat-b.lat)<.0002&&Math.abs(a.lng-b.lng)<.0002);

  async function fetchReverse(gps){
    const u=`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(gps.lat)}&lon=${encodeURIComponent(gps.lng)}&zoom=18&addressdetails=1&accept-language=tr`;
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
    try{
      const r=await fetch(u,{headers:{accept:'application/json'},cache:'no-store',signal:controller.signal});
      if(!r.ok)throw new Error('HTTP '+r.status);
      const j=await r.json(),a=j.address||{};
      const out={lat:gps.lat,lng:gps.lng,displayName:j.display_name||'',road:a.road||a.pedestrian||a.footway||'',neighbourhood:a.neighbourhood||a.suburb||a.quarter||'',district:a.city_district||a.district||'',city:a.city||a.town||a.municipality||a.province||'',postcode:a.postcode||'',country:a.country||'',source:'OpenStreetMap Nominatim'};
      last=out;lastAt=Date.now();lastError=null;return out;
    }catch(error){
      lastError={error:error?.name==='AbortError'?'timeout':String(error?.message||error),lat:gps.lat,lng:gps.lng,source:'reverse-geocode-unavailable'};
      return lastError;
    }finally{clearTimeout(timer)}
  }

  async function reverse(gps){
    if(!gps||!Number.isFinite(gps.lat)||!Number.isFinite(gps.lng))return null;
    const now=Date.now();
    if(last&&now-lastAt<60000&&close(last,gps))return last;
    if(pending&&close(pendingGps,gps))return pending;
    if(lastError&&now-lastAttemptAt<30000&&close(lastAttemptGps,gps))return lastError;
    lastAttemptAt=now;lastAttemptGps={lat:gps.lat,lng:gps.lng};pendingGps=lastAttemptGps;
    pending=fetchReverse(gps);
    try{return await pending}finally{pending=null;pendingGps=null}
  }

  window.TabelaAddress={reverse,version:'11.1.2-throttled-field'};
})();
