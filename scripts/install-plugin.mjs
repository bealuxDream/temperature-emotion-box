import { spawnSync } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runtimePath } from './run-dsh.mjs';
import { root } from './setup.mjs';

const packageInfo = JSON.parse(await readFile(resolve(root, 'plugins/temperature/package.json'), 'utf8'));
const tarball = resolve(root, '.local', `${packageInfo.name}-${packageInfo.version}.tgz`);
await access(tarball);
const profilePath = resolve(root, '.local/dsh/profiles/web/package.json');
const dshBin = resolve(root, 'node_modules/@deepseek-ai/dsh/lib/bin.js');

function runDsh(args) {
  const result = spawnSync(runtimePath(), [dshBin, 'plugin', '--profile', 'web', ...args], {
    cwd: root,
    env: { ...process.env, DSH_HOME: resolve(root, '.local/dsh') },
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`dsh plugin ${args[0]} failed (exit ${result.status ?? 'unknown'}).`);
}

try {
  const profile = JSON.parse(await readFile(profilePath, 'utf8'));
  if (profile.dependencies?.[packageInfo.name]) runDsh(['remove', packageInfo.name]);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
runDsh(['add', tarball]);
console.log(`[dsh-temperature-emotion-box] ${packageInfo.name}@${packageInfo.version} installed in the local DSH Web profile.`);
