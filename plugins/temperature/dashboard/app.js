const $ = (id) => document.getElementById(id);
const statuses = { waiting: '等待设备', stale: '数据已过期', disconnected: '探头已断开', sensor_error: '探头异常', unavailable: '服务未连接', ok: '实时感知中' };
let activeSettings = { comfortMinC: 20, comfortMaxC: 25 };
const settingsFields = {
  'prompt-template': 'systemPromptTemplate',
  'unavailable-prompt': 'unavailablePrompt',
  'cold-mood-prompt': 'coldMoodPrompt',
  'comfort-mood-prompt': 'comfortMoodPrompt',
  'hot-mood-prompt': 'hotMoodPrompt',
  'assistant-name': 'assistantName',
  'comfort-min': 'comfortMinC',
  'comfort-max': 'comfortMaxC',
  'serial-port': 'serialPort',
  'auto-open': 'autoOpenDashboardOnFirstRun',
};
const editedFields = new Set();
let saving = false;
let busy = false;
function render(data) {
  const valid = data.status === 'ok' && Number.isFinite(data.temperature_c);
  $('status').textContent = statuses[data.status] ?? '状态未知';
  $('temperature').textContent = valid ? data.temperature_c.toFixed(1) : '--';
  $('device').textContent = data.device_id ?? 'box-01';
  $('sample').textContent = data.sampled_at ? new Date(data.sampled_at).toLocaleTimeString('zh-CN', { hour12: false }) : '--:--:--';
  $('live').textContent = valid ? '● LIVE' : 'NO DATA';
  $('live').className = valid ? 'live ok' : 'live';
  $('connection').textContent = valid ? '真实探头 · 已连接' : statuses[data.status] ?? '未知';
  $('note').textContent = valid ? `DS18B20 · ${(data.age_ms / 1000).toFixed(1)} 秒前采样` : '当前没有有效的实时测量数据';
  let face = 'waiting', feeling = '等一份来自房间的消息', care = '连接温度探头后，我就能感受这里的冷暖。';
  if (valid) {
    face = data.temperature_c < activeSettings.comfortMinC ? 'cold'
      : data.temperature_c > activeSettings.comfortMaxC ? 'hot' : 'comfortable';
    [feeling, care] = face === 'cold' ? ['这里有一点凉意', `当前低于你设定的舒适范围（${activeSettings.comfortMinC}–${activeSettings.comfortMaxC}°C）。如果你也觉得冷，添件衣服吧。`]
      : face === 'hot' ? ['这里有一点热呢', `当前高于你设定的舒适范围（${activeSettings.comfortMinC}–${activeSettings.comfortMaxC}°C）。记得适量喝水，给房间一点流动的空气。`]
      : ['刚刚好，想陪你待一会儿', '温度很舒服，愿你今天也有自己的好节奏。'];
  } else if (data.status !== 'waiting') { feeling = '暂时感受不到温度了'; care = '检查一下探头和连接吧，我会在这里等新的真实读数。'; }
  $('face').className = `face ${face}`; $('face').setAttribute('aria-label', feeling);
  $('feeling').textContent = feeling; $('care').textContent = care;
}
function chart(readings) {
  const canvas = $('chart'), width = canvas.clientWidth, height = canvas.clientHeight;
  const scale = window.devicePixelRatio || 1;
  canvas.width = width * scale; canvas.height = height * scale;
  const ctx = canvas.getContext('2d'); ctx.scale(scale, scale);
  const points = readings.filter((r) => r.sensor_status === 'ok' && Number.isFinite(r.temperature_c));
  $('chart-empty').hidden = points.length > 0;
  if (!points.length) return;
  const values = points.map((r) => r.temperature_c), min = Math.min(...values) - 1, max = Math.max(...values) + 1;
  const first = Date.parse(readings[0].sampled_at), last = Math.max(first + 1, Date.parse(readings.at(-1).sampled_at));
  ctx.strokeStyle = '#e6ece0'; ctx.lineWidth = 1;
  for (const y of [15, 40, 65]) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
  ctx.strokeStyle = '#91a575'; ctx.lineWidth = 2; ctx.beginPath();
  let previous = null;
  for (const reading of readings) {
    if (reading.sensor_status !== 'ok' || !Number.isFinite(reading.temperature_c)) { previous = null; continue; }
    const x = 4 + ((Date.parse(reading.sampled_at) - first) / (last - first)) * (width - 8);
    const y = height - 8 - ((reading.temperature_c - min) / (max - min)) * (height - 16);
    if (!previous || Date.parse(reading.sampled_at) - Date.parse(previous.sampled_at) > 10000) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    ctx.stroke(); ctx.beginPath(); ctx.arc(x, y, 1.7, 0, Math.PI * 2); ctx.fillStyle = '#91a575'; ctx.fill(); ctx.beginPath(); ctx.moveTo(x, y);
    previous = reading;
  }
  ctx.stroke();
}
async function poll() {
  if (busy) return; busy = true;
  try {
    const [current, history] = await Promise.all([fetch('/api/v1/temperature', { signal: AbortSignal.timeout(2500) }), fetch('/api/v1/history', { signal: AbortSignal.timeout(2500) })]);
    if (!current.ok || !history.ok) throw new Error('HTTP error');
    render(await current.json()); chart((await history.json()).readings);
  } catch { render({ status: 'unavailable' }); }
  finally { busy = false; }
}

