import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {PassThrough} from 'node:stream';
import {attachSerialBridge} from '../plugins/temperature/serial.mjs';
import http from 'node:http';
import {createTemperatureRuntime,resolveSerialPort} from '../plugins/temperature/runtime.mjs';

test('occupied dashboard port falls back; no-adapter diagnostics and cross-site serial controls are safe',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'temperature-onboarding-'));
  const occupied=http.createServer((_req,res)=>res.end('unrelated service'));
  occupied.listen(0,'127.0.0.1');await once(occupied,'listening');
  const runtime=await createTemperatureRuntime({port:occupied.address().port,serialPort:'auto',settingsPath:join(dir,'settings.json'),autoOpenDashboardOnFirstRun:false},{listPorts:async()=>[]});
  t.after(async()=>{await runtime.close();await new Promise(r=>occupied.close(r));await rm(dir,{recursive:true,force:true});});
  assert.notEqual(runtime.server.address().port,occupied.address().port);
  assert.equal((await runtime.diagnostics()).code,'no_ports');
  const blocked=await fetch(runtime.dashboardUrl+'api/v1/serial-control',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://example.com'},body:JSON.stringify({action:'pause'})});
  assert.equal(blocked.status,403);
  assert.equal((await runtime.diagnostics()).serial.paused,false);
});

test('recognized USB adapter is selected, raw boot text is diagnosed, pause releases the port and resume recovers',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'temperature-serial-diagnostics-'));
  const ports=[{path:'COM8',vendorId:'10c4',manufacturer:'Silicon Labs'}];
  let callbacks,opened=0,closed=0;
  const runtime=await createTemperatureRuntime({port:0,serialPort:'auto',settingsPath:join(dir,'settings.json'),autoOpenDashboardOnFirstRun:false},{
    listPorts:async()=>ports,
    serialBridgeFactory:options=>{callbacks=options;opened++;return{close(done){closed++;done?.();}};},
  });
  t.after(async()=>{await runtime.close();await rm(dir,{recursive:true,force:true});});
  assert.equal(callbacks.path,'COM8');
  callbacks.onReading({kind:'connected',path:'COM8'});
  callbacks.onLine({valid:false});
  assert.equal((await runtime.diagnostics()).code,'waiting_frames');
  assert.equal((await runtime.diagnostics()).serial.ignoredLines,1);
  callbacks.onError(Object.assign(new Error('Access denied'),{code:'EACCES'}));
  assert.equal((await runtime.diagnostics()).code,'serial_error');
  callbacks.onReading({kind:'connected',path:'COM8'});
  runtime.store.ingest({schema_version:1,device_id:'box-01',boot_id:'boot-1',sensor_id:'ds18b20-0',source:'ds18b20',sequence:1,sample_age_ms:0,status:'ok',temperature_c:23});
  callbacks.onLine({valid:true});
  runtime.recordToolQuery();
  assert.equal((await runtime.diagnostics()).checklist.sensor,true);
  assert.equal((await runtime.diagnostics()).checklist.temperatureToolUsed,true);
  const control=action=>fetch(runtime.dashboardUrl+'api/v1/serial-control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action})});
  assert.equal((await control('pause')).status,200);
  assert.equal(closed,1);assert.equal(runtime.reading().temperature_c,null);
  assert.equal((await runtime.diagnostics()).code,'paused');
  assert.equal((await control('resume')).status,200);
  assert.equal(opened,2);
});

test('automatic serial selection never opens an unrelated single port or guesses between two USB adapters',async()=>{
  assert.equal(await resolveSerialPort('auto',async()=>[{path:'COM1',manufacturer:'Legacy Port'}]),'');
  assert.equal(await resolveSerialPort('auto',async()=>[{path:'COM8',vendorId:'10c4'},{path:'COM9',vendorId:'303a'}]),'');
  assert.equal(await resolveSerialPort('COM9',async()=>[]),'COM9');
});

test('pause during a pending serial open waits for the native port to be released and ignores late frames',async()=>{
  let native,completeOpen,completeClose,closed=false,connected=false;
  class PendingPort extends PassThrough {
    constructor(){super();native=this;this.isOpen=false;}
    open(callback){completeOpen=()=>{this.isOpen=true;this.emit('open');callback();};}
    close(callback){completeClose=()=>{this.isOpen=false;callback();};}
  }
  const bridge=attachSerialBridge({path:'COM8',serialPortClass:PendingPort,
    store:{ingest(){assert.fail('Paused port must not ingest data');}},
    onReading(){connected=true;},
  });
  bridge.close(()=>{closed=true;});
  assert.equal(closed,false);
  completeOpen();
  assert.equal(closed,false);
  assert.equal(connected,false);
  completeClose();
  assert.equal(closed,true);
  assert.equal(native.isOpen,false);
  native.destroy();
});
