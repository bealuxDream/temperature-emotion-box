import { spawnSync } from 'node:child_process';
import { access,readFile,rename,mkdir,copyFile } from 'node:fs/promises';
import { resolve,dirname } from 'node:path';
import {randomUUID} from 'node:crypto';
import net from 'node:net';
import { runtimePath } from './run-dsh.mjs';
import { root } from './setup.mjs';

const packageInfo=JSON.parse(await readFile(resolve(root,'plugins/temperature/package.json'),'utf8'));
const tarball=resolve(root,'.local',packageInfo.name+'-'+packageInfo.version+'.tgz');
await access(tarball);
const profile=resolve(root,'.local/dsh/profiles/web');
const dshBin=resolve(root,'node_modules/@deepseek-ai/dsh/lib/bin.js');
try{
  const launch=JSON.parse(await readFile(resolve(root,'.local/dsh-launch.json'),'utf8'));
  const url=new URL(launch.url);
  const active=await new Promise(done=>{
    const socket=net.connect({host:url.hostname,port:Number(url.port)});
    socket.once('connect',()=>{socket.destroy();done(true);});
    socket.once('error',()=>done(false));socket.setTimeout(500,()=>{socket.destroy();done(false);});
  });
  if(active)throw new Error('温度表情箱仍在运行。先停止 npm run dev，再执行升级；不会移除旧插件。');
}catch(error){if(error.code!=='ENOENT')throw error;}
const backup=profile+'.backup-'+randomUUID();
if(!profile.startsWith(resolve(root,'.local/dsh/profiles')+'/')&&!profile.startsWith(resolve(root,'.local/dsh/profiles')+'\\'))throw new Error('Unexpected profile directory');
await mkdir(dirname(profile),{recursive:true});
let moved=false;
try{await rename(profile,backup);moved=true;}catch(error){if(error.code!=='ENOENT')throw error;}
try{
  const result=spawnSync(runtimePath(),[dshBin,'plugin','--profile','web','add',tarball],{cwd:root,env:{...process.env,DSH_HOME:resolve(root,'.local/dsh')},stdio:'inherit',windowsHide:true});
  if(result.error)throw result.error;
  if(result.status!==0)throw new Error('插件安装失败（退出码 '+result.status+'）。');
  if(moved)await copyFile(resolve(backup,'cordis.patch.yml'),resolve(profile,'cordis.patch.yml')).catch(e=>{if(e.code!=='ENOENT')throw e;});
}catch(error){
  try{await rename(profile,profile+'.failed-'+randomUUID());}catch(e){if(e.code!=='ENOENT')throw e;}
  if(moved)await rename(backup,profile);
  throw new Error(error.message+' 旧 profile 已恢复，用户设置和聊天保留。',{cause:error});
}
console.log(packageInfo.name+'@'+packageInfo.version+' installed. Preferences and profile backup are preserved.');
