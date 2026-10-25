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

## 当前本机验证结果

在 Apple Silicon macOS 上已安装 Rust 1.99.1、Cargo 1.99.1 和 Tauri CLI 2.12.4，并成功完成：

- Tauri Rust 二进制编译
- macOS `.app` bundle 生成
- 产物架构检查为 `arm64`

本次 DMG bundler 已生成临时磁盘映像，但在当前环境中未正常结束，因此没有把临时 DMG 当作正式交付物。需要后续在完整 Xcode/稳定磁盘映像环境中重新执行 `cargo tauri build --bundles dmg`。

当前未完成 Windows 构建：本机是 Apple Silicon macOS，Windows NSIS 需要 Windows Runner 或 CI 构建机。

## 家长服务版预览包

当前最新预览包（0.3.0）：

```text
天赋生长_0.3.0_parent_flow_aarch64_unsigned.dmg
```

SHA-256：

```text
05f315301767198375456c585a7924cfa6d08d7d4298def092191f09ac9622fd
```

这一版包含：

- 首屏双方向入口：儿童成长天赋培养 / 全年龄天赋培养；
- 统一的品牌、字体、色彩和卡片语言；
- 完成第一次真实尝试并保存后出现的 20% 体验付费引导；
- 三档体验价格（9.9 / 29.9 / 69.9 元）、服务确认单、样例交付预览、演示支付页；
- 演示支付不接真实收款、不收集支付信息、不创建订单。

历史预览包（保留用于对照）：

```text
天赋花园_0.1.0_macos_aarch64_parent_preview_unsigned.dmg
天赋生长_0.2.0_unified_parent_allage_aarch64_unsigned.dmg
```

以上均为未签名、未公证的技术预览，不是正式商业发行版。

## 本地打包 DMG 的方式

`cargo tauri build --bundles dmg` 在本机不稳定（HFS 布局步骤会卡住），因此改用固定流程：

```sh
cargo tauri build --bundles app
rm -rf target/release/bundle/dmg/stage && mkdir -p target/release/bundle/dmg/stage
cp -R 'target/release/bundle/macos/天赋生长.app' target/release/bundle/dmg/stage/
ln -s /Applications target/release/bundle/dmg/stage/Applications
hdiutil create -volname '天赋生长·家庭培养' -srcfolder target/release/bundle/dmg/stage \
  -ov -format UDZO target/release/bundle/dmg/天赋生长_0.3.0_parent_flow_aarch64_unsigned.dmg
shasum -a 256 target/release/bundle/dmg/天赋生长_0.3.0_parent_flow_aarch64_unsigned.dmg
```

产物放入 `target/` 与 `release/`，不提交进仓库；只保留校验值文本。

## 发布前还需要完成
- Windows 代码签名与 SmartScreen 验证
- 不同系统的安装、升级、卸载和本地数据保留测试
- 备份文件路径、权限和导入恢复测试
- 隐私政策中增加桌面端数据目录说明
- CI 跨平台构建矩阵

未完成这些步骤前，不应把本地构建包称为正式发行版。
