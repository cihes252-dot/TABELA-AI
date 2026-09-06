(() => {
  const KEY='tabela_ai_v10_records',QUEUE='tabela_ai_v10_sync_queue';
  const read=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch{return[]}};
  const write=records=>localStorage.setItem(KEY,JSON.stringify(records||[]));
  function add(record){const a=read();a.push(record);write(a);enqueue({type:'upsert',record});return record}
  function remove(id){const a=read().filter(x=>x.id!==id);write(a);enqueue({type:'delete',id});return a}
  function clear(){localStorage.removeItem(KEY);localStorage.removeItem(QUEUE)}
  function enqueue(item){let q=[];try{q=JSON.parse(localStorage.getItem(QUEUE)||'[]')}catch{}q.push({...item,queuedAt:new Date().toISOString()});localStorage.setItem(QUEUE,JSON.stringify(q))}
  function queue(){try{return JSON.parse(localStorage.getItem(QUEUE)||'[]')}catch{return[]}}
  function setQueue(q){localStorage.setItem(QUEUE,JSON.stringify(q||[]))}
  function csv(records=read()){const cols=['id','createdAt','project','signType','shapeLabel','ocr','ocrConfidence','panel','lettering','latitude','longitude','gpsAccuracy','measurementVerified','widthM','heightM','diameterM','areaM2','distanceM','duplicateScore'];const esc=v=>'"'+String(v??'').replaceAll('"','""')+'"';return[cols.join(','),...records.map(r=>cols.map(k=>{const map={latitude:r.gps?.lat,longitude:r.gps?.lng,gpsAccuracy:r.gps?.accuracy};return esc(k in map?map[k]:r[k])}).join(','))].join('\n')}
  function download(name,text,type='text/plain'){const b=new Blob([text],{type}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}
  function exportCSV(){download('tabela_ai_v10.csv','\ufeff'+csv(),'text/csv;charset=utf-8')}
  function exportJSON(){download('tabela_ai_v10.json',JSON.stringify(read(),null,2),'application/json')}
  async function sync(endpoint){if(!endpoint)return{ok:false,reason:'endpoint_missing'};let q=queue(),sent=0,left=[];for(const item of q){try{const url=item.type==='delete'?`${endpoint}/api/signs/${encodeURIComponent(item.id)}`:`${endpoint}/api/signs`,res=await fetch(url,{method:item.type==='delete'?'DELETE':'POST',headers:{'content-type':'application/json'},body:item.type==='delete'?undefined:JSON.stringify(item.record)});if(!res.ok)throw new Error(String(res.status));sent++}catch{left.push(item)}}setQueue(left);return{ok:left.length===0,sent,left:left.length}}
  window.TabelaStorage={read,write,add,remove,clear,queue,exportCSV,exportJSON,sync,version:'10.0'};
})();