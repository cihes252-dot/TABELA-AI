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
  'iOS WebXR / ARKit köprüsü',
  'Android WebXR / ARCore',
  '11.2.5-webxr-hit-test-depth-crosscheck'
]) assert.ok(src.includes(token),'WebXR contract missing: '+token);

const document={readyState:'loading',addEventListener(){},getElementById(){return null},querySelector(){return null},createElement(){return{style:{},appendChild(){},remove(){},addEventListener(){}}},body:{appendChild(){}}};
const windowObj={isSecureContext:true,addEventListener(){},dispatchEvent(){}};
const context={window:windowObj,navigator:{userAgent:'Mozilla/5.0 (Linux; Android 15)',xr:null},document,console,CustomEvent:class{constructor(type,init){this.type=type;this.detail=init?.detail}},setInterval(){return 0},clearInterval(){},setTimeout(){return 0},performance:{now(){return 0}},Math,Number,Array,Date};
vm.runInNewContext(src,context,{filename:'webxr-measurement.js'});
const geometry=windowObj.TabelaWebXR?.geometry;
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

assert.throws(()=>geometry('polygon',[p(0,0),p(2,2),p(0,2),p(2,0)]),/kendi kendini kesiyor/);
assert.throws(()=>geometry('rectangle',[p(0,1,0),p(2,1,0),p(0,0,0),p(2,0,.2)]),/yeterince düz/);

console.log('TABELA AI WebXR measurement smoke tests passed');
