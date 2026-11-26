import {readFile,realpath,access} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {dirname,join,resolve,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
const execute=promisify(execFile);
const definitions={dsh:{name:'@deepseek-ai/dsh',bin:'lib/bin.js',accept:v=>v==='0.2.2-rc.1'},pnpm:{name:'pnpm',bin:'bin/pnpm.cjs',accept:v=>/^10\.(\d+)\./.test(v)&&Number(v.split('.')[1])>=25}};

export async function inspectPackage(root,kind,{node=process.execPath,probe=execute}={}){
  try{
    const spec=definitions[kind];
    const path=await realpath(root);
    const manifest=JSON.parse(await readFile(join(path,'package.json'),'utf8'));
    if(manifest.name!==spec.name||!spec.accept(manifest.version))return null;
    const bin=join(path,spec.bin);await access(bin);
    const result=await probe(node,[bin,'--version'],{timeout:8000,windowsHide:true,maxBuffer:32768});
    if(result.stdout.trim()!==manifest.version)return null;
    return {root:path,bin,version:manifest.version};
  }catch{return null;}
}

export async function discoverTools({dataDirectory,commandDirectories=[],previous={},node=process.execPath,probe=execute}){
  previous??={};
  const roots=[join(dataDirectory,'host'),...commandDirectories];
  const dataRoot=await realpath(dataDirectory).catch(()=>resolve(dataDirectory));
  const result={};
  for(const [kind,spec] of Object.entries(definitions)){
    const candidates=[join(dataDirectory,'host/node_modules',spec.name)];
    if(previous[kind]?.root)candidates.push(previous[kind].root);
    for(const dir of roots){
      candidates.push(join(dir,'node_modules',spec.name));
      if(dir.endsWith('.bin'))candidates.push(join(dirname(dir),spec.name));
    }
    for(const candidate of new Set(candidates)){
      const found=await inspectPackage(candidate,kind,{node,probe});
      if(found){
        const rel=relative(dataRoot,found.root);
        result[kind]={...found,source:!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..\\')&&!rel.startsWith('../')?'managed':'reused'};
        break;
      }
    }
  }
  return result;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const input=JSON.parse(await readFile(process.argv[2],'utf8'));
  process.stdout.write(JSON.stringify(await discoverTools(input)));
}
