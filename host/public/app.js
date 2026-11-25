const $ = (id) => document.getElementById(id);
const statuses = { waiting: '等待设备', stale: '数据已过期', disconnected: '探头已断开', sensor_error: '探头异常', unavailable: '服务未连接', ok: '实时感知中' };
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
    face = data.temperature_c < 18 ? 'cold' : data.temperature_c >= 28 ? 'hot' : 'comfortable';
    [feeling, care] = face === 'cold' ? ['这里有一点凉意', '如果你也觉得冷，添件衣服，让自己暖和一点。']
      : face === 'hot' ? ['这里有一点热呢', '记得适量喝水，给房间一点流动的空气。'] : ['刚刚好，想陪你待一会儿', '温度很舒服，愿你今天也有自己的好节奏。'];
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
await poll(); setInterval(poll, 1000);