function setFields(settings) {
  activeSettings = settings;
  $('comfort-setup').hidden = settings.comfortIsPersonalized || settings.comfortSetupDismissed;
  for (const [id, key] of Object.entries(settingsFields)) {
    if (editedFields.has(id) || document.activeElement === $(id)) continue;
    if ($(id).type === 'checkbox') $(id).checked = settings[key];
    else $(id).value = settings[key];
  }
  $('comfort-status').textContent = settings.comfortIsPersonalized
    ? '已记住你的个人偏好，聊天和表情都会随之调整。'
    : '这是通用起始范围。也可以在聊天里告诉 AI 你喜欢的室温。';
}

async function loadSettings() {
  try {
    const [result, detected] = await Promise.all([fetch('/api/v1/settings'), fetch('/api/v1/ports')]);
    if (!result.ok) throw new Error('设置服务暂时不可用');
    const { settings } = await result.json();
    for (const port of detected.ok ? (await detected.json()).ports : []) {
      if ([...$('serial-port').options].some((option) => option.value === port.path)) continue;
      const option = document.createElement('option');
      option.value = port.path;
      option.textContent = `${port.path}${port.manufacturer ? ` · ${port.manufacturer}` : ''}`;
      $('serial-port').append(option);
    }
    // Keep a saved port visible even if it is temporarily disconnected.
    if (settings.serialPort && settings.serialPort !== 'auto' && ![...$('serial-port').options].some((option) => option.value === settings.serialPort)) {
      const option = document.createElement('option'); option.value = settings.serialPort; option.textContent = `${settings.serialPort} · 当前未连接`; $('serial-port').append(option);
    }
    setFields(settings);
    $('settings-state').textContent = '偏好已加载';
  } catch { $('settings-state').textContent = '设置服务未连接'; }
}

const saveButton = $('settings-form').querySelector('button[type="submit"]');
async function saveSettings(patch) {
  const response = await fetch('/api/v1/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
    signal: AbortSignal.timeout(5000),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? '保存失败，请重试。');
  return body.settings;
}

async function completeComfortSetup(patch) {
  if (saving) return;
  saving = true;
  const buttons = $('comfort-setup-form').querySelectorAll('button');
  for (const button of buttons) button.disabled = true;
  try {
    setFields(await saveSettings(patch));
    $('settings-state').textContent = '偏好已加载';
  } catch (error) {
    $('setup-message').textContent = error.message;
  } finally {
    saving = false;
    for (const button of buttons) button.disabled = false;
    saveButton.disabled = editedFields.size === 0;
  }
}

$('comfort-setup-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const first = $('setup-first').valueAsNumber;
  const last = $('setup-last').valueAsNumber;
  const tolerance = activeSettings.comfortToleranceC;
  const round = (value) => Math.round(value * 100) / 100;
  const single = !Number.isFinite(last);
  void completeComfortSetup({
    comfortMinC: single ? round(first - tolerance) : first,
    comfortMaxC: single ? round(first + tolerance) : last,
    comfortIsPersonalized: true,
  });
});
$('setup-skip').addEventListener('click', () => void completeComfortSetup({ comfortSetupDismissed: true }));

for (const id of Object.keys(settingsFields)) $(id).addEventListener('input', () => {
  editedFields.add(id);
  if (!saving) saveButton.disabled = false;
});

$('settings-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (saving || editedFields.size === 0) return;
  saving = true;
  saveButton.disabled = true;
  $('settings-message').textContent = '正在保存…';
  const patch = {};
  const readField = (id) => {
    const element = $(id);
    if (element.type === 'checkbox') return element.checked;
    if (element.type === 'number') return element.valueAsNumber;
    return element.value;
  };
  const submitted = new Map([...editedFields].map((id) => [id, readField(id)]));
  for (const [id, value] of submitted) patch[settingsFields[id]] = value;
  if (submitted.has('comfort-min') || submitted.has('comfort-max')) {
    patch.comfortMinC = readField('comfort-min');
    patch.comfortMaxC = readField('comfort-max');
    patch.comfortToleranceC = (patch.comfortMaxC - patch.comfortMinC) / 2;
    patch.comfortIsPersonalized = true;
  }
  try {
    const settings = await saveSettings(patch);
    for (const [id, value] of submitted) if (readField(id) === value) editedFields.delete(id);
    setFields(settings);
    $('settings-message').textContent = '已保存 · 新偏好会用于接下来的每次对话';
    $('settings-state').textContent = '偏好已保存';
  } catch (error) {
    $('settings-message').textContent = error.message || '保存失败，请检查设置。';
    $('settings-state').textContent = '保存失败';
  } finally { saving = false; saveButton.disabled = editedFields.size === 0; }
});

await Promise.all([poll(), loadSettings()]);
setInterval(poll, 1000);
setInterval(async () => {
  if (saving || document.hidden) return;
  try {
    const response = await fetch('/api/v1/settings', { signal: AbortSignal.timeout(2000) });
    if (response.ok && !saving) setFields((await response.json()).settings);
  } catch { /* the latest available preferences stay visible until reconnect */ }
}, 4000);
