const fs=require('fs'),path=require('path');
const NM='/home/claude/abnt/node_modules';
const libs={
 'jszip/3.10.1/jszip.min.js':'jszip/dist/jszip.min.js',
 'pdf.js/3.11.174/pdf.min.js':'pdfjs-dist/build/pdf.min.js',
 'pdf.js/3.11.174/pdf.worker.min.js':'pdfjs-dist/build/pdf.worker.min.js',
 'docx-preview@0.3.5/dist/docx-preview.min.js':'docx-preview/dist/docx-preview.min.js',
 'html2canvas/1.4.1/html2canvas.min.js':'html2canvas/dist/html2canvas.min.js',
 'jspdf/2.5.1/jspdf.umd.min.js':'jspdf/dist/jspdf.umd.min.js'};
let h=fs.readFileSync(process.argv[2],'utf8');
h=h.replace(/<link[^>]+fonts\.(googleapis|gstatic)[^>]*>\s*/g,'');
let n=0;
h=h.replace(/<script([^>]*)src="https?:\/\/[^"]+?\/(?:ajax\/libs\/|npm\/)([^"]+)"([^>]*)><\/script>/g,(m,a,key,b)=>{
  const f=libs[key]; if(!f) throw new Error('lib desconhecida '+key);
  n++; const js=fs.readFileSync(path.join(NM,f),'utf8').replace(/<\/script/gi,'<\\/script');
  return `<script${(a+b).replace(/\s(integrity|crossorigin|referrerpolicy)="[^"]*"/g,'')}>\n${js}\n</script>`;});
if(n!==6) throw new Error('esperava 6 libs, achei '+n);
if(/https?:\/\/(cdnjs|cdn\.jsdelivr|fonts\.)/.test(h)) console.warn('AVISO: ainda há referência externa');
h=h.replace('<title>','<title>(offline) ');
fs.writeFileSync(process.argv[3],h);
console.log('ok',n,'libs,',(h.length/1e6).toFixed(2),'MB');
