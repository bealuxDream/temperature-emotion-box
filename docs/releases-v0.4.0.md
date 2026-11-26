# v0.4.0 — Windows 新手安装与设备引导

从 ZIP 解压、双击 Start.cmd 即可准备独立 Node、pnpm 和官方 dsh，并打开中文面板。已有 dsh 用户仍可安装标准 tgz 插件。

- 四步引导：设备 → 个人舒适区 → dsh 模型配置 → 真实温度工具查询。
- 可操作的连接诊断、串口刷新与选择、暂停/恢复采集、面板端口冲突自动回退。
- 内置无 CDN 的浏览器刷写页及无凭证公开固件，写入前检查芯片和 Flash 容量，需要用户手动选择设备并确认板型和覆盖。
- Windows 启动器使用独立数据目录；重复启动复用服务，停止只管理自身进程，升级失败恢复旧 profile，保留偏好和聊天。
- 保留可编辑提示词、舒适温度记忆、每步实时注入，以及每轮 17% 的温度闲聊许可。

验证：隔离数据目录中实际联网准备 Node/dsh 并启动，验证重复启动、停止、失败升级回滚和恢复；软件测试、公开固件编译、桌面面板与刷写控制验证已完成。并非全新操作系统验收。

限制：首次需要联网，支持 Windows x64；API Key 和舒适偏好由使用者自行配置。公开固件面向 ESP32-S3 DevKitC-1-N8（8MB、无 PSRAM），DQ GPIO16。新双通道固件尚未实板刷写验证；本次无硬件连接或模型 API 请求，不将软件验证当作硬件验收。

使用：[Windows 新手指南](https://github.com/bealuxDream/temperature-emotion-box/blob/main/docs/windows-quickstart.md) · [宣传与刷写页](https://bealuxdream.github.io/temperature-emotion-box/)
