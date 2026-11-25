import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';

export function consumeSerialLine(line, store) {
  if (typeof line !== 'string' || Buffer.byteLength(line, 'utf8') > 4096) return null;
  try {
    const frame = JSON.parse(line.trim());
    if (!frame || typeof frame !== 'object' || Array.isArray(frame)
        || frame.schema_version !== 1 || frame.source !== 'ds18b20') return null;
    return store.ingest(frame);
  } catch {
    // Boot diagnostics, garbage and invalid readings never reach the live state.
    return null;
  }
}

export function attachSerialBridge({ path, baudRate = 115200, store, onReading, onError, serialPortClass = SerialPort }) {
  if (typeof path !== 'string' || !/^(COM\d+|\/dev\/tty[A-Za-z0-9._/-]+)$/.test(path)) {
    throw new Error('SERIAL_PORT must be a COM port such as COM3 or a /dev/tty* device');
  }
  if (!Number.isInteger(baudRate) || baudRate < 300 || baudRate > 1000000) throw new Error('Invalid SERIAL_BAUD');
  let disposed = false;
  let retryTimer;
  let parser;
  let port;

  const scheduleOpen = () => {
    if (disposed || retryTimer) return;
    retryTimer = setTimeout(open, 2000);
    retryTimer.unref?.();
  };

  const open = () => {
    retryTimer = undefined;
    if (disposed) return;
    port = new serialPortClass({ path, baudRate, autoOpen: false });
    parser = port.pipe(new ReadlineParser({ delimiter: '\n', includeDelimiter: false }));
    parser.on('data', (line) => {
      const reading = consumeSerialLine(String(line).replace(/\r$/, ''), store);
      if (reading) onReading?.(reading);
    });
    port.on('open', () => onReading?.({ kind: 'connected', path, baudRate }));
    port.on('error', (error) => {
      onError?.(error);
      scheduleOpen();
    });
    port.on('close', () => scheduleOpen());
    port.open((error) => {
      if (error) {
        onError?.(error);
        try { port.destroy(); } catch { /* retry the next open interval */ }
        scheduleOpen();
      }
    });
  };

  open();
  return {
    close(callback) {
      disposed = true;
      clearTimeout(retryTimer);
      parser?.destroy();
      if (port?.isOpen) port.close(callback ?? (() => {}));
      else callback?.();
    },
  };
}
