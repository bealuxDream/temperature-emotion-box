import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, rmSync } from 'node:fs';
import { setup, root } from './setup.mjs';

export function runtimePath() {
  return resolve(root, process.platform === 'win32' ? 'node_modules/node/bin/node.exe' : 'node_modules/node/bin/node');
}
export async function startDsh(extra = []) {
  await setup();
  const launchFile = resolve(root, '.local/dsh-launch.json');
  rmSync(launchFile, { force: true });
  const child = spawn(runtimePath(), [resolve(root, 'node_modules/@deepseek-ai/dsh/lib/bin.js'), 'web',
    '--patch', resolve(root, '.local/temperature.patch.yml'), '--no-open', ...extra], {
    cwd: root, env: { ...process.env, DSH_HOME: resolve(root, '.local/dsh') }, stdio: ['inherit', 'pipe', 'pipe'], windowsHide: true,
  });
  let recent = '';
  const capture = (stream, output) => stream.on('data', (chunk) => {
    const raw = chunk.toString();
    const visible = raw.replace(/(dsh web: http:\/\/127\.0\.0\.1:3080\/\?token=)[A-Za-z0-9_-]+/g, '$1<redacted>');
    output.write(visible);
    recent = (recent + raw).slice(-8192);
    const match = recent.match(/dsh web: (http:\/\/127\.0\.0\.1:3080\/\?token=[A-Za-z0-9_-]+)/);
    if (match) writeFileSync(launchFile, JSON.stringify({ url: match[1] }), { mode: 0o600 });
  });
  capture(child.stdout, process.stdout); capture(child.stderr, process.stderr);
  child.on('exit', () => rmSync(launchFile, { force: true }));
  child.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
  return child;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const child = await startDsh(process.argv.slice(2));
  child.on('exit', (code) => { process.exitCode = code ?? 1; });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
}
