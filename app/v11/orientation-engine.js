(() => {
  let state={heading:null,alpha:null,beta:null,gamma:null,updatedAt:null,permission:'unknown'},started=false;
  function handler(e){const h=Number.isFinite(e.webkitCompassHeading)?e.webkitCompassHeading:(Number.isFinite(e.alpha)?(360-e.alpha)%360:null);state={heading:h,alpha:Number.isFinite(e.alpha)?e.alpha:null,beta:Number.isFinite(e.beta)?e.beta:null,gamma:Number.isFinite(e.gamma)?e.gamma:null,updatedAt:new Date().toISOString(),permission:'granted'}}
  async function start(){if(started)return state;try{if(typeof DeviceOrientationEvent!=='undefined'&&typeof DeviceOrientationEvent.requestPermission==='function'){const p=await DeviceOrientationEvent.requestPermission();state.permission=p;if(p!=='granted')return state}window.addEventListener('deviceorientationabsolute',handler,true);window.addEventListener('deviceorientation',handler,true);started=true;state.permission='granted'}catch(e){state.permission='denied';state.error=e.message}return state}
  function read(){return{...state}}
  function cardinal(h){if(!Number.isFinite(h))return null;const names=['K','KD','D','GD','G','GB','B','KB'];return names[Math.round(h/45)%8]}
  window.TabelaOrientation={start,read,cardinal,version:'11.0'};
})();