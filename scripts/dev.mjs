import { startDsh } from './run-dsh.mjs';

const dsh = await startDsh();
let stopping = false;
const stop = (code = 0) => {
  if (stopping) return;
  stopping = true; process.exitCode = code;
  dsh.kill();
};
for (const child of [dsh]) {
  child.on('error', (error) => { console.error(error.message); stop(1); });
  child.on('exit', (code) => { if (!stopping) stop(code ?? 1); });
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop());
