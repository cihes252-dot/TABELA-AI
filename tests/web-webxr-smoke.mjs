import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const src=fs.readFileSync('app/v11_2/webxr-measurement.js','utf8');
for(const token of [
  "requestSession('immersive-ar'",
  "requiredFeatures:['hit-test']",
  "'depth-sensing'",
  'getDepthInMeters?.(.5,.5)',
  'WebXR-HitTest-3D',
  'WebXR-HitTest+Depth-Sensing-3D',
  'Android WebXR / ARCore',
  'ios_webxr_disabled',
  "webxrPlatform:'android'",
  '11.2.6-android-only-webxr-truth-gated'
]) assert.ok(src.includes(token),'WebXR contract missing: '+token);

function makeContext(userAgent){
  const document={readyState:'loading',addEventListener(){},getElementById(){return null},querySelector(){return null},createElement(){return{style:{},appendChild(){},remove(){},addEventListener(){}}},body:{appendChild(){}}};
  const windowObj={isSecureContext:true,addEventListener(){},dispatchEvent(){}};
  const context={window:windowObj,navigator:{userAgent,xr:null},document,console,CustomEvent:class{constructor(type,init){this.type=type;this.detail=init?.detail}},setInterval(){return 0},clearInterval(){},setTimeout(){return 0},performance:{now(){return 0}},Math,Number,Array,Date};
  vm.runInNewContext(src,context,{filename:'webxr-measurement.js'});return windowObj;
}

const android=makeContext('Mozilla/5.0 (Linux; Android 15)');
assert.equal(android.TabelaWebXR.state.isAndroid,true);
assert.equal(android.TabelaWebXR.state.allowed,true);
const geometry=android.TabelaWebXR.geometry;
assert.equal(typeof geometry,'function');
const p=(x,y,z=0)=>({x,y,z});
const rect=geometry('rectangle',[p(0,1),p(2,1),p(0,0),p(2,0)]);
assert.ok(Math.abs(rect.widthM-2)<1e-9);
assert.ok(Math.abs(rect.heightM-1)<1e-9);
assert.ok(Math.abs(rect.areaM2-2)<1e-9);
assert.ok(rect.geometryQualityScore>=95);
const circle=geometry('circle',[p(-1,0),p(1,0),p(0,1),p(0,-1)]);
assert.ok(Math.abs(circle.diameterM-2)<1e-9);
assert.ok(Math.abs(circle.areaM2-Math.PI)<1e-9);
const triangle=geometry('triangle',[p(0,0),p(2,0),p(0,1)]);
assert.ok(Math.abs(triangle.areaM2-1)<1e-9);
const polygon=geometry('polygon',[p(0,0),p(2,0),p(2,1),p(1,0.5),p(0,1)]);
assert.ok(Math.abs(polygon.areaM2-1.5)<1e-9);
assert.throws(()=>geometry('polygon',[p(0,0),p(2,2),p(0,2),p(2,0)]),'self-crossing polygon must be rejected');
assert.throws(()=>geometry('rectangle',[p(0,1,0),p(2,1,0),p(0,0,0),p(2,0,.2)]),/yeterince düz/);

const ios=makeContext('Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)');
assert.equal(ios.TabelaWebXR.state.isIOS,true);
assert.equal(ios.TabelaWebXR.state.allowed,false);
assert.equal(ios.TabelaWebXR.state.immersiveAR,false);

console.log('TABELA AI Android-only WebXR truth-gate smoke tests passed');