# GitHub Release 草案：v0.1.0-preview

## 标题

天赋生长 v0.1.0-preview · Web/PWA 与 macOS Apple Silicon 预览

## 发布说明

这是面向评审和本地体验的预览版本，不是正式商业发行版。

### 可以体验

- Web 本地启动：`npm start`
- PWA 安装和基础离线访问
- 6 个年龄入口、624 个活动、14 个学习领域
- 真实尝试、作品与变化、探索周报
- 多成员独立档案
- 本地备份与恢复
- macOS Apple Silicon 未签名 DMG 预览

### 数据边界

- 默认数据保存在当前浏览器和本机。
- 文本备份不包含照片文件。
- 不要使用真实儿童姓名、生日、照片或医疗信息做演示。
- 未签名 DMG 只用于技术预览，首次打开可能需要系统设置允许。

### 已验证

- Node.js 24.17.0
- Rust 1.99.1
- Cargo 1.99.1
- Tauri CLI 2.12.4
- 18/18 Web 测试通过
- macOS Apple Silicon `.app` 构建成功
- DMG 可通过 `hdiutil imageinfo` 读取

### 当前未提供

- Windows 安装包
- macOS Developer ID 签名
- Apple notarization
- 自动更新
- 公网在线 Demo

## 推荐评审路径

1. 先阅读仓库首页 README。
2. 运行 `npm start` 体验 Web/PWA 版本。
3. 按 `talent-growth/docs/参赛演示流程.md` 体验一次任务、记录和回看。
4. macOS Apple Silicon 用户可下载 DMG 做本地预览。
