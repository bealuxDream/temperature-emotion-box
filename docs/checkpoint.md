# 实施检查点

日期：2026-11-23（Asia/Shanghai）。GPIO16、COM3、实时网页及 DeepSeek 对话已联动。标准 dsh Bundle 0.3.0 已通过官方命令从 tarball 安装并重启验证。本地测试对话读取 21.125°C，并保存了 23–26°C 的测试偏好。测试后已恢复未个性化的 20–25°C 默认值。参考温度计校准仍待完成。

## 已有事实

- 独立项目 Git 已初始化，分支 main。2026-11-25 创建公开仓库 kiroee3/temperature-emotion-box，GitHub Pages 已启用工作流部署。
- 用户选择官方 dsh，未安装 Open WebUI。官方仓库 deepseek-ai/deepseek-harness 的 README 明确 dsh 身份及 Web UI。安装 @deepseek-ai/dsh 0.2.2-rc.1；项目本地 Node 24.11.1，系统 Node 24.7.0 保留。
- 上位机温度服务、中文表情面板、原生 Cordis 工具插件、每步动态上下文、私有设备凭证生成和 Git 忽略已实现。
- 温度服务实际 HTTP 200；无硬件时 API 为 waiting / temperature_c:null。接入后 GET `/api/v1/temperature` 实测返回 `status=ok`、`temperature_c=22.3125`、`age_ms=317`、`sensor_status=ok`；历史收到 27 帧。随后串口持续采到约 22.25–22.31°C。
- 官方 dsh 实际启动并打印温度工具与动态上下文注册日志。Playwright 在 Edge 打开了中文 dsh 页面；面板 /chat 可用本次启动令牌跳转并成功认证。
- 最新一轮 `npm test` 12/12 通过：协议与零值、数据过期、断线、非法/模拟来源、乱序、认证、边界、官方 dsh Prompt Assembly、17% 单轮抽签与复用、直接温度查询例外、设置持久化和面板服务。测试夹具不代表真实温度。
- ESP32-S3 固件真实构建成功并烧录至 FTDI COM3：esptool 检出 ESP32-S3 revision v0.2，整镜像及各分区 Hash verified，RTS 自动复位成功。PlatformIO `esp32-s3-devkitc-1`、espressif32 6.10.0、Arduino framework 3.20017、PlatformIO 6.1.18。RAM 45,880 B / 327,680 B；Flash 887,057 B / 3,342,336 B。测温 DQ 在本次 secrets 配置为 GPIO16；固件通过 Serial0 输出 UART0 JSON，主机 USB SerialPort 桥把数据提交到温度服务。
- `SERIAL_PORT=COM3` 位于被 Git 忽略的 `.env`；已启动真实串口读取、面板与 dsh。历史联调读数约 22.31°C；测试夹具与实物读数分开记录。
- 实际 DeepSeek 聊天已端到端验证：工作区“温度表情箱”，模型 DeepSeek-V4.1-Flash High；提问“请查询温度表情箱当前的真实温度……”，Agent 实际执行 `get_current_temperature`，工具读数 `22.1875 °C`、采样年龄 `421 ms`，最终回答 `22.19 °C` 并按舒适温度自然关心。对话与工具轨迹已存入本机忽略的 DSH 数据目录。
- 已检查桌面 1440×1050 和手机 390×844 页面。面板控制台零错误；首次发现的 CSP 样式和 favicon 问题已修复。截图位于 Git 忽略的 output/playwright/ 与 .local/。

## 已解决的问题与边界

1. 内置浏览器宿主报 registered runtime ownership is missing，改用 Playwright CLI + Edge 验证；不代表产品页面失败。
2. 旧 Xtensa GCC 在中文绝对路径下报 Invalid argument / CreateProcess。构建脚本临时 subst 项目到空闲 ASCII 盘符，已编译成功并解除映射。第三方 OneWire 2.3.8 有两条 #undef 编译警告，不影响本次链接。
3. 官方 dsh 裸地址返回 401 属于访问令牌机制。启动器保存本次 URL 到 .local/dsh-launch.json，面板 /chat 仅向 loopback 请求返回授权跳转；不向局域网泄露令牌。
4. 实时指每个模型请求前读取最新有效数据，以及主动工具查询；不能在单次模型生成进行中改写其输入。
5. 当前实时链路为 USB UART。可选 LAN HTTP 路径仍保留。DeepSeek API 在电脑端调用；不是 ESP32 单机脱离上位机调用模型。实体屏幕型号未给定，本版只做网页表情。

## 本次复核状态

- 2026-11-23 本轮复核：0.3.0 已安装并运行，面板明确显示每轮 17% 温度闲聊规则；API 实测 23.125°C，COM3 串口已重连。现有个人舒适区在更新时原样保留。源码、profile 已安装插件的核心文件哈希一致。

## 仍待完成的真实验证

- 0.3.0 首次升级时，运行中的 dsh 持有 `@serialport/bindings-cpp` 文件锁，导致第一次安装中断。停止该 dsh 后将 profile 生成依赖目录备份到 `.local/dsh/profiles/web/node_modules-upgrade-backup-21806eba14b7450caa9b0bbaedf0b13a`，重新安装及启动成功；当前 COM3、面板和实测 API 均正常。备份目录仍在本机，尚未清理。

- 参考温度计多点校准；当前温度读数已实测，但未确认绝对准确度。
- 测试拔插探头、断开串口、恢复、设备断电重启和 stale 状态复位。
- 当前模型 API 和工具调用都已通过真实请求验证；API 由本机 dsh 配置调用，未写入项目或设备。
- 用独立参考温度计做多点对比与最终标定；当前不能宣称实测准确度或整机验收通过。
- 仓库：https://github.com/kiroee3/temperature-emotion-box；宣传页：https://kiroee3.github.io/temperature-emotion-box/。

## 继续入口

`npm run dev` 启动面板、COM3 串口桥和官方 dsh。打开 http://127.0.0.1:8787 查看实时真实温度，点右上角进入聊天；可问“现在温度是多少？”。`npm test` 验证上位机、串口桥与插件；`npm run firmware:build -- -UploadPort COM3` 在需要重新烧录时使用。接线与协议详见 hardware.md / protocol.md。Skill 迭代反馈为 off，未修改共享技能或记忆。

## 开源发布完成 · 2026-11-25

- 新增 MIT 许可证与插件内许可证、公开安装说明及 GitHub Pages 工作流。
- 独立静态宣传页位于 site/；浏览器验证桌面和 390px 手机布局，以及 10°C / 38°C 两端的示例互动。页面明确标注示例数据，不读取本机设备或 API Key。
- 本次插件软件测试 12/12 通过，安装包包含 16 个文件；已发布 GitHub Release v0.3.0 及 SHA256SUMS，公开下载包与本地文件校验一致。未执行新固件烧录或重新标定。
- GitHub Pages 工作流 45552332431 成功，线上浏览器已确认宣传页可访问。首次部署的产物可见性问题通过升级官方 Action 并拆分上传、部署任务解决。main 已推送并跟踪 origin/main。
