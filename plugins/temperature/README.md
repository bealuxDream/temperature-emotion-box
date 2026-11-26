# dsh-temperature-emotion-box

An installable DeepSeek Harness bundle that pairs an ESP32-S3 + DS18B20 with a local live dashboard and an affectionate temperature-aware assistant.

## Install in DeepSeek Harness

Install the supplied tarball in DeepSeek Harness Web 0.2.2-rc.1. Use the absolute path to the downloaded file.

```sh
dsh plugin --profile web add "/path/to/dsh-temperature-emotion-box-0.4.0.tgz"
dsh web
```

The bundle includes its dashboard, temperature service, serial reader, and DSH tools. The Web profile supplies the browser connection for the dashboard's chat shortcut. Each turn uses one 17% random draw for unsolicited temperature asides; direct questions always return a fresh factual reading.

The plugin tries to open the local dashboard on first activation. Its first-use form lets each installer choose an ideal temperature or a range, or skip setup. The displayed defaults are 20–25°C. A single ideal temperature uses a ±2.5°C range by default. The settings panel lets users edit the prompt, temperature-specific moods, comfort range, assistant name, and serial port. Preferences persist under the local DSH home.

The default dashboard is <http://127.0.0.1:8787/>; an occupied port falls back to an available port printed in DSH's startup log. Windows beginner-package users should open it through Start.cmd. Maintainers can generate the tarball with `npm run plugin:pack`. To uninstall, use `dsh plugin --profile web remove dsh-temperature-emotion-box` and restart DSH. Manual DSH installation requires Node >=24.9 and pnpm.

## What the bundle contributes

- **`get_current_temperature`** returns the latest valid DS18B20 sample. The plugin also reads the latest sample each time DSH assembles the system prompt.
- **`remember_comfort_temperature`** persists a user's clearly stated room-temperature comfort range. The assistant only calls it after the user explicitly provides or corrects a preference; a single stated ideal temperature uses the configured tolerance around that value.
- **Temperature shapes the reply** from shorter, quieter answers when cold to more expressive, urgent answers above the comfort range. Each turn has a 17% chance to allow one brief aside about room temperature. Direct temperature questions always use the live reading tool.
- **The companion page** shows the live reading, connection / stale state, recent temperature curve and editable preferences.
- **First-use dashboard launch** opens the local page once and can be disabled in settings.

## Hardware / supported transport

DS18B20 DQ defaults to ESP32-S3 GPIO16. A compatible ESP32-S3 running the project's telemetry firmware sends newline-delimited protocol v1 samples at 115200 baud. The local page automatically selects one recognized USB serial adapter; with multiple or unrecognized ports, choose the device's COM or `/dev/tty*` port in settings. Pause collection before browser flashing and disconnect the browser's port before resuming collection.

The optional authenticated HTTP ingress can be configured on the DSH runtime plugin row when the board has Wi-Fi. The default serial transport does not require Wi-Fi credentials or an API key on the microcontroller. The dashboard binds only to `127.0.0.1` by default.

## First-use guidance

1. Install the bundle and start the DSH Web profile. The tested Windows x64 setup uses the native dependency's prebuilt binary.
2. Open the dashboard, select the ESP32 COM / tty port if automatic detection did not select it, and confirm the display changes from “waiting” to a live reading.
3. In DSH's **Settings → Models**, configure a DeepSeek API key. Ask “现在温度是多少？” to exercise the tool, or carry on with a normal conversation to use the injected system prompt.
4. Edit the system-prompt template and comfortable temperature range in the dashboard. When the user explicitly says their preferred room temperature, the assistant may save the range with `remember_comfort_temperature`.

No valid / fresh reading is injected as a number when the sensor disconnects or data expires; the configurable `unavailablePrompt` is injected instead. The default sensor validity window is 10 seconds.

Version 0.4.0 includes a four-step setup checklist, actionable connection diagnostics, live port refresh, pause/resume for browser flashing, and automatic dashboard-port fallback. A Windows x64 beginner ZIP is available from the organization Releases. The public 8MB ESP32-S3 DevKitC-1-N8 firmware has no credentials; new dual-channel firmware still needs board-level acceptance.
