const fs=require('fs');
const html=fs.readFileSync('c:/Users/Administrator/WorkBuddy/Claw/bailing-dashboard.html','utf8');
const start=html.indexOf('<script>')+8;
const end=html.lastIndexOf('</script>');
const js=html.slice(start,end);
let stack=[];let line=1;let col=0;let inStr=null;let esc=false;
for(let i=0;i<js.length;i++){
  const ch=js[i];
  if(ch==='\n'){line++;col=0;continue;}
  col++;
  if(esc){esc=false;continue;}
  if(inStr){ if(ch==='\\') {esc=true;continue;} if(ch===inStr){inStr=null;} continue; }
  if(ch==='"'||ch==="'"||ch==='`'){inStr=ch;continue;}
  if(ch==='('||ch==='{'||ch==='[') stack.push({ch,line,col});
  else if(ch===')'||ch==='}'||ch===']'){
    if(!stack.length){ console.log('First unexpected', ch, 'at line', line, 'col', col); process.exit(0); }
    stack.pop();
  }
}
console.log('No negative. Remaining stack', stack.length);
