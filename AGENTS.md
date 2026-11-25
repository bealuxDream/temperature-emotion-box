# Temperature Emotion Box

This directory is an independent Git repository. Do not edit sibling projects or the parent repository to implement this project.

The selected AI host is the **official DeepSeek Harness (`@deepseek-ai/dsh`)**, pinned in package-lock.json. Use its actual installed Cordis/tools/system-prompt APIs. Open WebUI is not part of the selected implementation.

Read README.md, docs/protocol.md and docs/checkpoint.md before continuing implementation. The installable DSH bundle, dashboard and temperature runtime are in plugins/temperature/. ESP32-S3 firmware is in firmware/.

- Run `npm test` for meaningful host/plugin changes. tests/assembly.test.mjs exercises official DSH prompt assembly and lifecycle.
- On Windows use `npm run firmware:build`; its temporary drive mapping avoids the Xtensa Unicode-path bug.
- Never present fixture or simulated readings as real hardware measurements. Missing/stale/error data has no current temperature.
- Assemble the live temperature section on every model step. The dashboard and both tools share the same settings and sensor state.
- `.env`, firmware/include/secrets.h, .local/, node_modules/ and firmware/.pio/ are private/generated. Do not commit tokens, Wi-Fi passwords, DSH profile state or sessions.
- Report software checks, compiled firmware, flashed hardware, real sensor measurements and live model requests separately. The checkpoint records what actually happened.
