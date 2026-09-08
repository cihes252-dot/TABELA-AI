import fs from 'node:fs';

const file='app/v11_1/index.html';
const html=fs.readFileSync(file,'utf8');
const open=html.indexOf('<script>');
const close=html.indexOf('</script>',open+8);
if(open<0||close<0)throw new Error('V11.1 loader script block not found');
const script=html.slice(open+8,close);
const required=[
  'const oldSW=',
  'field-hardening.js?b=11.1.2',
  'resilience.js?b=11.1.2',
  'document.write(html)',
  'document.close()'
];
for(const token of required){
  if(!script.includes(token))throw new Error(`Loader script ended early or is missing: ${token}`);
}
if(script.includes('<script src="./storage-engine.js"></script>')){
  throw new Error('Raw </script> found inside V11.1 loader JavaScript string');
}
if(!script.includes('<\\/script>'))throw new Error('Escaped script terminator missing from loader string templates');
console.log('V11.1 loader smoke test OK');
