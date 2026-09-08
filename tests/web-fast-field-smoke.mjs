import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const loader=read('app/v11_2/index.html'),fast=read('app/v11_2/fast-field.js'),ocr=read('app/v11_2/fast-ocr-engine.js'),tax=read('app/v11_2/sign-taxonomy.js'),sw=read('app/v11_2/service-worker.js');
const required=[
  [loader,'FAST FIELD 11.2.0'],[loader,'fast-field.js?b=11.2.0'],[loader,'fast-ocr-engine.js?b=11.2.0'],[loader,'sign-taxonomy.js?b=11.2.0'],
  [fast,'TabelaFastField'],[fast,'520'],[fast,'TabelaFastOCR.run'],[fast,'3000'],
  [ocr,"createWorker('tur+eng'"],[ocr,'singlePass:true'],[ocr,'TURKISH_ALPHABET'],[ocr,'TARGET_MS=3000'],
  [tax,'Pylon / direk tabelası'],[tax,'Bina cephe / fascia tabelası'],[tax,'LED / dijital reklam ekranı'],[tax,'Durak reklamı / bus shelter'],
  [sw,'tabela-ai-v11-2-11.2.0-fast']
];
for(const [text,token] of required)if(!text.includes(token))throw new Error('V11.2 contract missing: '+token);
if(/TabelaMultiFrame\.capture/.test(fast))throw new Error('FAST FIELD must not use 5-frame capture');
if(!/const data=snap\(video,null,\.92\)/.test(fast))throw new Error('Single high-resolution frame capture missing');
const open=loader.indexOf('<script>'),close=loader.indexOf('</script>',open+8),script=loader.slice(open+8,close);
if(!script.includes('<\\/script>'))throw new Error('Loader escaped script terminator missing');
console.log('V11.2 FAST FIELD smoke test OK');
