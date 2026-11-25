import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const root = fileURLToPath(new URL('../', import.meta.url));
const exists = async (file) => { try { await access(file); return true; } catch { return false; } };
export async function setup() {
  await mkdir(resolve(root, '.local'), { recursive: true });
  const envFile = resolve(root, '.env');
  if (!await exists(envFile)) {
    const template = await readFile(resolve(root, '.env.example'), 'utf8');
    await writeFile(envFile, template.replace(/^DEVICE_TOKEN=.*$/m, `DEVICE_TOKEN=${randomBytes(32).toString('hex')}`), { mode: 0o600 });
  }
  process.loadEnvFile(envFile);
  if (!process.env.DEVICE_TOKEN || process.env.DEVICE_TOKEN.length < 32) throw new Error('Set a DEVICE_TOKEN of at least 32 characters in .env');
  const port = Number(process.env.PORT ?? 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  const workspaceOverlay = `    - id: temperature-box-workspace\n      name: ${JSON.stringify(resolve(root, 'scripts/dsh-workspace.mjs').replaceAll('\\', '/'))}\n      config:\n        directory: ${JSON.stringify(root)}\n`;
  await writeFile(resolve(root, '.local/temperature.patch.yml'), '- insert:\n' + workspaceOverlay);
  const secrets = resolve(root, 'firmware/include/secrets.h');
  await mkdir(resolve(root, 'firmware/include'), { recursive: true });
  if (!await exists(secrets)) {
    await writeFile(secrets, `#pragma once\n// LOCAL ONLY: configure Wi-Fi only if using optional LAN transport.\n#define WIFI_SSID "YOUR_WIFI_SSID"\n#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"\n#define BRIDGE_URL "http://YOUR_PC_LAN_IP:${port}/api/v1/readings"\n#define DEVICE_TOKEN ${JSON.stringify(process.env.DEVICE_TOKEN)}\n#define DEVICE_ID ${JSON.stringify(process.env.DEVICE_ID ?? 'box-01')}\n#define ONE_WIRE_PIN 16\n`);
  }
  console.log('Local config ready. Device token and firmware credentials are Git-ignored.');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await setup();
