import { resolve } from 'node:path';
import { setup, root } from './setup.mjs';
import { createTemperatureRuntime } from '../plugins/temperature/runtime.mjs';

await setup();
const runtime = await createTemperatureRuntime({
  host: process.env.HOST ?? '127.0.0.1',
  port: Number(process.env.DASHBOARD_PORT ?? 8787),
  deviceId: process.env.DEVICE_ID ?? 'box-01',
  staleAfterMs: Number(process.env.STALE_AFTER_MS ?? 10000),
  baudRate: Number(process.env.SERIAL_BAUD ?? 115200),
  serialPort: process.env.SERIAL_PORT?.trim() || 'auto',
  deviceToken: process.env.DEVICE_TOKEN,
  settingsPath: resolve(root, '.local/temperature-settings.json'),
  autoOpenDashboardOnFirstRun: true,
});
console.log(`Temperature companion: ${runtime.dashboardUrl}`);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => runtime.close());
