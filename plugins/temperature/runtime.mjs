import { timingSafeEqual } from 'node:crypto';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { SerialPort } from 'serialport';
import { attachSerialBridge } from './serial.mjs';
import { InputError, TemperatureStore } from './temperature.mjs';
import { DEFAULT_SETTINGS, SettingsStore } from './settings.mjs';

const loopback = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const pageFiles = new Map(Object.entries({
  '/': ['index.html', 'text/html'],
  '/app.js': ['app.js', 'text/javascript'],
  '/style.css': ['style.css', 'text/css'],
  '/settings.css': ['settings.css', 'text/css'],
  '/settings.css': ['settings.css', 'text/css'],
}));
const pageDir = new URL('./dashboard/', import.meta.url);

async function bodyJson(req, limit = 8192) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new InputError('Request body too large', 413);
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new InputError('Invalid JSON'); }
}

function isLocalOrigin(req) {
  if (!loopback.has(req.socket.remoteAddress)) return false;
  if (!/^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/i.test(req.headers.host ?? '')) return false;
  if (req.headers['sec-fetch-site'] === 'cross-site') return false;
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    return parsed.protocol === 'http:' && parsed.host === req.headers.host;
  } catch { return false; }
}

export function createServer({ token, deviceId = 'box-01', staleAfterMs = 10000, now,
  settingsStore = null, getChatUrl = () => 'http://127.0.0.1:3080/', onSettingsUpdated = async () => {},
  listPorts = () => SerialPort.list() } = {}) {
  const store = new TemperatureStore({ deviceId, staleAfterMs, now });
  const expected = token && token.length >= 32 ? Buffer.from(`Bearer ${token}`) : null;
  const server = http.createServer(async (req, res) => {
    const json = (status, value) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff' });
      res.end(JSON.stringify(value));
    };
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (req.method === 'GET' && path === '/chat') {
        if (!isLocalOrigin(req)) return json(403, { error: 'Open chat from the local dashboard' });
        const chatUrl = new URL(getChatUrl());
        if (!['http:', 'https:'].includes(chatUrl.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(chatUrl.hostname)) {
          return json(503, { error: '请从 DeepSeek Harness 的启动入口打开聊天。' });
        }
        res.writeHead(302, { Location: chatUrl.href, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
        return res.end();
      }
      if (req.method === 'GET' && path === '/favicon.ico') { res.writeHead(204); return res.end(); }
      if (req.method === 'POST' && path === '/api/v1/readings') {
        if (!expected) return json(503, { error: 'HTTP device ingress is not configured' });
        const provided = Buffer.from(req.headers.authorization ?? '');
        if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return json(401, { error: 'Unauthorized device' });
        if (!(req.headers['content-type'] ?? '').startsWith('application/json')) return json(415, { error: 'Expected application/json' });
        const frame = await bodyJson(req, 4096);
        return json(200, store.ingest(frame));
      }
      if (req.method === 'GET' && path === '/api/v1/temperature') return json(200, store.snapshot());
      if (req.method === 'GET' && path === '/api/v1/history') return json(200, { readings: store.history });
      if (req.method === 'GET' && path === '/api/v1/settings') {
        if (!isLocalOrigin(req)) return json(403, { error: 'Settings can only be viewed on this computer' });
        return json(200, { schema_version: 1, settings: settingsStore?.read() ?? { ...DEFAULT_SETTINGS } });
      }
      if (req.method === 'PUT' && path === '/api/v1/settings') {
        if (!isLocalOrigin(req)) return json(403, { error: 'Settings can only be changed on this computer' });
        if (!settingsStore) return json(503, { error: 'Settings storage is not configured' });
        if (!(req.headers['content-type'] ?? '').startsWith('application/json')) return json(415, { error: 'Expected application/json' });
        const payload = await bodyJson(req);
        const settings = await settingsStore.update(payload);
        await onSettingsUpdated(settings);
        return json(200, { schema_version: 1, settings });
      }
      if (req.method === 'GET' && path === '/api/v1/ports') {
        if (!isLocalOrigin(req)) return json(403, { error: 'Serial port discovery is local only' });
        const ports = await listPorts();
        return json(200, { ports: ports.map(({ path: portPath, manufacturer, vendorId, productId }) => ({
          path: portPath, manufacturer: manufacturer ?? '', vendor_id: vendorId ?? '', product_id: productId ?? '',
        })) });
      }
      if (req.method === 'GET' && path === '/health') return json(200, { ok: true, service: 'temperature-emotion-box', sensor_status: store.snapshot().status });
      if (req.method === 'GET' && pageFiles.has(path)) {
        const [file, type] = pageFiles.get(path);
        res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-cache',
          'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'",
          'Referrer-Policy': 'no-referrer' });
        return res.end(await readFile(new URL(file, pageDir)));
      }
      return json(404, { error: 'Not found' });
    } catch (error) {
      if (!res.headersSent) json(error instanceof InputError ? error.status : 400,
        { error: error instanceof Error ? error.message : 'Invalid request' });
      else res.destroy();
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  return { server, store };
}

export async function resolveSerialPort(configuredPort, listPorts = () => SerialPort.list()) {
  if (configuredPort !== 'auto') return configuredPort;
  const ports = await listPorts();
  return ports.length === 1 ? ports[0].path : '';
}

function openLocalBrowser(url, spawnProcess = spawn) {
  let executable;
  let args;
  if (process.platform === 'win32') { executable = 'explorer.exe'; args = [url]; }
  else if (process.platform === 'darwin') { executable = 'open'; args = [url]; }
  else if (process.env.DISPLAY || process.env.WAYLAND_DISPLAY) { executable = 'xdg-open'; args = [url]; }
  else return Promise.resolve(false);
  return new Promise((resolve) => {
    let child;
    try { child = spawnProcess(executable, args, { detached: true, stdio: 'ignore', windowsHide: true }); }
    catch { resolve(false); return; }
    child.once('error', () => resolve(false));
    child.once('spawn', () => { child.unref(); resolve(true); });
  });
}

export async function createTemperatureRuntime(config = {}, { spawnProcess = spawn, listPorts = () => SerialPort.list() } = {}) {
  const host = config.host ?? '127.0.0.1';
  const port = Number(config.port ?? 0);
  const deviceId = config.deviceId ?? 'box-01';
  const staleAfterMs = Number(config.staleAfterMs ?? 10000);
  const baudRate = Number(config.baudRate ?? 115200);
  const settingsPath = config.settingsPath?.trim() || join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'plugins', 'temperature-emotion-box', 'settings.json');
  const settingsStore = new SettingsStore(settingsPath, {
    systemPromptTemplate: config.systemPromptTemplate ?? DEFAULT_SETTINGS.systemPromptTemplate,
    unavailablePrompt: config.unavailablePrompt ?? DEFAULT_SETTINGS.unavailablePrompt,
    comfortMinC: config.comfortMinC ?? DEFAULT_SETTINGS.comfortMinC,
    comfortMaxC: config.comfortMaxC ?? DEFAULT_SETTINGS.comfortMaxC,
    comfortToleranceC: config.comfortToleranceC ?? DEFAULT_SETTINGS.comfortToleranceC,
    comfortIsPersonalized: config.comfortIsPersonalized ?? DEFAULT_SETTINGS.comfortIsPersonalized,
    assistantName: config.assistantName ?? DEFAULT_SETTINGS.assistantName,
    serialPort: config.serialPort ?? 'auto',
    autoOpenDashboardOnFirstRun: config.autoOpenDashboardOnFirstRun ?? true,
  });
  await settingsStore.load();
  let connectSerial = async () => {};
  const { server, store } = createServer({ token: config.deviceToken, deviceId, staleAfterMs,
    settingsStore, listPorts, getChatUrl: config.getChatUrl,
    onSettingsUpdated: (settings) => connectSerial(settings.serialPort) });

  let serialBridge;
  let activeSerialPort = '';
  let serialQueue = Promise.resolve();
  let closed = false;
  const selectSerial = async (requested) => {
    if (closed) return;
    const selected = await resolveSerialPort(requested, listPorts);
    if (serialBridge && activeSerialPort === selected) return;
    if (serialBridge) await new Promise((resolve) => serialBridge.close(resolve));
    serialBridge = undefined;
    if (activeSerialPort && activeSerialPort !== selected) store.resetCurrent();
    activeSerialPort = selected;
    if (!selected) return;
    let lastError = '';
    serialBridge = attachSerialBridge({ path: selected, baudRate, store,
      onReading(reading) {
        if (reading.kind !== 'connected') return;
        lastError = '';
        console.log(`[temperature-emotion-box] 串口已连接 ${reading.path}`);
      },
      onError(error) {
        if (error.message !== lastError) console.warn(`[temperature-emotion-box] ${selected}: ${error.message}`);
        lastError = error.message;
      },
    });
  };
  connectSerial = (requested) => {
    const operation = serialQueue.then(() => selectSerial(requested));
    serialQueue = operation.catch((error) => console.warn(`[temperature-emotion-box] ${error.message}`));
    return serialQueue;
  };
  const address = await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => { server.removeListener('error', reject); resolve(server.address()); });
  });
  const dashboardUrl = `http://127.0.0.1:${address.port}/`;
  const initial = settingsStore.read();
  await connectSerial(initial.serialPort);
  const discovery = setInterval(() => {
    if (!activeSerialPort && settingsStore.read().serialPort === 'auto') void connectSerial('auto');
  }, 3000);
  discovery.unref();

  server.on('error', (error) => console.error(`[temperature-emotion-box] local service error: ${error.message}`));
  // Opening the page is optional, local, and persisted so a restart will not open duplicates.
  if (initial.autoOpenDashboardOnFirstRun && !initial.dashboardOpened && config.autoOpenDashboardOnFirstRun !== false) {
    if (await openLocalBrowser(dashboardUrl, spawnProcess)) {
      await settingsStore.update({ dashboardOpened: true }).catch((error) => console.warn(`[temperature-emotion-box] ${error.message}`));
    }
  }

  return {
    server, store, settings: settingsStore, dashboardUrl,
    reading: () => store.snapshot(),
    updateSettings: async (patch) => {
      const previousPort = settingsStore.read().serialPort;
      const settings = await settingsStore.update(patch);
      if (settings.serialPort !== previousPort) await connectSerial(settings.serialPort);
      return settings;
    },
    async close() {
      closed = true;
      clearInterval(discovery);
      await serialQueue;
      if (serialBridge) await new Promise((resolve) => serialBridge.close(resolve));
      if (server.listening) await new Promise((resolve) => server.close(resolve));
    },
  };
}
