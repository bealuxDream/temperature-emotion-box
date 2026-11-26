import { build } from 'esbuild';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const image=await readFile('.local/public-firmware/firmware.bin');
const manifest={version:'0.4.0',chip:'ESP32-S3',board:'esp32-s3-devkitc-1',minFlashMB:8,dqPin:16,transport:['uart0','native-usb'],size:image.length,sha256:createHash('sha256').update(image).digest('hex'),md5:createHash('md5').update(image).digest('hex')};
for(const dir of ['site/flash','plugins/temperature/dashboard/flash']){
  await mkdir(dir,{recursive:true});
  await build({entryPoints:['web-flasher/app.js'],bundle:true,format:'esm',target:['chrome100'],outfile:resolve(dir,'app.js'),legalComments:'eof',minify:true});
  for(const name of ['index.html','style.css'])await copyFile('web-flasher/'+name,dir+'/'+name);
  await writeFile(dir+'/firmware.bin',image);
  await writeFile(dir+'/manifest.json',JSON.stringify(manifest,null,2)+'\n');
  const licenses=await Promise.all(['esptool-js','pako','atob-lite'].map(async name=>name+'\n'+await readFile('node_modules/'+name+(name==='atob-lite'?'/LICENSE.md':'/LICENSE'),'utf8')));
  await writeFile(dir+'/THIRD-PARTY.txt',licenses.join('\n\n'));
}
console.log('Built bundled flasher and verified public firmware',manifest.sha256);
