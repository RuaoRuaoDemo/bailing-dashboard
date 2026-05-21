const fs=require('fs');
const html=fs.readFileSync('c:/Users/Administrator/WorkBuddy/Claw/bailing-dashboard.html','utf8');
const start=html.indexOf('<script>')+8;
const end=html.lastIndexOf('</script>');
const js=html.slice(start,end).split('\n');
let depth=0;let inStr=null;let esc=false;
js.forEach((line,idx)=>{
  for(let i=0;i<line.length;i++){
    const ch=line[i];
    if(esc){esc=false;continue;}
    if(inStr){ if(ch==='\\') {esc=true; continue;} if(ch===inStr){inStr=null;} continue; }
    if(ch==='"'||ch==="'"||ch==='`'){inStr=ch;continue;}
    if(ch==='('||ch==='{'||ch==='[') depth++;
    else if(ch===')'||ch==='}'||ch===']') depth--;
  }
  if(depth<0){ console.log('Negative at line', idx+1, 'depth', depth, '|', line.substring(0,80)); }
});
console.log('final depth',depth);
