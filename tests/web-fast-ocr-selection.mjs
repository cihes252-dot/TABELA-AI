import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const code=fs.readFileSync('app/v11_2/fast-ocr-engine.js','utf8');
const sandbox={window:{},performance:{now:()=>0},Image:function(){},console};
vm.runInNewContext(code,sandbox,{filename:'fast-ocr-engine.js'});
const t=sandbox.window.TabelaFastOCR?.__test;
assert.ok(t,'OCR test helpers missing');

const words=[
  {text:'pe',confidence:41,bbox:{x0:15,y0:18,x1:35,y1:28}},
  {text:'aay',confidence:39,bbox:{x0:45,y0:20,x1:72,y1:29}},
  {text:'OL',confidence:88,bbox:{x0:120,y0:70,x1:180,y1:125}},
  {text:'EX',confidence:91,bbox:{x0:188,y0:69,x1:252,y1:126}},
  {text:'PPF',confidence:75,bbox:{x0:270,y0:84,x1:309,y1:111}},
  {text:'WINDOW',confidence:78,bbox:{x0:315,y0:84,x1:386,y1:111}},
  {text:'FILM',confidence:79,bbox:{x0:392,y0:84,x1:438,y1:111}},
  {text:'GENSESEZ',confidence:48,bbox:{x0:90,y0:165,x1:155,y1:179}},
  {text:'town',confidence:46,bbox:{x0:170,y0:166,x1:202,y1:179}}
];
const selected=t.chooseText({text:'pe aay OL EX PPF WINDOW FILM GENSESEZ town',words});
assert.match(selected.text,/OLEX/,'Split main brand should merge into OLEX');
assert.doesNotMatch(selected.text,/pe|aay|GENSESEZ|town/i,'Small noisy rows must not dominate OCR output');
assert.ok(selected.wordConfidence>=70,'Dominant sign line should retain useful confidence');

const single=t.chooseText({text:'BAŞAKŞEHİR BELEDİYESİ',words:[
  {text:'BAŞAKŞEHİR',confidence:93,bbox:{x0:20,y0:40,x1:190,y1:82}},
  {text:'BELEDİYESİ',confidence:91,bbox:{x0:205,y0:40,x1:360,y1:82}}
]});
assert.equal(single.text,'BAŞAKŞEHİR BELEDİYESİ');

const blockWords=t.collectWords({blocks:[{paragraphs:[{lines:[{words:[
  {text:'OLEX',confidence:92,bbox:{x0:10,y0:10,x1:95,y1:48}},
  {text:'WINDOW',confidence:84,bbox:{x0:105,y0:12,x1:190,y1:45}}
]}]}]}]});
assert.equal(blockWords.length,2,'Tesseract blocks must be flattened to words');
assert.equal(blockWords[0].text,'OLEX');

assert.equal(t.plausibility('OLEX PPF WINDOW FILM',86).accepted,true,'Real sign-like text should pass plausibility gate');
assert.equal(t.plausibility('3 I j vi di',47).accepted,false,'Fragmented OCR noise must be rejected');
assert.equal(t.plausibility('BAŞAKŞEHİR',91).accepted,true,'Turkish brand/city text should pass');

console.log('V11.2.13 single-pass Turkish sign OCR selection tests passed');