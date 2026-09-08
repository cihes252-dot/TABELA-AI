const CACHE='tabela-ai-v11-1-11.1.2';
const CORE=[
  './','./index.html','./manifest.webmanifest','./resilience.js',
  '../v11/index.html','../v11/quality-engine.js','../v11/multiframe-engine.js','../v11/segmentation-engine.js',
  '../v11/perspective-engine.js','../v11/ocr-ensemble.js','../v11/fingerprint-engine.js','../v11/duplicate-engine.js',
  '../v11/orientation-engine.js','../v11/address-engine.js','../v11/material-engine.js','../v11/measurement-engine.js',
  '../v11/storage-engine.js','../v10/shape-engine.js','../v10/ocr-engine.js','../icon.svg'
];

self.addEventListener('install',event=>event.waitUntil(
  caches.open(CACHE).then(async cache=>{
    for(const url of CORE){
      try{await cache.add(new Request(url,{cache:'reload'}))}catch(error){console.warn('cache skip',url,error)}
    }
  }).then(()=>self.skipWaiting())
));

self.addEventListener('activate',event=>event.waitUntil(
  caches.keys()
    .then(keys=>Promise.all(keys.filter(key=>key.startsWith('tabela-ai-')&&key!==CACHE).map(key=>caches.delete(key))))
    .then(()=>self.clients.claim())
));

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);

  if(url.origin!==self.location.origin){
    event.respondWith(
      caches.match(event.request).then(hit=>hit||fetch(event.request).then(response=>{
        if(response&&response.ok){
          caches.open(CACHE).then(cache=>cache.put(event.request,response.clone())).catch(()=>{});
        }
        return response;
      }).catch(()=>hit||new Response('',{status:503,statusText:'Offline'})))
    );
    return;
  }

  const isNavigation=event.request.mode==='navigate';
  event.respondWith(
    fetch(event.request,{cache:'no-store'}).then(response=>{
      if(response&&response.ok){
        const copy=response.clone();
        caches.open(CACHE).then(cache=>cache.put(event.request,copy)).catch(()=>{});
      }
      return response;
    }).catch(async()=>{
      const exact=await caches.match(event.request);
      if(exact)return exact;
      const clean=new Request(url.origin+url.pathname,{method:'GET'});
      const cleanHit=await caches.match(clean);
      if(cleanHit)return cleanHit;
      if(isNavigation)return (await caches.match('./index.html'))||new Response('TABELA AI çevrimdışı',{status:503});
      return new Response('',{status:503,statusText:'Offline'});
    })
  );
});
