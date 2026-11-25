import Schema from '@deepseek-ai/schemastery';
import { createTemperatureRuntime } from './runtime.mjs';

export const name = 'dsh-temperature-emotion-box/runtime';
export const provide = 'temperatureBoxRuntime';
export const inject = ['webApp', 'connection'];
export const Config = Schema.object({
  host: Schema.string().default('127.0.0.1'),
  port: Schema.number().min(0).max(65535).default(8787),
  deviceId: Schema.string().default('box-01'),
  staleAfterMs: Schema.number().min(1000).max(60000).default(10000),
  baudRate: Schema.number().min(300).max(1000000).default(115200),
  serialPort: Schema.string().default('auto'),
  deviceToken: Schema.string().default(''),
  settingsPath: Schema.string().default(''),
  autoOpenDashboardOnFirstRun: Schema.boolean().default(true),
  systemPromptTemplate: Schema.string().default('当前得到温度为 {{temperature}} °C。'),
  unavailablePrompt: Schema.string().default('目前无法获取到温度'),
  comfortMinC: Schema.number().min(-20).max(59).default(20),
  comfortMaxC: Schema.number().min(-19).max(60).default(25),
  comfortToleranceC: Schema.number().min(0.5).max(15).default(2.5),
  comfortIsPersonalized: Schema.boolean().default(false),
  assistantName: Schema.string().default('欧鲸鲸'),
});

export async function apply(ctx, config) {
  if (config.comfortMaxC - config.comfortMinC < 1 || config.comfortMaxC - config.comfortMinC > 30) {
    throw new Error('舒适温度范围宽度须为 1–30°C。');
  }
  const runtime = await createTemperatureRuntime({ ...config,
    getChatUrl: () => ctx.connection.authenticatedUrl(ctx.webApp.getAdvertisedUrl()),
  });
  ctx.effect(() => () => runtime.close(), 'temperature-emotion-box.runtime');
  ctx.provide('temperatureBoxRuntime', runtime);
  console.log(`[dsh-temperature-emotion-box] 温度面板已就绪：${runtime.dashboardUrl}`);
}
