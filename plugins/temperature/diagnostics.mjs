const usbVendors = new Set(['0403', '10c4', '1a86', '303a']);
export function isLikelyTemperaturePort(port) {
  return usbVendors.has((port.vendorId ?? '').toLowerCase())
    || /FTDI|CP210|CH340|CH343|CH910|Espressif|USB.*(?:UART|Serial|JTAG)/i.test(port.manufacturer ?? '');
}
export function chooseSerialPort(configured, ports) {
  if (configured !== 'auto') return configured;
  const candidates = ports.filter(isLikelyTemperaturePort);
  return candidates.length === 1 ? candidates[0].path : '';
}
export function describeDiagnostics({ reading, settings, ports, transport, lastToolQueryAt }) {
  const candidates = ports.filter(isLikelyTemperaturePort);
  let code, message, action;
  if (transport.paused) {
    [code,message,action] = ['paused','串口采集已暂停，刷写器可以使用设备。','刷写完成并释放浏览器串口后，点击恢复采集。'];
  } else if (transport.error) {
    [code,message,action] = ['serial_error','无法打开串口。','关闭其他串口监视器或刷写页，检查驱动与连接后重试。'];
  } else if (reading.status === 'ok') {
    [code,message,action] = ['ready','已收到兼容固件的有效测温帧。','可以开始聊天并询问当前温度。'];
  } else if (reading.status === 'disconnected' || reading.status === 'sensor_error') {
    [code,message,action] = ['sensor_error','开发板已连通，但温度探头报告异常。','检查 DQ→GPIO16、3.3V、GND 与上拉电阻。'];
  } else if (reading.status === 'stale') {
    [code,message,action] = ['stale','曾收到温度，但数据已过期。','检查 USB 是否断开；连接恢复后会自动等待新读数。'];
  } else if (settings.serialPort === '') {
    [code,message,action] = ['http_only','当前关闭了 USB 采集。','使用 USB 时，在传感器串口里选择自动识别或设备端口。'];
  } else if (!ports.length) {
    [code,message,action] = ['no_ports','没有发现串口设备。','插入支持数据传输的 USB 线；若仍无设备，检查 USB-UART 驱动。'];
  } else if (!transport.selectedPort) {
    [code,message,action] = ['select_port',candidates.length > 1 ? '发现多个可能的设备，请手动选择。' : '没有唯一可识别的 USB 设备，请手动选择。','在下方选择开发板对应端口并保存；插拔后的列表会自动刷新。'];
  } else {
    [code,message,action] = ['waiting_frames',transport.connected ? '串口已打开，正在等待有效测温数据。' : '正在连接所选串口。','超过十秒仍无数据时，确认已烧录配套固件、USB 接口和 DQ 接线；点击“刷写固件”查看指引。'];
  }
  return {
    schema_version:1, code, message, action, sensor_status:reading.status,
    serial:{...transport}, ports:ports.map(p=>({path:p.path,manufacturer:p.manufacturer ?? '',recommended:isLikelyTemperaturePort(p)})),
    checklist:{sensor:reading.status === 'ok',comfort:settings.comfortIsPersonalized,temperatureToolUsed:Boolean(lastToolQueryAt)},
    last_tool_query_at:lastToolQueryAt,
  };
}
