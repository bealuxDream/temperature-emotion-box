# 温度表情箱 / Temperature Emotion Box

[静态宣传页](https://bealuxdream.github.io/temperature-emotion-box/) · [下载安装包](https://github.com/bealuxDream/temperature-emotion-box/releases/latest) · [MIT License](LICENSE)

ESP32-S3 + DS18B20 实时测温，以 **DeepSeek 官方 Harness（dsh）** 作为带界面的 AI 上位机。插件既提供温度查询工具，也在每轮模型请求前注入最新环境温度，让对话有温度依据。本次探头接 GPIO16，通过 USB 串口进入上位机。

## 第一版范围

- DS18B20 GPIO16 → ESP32-S3 → USB 串口 → 本机温度服务；可选局域网 HTTP。
- 标准 dsh 插件包，内含温度查询、实时系统提示词、可调情绪规则和舒适温度记忆。
- 插件自带中文网页，显示实时温度、最近 300 帧曲线、冷热表情和聊天设置。
- 无设备时显示等待；失联超过 10 秒不再返回旧温度；传感器断开明确报告。
- DeepSeek API Key 保存在 dsh 本地配置，不写入 ESP32 或 Git。
- 本版没有实体屏幕驱动；公开固件面向 ESP32-S3 DevKitC-1-N8，其他板型需要独立验证。

## Windows 新手安装（推荐）

从 [Releases](https://github.com/bealuxDream/temperature-emotion-box/releases/latest) 下载 temperature-emotion-box-windows-v0.4.1.zip，解压后双击 Start.cmd。第一次从国内 npmmirror 镜像下载独立 Node 24.11.1、pnpm 和官方 dsh；之后双击即可打开，双击 Stop.cmd 停止。无需手动安装 Python、PlatformIO 或全局 Node，也不更改已有 dsh 环境。

打开面板后跟随四步向导：连接设备 → 设置舒适区 → dsh 原生 API Key 引导 → 询问真实温度。未刷固件时可使用 [浏览器刷写页](https://bealuxdream.github.io/temperature-emotion-box/flash/) 或面板内入口；只适配 ESP32-S3 DevKitC-1-N8（8MB Flash、无PSRAM）兼容板。刷写需在 Edge/Chrome 手动选择设备、确认覆盖原程序。

安装器 v0.4.1 默认从 `npmmirror.com/mirrors/node/` 下载 Node，从 `registry.npmmirror.com` 下载 npm/pnpm 包及插件依赖；校验 Node 固定 SHA-256，不自动回退官方源。首次仍需联网，ZIP 和宣传页继续托管 GitHub。API Key、硬件和舒适偏好由使用者提供。插件及公开固件仍为 v0.4.0，实板验收状态见 [检查点](docs/checkpoint.md)。

详见 [Windows 新手指南](docs/windows-quickstart.md)。独立数据位于 %LOCALAPPDATA%/TemperatureEmotionBox，含聊天与密钥，不要上传或外发。端口冲突会自动换端口，请通过 Start.cmd 打开实际面板地址。

已有官方 dsh 0.2.2-rc.1 的用户可只安装下面的标准插件。手动安装 dsh 需要 Node >=24.9 和 pnpm：

~~~powershell
$env:npm_config_registry="https://registry.npmmirror.com"
npm install -g pnpm@10.25.0 @deepseek-ai/dsh@0.2.2-rc.1 --registry=https://registry.npmmirror.com
~~~
## 安装与使用

先到 [GitHub Releases](https://github.com/bealuxDream/temperature-emotion-box/releases/latest) 下载插件安装包。如果已有 DeepSeek Harness Web 0.2.2-rc.1，把 `dsh-temperature-emotion-box-0.4.0.tgz` 安装到 `web` profile。安装后启动 dsh，打开 [温度表情箱](http://127.0.0.1:8787/)。

```powershell
dsh plugin --profile web add "C:\path\to\dsh-temperature-emotion-box-0.4.0.tgz" --registry=https://registry.npmmirror.com
dsh web
```

从本项目开发或更新时，在项目根目录执行以下命令。若旧版面板或 dsh 正在运行，先停止旧实例，释放 8787、3080 和串口。

```powershell
npm ci
npm run setup
npm run plugin:install
npm run dev
```

安装会在项目内准备 Node 24.11.1 和 dsh 0.2.2-rc.1，不替换系统 Node。首次下载安装需要网络。

- 表情面板：<http://127.0.0.1:8787>
- 官方 dsh 聊天：<http://127.0.0.1:8787/chat>

以上为默认地址；端口冲突时使用启动日志中的实际 URL，Windows 新手包由 Start.cmd 自动打开。

点击表情面板右上角“打开 DeepSeek 聊天”，自动携带本次启动的本地访问令牌；直接打开没有令牌的 3080 地址可能返回 401。进入 dsh 的 **Settings → Models** 填写自己的 DeepSeek API Key，然后选择默认工作区或自己创建的本地工作区；安装独立插件不要求克隆本项目。密钥请直接填本机界面。项目专用 dsh 用户目录是 `.local/dsh/`，不影响已有 dsh 安装。

询问“现在温度是多少？”可触发查询工具。普通聊天的系统提示词会加入当次有效的实测温度，失联或过期时加入“目前无法获取到温度”。在面板「温度与聊天设置」可编辑这两段提示词、冷热情绪和 AI 自称。实测温度会持续影响回复长短与语气。日常聊天每轮有 17% 的机会顺带提及一句室温或冷暖，直接询问时照常查询。

第一次启用插件时会尝试打开本机面板。「首次设置」让使用者填写一个理想温度或一个区间，也可以点「稍后设置」。表情和 AI 语气共用舒适区，初始为 20–25°C。只填一个理想温度时，以它为中心各加减 2.5°C。之后可在「温度与聊天设置」修改，或直接在聊天中说“我觉得 23 到 26 度最舒服，请记住”。

## 接线与烧录

参见 [硬件与联调](docs/hardware.md)。USB 串口联调无需配置 Wi-Fi；首次配置 `npm run setup` 生成 Git 忽略的 `firmware/include/secrets.h`，其中测温 DQ 默认 GPIO16。

```powershell
py -3.12 -m venv .local/pio-venv
.local/pio-venv/Scripts/python.exe -m pip install platformio==6.1.18
npm run firmware:build
# 确认开发板、端口和接线后才执行上传：
npm run firmware:build -- -UploadPort COM3
```

只有一个可识别的 USB 串口适配器时插件会自动连接；多个或无法识别时在面板手动选择。历史实板已验证 COM3、115200 baud。浏览器刷写前在面板暂停采集，刷写后断开浏览器串口并恢复采集。通过 Wi-Fi 上报时，可在 dsh profile 的 `temperature-emotion-box-runtime` 配置行设置监听地址和设备 Token，并将面板串口选为「仅使用 HTTP 上报」。

Windows 下旧版 Xtensa 工具链无法直接处理此项目的中文父路径。`npm run firmware:build` 临时把本项目映射到一个空闲 ASCII 盘符，编译后解除映射；工具链缓存在项目 `.local/platformio/`。手动上传也应在同样的 ASCII 路径环境下进行，并确认开发板型号和串口。开发工具在每台新电脑都需要安装，不能复用维护者本机已安装的状态。

## 项目结构

| 目录 | 作用 |
| --- | --- |
| `firmware/` | ESP32-S3 PlatformIO 工程与 DS18B20 驱动 |
| `plugins/temperature/` | dsh 插件包、温度服务、串口采集和表情面板 |
| `scripts/` | 本地配置和隔离运行时启动器 |
| `tests/` | 协议、过期、故障、认证与插件测试 |
| `docs/` | 硬件、接口、实施状态 |

## 配置与验证

面板和聊天修改的偏好保存在 `DSH_HOME/plugins/temperature-emotion-box/settings.json`。运行 `npm run plugin:pack` 可在 `.local/` 生成可转发的安装包。更多安装和卸载说明见 [插件说明](plugins/temperature/README.md)。

```powershell
npm test
git status
```

测试中的合成读数只存在于独立测试服务，不注入运行中的面板。实物、测量精度、真实 API 调用与软件测试分别记录在 [检查点](docs/checkpoint.md)。该探头测得的是探头周围温度；未做整机标定，不作为医疗或安全报警设备。

## 开源与宣传页

项目以 MIT 协议开源：[GitHub 仓库](https://github.com/bealuxDream/temperature-emotion-box)。依赖、密钥、Wi-Fi 配置、dsh 会话数据与私有构建目录均已忽略；网页刷写所需的无凭证公开固件随插件和静态站点发布。

静态宣传页源文件在 site/，通过 GitHub Pages 发布；main 分支更新页面文件时，GitHub Actions 自动部署。宣传页的滑块仅为明确标注的交互示例，不显示实测读数。真实传感器状态、温度曲线和设置保存在插件附带的本机面板中。

## 官方依据

- [DeepSeek Harness 官方仓库](https://github.com/deepseek-ai/deepseek-harness)
- [官方 Web UI 使用指南](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/index.md)
- [工具插件教程](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/tool.md)
- [动态上下文接口](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/system-prompt.md)

dsh 目前为开发预览版，因此安装版本固定在 lockfile；升级应先重跑插件集成检查。
