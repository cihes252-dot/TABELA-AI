(() => {
  const DB='tabela_ai_v11',VER=1,REC='records',PH='photos',AUD='audit',Q='queue';
  let dbp=null;

  function db(){
    if(dbp)return dbp;
    dbp=new Promise((ok,fail)=>{
      const r=indexedDB.open(DB,VER);
      r.onupgradeneeded=()=>{
        const d=r.result;
        if(!d.objectStoreNames.contains(REC))d.createObjectStore(REC,{keyPath:'id'});
        if(!d.objectStoreNames.contains(PH))d.createObjectStore(PH,{keyPath:'id'});
        if(!d.objectStoreNames.contains(AUD)){
          const s=d.createObjectStore(AUD,{keyPath:'auditId'});
          s.createIndex('recordId','recordId');
        }
        if(!d.objectStoreNames.contains(Q))d.createObjectStore(Q,{keyPath:'queueId'});
      };
      r.onsuccess=()=>{
        r.result.onversionchange=()=>r.result.close();
        ok(r.result);
      };
      r.onerror=()=>fail(r.error||new Error('indexeddb_open_failed'));
      r.onblocked=()=>fail(new Error('indexeddb_blocked'));
    });
    return dbp;
  }

  function friendlyError(error){
    const name=error?.name||'';
    if(name==='QuotaExceededError')return new Error('Cihaz depolama alanı dolu. Kayıt ve fotoğraf kaydedilemedi.');
    return error instanceof Error?error:new Error(String(error||'storage_error'));
  }

  async function atomic(storeNames,mode,fn){
    const d=await db();
    return new Promise((ok,fail)=>{
      let result;
      const t=d.transaction(storeNames,mode);
      const stores=Object.fromEntries(storeNames.map(name=>[name,t.objectStore(name)]));
      try{result=fn(stores,t)}catch(error){try{t.abort()}catch{}fail(friendlyError(error));return}
      t.oncomplete=()=>ok(result);
      t.onerror=()=>fail(friendlyError(t.error));
      t.onabort=()=>fail(friendlyError(t.error||new Error('storage_transaction_aborted')));
    });
  }

  async function tx(store,mode,fn){return atomic([store],mode,stores=>fn(stores[store]))}
  async function request(store,method,arg){
    const d=await db();
    return new Promise((ok,fail)=>{
      const s=d.transaction(store,'readonly').objectStore(store);
      const r=arg===undefined?s[method]():s[method](arg);
      r.onsuccess=()=>ok(r.result);
      r.onerror=()=>fail(friendlyError(r.error));
    });
  }
  async function getAll(store){return(await request(store,'getAll'))||[]}
  async function count(store){return Number(await request(store,'count'))||0}

  const aid=()=>`A-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`;
  const qid=()=>`Q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`;
  const now=()=>new Date().toISOString();
  const auditRow=(recordId,action,before,after,actor='field-device')=>({auditId:aid(),recordId,action,before:before||null,after:after||null,actor,at:now()});
  const queueRow=item=>({...item,queueId:qid(),queuedAt:now()});

  async function audit(recordId,action,before,after,actor='field-device'){
    const row=auditRow(recordId,action,before,after,actor);
    await tx(AUD,'readwrite',s=>s.put(row));
    return row;
  }
  async function list(){return(await getAll(REC)).sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)))}
  async function get(id){return(await request(REC,'get',id))||null}

  async function add(record,photoData){
    if(!record?.id)throw new Error('record_id_required');
    const createdAudit=auditRow(record.id,'create',null,record);
    const queued=queueRow({type:'upsert',record});
    await atomic([REC,PH,AUD,Q],'readwrite',s=>{
      s[REC].put(record);
      if(photoData)s[PH].put({id:record.id,data:photoData,at:now()});
      s[AUD].put(createdAudit);
      s[Q].put(queued);
    });
    return record;
  }

  async function update(id,patch,actor='field-device'){
    const before=await get(id);
    if(!before)throw new Error('record_not_found');
    const after={...before,...patch,id:before.id,updatedAt:now()};
    const row=auditRow(id,'update',before,after,actor);
    const queued=queueRow({type:'upsert',record:after});
    await atomic([REC,AUD,Q],'readwrite',s=>{
      s[REC].put(after);
      s[AUD].put(row);
      s[Q].put(queued);
    });
    return after;
  }

  async function remove(id,actor='field-device'){
    const before=await get(id);
    if(!before)return false;
    const row=auditRow(id,'delete',before,null,actor);
    const queued=queueRow({type:'delete',id});
    await atomic([REC,PH,AUD,Q],'readwrite',s=>{
      s[REC].delete(id);
      s[PH].delete(id);
      s[AUD].put(row);
      s[Q].put(queued);
    });
    return true;
  }

  async function photo(id){return(await request(PH,'get',id))?.data||null}
  async function audits(recordId){
    const d=await db();
    return new Promise((ok,fail)=>{
      const i=d.transaction(AUD,'readonly').objectStore(AUD).index('recordId');
      const r=i.getAll(recordId);
      r.onsuccess=()=>ok((r.result||[]).sort((a,b)=>a.at.localeCompare(b.at)));
      r.onerror=()=>fail(friendlyError(r.error));
    });
  }
  async function enqueue(item){const row=queueRow(item);await tx(Q,'readwrite',s=>s.put(row));return row}
  async function queue(){return(await getAll(Q)).sort((a,b)=>String(a.queuedAt).localeCompare(String(b.queuedAt)))}
  async function clearQueue(ids){if(!ids?.length)return;return tx(Q,'readwrite',s=>{for(const id of ids)s.delete(id)})}

  async function sync(endpoint){
    if(!endpoint)return{ok:false,reason:'endpoint_missing',sent:0,left:(await queue()).length};
    endpoint=endpoint.replace(/\/$/,'');
    const q=await queue(),done=[],failed=[];
    for(const item of q){
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),20000);
      try{
        const url=item.type==='delete'?`${endpoint}/api/signs/${encodeURIComponent(item.id)}`:`${endpoint}/api/signs`;
        const r=await fetch(url,{method:item.type==='delete'?'DELETE':'POST',headers:{'content-type':'application/json'},body:item.type==='delete'?undefined:JSON.stringify(item.record),signal:controller.signal});
        if(!r.ok)throw new Error(`HTTP ${r.status}`);
        done.push(item.queueId);
      }catch(error){
        failed.push({queueId:item.queueId,error:error?.name==='AbortError'?'timeout':String(error?.message||error)});
      }finally{clearTimeout(timer)}
    }
    if(done.length)await clearQueue(done);
    return{ok:failed.length===0,sent:done.length,left:failed.length,failed};
  }

  function csv(rows){
    const cols=['id','createdAt','project','signType','shapeLabel','ocr','ocrConfidence','ocrValidated','qualityScore','panel','lettering','address','heading','latitude','longitude','gpsAccuracy','measurementVerified','measurementSource','measurementQuality','widthM','heightM','diameterM','areaM2','distanceM','duplicateScore'];
    const e=v=>'"'+String(v??'').replaceAll('"','""')+'"';
    return'\ufeff'+[cols.join(','),...rows.map(r=>cols.map(k=>{const m={latitude:r.gps?.lat,longitude:r.gps?.lng,gpsAccuracy:r.gps?.accuracy,address:r.address?.displayName,heading:r.orientation?.heading,measurementQuality:r.measurementQualityScore};return e(k in m?m[k]:r[k])}).join(','))].join('\n');
  }
  function download(name,text,type){const b=new Blob([text],{type}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}
  async function exportCSV(){download('tabela_ai_v11_1.csv',csv(await list()),'text/csv;charset=utf-8')}
  async function exportJSON(){download('tabela_ai_v11_1.json',JSON.stringify(await list(),null,2),'application/json')}

  async function health(){
    const [records,photos,auditsCount,queued]=await Promise.all([count(REC),count(PH),count(AUD),count(Q)]);
    let usage=null,quota=null,persisted=null;
    try{
      const estimate=await navigator.storage?.estimate?.();
      usage=Number.isFinite(estimate?.usage)?estimate.usage:null;
      quota=Number.isFinite(estimate?.quota)?estimate.quota:null;
    }catch{}
    try{persisted=await navigator.storage?.persisted?.()}catch{}
    return{ok:true,records,photos,audits:auditsCount,queued,usage,quota,persisted,indexedDB:true,version:'11.1.2-indexeddb-atomic'};
  }

  async function requestPersistentStorage(){
    if(!navigator.storage?.persist)return{supported:false,persisted:false};
    try{
      const persisted=await navigator.storage.persist();
      return{supported:true,persisted:!!persisted};
    }catch(error){return{supported:true,persisted:false,error:String(error?.message||error)}}
  }

  async function clear(){
    await atomic([REC,PH,AUD,Q],'readwrite',s=>{for(const n of [REC,PH,AUD,Q])s[n].clear()});
  }

  window.TabelaStorage={list,get,add,update,remove,photo,audits,audit,queue,sync,exportCSV,exportJSON,health,requestPersistentStorage,clear,version:'11.1.2-indexeddb-atomic'};
})();
