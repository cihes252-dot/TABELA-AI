import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const loader=read('app/v11_2/index.html'),fast=read('app/v11_2/fast-field.js'),ocr=read('app/v11_2/fast-ocr-engine.js'),roi=read('app/v11_2/ocr-roi-guard.js'),manual=read('app/v11_2/manual-ocr-roi.js'),accuracy=read('app/v11_2/field-accuracy-fix.js'),tax=read('app/v11_2/sign-taxonomy.js'),webxr=read('app/v11_2/webxr-measurement.js'),diag=read('app/v11_2/field-diagnostics.js'),sw=read('app/v11_2/service-worker.js'),shape=read('app/v10/shape-engine.js'),clean=read('app/v11_2/camera-clean-ui.js'),runtime=read('app/v11_2/field-runtime-fix.js');
const required=[
  [loader,'FAST FIELD 11.2.12'],[loader,'fast-field.js?b=11.2.12'],[loader,'fast-ocr-engine.js?b=11.2.12'],[loader,'ocr-roi-guard.js?b=11.2.12'],[loader,'manual-ocr-roi.js?b=11.2.12'],[loader,'field-accuracy-fix.js?b=11.2.12'],[loader,'sign-taxonomy.js?b=11.2.12'],[loader,'webxr-measurement.js?b=11.2.12'],[loader,'field-diagnostics.js?b=11.2.12'],[loader,'OCR sonucu burada görünecek'],
  [fast,'TabelaFastField'],[fast,'420'],[fast,'TabelaFastOCR.run'],[fast,'3000'],[fast,'AUTO ÖLÇÜ'],[fast,'requestAutoMetric'],[fast,'bboxNormalized'],[fast,'OTOMATİK TESPİT'],[fast,'Fotoğraf Çek + OCR'],[fast,'preCapture:true'],[fast,'manualPhoto:true'],[fast,'stable-live-roi'],[fast,'selectPhotoSeg'],[fast,'normalizeShape'],
  [ocr,"createWorker('tur+eng'"],[ocr,'singlePass:true'],[ocr,'TURKISH_ALPHABET'],[ocr,'TARGET_MS=3000'],[ocr,'apple-vision'],[ocr,'tr-TR+en-US'],[ocr,'darkBackground'],[ocr,'dominantLines'],[ocr,'dominantLineSelection:true'],[ocr,'mergeLineWords'],
  [roi,'manual-operator-exact'],[roi,'detected-sign-exact'],[roi,'small-sign-guarded-expand'],[roi,'roi-guard-11.2.12'],
  [manual,'OCR alanını düzelt'],[manual,'Bu alanı oku'],[manual,'manualOcrRoi:true'],[manual,'manual-roi-11.2.12'],[manual,'tabela:fast-scan-complete'],
  [accuracy,'detected-sign-roi'],[accuracy,'headline-fallback-after-full-roi'],[accuracy,'ocrAttempts'],[accuracy,'lowConfidenceRejected'],[accuracy,'confidence>=68'],[accuracy,'Güven 70 altında'],
  [shape,'ellipseStrong'],[shape,'10.3-rectangle-first-sign-shape'],
  [clean,'cleanUnavailableMetricBadge'],[clean,'env(safe-area-inset-bottom'],[clean,'GPS ZAYIF'],
  [runtime,'GPS ZAYIF • ±'],[runtime,'KAYIT BEKLER'],[runtime,'11.2.9-clean-camera-gps-block-status'],
  [tax,'Pylon / direk tabelası'],[tax,'Bina cephe / fascia tabelası'],[tax,'LED / dijital reklam ekranı'],[tax,'Durak reklamı / bus shelter'],
  [webxr,'ios_webxr_disabled'],[webxr,"webxrPlatform:'android'"],
  [diag,'web-no-metric'],[diag,'native-ios-arkit-lidar'],[diag,'native-android-arcore-depth'],[diag,'android-webxr-arcore'],[diag,"querySelector('#settings .card')"],
  [sw,'tabela-ai-v11-2-11.2.12-manual-ocr-roi'],[sw,'./manual-ocr-roi.js'],[sw,'./ocr-roi-guard.js']
];
for(const [text,token] of required)if(!text.includes(token))throw new Error('V11.2.12 contract missing: '+token);
if(/TabelaMultiFrame\.capture/.test(fast))throw new Error('FAST FIELD must not use 5-frame OCR capture');
if(/\.click\(\).*autoTriggered/.test(fast))throw new Error('Photo capture must remain manual');
if(!/snapFrame\(v,null,\.94\)/.test(fast))throw new Error('Single high-resolution photo capture missing');
if(!/GERÇEK m: saf web tarayıcıda ARKit\/LiDAR yok/.test(fast))throw new Error('Fallback web metric truthfulness guard missing');
if(!/iOS WEB • gerçek metre kapalı/.test(webxr))throw new Error('iOS web truthfulness label missing');
if(!/shapeType==='oval'\|\|out\.shapeType==='circle'/.test(fast))throw new Error('Rectangle guard for weak oval/circle classification missing');
if(!/let first=await original\(data,shape,onProgress,timeoutMs\)/.test(accuracy))throw new Error('OCR must read detected sign ROI first');
if(!/remaining>=450/.test(accuracy))throw new Error('OCR recovery must stay inside the overall time budget');
if(!/shape\?\.manualOcrRoi===true/.test(roi))throw new Error('Operator OCR ROI must bypass automatic expansion');
if(!/currentOCR=\{\.\.\.result,text\}/.test(manual))throw new Error('Manual ROI OCR must update active OCR state');
const ocrPos=fast.indexOf('TabelaFastOCR.run'),photoPos=fast.indexOf('async function fastScan');if(!(ocrPos>photoPos))throw new Error('OCR must run after manual photo flow');
const open=loader.indexOf('<script>'),close=loader.indexOf('</script>',open+8),script=loader.slice(open+8,close);if(!script.includes('<\\/script>'))throw new Error('Loader escaped script terminator missing');
console.log('V11.2.12 FAST FIELD manual OCR ROI smoke test OK');