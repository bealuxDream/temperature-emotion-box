import test from 'node:test';
import assert from 'node:assert/strict';
import { AMBIENT_TEMPERATURE_MENTION_PROBABILITY, createAmbientTemperatureMentionGate, DEFAULT_SETTINGS, buildSystemPrompt, normalizeSettings, SettingsStore } from '../plugins/temperature/settings.mjs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('default Chinese system prompt is concrete and includes the sensor value', () => {
  const prompt = buildSystemPrompt({ status: 'ok', temperature_c: 22.1875, age_ms: 300, stale_after_ms: 10000 }, DEFAULT_SETTINGS);
  assert.match(prompt, /^当前得到温度为 22\.19 °C/);
  const unavailable = buildSystemPrompt({ status: 'disconnected', temperature_c: null }, DEFAULT_SETTINGS);
  assert.match(unavailable, /^目前无法获取到温度/);
  assert.doesNotMatch(unavailable, /22\.19/);
});

test('temperature changes reply style and uses one deterministic 17% ambient-aside draw per turn', () => {
  assert.equal(AMBIENT_TEMPERATURE_MENTION_PROBABILITY, 0.17);
  let draws = 0;
  const gate = createAmbientTemperatureMentionGate(() => { draws++; return 0.16; });
  const turnSignal = new AbortController().signal;
  assert.equal(gate(turnSignal), true);
  assert.equal(gate(turnSignal), true);
  assert.equal(draws, 1);
  const blockedGate = createAmbientTemperatureMentionGate(() => 0.17);
  assert.equal(blockedGate(new AbortController().signal), false);
  assert.equal(blockedGate(undefined), false);

  const cold = buildSystemPrompt({ status: 'ok', temperature_c: 12 }, DEFAULT_SETTINGS);
  assert.match(cold, /通常只用一句简短的话/);
  assert.match(cold, /本轮未抽中温度闲聊/);
  assert.match(cold, /用户问当前温度.*直接回答/);
  assert.doesNotMatch(cold, /好冷啊，欧鲸鲸要感冒了/);
  const selectedCold = buildSystemPrompt({ status: 'ok', temperature_c: 12 }, DEFAULT_SETTINGS, { allowTemperatureAside: true });
  assert.match(selectedCold, /好冷啊，欧鲸鲸要感冒了/);
  assert.match(selectedCold, /最多一句/);

  const hot = buildSystemPrompt({ status: 'ok', temperature_c: 38 }, DEFAULT_SETTINGS);
  assert.match(hot, /更急切/);
  assert.match(hot, /本轮未抽中温度闲聊/);
  assert.doesNotMatch(hot, /好热好热，感觉要被煮熟了/);
  const selectedHot = buildSystemPrompt({ status: 'ok', temperature_c: 38 }, DEFAULT_SETTINGS, { allowTemperatureAside: true });
  assert.match(selectedHot, /好热好热，感觉要被煮熟了/);

  const adjusted = normalizeSettings({ comfortMinC: 24, comfortMaxC: 27 });
  assert.match(buildSystemPrompt({ status: 'ok', temperature_c: 28 }, adjusted), /稍显着急/);
});

test('system prompt variables, range, nickname and serial device settings reject invalid values', () => {
  for (const patch of [
    { systemPromptTemplate: '{{temperature_secret}}' },
    { systemPromptTemplate: '' },
    { comfortMinC: 26, comfortMaxC: 25 },
    { comfortMinC: -21 },
    { comfortToleranceC: 30 },
    { assistantName: '' },
    { serialPort: 'COM3&format' },
  ]) assert.throws(() => normalizeSettings(patch));
});

test('settings persist atomically across plugin runtime restarts', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'temperature-box-settings-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'settings.json');
  const first = new SettingsStore(path);
  await first.load();
  await first.update({ comfortMinC: 22, comfortMaxC: 27, systemPromptTemplate: '现在 {{temperature}}{{unit}}' });
  const second = new SettingsStore(path);
  const persisted = await second.load();
  assert.equal(persisted.comfortMinC, 22);
  assert.equal(persisted.comfortMaxC, 27);
  assert.equal(persisted.systemPromptTemplate, '现在 {{temperature}}{{unit}}');
  const disk = await readFile(path, 'utf8');
  assert.doesNotMatch(disk, /api[_ -]?key|device[_ -]?token/i);
});
