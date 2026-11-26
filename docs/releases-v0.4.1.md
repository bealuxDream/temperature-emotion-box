# v0.4.1 — 国内镜像安装器

Windows 新手包默认通过国内 npmmirror 下载环境和依赖，面向国内用户减少官方源直连带来的安装等待。ZIP 和宣传页继续托管 GitHub。

- Node 24.11.1：`https://npmmirror.com/mirrors/node/`，固定 SHA-256 验证，下载失败最多重试三次。
- pnpm、官方 dsh 和插件依赖：`https://registry.npmmirror.com`，覆盖 dsh 内部 pnpm 子进程使用的 registry。
- 镜像不可用时提示重试，不自动回退官方源；不修改用户全局 npm 配置。
- Windows 安装器版本 v0.4.1，标准插件及公开固件保留 v0.4.0；原有温度功能、17% 规则与硬件支持范围不变。

解压 ZIP，双击 Start.cmd；已有用户也可通过新版 Start.cmd 升级。舒适偏好和 API Key 仍由使用者在本机界面设置。

验证：全新隔离目录、空 npm/pnpm 缓存实际下载并安装成功；Node 哈希一致，宿主锁文件的 725 项远程解析地址均在 npmmirror，安装 HTTP 日志未见官方 Node/npm 地址。dsh、面板与重复启动通过，父 npm 配置哈希保持不变。插件 16 项软件测试通过。此检查未连接硬件或调用模型 API。

[Windows 新手指南](https://github.com/bealuxDream/temperature-emotion-box/blob/main/docs/windows-quickstart.md) · [宣传页](https://bealuxdream.github.io/temperature-emotion-box/)
