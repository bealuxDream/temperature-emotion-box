import { defineTool } from '@deepseek-ai/dsh-tools';
import { buildSystemPrompt, createAmbientTemperatureMentionGate } from './settings.mjs';

export const name = 'dsh-temperature-emotion-box';
export const inject = ['tools', 'systemPrompt', 'temperatureBoxRuntime'];
export function apply(ctx) {
  const runtime = ctx.temperatureBoxRuntime;
  // DSH shares one signal across all model steps in a turn.
  const allowTemperatureAside = createAmbientTemperatureMentionGate();

  // DSH resolves this dynamic section every model turn; successful sensor data
  // never becomes a stale, startup-only system prompt.
  ctx.systemPrompt.section({
    name: 'temperature-emotion-box:personalized-temperature',
    order: 10300,
    interpolate: false,
    text: ({ signal }) => buildSystemPrompt(runtime.reading(), runtime.settings.read(), {
      allowTemperatureAside: allowTemperatureAside(signal),
    }),
  });

  ctx.tools.register(defineTool({
    name: 'get_current_temperature',
    description: '读取温度表情箱的最新真实 DS18B20 环境温度（摄氏度）。用户询问当前温度时应使用此工具。只报告成功返回的最新读数；未连接、过期或错误时明确说明无法获取，不猜测。',
    parameters: {},
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute() {
      runtime.recordToolQuery?.();
      const reading = runtime.reading();
      const explanation = reading.status === 'ok' ? 'DS18B20 测得的探头周围温度。' : '目前无法获取到温度';
      return JSON.stringify({ ...reading, explanation });
    },
  }));

  ctx.tools.register(defineTool({
    name: 'remember_comfort_temperature',
    description: '保存用户明确表达的舒适室温。用户只给一个数时传 ideal_c；用户给出区间时传两个边界。若用户说“这个温度刚刚好”，先查询探头确认数值，再询问是否把它记为偏好。单纯说冷或热时先问舒适温度，不能猜测。',
    parameters: {
      ideal_c: { type: 'number', description: '用户亲口表达的单点舒适温度，摄氏度。' },
      comfort_min_c: { type: 'number', description: '用户表达的舒适温度范围下限，摄氏度。' },
      comfort_max_c: { type: 'number', description: '用户表达的舒适温度范围上限，摄氏度。' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      const single = args.ideal_c !== undefined;
      const range = args.comfort_min_c !== undefined && args.comfort_max_c !== undefined;
      if (single ? args.comfort_min_c !== undefined || args.comfort_max_c !== undefined : !range) {
        return JSON.stringify({ ok: false, message: '请提供一个舒适温度，或者同时提供舒适区间的上下限。' });
      }
      const tolerance = runtime.settings.read().comfortToleranceC;
      const round = (value) => Math.round(value * 100) / 100;
      const min = single ? round(args.ideal_c - tolerance) : args.comfort_min_c;
      const max = single ? round(args.ideal_c + tolerance) : args.comfort_max_c;
      try {
        await runtime.updateSettings({ comfortMinC: min, comfortMaxC: max, comfortIsPersonalized: true });
      } catch (error) {
        if (!(error instanceof TypeError)) throw error;
        return JSON.stringify({ ok: false, message: error.message });
      }
      return JSON.stringify({ ok: true, comfort_min_c: min, comfort_max_c: max,
        message: `已记住你偏好的舒适范围：${min}–${max} °C。` });
    },
  }));

  console.log(`[dsh-temperature-emotion-box] ready at ${runtime.dashboardUrl}; temperature query and user-managed comfort range are active`);
}
