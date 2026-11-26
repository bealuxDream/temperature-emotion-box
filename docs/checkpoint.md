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
- 仓库：https://github.com/bealuxDream/temperature-emotion-box；宣传页：https://bealuxdream.github.io/temperature-emotion-box/。

## 继续入口

`npm run dev` 启动面板、COM3 串口桥和官方 dsh。打开 http://127.0.0.1:8787 查看实时真实温度，点右上角进入聊天；可问“现在温度是多少？”。`npm test` 验证上位机、串口桥与插件；`npm run firmware:build -- -UploadPort COM3` 在需要重新烧录时使用。接线与协议详见 hardware.md / protocol.md。Skill 迭代反馈为 off，未修改共享技能或记忆。

## 开源发布完成 · 2026-11-25

- 新增 MIT 许可证与插件内许可证、公开安装说明及 GitHub Pages 工作流。
- 独立静态宣传页位于 site/；浏览器验证桌面和 390px 手机布局，以及 10°C / 38°C 两端的示例互动。页面明确标注示例数据，不读取本机设备或 API Key。
- 本次插件软件测试 12/12 通过，安装包包含 16 个文件；已发布 GitHub Release v0.3.0 及 SHA256SUMS，公开下载包与本地文件校验一致。未执行新固件烧录或重新标定。
- GitHub Pages 工作流 45552332431 成功，线上浏览器已确认宣传页可访问。首次部署的产物可见性问题通过升级官方 Action 并拆分上传、部署任务解决。main 已推送并跟踪 origin/main。

## 组织迁移 · 2026-11-25

- 仓库已从 kiroee3 转移至 bealuxDream，仍为 Public / MIT；提交历史和 v0.3.0 Release 资产已保留，SHA-256 未变化。
- 本机 origin、README、宣传页入口和插件仓库元数据已改为组织地址。
- 组织域名宣传页为 https://bealuxdream.github.io/temperature-emotion-box/，GitHub Pages 工作流 45555969992 已成功；新域名 HTTP 200，组织下载链接核验通过。
- 当前 kiroee3 在组织仓库拥有 WRITE 权限；组织仓库设置由组织管理员管理。

## 首次使用审查 · 2026-11-25

- 公开 v0.3.0 在新 DSH_HOME 中安装成功，独立端口启动后浏览器验证偏好填写与认证跳转；dsh 原生 API Key 中文引导和默认工作区存在。
- 首轮 35 秒启动等待超时，单独重试后启动成功；未归因的启动等待仍记为限制。复用本机官方 dsh 运行时/缓存，不是全新操作系统验收。
- 隔离检查验证偏好重新加载、跳过向导、无设备不造温度；复现固定面板端口冲突直接 EADDRINUSE；未连接硬件或进行模型 API 请求。
- 结论：当前为可用的开发预览插件，尚未达到零基础用户开袋即食。完整发现和整改验收条件见 first-use-audit.md。
- 本地 README 已补充 Node >=24.9、pnpm、dsh 安装前提和 UART0/原生 USB 区别。未改动发布包、固件或线上页面，未提交/推送本轮修改。软件测试仍为 12/12 通过。

## 新手安装补齐 v0.4.0 · 2026-11-26

- Windows x64 新手 ZIP：双击 Start.cmd 以 WPF 显示进度，独立下载并校验 Node 24.11.1、安装 pnpm 10.25.0 和官方 dsh 0.2.2-rc.1。默认数据目录为 `%LOCALAPPDATA%/TemperatureEmotionBox`，不修改系统 Node 或已有全局 dsh；首次仍需联网。API Key 与舒适偏好由最终使用者填写。
- 面板新增四步检查、连接诊断、刷新与手动选择串口、暂停/恢复采集；唯一可识别 USB 适配器自动选择，未知或多个设备不猜测。8787 冲突时自动选择空闲端口。暂停等待正在打开的串口真正关闭，并立即使旧读数失效。
- 标准插件 tgz 仍可通过官方 dsh 命令安装。图形刷写器及 esptool-js 0.7.1、依赖许可证、无凭证固件均随包分发，无 CDN 依赖。下载使用 SHA-256 验证，写入检查芯片/Flash 容量、要求手动核对兼容板型并确认覆盖。
- 公开固件 `esp32-s3-public` 已成功编译和合并：RAM 45,944 B，Flash 888,285 B，合并镜像 954,192 B。目标 ESP32-S3 DevKitC-1-N8，8MB、无 PSRAM、DQ GPIO16；忽略本机 secrets.h，未启用 Wi-Fi，向 UART0 与原生 USB CDC 输出帧。**本轮没有硬件连接，新双通道固件未实板刷写；历史实测不能替代本版验收。**
- `npm test` 16/16 通过，包括官方 dsh 提示词组装、17% 单轮规则、端口冲突回退、跨站控制拒绝、串口诊断/暂停/恢复，以及打开期间暂停的回归测试。测试夹具不是真实测温。
- 在项目忽略目录 `.local/windows-clean-test` 实际联网准备独立 Node 和 dsh（655 个宿主包），安装最终 tgz 并启动真实 dsh；最终安装的串口源码哈希与源文件一致。复用本机 npm 缓存，不是全新 Windows 系统验收。
- 最终 Windows 包复验通过：重复启动复用 runner PID；Stop 关闭两项所属进程；模拟损坏升级包且校验清单匹配，安装失败后原 profile 与偏好哈希保持一致、版本未更改；恢复后正常启动。Windows PowerShell 5.1 解析 WPF 并确认控件，ZIP 解压与 manifest 哈希一致。未自动操作原生 WPF 窗口。
- 浏览器已验证桌面面板无设备诊断、隔离舒适温度填写、刷写页加载及 SHA 校验、暂停和恢复；未选择设备、未写入固件。本轮手机视口复验未完成，不引用历史截图证明本版手机验收。隔离数据偏好不会写入用户原有配置。
- 本轮没有配置模型密钥或发起模型 API 请求。工具调用检查项不表示密钥已验证；温度工具与上下文在官方宿主中的软件集成仍通过测试。
- 公共站点与包内刷写资源逐文件一致；公开文件及发布文件未匹配本机凭证。新增 Windows CI 运行软件测试与公开资源完整性检查。

最终文件 SHA-256：

```text
1019c044b597b74d1fd500f265af007dcb43131dd13a450c9eb415377e7e9b84  dsh-temperature-emotion-box-0.4.0.tgz
13decd477bdbe4987782cb0d28c18c20aa4bfb0dc530f7393e70ce7db596d670  temperature-emotion-box-windows-v0.4.0.zip
c6961e4121e5c5ee33b026d94f845f9945b7c80bdabb25a9490de657058b2b39  temperature-emotion-box-esp32s3-v0.4.0.bin
```
