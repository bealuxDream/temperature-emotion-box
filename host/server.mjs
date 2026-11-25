import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { attachSerialBridge } from './serial.mjs';
import { InputError, TemperatureStore } from './temperature.mjs';

export function createServer({ token, deviceId = 'box-01', staleAfterMs = 10000, now } = {}) {
  if (!token || token.length < 32) throw new Error('Missing DEVICE_TOKEN. Run npm run setup first.');
  const store = new TemperatureStore({ deviceId, staleAfterMs, now });
  const expected = Buffer.from(`Bearer ${token}`);
  const server = http.createServer(async (req, res) => {
    const json = (status, value) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(value));
    };
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (req.method === 'GET' && path === '/favicon.ico') { res.writeHead(204); return res.end(); }
      if (req.method === 'GET' && path === '/chat') {
        if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) {
          return json(403, { error: '请在运行服务的电脑上打开 DeepSeek 聊天。' });
        }
        let launch;
        try { launch = JSON.parse(await readFile(new URL('../.local/dsh-launch.json', import.meta.url), 'utf8')); }
        catch { return json(503, { error: '请先运行 npm run dev，等待 dsh 启动。' }); }
        const target = new URL(launch.url);
        if (target.protocol !== 'http:' || target.hostname !== '127.0.0.1' || target.port !== '3080') {
          return json(503, { error: 'Invalid local dsh launch URL' });
        }
        res.writeHead(302, { Location: target.href, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
        return res.end();
      }
      if (req.method === 'POST' && path === '/api/v1/readings') {
        const provided = Buffer.from(req.headers.authorization ?? '');
        if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return json(401, { error: 'Unauthorized device' });
        if (!(req.headers['content-type'] ?? '').startsWith('application/json')) return json(415, { error: 'Expected application/json' });
        let length = 0;
        const chunks = [];
        for await (const chunk of req) {
          length += chunk.length;
          if (length > 4096) throw new InputError('Frame too large', 413);
          chunks.push(chunk);
        }
        let frame;
        try { frame = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
        catch { throw new InputError('Invalid JSON'); }
        return json(200, store.ingest(frame));
      }
      if (req.method === 'GET' && path === '/api/v1/temperature') return json(200, store.snapshot());
      if (req.method === 'GET' && path === '/api/v1/history') return json(200, { readings: store.history });
      if (req.method === 'GET' && path === '/health') return json(200, { ok: true, service: 'temperature-emotion-box', sensor_status: store.snapshot().status });
      const files = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] };
      if (req.method === 'GET' && files[path]) {
        const [file, type] = files[path];
        res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-cache',
          'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'",
          'X-Content-Type-Options': 'nosniff' });
        return res.end(await readFile(new URL(`./public/${file}`, import.meta.url)));
      }
      return json(404, { error: 'Not found' });
    } catch (error) {
      if (!res.headersSent) json(error instanceof InputError ? error.status : 500,
        { error: error instanceof InputError ? error.message : 'Internal server error' });
      else res.destroy();
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  return { server, store };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.loadEnvFile(new URL('../.env', import.meta.url)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const port = Number(process.env.PORT ?? 8787);
  const staleAfterMs = Number(process.env.STALE_AFTER_MS ?? 10000);
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !Number.isFinite(staleAfterMs) || staleAfterMs < 1000) throw new Error('Invalid PORT or STALE_AFTER_MS');
  const { server, store } = createServer({ token: process.env.DEVICE_TOKEN, deviceId: process.env.DEVICE_ID ?? 'box-01', staleAfterMs });
  let serialBridge;
  server.listen(port, process.env.HOST ?? '0.0.0.0', () => {
    console.log(`Temperature dashboard: http://127.0.0.1:${port}`);
    if (process.env.SERIAL_PORT?.trim()) {
      try {
        serialBridge = attachSerialBridge({ path: process.env.SERIAL_PORT.trim(), baudRate: Number(process.env.SERIAL_BAUD ?? 115200), store,
          onReading: (reading) => {
            if (reading.kind === 'connected') console.log(`USB sensor port connected: ${reading.path} at ${reading.baudRate} baud`);
            else if (reading.status === 'ok') console.log(`DS18B20: ${reading.temperature_c.toFixed(2)} C`);
            else if (reading.status) console.log(`DS18B20 status: ${reading.status}`);
          },
          onError: (error) => console.error(`USB sensor port ${process.env.SERIAL_PORT}: ${error.message}`),
        });
      } catch (error) { console.error(`USB sensor bridge disabled: ${error.message}`); }
    }
  });
  server.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
    serialBridge?.close(() => server.close());
    if (!serialBridge) server.close();
  });
}
