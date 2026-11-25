const idPattern = /^[A-Za-z0-9_-]{1,64}$/;

export class InputError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export class TemperatureStore {
  constructor({ deviceId = 'box-01', staleAfterMs = 10000, now = Date.now } = {}) {
    this.deviceId = deviceId;
    this.staleAfterMs = staleAfterMs;
    this.now = now;
    this.latest = null;
    this.history = [];
    this.retiredBoots = new Set();
  }

  ingest(input) {
    if (!input || input.schema_version !== 1) throw new InputError('Unsupported schema_version');
    if (input.device_id !== this.deviceId) throw new InputError('Unknown device_id', 403);
    for (const key of ['device_id', 'boot_id', 'sensor_id']) {
      if (typeof input[key] !== 'string' || !idPattern.test(input[key])) throw new InputError(`Invalid ${key}`);
    }
    if (input.source !== 'ds18b20') throw new InputError('Only DS18B20 device frames are accepted');
    if (!Number.isSafeInteger(input.sequence) || input.sequence < 0) throw new InputError('Invalid sequence');
    if (!Number.isInteger(input.sample_age_ms) || input.sample_age_ms < 0 || input.sample_age_ms > 60000) {
      throw new InputError('Invalid sample_age_ms');
    }
    if (!['ok', 'disconnected', 'sensor_error'].includes(input.status)) throw new InputError('Invalid sensor status');
    if (input.status === 'ok') {
      if (typeof input.temperature_c !== 'number' || !Number.isFinite(input.temperature_c)
          || input.temperature_c < -55 || input.temperature_c > 125) throw new InputError('Invalid DS18B20 temperature');
    } else if (input.temperature_c !== null) throw new InputError('Failed readings must have null temperature_c');
    if (this.retiredBoots.has(input.boot_id)) throw new InputError('Retired boot frame', 409);
    if (this.latest?.boot_id === input.boot_id && input.sequence <= this.latest.sequence) {
      throw new InputError('Duplicate or out-of-order frame', 409);
    }
    if (this.latest && this.latest.boot_id !== input.boot_id) this.retiredBoots.add(this.latest.boot_id);
    // Bound long-lived state even across many device resets.
    if (this.retiredBoots.size > 128) this.retiredBoots.delete(this.retiredBoots.values().next().value);
    const receivedAt = this.now();
    this.latest = {
      schema_version: 1, device_id: input.device_id, boot_id: input.boot_id,
      sensor_id: input.sensor_id, source: input.source, sequence: input.sequence,
      sensor_status: input.status, temperature_c: input.temperature_c,
      received_at: new Date(receivedAt).toISOString(),
      sampled_at: new Date(receivedAt - input.sample_age_ms).toISOString(),
    };
    this.history.push({ ...this.latest });
    if (this.history.length > 300) this.history.shift();
    return this.snapshot();
  }

  snapshot() {
    if (!this.latest) return {
      schema_version: 1, device_id: this.deviceId, status: 'waiting',
      temperature_c: null, source: 'none', age_ms: null, sampled_at: null,
      stale_after_ms: this.staleAfterMs,
    };
    const age = Math.max(0, this.now() - Date.parse(this.latest.sampled_at));
    const status = age > this.staleAfterMs ? 'stale' : this.latest.sensor_status;
    return { ...this.latest, status, age_ms: age, stale_after_ms: this.staleAfterMs,
      temperature_c: status === 'ok' ? this.latest.temperature_c : null };
  }
}

export function describeTemperature(reading, { coldBelowC = 18, hotAboveC = 28 } = {}) {
  if (reading?.status !== 'ok' || !Number.isFinite(reading.temperature_c)) {
    const status = reading?.status ?? 'unavailable';
    return `温度表情箱：当前没有可用的实时温度（状态：${status}）。不要沿用历史读数、猜测温度或声称已经测量。需要时请用户检查设备。`;
  }
  const value = reading.temperature_c;
  const feeling = value < coldBelowC ? '偏凉，可以自然地关心是否需要保暖'
    : value >= hotAboveC ? '偏热，可以自然地提醒通风、休息或适量饮水' : '温度较舒适';
  return `温度表情箱实时环境观测：DS18B20 测得 ${value.toFixed(2)} °C；设备 ${reading.device_id}；采样时间 ${reading.sampled_at}；数据年龄 ${reading.age_ms} ms；有效期 ${reading.stale_after_ms} ms。${feeling}。这是探头周围的温度，不代表体温、湿度或用户身体状况；结合对话自然关心，避免每句话重复提醒。用户询问当前温度时调用 get_current_temperature 再次确认，以新读数为准。`;
}
