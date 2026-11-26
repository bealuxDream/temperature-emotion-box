import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const pkg=JSON.parse(await readFile('plugins/temperature/package.json','utf8'));
const directories=['site/flash','plugins/temperature/dashboard/flash'];
const files=['app.js','index.html','style.css','manifest.json','firmware.bin','THIRD-PARTY.txt'];
for(const file of files){
  assert.deepEqual(await readFile(directories[0]+'/'+file),await readFile(directories[1]+'/'+file),`Published and packaged ${file} differ`);
}
const manifest=JSON.parse(await readFile(directories[0]+'/manifest.json','utf8'));
const image=await readFile(directories[0]+'/firmware.bin');
assert.equal(manifest.version,pkg.version);
assert.equal(manifest.size,image.length);
assert.equal(manifest.sha256,createHash('sha256').update(image).digest('hex'));
assert.equal(manifest.md5,createHash('md5').update(image).digest('hex'));
assert.equal(manifest.chip,'ESP32-S3');
assert.equal(manifest.dqPin,16);
console.log(`Public and packaged flasher assets match; firmware SHA-256 ${manifest.sha256}`);
