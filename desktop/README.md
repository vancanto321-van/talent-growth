# 桌面版开发与构建

## 当前策略

桌面版使用 Tauri 2 复用 `talent-growth/app/www/` 的 Web 前端：

- macOS：目标为 `.dmg`
- Windows：目标为 NSIS `.exe` 安装包
- Linux：目标为 AppImage，便于本地验证
- 桌面壳不改变现有 Web 版的数据模型和备份逻辑
- 当前只提供构建配置，不签名、不公证、不发布

## 环境要求

- Node.js 22+
- Rust stable 与 Cargo
- macOS 构建需要 Xcode Command Line Tools
- Windows 构建需要 WebView2 环境；正式发布还需要代码签名证书

当前仓库的 Web 版仍然通过根目录 `npm start` 运行；桌面版不替换它。

## 本地开发

在仓库根目录先同步 Web 数据并启动预览服务：

```bash
npm run sync:data
npm start
```

另开终端进入桌面壳目录：

```bash
cd desktop/tauri
cargo tauri dev
```

若使用 Tauri CLI：

```bash
cargo install tauri-cli --version '^2'
```

## 构建安装包

```bash
cd desktop/tauri
cargo tauri build --bundles dmg       # macOS
cargo tauri build --bundles nsis      # Windows
cargo tauri build --bundles appimage  # Linux
```

构建前会运行 `app/scripts/sync-data.mjs`，确保桌面版使用当前 Web 数据。

## 发布前还需要完成

- macOS Developer ID 签名与 notarization
- Windows 代码签名与 SmartScreen 验证
- 不同系统的安装、升级、卸载和本地数据保留测试
- 备份文件路径、权限和导入恢复测试
- 隐私政策中增加桌面端数据目录说明
- CI 跨平台构建矩阵

未完成这些步骤前，不应把本地构建包称为正式发行版。
