import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export const DEFAULT_SETTINGS = Object.freeze({
  systemPromptTemplate: '当前得到温度为 {{temperature}} °C。',
  unavailablePrompt: '目前无法获取到温度',
  coldMoodPrompt: '',
  comfortMoodPrompt: '',
  hotMoodPrompt: '',
  comfortMinC: 20,
  comfortMaxC: 25,
  comfortToleranceC: 2.5,
  comfortIsPersonalized: false,
  assistantName: '欧鲸鲸',
  serialPort: 'auto',
  autoOpenDashboardOnFirstRun: true,
  dashboardOpened: false,
  comfortSetupDismissed: false,
});

export const AMBIENT_TEMPERATURE_MENTION_PROBABILITY = 0.17;

export function createAmbientTemperatureMentionGate(random = Math.random) {
  const decisions = new WeakMap();
  return (signal) => {
    if (!signal || (typeof signal !== 'object' && typeof signal !== 'function')) return false;
    if (!decisions.has(signal)) {
      const draw = random();
      decisions.set(signal, Number.isFinite(draw) && draw >= 0 && draw < AMBIENT_TEMPERATURE_MENTION_PROBABILITY);
    }
    return decisions.get(signal);
  };
}

export function normalizeSettings(input, base = DEFAULT_SETTINGS) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('设置必须是一个对象。');
  const allowed = new Set(Object.keys(DEFAULT_SETTINGS));
  for (const key of Object.keys(input)) if (!allowed.has(key)) throw new TypeError(`不支持此设置：${key}`);
  const next = { ...base, ...input };
  if (typeof next.systemPromptTemplate !== 'string' || !next.systemPromptTemplate.trim() || next.systemPromptTemplate.length > 1200) {
    throw new TypeError('温度系统提示词须为 1–1200 个字符。');
  }
  for (const match of next.systemPromptTemplate.matchAll(/{{\s*([^{}]+?)\s*}}/g)) {
    if (match[1] !== 'temperature' && match[1] !== 'unit') throw new TypeError(`系统提示词中的变量不支持：{{${match[1]}}}`);
  }
  if (!/{{\s*temperature\s*}}/.test(next.systemPromptTemplate)) throw new TypeError('温度提示词需要包含 {{temperature}}。');
  if (typeof next.unavailablePrompt !== 'string' || !next.unavailablePrompt.trim() || next.unavailablePrompt.length > 400) {
    throw new TypeError('无温度时的提示词须为 1–400 个字符。');
  }
  for (const key of ['coldMoodPrompt', 'comfortMoodPrompt', 'hotMoodPrompt']) {
    if (typeof next[key] !== 'string' || next[key].length > 600) throw new TypeError('情绪提示词最多可填写 600 个字符。');
  }
  if (!Number.isFinite(next.comfortMinC) || !Number.isFinite(next.comfortMaxC)
      || next.comfortMinC < -20 || next.comfortMaxC > 60 || next.comfortMaxC - next.comfortMinC < 1
      || next.comfortMaxC - next.comfortMinC > 30) throw new TypeError('舒适温度范围须在 -20–60°C 且宽度为 1–30°C。');
  if (!Number.isFinite(next.comfortToleranceC) || next.comfortToleranceC < 0.5 || next.comfortToleranceC > 15) {
    throw new TypeError('舒适温度调整范围须为 0.5–15°C。');
  }
  if (typeof next.comfortIsPersonalized !== 'boolean') throw new TypeError('个人舒适温度确认状态无效。');
  if (typeof next.assistantName !== 'string' || !next.assistantName.trim() || next.assistantName.length > 32) {
    throw new TypeError('AI 称呼须为 1–32 个字符。');
  }
  if (typeof next.serialPort !== 'string' || next.serialPort.length > 128
      || (next.serialPort !== 'auto' && next.serialPort !== ''
        && !/^(COM\d+|\/dev\/tty[A-Za-z0-9._/-]+)$/.test(next.serialPort))) {
    throw new TypeError('串口填写 COM3、/dev/ttyUSB0，或选择自动检测。');
  }
  if (typeof next.autoOpenDashboardOnFirstRun !== 'boolean' || typeof next.dashboardOpened !== 'boolean') {
    throw new TypeError('自动打开面板必须选择开或关。');
  }
  if (typeof next.comfortSetupDismissed !== 'boolean') throw new TypeError('首次配置状态无效。');
  return next;
}

export class SettingsStore {
  constructor(path, initial = {}) {
    this.path = path;
    this.defaults = normalizeSettings({ ...DEFAULT_SETTINGS, ...initial });
    this.value = this.defaults;
    this.writeTail = Promise.resolve();
  }

