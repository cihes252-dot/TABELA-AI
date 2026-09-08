const CACHE='tabela-ai-v11-2-11.2.5-webxr-bridge';
const CORE=[
  './','./index.html','./manifest.webmanifest','./sign-taxonomy.js','./fast-ocr-engine.js','./webxr-measurement.js','./fast-field.js',
  '../v11_1/resilience.js','../v11_1/field-hardening.js',
  '../v11/index.html','../v11/quality-engine.js','../v11/multiframe-engine.js','../v11/segmentation-engine.js',
  '../v11/perspective-engine.js','../v11/ocr-ensemble.js','../v11/fingerprint-engine.js','../v11/duplicate-engine.js',
  '../v11/orientation-engine.js','../v11/address-engine.js','../v11/material-engine.js','../v11/measurement-engine.js',
  '../v11/storage-engine.js','../v10/shape-engine.js','../v10/ocr-engine.js','../icon.svg',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css','https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'
];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(async cache=>{for(const url of CORE){try{const req=new Request(url,{cache:'reload',mode:url.startsWith('http')?'no-cors':'same-origin'});const res=await fetch(req);if(res&&(res.ok||res.type==='opaque'))await cache.put(req,res)}catch(error){console.warn('cache skip',url,error)}}}).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('tabela-ai-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;const url=new URL(event.request.url);
  if(url.origin!==self.location.origin){event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request).then(res=>{if(res&&(res.ok||res.type==='opaque'))caches.open(CACHE).then(c=>c.put(event.request,res.clone())).catch(()=>{});return res}).catch(()=>hit||new Response('',{status:503,statusText:'Offline'}))));return}
  const nav=event.request.mode==='navigate';
  event.respondWith(fetch(event.request,{cache:'no-store'}).then(res=>{if(res?.ok)caches.open(CACHE).then(c=>c.put(event.request,res.clone())).catch(()=>{});return res}).catch(async()=>{const exact=await caches.match(event.request);if(exact)return exact;const clean=await caches.match(new Request(url.origin+url.pathname));if(clean)return clean;if(nav)return(await caches.match('./index.html'))||new Response('TABELA AI çevrimdışı',{status:503});return new Response('',{status:503,statusText:'Offline'})}));
});