import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const dispatched=[];
globalThis.CustomEvent=class CustomEvent {
  constructor(type,init={}){this.type=type;this.detail=init.detail;}
};
globalThis.document={
  readyState:'complete',
  getElementById(){return null;},
  addEventListener(){}
};
globalThis.window={
  TabelaNativeCapabilities:{},
  addEventListener(){},
  dispatchEvent(event){dispatched.push(event);return true;}
};

const code=fs.readFileSync(new URL('../app/v11/measurement-engine.js',import.meta.url),'utf8');
vm.runInThisContext(code,{filename:'measurement-engine.js'});
const metric=globalThis.window.TabelaMetric;
assert.ok(metric,'TabelaMetric global must exist');

function mustReject(payload,pattern){
  assert.throws(()=>metric.normalize(payload),pattern);
}

const baseAR={
  verified:true,
  source:'ARKit-DetectedPlane-Raycast',
  shapeType:'horizontal-rectangle',
  qualityScore:86,
  widthM:2,
  heightM:1,
  areaM2:2,
  pointCount:4,
  planeDeviationM:0.004,
  failureReasons:[]
};
const ar=metric.normalize(baseAR);
assert.equal(ar.accepted,true);
assert.equal(ar.measurementThreshold,80);
assert.equal(ar.areaM2,2);

mustReject({...baseAR,verified:false},/Doğrulanmamış/);
mustReject({...baseAR,source:'RGB-pixels'},/3D ölçüm kaynağı/);
mustReject({...baseAR,qualityScore:40},/ölçüm kalitesi yetersiz/);
mustReject({...baseAR,pointCount:3},/beklenen 3D nokta/);

const lidar={
  ...baseAR,
  source:'LiDAR-ARKit-SceneDepth-Reprojected+Raycast',
  lidar:true,
  depthAssisted:true,
  qualityScore:96,
  depthSamplesM:[2.0,2.02,2.01,2.0],
  depthConfidence:[2,2,2,2],
  depthSpreadM:[0.012,0.014,0.011,0.013],
  depthRaycastErrorM:[0.020,0.022,0.019,0.021],
  maxDepthRaycastErrorM:0.022
};
const lidarAccepted=metric.normalize(lidar);
assert.equal(lidarAccepted.accepted,true);
assert.equal(lidarAccepted.measurementThreshold,88);

mustReject({...lidar,depthRaycastErrorM:[0.20,0.022,0.019,0.021],maxDepthRaycastErrorM:0.20},/LiDAR ve ARKit/);
mustReject({...lidar,depthConfidence:[0,2,2,2]},/LiDAR güven/);
mustReject({...lidar,depthSpreadM:[0.20,0.014,0.011,0.013]},/LiDAR yüzey/);
mustReject({...lidar,depthRaycastErrorM:[0.02,0.022],maxDepthRaycastErrorM:0.022},/çapraz kontrol verisi eksik/);

const androidDepth={
  ...baseAR,
  source:'ARCore-Depth-HitTest-3D',
  lidar:false,
  depthAssisted:true,
  arcoreDepth:true,
  qualityScore:94
};
const androidAccepted=metric.normalize(androidDepth);
assert.equal(androidAccepted.accepted,true);
assert.equal(androidAccepted.measurementThreshold,88);

const triangle=metric.normalize({
  verified:true,
  source:'ARCore-Plane-HitTest-3D',
  shapeType:'triangle',
  qualityScore:84,
  widthM:3,
  heightM:2,
  areaM2:3,
  pointCount:3,
  planeDeviationM:0,
  failureReasons:[]
});
assert.equal(triangle.areaM2,3);

console.log('TABELA AI web measurement trust smoke tests passed');