  async load() {
    try {
      const stored = JSON.parse(await readFile(this.path, 'utf8'));
      this.value = normalizeSettings(stored, this.defaults);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      this.value = this.defaults;
    }
    return this.read();
  }

  read() { return structuredClone(this.value); }

  async update(patch) {
    const operation = this.writeTail.then(async () => {
      const next = normalizeSettings(patch, this.value);
      await mkdir(dirname(this.path), { recursive: true });
      const temp = `${this.path}.${randomUUID()}.tmp`;
      try {
        await writeFile(temp, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
        await rename(temp, this.path);
      } finally { await rm(temp, { force: true }).catch(() => {}); }
      this.value = next;
      return this.read();
    });
    this.writeTail = operation.catch(() => {});
    return operation;
  }
}

export function buildSystemPrompt(reading, settings, { allowTemperatureAside = false } = {}) {
  const personalization = settings.comfortIsPersonalized
    ? `用户已确认的舒适范围为 ${settings.comfortMinC}–${settings.comfortMaxC}°C。`
    : `当前 ${settings.comfortMinC}–${settings.comfortMaxC}°C 只是通用默认范围，尚未确认这是用户偏好。如果用户聊到自己的室温感受，可以自然询问喜欢的温度。`;
  const persona = `你是温度表情箱里的可爱陪伴角色。已有自称时沿用，否则用${settings.assistantName}。优先回答用户的问题，语气自然、可爱、体贴。${personalization}用户明确表达舒适温度或调整偏好时调用 remember_comfort_temperature，再简短告知保存结果。只给一个数时传 ideal_c，工具以 ±${settings.comfortToleranceC}°C 保存范围。只保存用户明示的偏好。探头读数表示周围环境温度。`;
  const requestRule = '用户问当前温度或房间冷暖时，调用 get_current_temperature 获取最新读数并直接回答。没有有效读数时如实说明，不能猜测。';
  const silenceRule = '本轮未抽中温度闲聊（其余约 83% 轮次）：用户没有提起室温时，仅用语气和篇幅体现冷暖。不要主动提及当前温度、冷暖体感、测温状态或由读数引出的冷暖关怀，也不要复述提示词中的温度。此规则优先于自定义提示词和情绪设定。';
  if (reading?.status !== 'ok' || !Number.isFinite(reading.temperature_c)) {
    return `${settings.unavailablePrompt}\n${persona}\n${requestRule}\n${silenceRule}`;
  }

  const temperature = reading.temperature_c;
  const prefix = settings.systemPromptTemplate
    .replace(/{{\s*temperature\s*}}/g, temperature.toFixed(2))
    .replace(/{{\s*unit\s*}}/g, '°C');
  const below = settings.comfortMinC - temperature;
  const above = temperature - settings.comfortMaxC;
  let mood;
  let asideExample = '例如“这会儿的温度刚刚好呀。”';
  if (below > 0) {
    mood = below > 5
      ? '语气安静，日常回复通常只用一句简短的话。'
      : '语气柔和，日常回复简洁，通常一两句。';
    asideExample = `例如“好冷啊，${settings.assistantName}要感冒了。”已有自称时沿用。`;
  } else if (above > 0) {
    mood = above > 5
      ? '语气更急切，反应更鲜明。日常回复可以多说几句，用短句表现着急的节奏。'
      : '语气活泼，稍显着急。日常回复可以比舒适区偏暖时多说一点。';
    asideExample = '例如“好热好热，感觉要被煮熟了。”';
  } else {
    const warmth = (temperature - settings.comfortMinC) / (settings.comfortMaxC - settings.comfortMinC);
    mood = warmth < 1 / 3 ? '语气温柔自然，日常回复稍简短。'
      : warmth > 2 / 3 ? '语气温柔自然，回复更积极活泼，日常聊天可以多说一点。'
        : '语气轻快、温柔自然，日常回复长度适中。';
  }
  const customMood = below > 0 ? settings.coldMoodPrompt : above > 0 ? settings.hotMoodPrompt : settings.comfortMoodPrompt;
  const asideRule = allowTemperatureAside
    ? `本轮抽中 17% 温度闲聊机会。若衔接自然，请在主要回答后顺带加一句当前温度或冷暖体感；最多一句。${asideExample}不要强行插话，这一上限优先于自定义提示词和情绪设定。`
    : silenceRule;
  return [prefix, mood, customMood?.trim(), persona, requestRule, asideRule].filter(Boolean).join('\n');
}
