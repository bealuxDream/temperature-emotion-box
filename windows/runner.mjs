import {spawn} from 'node:child_process';
import {writeFile,appendFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createInterface} from 'node:readline';
const root=process.env.TEMPERATURE_LAUNCH_ROOT;
if(!root)throw new Error('Start through the Windows launcher.');
const state={runnerPid:process.pid,startedAt:new Date().toISOString(),status:'starting'};
const stateFile=join(root,'run.json'),logFile=join(root,'service.log');
let writes=Promise.resolve();
function save(){const snapshot=JSON.stringify(state,null,2);writes=writes.then(()=>writeFile(stateFile,snapshot));}
const child=spawn(process.execPath,[join(root,'host/node_modules/@deepseek-ai/dsh/lib/bin.js'),'web','--patch',join(root,'launcher.patch.yml'),'--port',process.env.TEMPERATURE_CHAT_PORT,'--no-open'],{cwd:join(root,'workspace'),env:{...process.env,DSH_HOME:join(root,'dsh')},windowsHide:true,stdio:['ignore','pipe','pipe']});
state.dshPid=child.pid;save();
let tail='',announced=false,exited=false,checking=false;
function capture(line){
  const raw=line+'\n';tail=(tail+raw).slice(-12000);
  void appendFile(logFile,raw.replace(/(token=)[^\s&#]+/g,'$1<redacted>'));
  const match=tail.match(/温度面板已就绪：(http:\/\/127\.0\.0\.1:\d+\/)/);
  if(match)state.dashboardUrl=match[1];
  if(/dsh web: http:\/\/127\.0\.0\.1:\d+\//.test(tail))announced=true;
  if(state.dashboardUrl&&announced&&!checking&&!exited){
    checking=true;
    void fetch(state.dashboardUrl+'health').then(r=>r.json()).then(r=>{if(!exited&&r.service==='temperature-emotion-box'){state.status='ready';save();}}).catch(()=>{}).finally(()=>{checking=false;});
  }
}
// Complete UTF-8 lines prevent chunk boundaries splitting tokens or readiness messages.
createInterface({input:child.stdout}).on('line',capture);
createInterface({input:child.stderr}).on('line',capture);
child.on('exit',code=>{exited=true;state.status='stopped';state.exitCode=code;save();});
child.on('error',e=>{exited=true;state.status='error';state.message=e.message;save();});
