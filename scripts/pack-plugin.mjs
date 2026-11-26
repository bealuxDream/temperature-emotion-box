import {mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
await mkdir('.local',{recursive:true});
const command=process.platform==='win32'?'npm.cmd':'npm';
const result=spawnSync(command,['pack','./plugins/temperature','--pack-destination','.local'],{stdio:'inherit',shell:process.platform==='win32'});
if(result.error)throw result.error;
process.exitCode=result.status ?? 1;
