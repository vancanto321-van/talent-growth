# GitHub 上传前检查清单

## 仓库内容

- [ ] 当前分支确认是 `optimize/engineering-baseline`
- [ ] 工作树干净
- [ ] README 首屏说明产品、启动方式和当前限制
- [ ] 没有个人备份、`.local-data/`、账号密码或密钥
- [ ] 没有 `node_modules/`、Rust `target/` 或临时 DMG 构建目录
- [ ] 发布说明与实际交付物一致

## 本地验证

```bash
npm test --prefix talent-growth/app
npm run build:web
```

桌面版：

```bash
cd desktop/tauri
cargo tauri build --bundles dmg
```

## GitHub Release

- [ ] 先推送代码分支，等待 GitHub 页面确认内容
- [ ] 再创建 `v0.1.0-preview` Release
- [ ] 上传 macOS Apple Silicon DMG
- [ ] 在资产名称中写明 `aarch64`、`unsigned`、`preview`
- [ ] 不上传临时 DMG、`.app` 目录、`target/` 或 Cargo 缓存
- [ ] 明确写出未签名、未公证、无 Windows 包
- [ ] 通过 GitHub 页面打开 Release 资产下载链接后再邀请评委体验

## 上传前最后确认

本清单完成前，不执行 `git push`、不创建公开 Release、不部署线上服务。
