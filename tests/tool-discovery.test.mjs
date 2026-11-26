import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {discoverTools,inspectPackage} from '../windows/discover-tools.mjs';

async function fixture(root,name,version,bin){
  await mkdir(join(root,...bin.split('/').slice(0,-1)),{recursive:true});
  await writeFile(join(root,'package.json'),JSON.stringify({name,version}));
  await writeFile(join(root,bin),'fixture');
}
test('tool discovery reuses installed package roots and distinguishes external from project downloads',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'temperature-tools-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const data=join(dir,'project data'),external=join(dir,'existing global');
  await fixture(join(external,'node_modules/@deepseek-ai/dsh'),'@deepseek-ai/dsh','0.2.2-rc.1','lib/bin.js');
  await fixture(join(data,'host/node_modules/pnpm'),'pnpm','10.25.0','bin/pnpm.cjs');
  const probe=async(_node,args)=>({stdout:args[0].includes('pnpm')?'10.25.0\n':'0.2.2-rc.1\n'});
  const found=await discoverTools({dataDirectory:data,commandDirectories:[external],probe});
  assert.equal(found.dsh.source,'reused');assert.equal(found.pnpm.source,'managed');
  const remembered=await discoverTools({dataDirectory:data,previous:found,probe});
  assert.equal(remembered.dsh.bin,found.dsh.bin);
});
test('incompatible, broken and misleading packages are rejected without being changed',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'temperature-bad-tools-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  await fixture(dir,'@deepseek-ai/dsh','0.3.0','lib/bin.js');
  assert.equal(await inspectPackage(dir,'dsh'),null);
  await fixture(dir,'@deepseek-ai/dsh','0.2.2-rc.1','lib/bin.js');
  assert.equal(await inspectPackage(dir,'dsh',{probe:async()=>({stdout:'0.1.0'})}),null);
  assert.equal(await inspectPackage(dir,'dsh',{probe:async()=>{throw new Error('broken');}}),null);
  await rm(join(dir,'lib/bin.js'));
  assert.equal(await inspectPackage(dir,'dsh'),null);
});
