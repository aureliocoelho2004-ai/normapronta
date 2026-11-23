const fs=require('fs');
const core=fs.readFileSync(__dirname+'/core.js','utf8');
const t=fs.readFileSync(__dirname+'/template.html','utf8');
fs.writeFileSync(__dirname+'/../index.html', t.replace('/*CORE*/', ()=>core));
console.log('built', fs.statSync(__dirname+'/../index.html').size);
