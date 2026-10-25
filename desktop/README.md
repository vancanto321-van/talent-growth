# 桌面版开发与构建

## 当前策略

桌面版使用 Tauri 2 复用 `talent-growth/app/www/` 的 Web 前端：

- macOS：目标为 `.dmg`
- Windows：目标为 NSIS `.exe` 安装包
- Linux：目标为 AppImage，便于本地验证
- 桌面壳不改变现有 Web 版的数据模型和备份逻辑
- 当前发布 Apple Silicon macOS DMG 技术预览包，未做 Apple Developer ID 签名或公证；Windows/Linux 暂无发布包

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

`cargo tauri build --bundles dmg` 在本机不稳定（HFS 布局步骤会卡住），因此 DMG 用 `hdiutil` 手工封装，见下文「本地打包 DMG 的方式」。

当前未完成 Windows 构建：本机是 Apple Silicon macOS，Windows NSIS 需要 Windows Runner 或 CI 构建机。

## 当前预览包：0.7.7

下载：[GitHub Release v0.7.7](https://github.com/vancanto321-van/talent-growth/releases/tag/v0.7.7)

文件：`TalentGrowth_0.7.7_aarch64_unsigned.dmg`，适用于 Apple Silicon（arm64）Mac。
校验值见 [SHA256SUMS-v077.txt](tauri/release/SHA256SUMS-v077.txt)。

这一版包含：

- 首页说明如何开始一次探索，家庭入口支持3–12岁探索档案，旧0–8岁成长档案单独标明；
- 成人探索使用适合自身的文案；
- 保存或修改观察后先回看记录与反馈，家庭方案由用户自愿打开；
- 儿童不愿继续时优先尊重暂停，反馈围绕参与意愿、情境、材料与时长；
- 三档服务、确认单、虚构样例和演示支付仍可使用。演示不创建订单或发起扣款。

本版为未签名、未公证的技术预览，不是正式商业发行版。未完成 Intel Mac、Windows 或跨版本升级的数据保留实测；更新前请导出备份。

## 打包路径的坑（务必看）

`tauri.conf.json` 里的两类路径解析基准不同：

| 配置项 | 相对谁解析 |
| --- | --- |
| `build.frontendDist` | `tauri.conf.json` 所在目录（`desktop/tauri/`） |
| `build.beforeBuildCommand` 的工作目录 | `tauri.conf.json` 的上一级（`desktop/`） |

曾经因为 `frontendDist` 写成 `../../talent-growth/app/www`，从 `desktop/` 往上两级解析到了仓库外的同名旧副本，导致打出来的 DMG 一直是旧界面。

现在改为显式两步：

```text
beforeBuildCommand : node ./tauri/scripts/prepare-dist.mjs   →  生成 desktop/tauri/dist
frontendDist       : ./dist                                   →  只从 dist 打包
```

`prepare-dist.mjs` 会：

1. 运行 `sync-data.mjs` 生成最新数据文件；
2. 校验源目录确实含有首页双入口样式（`tg-entry-grid`），否则直接报错终止；
3. 清空并重建 `dist`，追加一行构建标记 `/* build=… at=… source=… */`。

因此只要校验构建产物里有没有这条标记，就能确认 DMG 里嵌的是不是当前代码。

## 本地打包 DMG 的方式

`cargo tauri build --bundles dmg` 在本机不稳定（HFS 布局步骤会卡住），因此改用固定流程：

```sh
TG_BUILD=v0.7.7 cargo tauri build --bundles app
mkdir -p target/release/bundle/dmg release
stage=$(mktemp -d target/release/bundle/dmg/stage-v077.XXXXXX)
ditto 'target/release/bundle/macos/天赋生长.app' "$stage/天赋生长.app"
ln -s /Applications "$stage/Applications"
hdiutil create -volname 'TalentGrowth 0.7.7' -srcfolder "$stage" \
  -format UDZO release/TalentGrowth_0.7.7_aarch64_unsigned.dmg
shasum -a 256 release/TalentGrowth_0.7.7_aarch64_unsigned.dmg
```

产物放入 `target/` 与 `release/`，不提交进仓库；只保留校验值文本。

## 发布前还需要完成
- Windows 代码签名与 SmartScreen 验证
- 不同系统的安装、升级、卸载和本地数据保留测试
- 备份文件路径、权限和导入恢复测试
- 隐私政策中增加桌面端数据目录说明
- CI 跨平台构建矩阵

未完成这些步骤前，不应把本地构建包称为正式发行版。
