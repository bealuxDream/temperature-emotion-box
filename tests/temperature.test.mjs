import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TemperatureStore } from '../plugins/temperature/temperature.mjs';
import { consumeSerialLine, attachSerialBridge } from '../plugins/temperature/serial.mjs';
import { createServer, createTemperatureRuntime } from '../plugins/temperature/runtime.mjs';

const frame = (changes = {}) => ({ schema_version: 1, device_id: 'box-01', boot_id: 'boot-1',
  sensor_id: 'ds18b20-0', source: 'ds18b20', sequence: 1, sample_age_ms: 0,
  status: 'ok', temperature_c: 24.5, ...changes });

test('no invented temperature before hardware connects; 0 C is a valid measurement', () => {
  const store = new TemperatureStore();
  assert.equal(store.snapshot().status, 'waiting');
  assert.equal(store.snapshot().temperature_c, null);
  assert.equal(store.ingest(frame({ temperature_c: 0 })).temperature_c, 0);
});

test('age includes device sample age; stale and disconnected values never report a temperature', () => {
  let now = 100000;
  const store = new TemperatureStore({ now: () => now });
  store.ingest(frame({ sample_age_ms: 9000 }));
  now += 1001;
  assert.equal(store.snapshot().status, 'stale');
  assert.equal(store.snapshot().temperature_c, null);
  store.ingest(frame({ sequence: 2, status: 'disconnected', temperature_c: null }));
  assert.equal(store.snapshot().status, 'disconnected');
  assert.equal(store.snapshot().temperature_c, null);
});

test('invalid, fabricated source, duplicate, out-of-order and retired boot frames are rejected', () => {
  const store = new TemperatureStore();
  for (const changes of [{ temperature_c: -127 }, { temperature_c: 126 }, { temperature_c: '25' },
    { temperature_c: NaN }, { source: 'simulation' }, { sample_age_ms: -1 },
    { device_id: 'other' }, { status: 'disconnected' }]) assert.throws(() => store.ingest(frame(changes)));
  store.ingest(frame());
  assert.throws(() => store.ingest(frame()), /Duplicate/);
  store.ingest(frame({ boot_id: 'boot-2', sequence: 0 }));
  assert.throws(() => store.ingest(frame({ sequence: 999 })), /Retired/);
});

test('history stays bounded', () => {
  const store = new TemperatureStore();
  for (let sequence = 0; sequence < 350; sequence++) store.ingest(frame({ sequence }));
  assert.equal(store.history.length, 300);
});

test('USB UART JSON frames flow through the validated temperature store', () => {
  const store = new TemperatureStore();
  assert.equal(consumeSerialLine('temperature-emotion-box firmware 0.1.0', store), null);
  assert.equal(consumeSerialLine('NaN', store), null);
  assert.equal(consumeSerialLine(' '.repeat(4097), store), null);
  assert.equal(consumeSerialLine(JSON.stringify(frame({ temperature_c: 23.75 })), store).temperature_c, 23.75);
  assert.equal(consumeSerialLine(JSON.stringify(frame({ sequence: 2, source: 'fake' })), store), null);
  assert.equal(consumeSerialLine(JSON.stringify(frame({ sequence: 3, status: 'disconnected', temperature_c: null })), store).status, 'disconnected');
  assert.throws(() => attachSerialBridge({ path: 'COM3;WRITE', store }), /SERIAL_PORT/);
  assert.throws(() => attachSerialBridge({ path: 'COM3', baudRate: 0, store }), /SERIAL_BAUD/);
});

test('HTTP bridge authentication, invalid JSON and fresh read contract', async (t) => {
  const token = 'a'.repeat(64);
  const { server } = createServer({ token });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (body, key = token) => fetch(`${base}/api/v1/readings`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body });
  assert.equal((await post(JSON.stringify(frame()), 'wrong')).status, 401);
  assert.equal((await post('{')).status, 400);
  assert.equal((await post(JSON.stringify(frame()))).status, 200);
  assert.equal((await (await fetch(`${base}/api/v1/temperature`)).json()).temperature_c, 24.5);
  assert.equal((await post(JSON.stringify(frame()))).status, 409);
  assert.equal((await fetch(`${base}/.env`)).status, 404);
});

test('standalone plugin runtime serves its packaged dashboard and persists user settings locally', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'temperature-box-runtime-'));
  const settingsPath = join(directory, 'settings.json');
  const runtime = await createTemperatureRuntime({ host: '127.0.0.1', port: 0, serialPort: '', settingsPath,
    autoOpenDashboardOnFirstRun: false, comfortMinC: 21, comfortMaxC: 26 }, { spawnProcess: () => { throw new Error('auto-open disabled in integration test'); }, listPorts: async () => [] });
  t.after(async () => { await runtime.close(); await rm(directory, { recursive: true, force: true }); });
  assert.equal(runtime.settings.read().comfortMinC, 21);
  assert.equal(runtime.settings.read().comfortMaxC, 26);
  const base = runtime.dashboardUrl.replace(/\/$/, '');
  assert.match(await (await fetch(`${base}/`)).text(), /温度与聊天设置/);
  assert.equal((await fetch(`${base}/settings.css`)).status, 200);
  assert.equal((await fetch(`${base}/chat`, { redirect: 'manual' })).status, 302);
  assert.equal((await (await fetch(`${base}/api/v1/ports`)).json()).ports.length, 0);
  const updated = await fetch(`${base}/api/v1/settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Origin: base },
    body: JSON.stringify({ comfortMinC: 22, comfortMaxC: 27 }) });
  assert.equal(updated.status, 200);
  assert.equal(runtime.settings.read().comfortMinC, 22);
  const persisted = JSON.parse(await readFile(settingsPath, 'utf8'));
  assert.equal(persisted.comfortMaxC, 27);
  const blocked = await fetch(`${base}/api/v1/settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Origin: 'http://evil.example' },
    body: JSON.stringify({ settings: runtime.settings.read() }) });
  assert.equal(blocked.status, 403);
  runtime.store.ingest(frame({temperature_c:20}));
  assert.equal(runtime.reading().temperature_c, 20);
});
