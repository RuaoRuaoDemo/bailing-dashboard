const fs=require('fs');
const html=fs.readFileSync('c:/Users/Administrator/WorkBuddy/Claw/bailing-dashboard.html','utf8');
const start=html.indexOf('<script>')+8;
const end=html.lastIndexOf('</script>');
const js=html.slice(start,end);
let line=1;let col=1;
for(let i=0;i<js.length;i++){
  if(line===242){console.log('Line242 snippet:', js.slice(i, i+120)); break;}
  if(js[i]=='\n'){line++;col=1;} else col++;
}
