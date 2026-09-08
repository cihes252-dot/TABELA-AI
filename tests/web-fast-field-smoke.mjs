import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const loader=read('app/v11_2/index.html'),fast=read('app/v11_2/fast-field.js'),ocr=read('app/v11_2/fast-ocr-engine.js'),tax=read('app/v11_2/sign-taxonomy.js'),sw=read('app/v11_2/service-worker.js');
const required=[
  [loader,'FAST FIELD 11.2.4'],[loader,'fast-field.js?b=11.2.4'],[loader,'fast-ocr-engine.js?b=11.2.4'],[loader,'sign-taxonomy.js?b=11.2.4'],
  [fast,'TabelaFastField'],[fast,'420'],[fast,'TabelaFastOCR.run'],[fast,'3000'],[fast,'AUTO ÖLÇÜ'],[fast,'requestAutoMetric'],[fast,'bboxNormalized'],[fast,'OTOMATİK TESPİT'],[fast,'Fotoğraf Çek + OCR'],[fast,'preCapture:true'],[fast,'manualPhoto:true'],
  [ocr,"createWorker('tur+eng'"],[ocr,'singlePass:true'],[ocr,'TURKISH_ALPHABET'],[ocr,'TARGET_MS=3000'],[ocr,'apple-vision'],[ocr,'tr-TR+en-US'],
  [tax,'Pylon / direk tabelası'],[tax,'Bina cephe / fascia tabelası'],[tax,'LED / dijital reklam ekranı'],[tax,'Durak reklamı / bus shelter'],
  [sw,'tabela-ai-v11-2-11.2.4-auto-predetect']
];
for(const [text,token] of required)if(!text.includes(token))throw new Error('V11.2.4 contract missing: '+token);
if(/TabelaMultiFrame\.capture/.test(fast))throw new Error('FAST FIELD must not use 5-frame OCR capture');
if(/\.click\(\).*autoTriggered/.test(fast))throw new Error('Photo capture must remain manual');
if(!/snapFrame\(v,null,\.94\)/.test(fast))throw new Error('Single high-resolution photo capture missing');
if(!/GERÇEK m: saf web tarayıcıda ARKit\/LiDAR yok/.test(fast))throw new Error('Web metric truthfulness guard missing');
const ocrPos=fast.indexOf('TabelaFastOCR.run'),photoPos=fast.indexOf('async function fastScan');if(!(ocrPos>photoPos))throw new Error('OCR must run after manual photo flow');
const open=loader.indexOf('<script>'),close=loader.indexOf('</script>',open+8),script=loader.slice(open+8,close);if(!script.includes('<\\/script>'))throw new Error('Loader escaped script terminator missing');
console.log('V11.2.4 FAST FIELD auto-predetect premeasure manual-photo OCR smoke test OK');