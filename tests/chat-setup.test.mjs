import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {checkChatModels} from '../plugins/temperature/chat-setup.mjs';
import {createTemperatureRuntime} from '../plugins/temperature/runtime.mjs';

test('model setup distinguishes missing catalogs from configured models without exposing provider secrets',async()=>{
  assert.deepEqual(await checkChatModels({listProviders:()=>[{id:'deepseek-official'}],listModels:async()=>[]}),{status:'unconfigured',modelCount:0});
  assert.deepEqual(await checkChatModels({listProviders:()=>[{id:'deepseek-official'}],listModels:async()=>[{id:'model',apiKey:'secret-fixture'}]}),{status:'configured',modelCount:1});
  assert.deepEqual(await checkChatModels({listProviders(){throw new Error('secret-fixture');}}),{status:'unknown',modelCount:0});
});

test('unresponsive model catalogs time out instead of blocking first-use setup',async()=>{
  assert.deepEqual(await checkChatModels({listProviders:()=>[{id:'slow'}],listModels:()=>new Promise(()=>{})},20),{status:'unknown',modelCount:0});
});

test('chat status is local, strips extra fields, never claims a verified reply, and wizard dismissal survives restart',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'temperature-chat-setup-'));
  const config={port:0,serialPort:'',autoOpenDashboardOnFirstRun:false,settingsPath:join(dir,'settings.json'),getChatStatus:async()=>({status:'configured',modelCount:2,apiKey:'secret-fixture',replyVerified:true})};
  let runtime=await createTemperatureRuntime(config,{listPorts:async()=>[]});
  t.after(async()=>{await runtime.close();await rm(dir,{recursive:true,force:true});});
  assert.deepEqual(await (await fetch(runtime.dashboardUrl+'api/v1/chat-status')).json(),{status:'configured',modelCount:2,replyVerified:false});
  const blocked=await fetch(runtime.dashboardUrl+'api/v1/chat-status',{headers:{Origin:'https://example.com'}});
  assert.equal(blocked.status,403);
  await runtime.updateSettings({chatSetupDismissed:true});
  await runtime.close();
  runtime=await createTemperatureRuntime(config,{listPorts:async()=>[]});
  assert.equal(runtime.settings.read().chatSetupDismissed,true);
  assert.equal(runtime.settings.read().comfortIsPersonalized,false);
});
