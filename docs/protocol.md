# 接口约定 v1

ESP32-S3 通过 USB 串口、115200 baud 向主机逐行写入 JSON 帧，COM 号由操作系统分配。v0.4.0 公开固件支持 UART0 USB-UART 和原生 USB CDC 输出；历史实板端口为 COM3。主机只接受合法的 protocol v1 DS18B20 帧，忽略启动文案和其他串口输出。串口读数经过同一个温度状态存储。可选 LAN 模式下设备也可向 `POST /api/v1/readings` 发 `Content-Type: application/json` 和 `Authorization: Bearer <DEVICE_TOKEN>`。

```json
{"schema_version":1,"device_id":"box-01","boot_id":"random-per-boot","sensor_id":"ds18b20-0","source":"ds18b20","sequence":1,"sample_age_ms":0,"status":"ok","temperature_c":24.5}
```

`temperature_c` 单位为摄氏度，合法区间 [-55,125]，零值有效。`status` 为 `ok`、`disconnected`、`sensor_error`；故障时温度必须为 `null`。同一次启动 sequence 必须严格递增；设备重启生成新 boot_id。重复/乱序返回 409，未知设备 403，认证失败 401，格式错误 400，超大请求 413。服务只接受配置的一个设备，历史只保留 300 帧内存，服务重启后等待新数据。

主机以接收时间减 sample_age_ms 估算采样时间，不信任设备墙钟。局域网传输时延不是精确测量的一部分，12-bit 转换和网络发送引入采样延迟；本项目是温度陪伴原型，不是确定性实时系统。

`GET /api/v1/temperature` 返回 `status`、`temperature_c`、`sampled_at`、`age_ms` 和 `stale_after_ms`。未收到数据为 `waiting`；超过有效期为 `stale`，此时温度为 `null`。查询插件每轮模型步骤和显式工具调用均重新请求；服务失败时返回 `unavailable`，不复用旧成功读数。没有在 AI 正在生成一句话时修改它的输入；刷新发生在下一次模型请求前。

`GET /api/v1/history` 返回历史采样，可用于曲线但不替代实时值；故障与超过 10 秒的间隔不连线。`GET /health` 表示服务存活，不表示传感器正常。

`GET /api/v1/diagnostics` 返回设备识别、串口连接及错误、有效/忽略帧计数和新手检查项。检查项记录有效传感器、个人舒适偏好和工具调用；不据此断言模型 API Key 有效。`GET /api/v1/ports` 重新列出端口。自动模式只选择唯一可识别 USB 适配器，每三秒重新发现；多个或未知端口由用户选择。

`POST /api/v1/serial-control` 接受 JSON `{"action":"pause"}` 或 `{"action":"resume"}`。暂停等待串口关闭并立即使当前温度失效；恢复重新打开所选端口，等待新帧。这些接口与设置接口仅接受本机、相同来源请求。浏览器刷写页使用它释放采集端口。面板默认 8787 被占用时换用空闲端口，实际 URL 以启动日志或 Windows 启动器为准。

dsh 插件通过 `ctx.systemPrompt.section(...)` 在每次组装系统提示词时读取有效温度和当前偏好。温度始终用于调节回复话量、积极程度与情绪；每个 dsh 轮次按 17% 概率抽取一次，同轮内模型步骤复用该结果，允许时最多顺带一句自然的温度体感。用户直接询问当前温度或冷暖时不受此概率限制，必须查询并如实回答。通过 `get_current_temperature` 工具即时查询，通过 `remember_comfort_temperature` 工具持久化用户确认的舒适温度。停用完整插件包会清理工具、提示词、面板监听和串口连接。
