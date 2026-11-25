import test from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import SystemPrompt, { renderPrompt } from '@deepseek-ai/dsh-system-prompt';
import ToolsService from '@deepseek-ai/dsh-tools';
import * as nativeExecutor from '@deepseek-ai/dsh-tool-executor-native';
import * as temperature from '../plugins/temperature/index.mjs';
import { DEFAULT_SETTINGS, buildSystemPrompt } from '../plugins/temperature/settings.mjs';

test('official DSH assembly injects configured cute temperature prompt and offers lookup + preference tools', async (t) => {
  const ctx = new Context();
  const settings = structuredClone(DEFAULT_SETTINGS);
  let reading = { status: 'ok', temperature_c: 24.125, age_ms: 350, stale_after_ms: 10000, device_id: 'box-01', sampled_at: new Date().toISOString() };
  const runtime = {
    dashboardUrl: 'http://127.0.0.1:48921/',
    reading: () => structuredClone(reading),
    settings: { read: () => structuredClone(settings), update: async (patch) => Object.assign(settings, patch) },
    updateSettings: async (patch) => Object.assign(settings, patch),
    close: async () => {},
  };
  const disposeRuntime = ctx.provide('temperatureBoxRuntime', runtime);
  await ctx.plugin(SystemPrompt, {});
  await ctx.plugin(ToolsService);
  await ctx.plugin(nativeExecutor);
  let drawCount = 0;
  t.mock.method(Math, 'random', () => drawCount++ === 0 ? 0.1699 : 0.17);
  const plugin = await ctx.plugin(temperature);
  try {
    const assembly = await ctx.systemPrompt.assemble();
    assert.match(renderPrompt(assembly), /当前得到温度为 24\.13 °C/);
    assert.match(renderPrompt(assembly), /温柔自然/);
    assert.ok(assembly.tools.some((tool) => tool.name === 'get_current_temperature'));
    assert.ok(assembly.tools.some((tool) => tool.name === 'remember_comfort_temperature'));

    reading = { ...reading, status: 'stale', temperature_c: null };
    const unavailable = await ctx.systemPrompt.assemble();
    assert.match(renderPrompt(unavailable), /目前无法获取到温度/);
    assert.doesNotMatch(renderPrompt(unavailable), /24\.13/);

    reading = { ...reading, status: 'ok', temperature_c: 12 };
    assert.match(buildSystemPrompt(reading, settings), /本轮未抽中温度闲聊/);
    assert.match(buildSystemPrompt(reading, settings, { allowTemperatureAside: true }), /好冷啊，欧鲸鲸要感冒了/);
    reading = { ...reading, temperature_c: 38 };
    assert.match(buildSystemPrompt(reading, settings), /本轮未抽中温度闲聊/);
    assert.match(buildSystemPrompt(reading, settings, { allowTemperatureAside: true }), /好热好热，感觉要被煮熟了/);

    const turnSignal = new AbortController().signal;
    assert.match(renderPrompt(await ctx.systemPrompt.assemble({ signal: turnSignal })), /最多一句/);
    reading = { ...reading, temperature_c: 12 };
    const sameTurn = renderPrompt(await ctx.systemPrompt.assemble({ signal: turnSignal }));
    assert.match(sameTurn, /当前得到温度为 12\.00 °C/);
    assert.match(sameTurn, /最多一句/);
    assert.match(renderPrompt(await ctx.systemPrompt.assemble({ signal: new AbortController().signal })), /不要主动提及当前温度/);
    assert.equal(drawCount, 2);

    const lookup = ctx.tools.get('get_current_temperature');
    assert.equal(JSON.parse(await lookup.execute({}, { signal: turnSignal })).temperature_c, 12);

    const signal = new AbortController().signal;
    const result = await ctx.tools.get('remember_comfort_temperature').execute({ comfort_min_c: 23, comfort_max_c: 26 }, { signal });
    assert.equal(JSON.parse(result).ok, true);
    assert.equal(settings.comfortMinC, 23);
    assert.equal(settings.comfortMaxC, 26);
  } finally {
    await plugin.dispose();
    disposeRuntime();
    await ctx.fiber.dispose();
  }
});
