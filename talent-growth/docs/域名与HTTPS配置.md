# 域名与 HTTPS 配置（待办清单）

当前线上用的是 **IP 证书**：`https://<服务器地址>/growth/`。

这有三个实际问题，按严重程度排列：

| # | 问题 | 影响 |
| --- | --- | --- |
| 1 | IP 证书有效期只有 6–7 天（当前到 2026-10-29 04:42） | 续期一旦失败，整站 HTTPS 直接报错 |
| 2 | 80 端口不跳转 HTTPS | 从聊天软件点进来可能停在明文页 |
| 3 | 没有域名 | 链接不像正式服务，部分浏览器对 IP 证书会多弹确认 |

## 一、先看现在的证书状态

```bash
# 到期时间
echo | openssl s_client -connect <服务器地址>:443 2>/dev/null | openssl x509 -noout -dates

# 证书覆盖了谁（看 SAN）
echo | openssl s_client -connect <服务器地址>:443 2>/dev/null \
  | openssl x509 -noout -text | grep -A2 "Subject Alternative Name"
```

Caddy 正常的续期日志在：

```bash
journalctl -u caddy --since "2 days ago" | grep -i -E "certificate|renew|obtain"
```

如果看到 `certificate obtained successfully`，说明自动续期在跑；如果只有历史记录没有新记录，就要人工介入。

## 二、推荐做法：绑一个域名

Caddy 会自动为域名申请 Let's Encrypt 的 90 天证书并自动续期，比 IP 证书稳定得多。

1. 买一个域名，把 A 记录指向 `<服务器地址>`；
2. 等解析生效（`dig +short 你的域名` 能查到 IP）；
3. 把 Caddy 站点配置里的地址从 IP 改成域名。

Caddyfile 里典型写法：

```caddyfile
# 1. 域名站点：自动申请并续期证书
你的域名 {
    encode gzip
    # ……原有站点配置保持不变……
}

# 2. 旧 IP 访问统一 301 到域名，避免两个入口并存
<服务器地址> {
    redir https://你的域名{uri} permanent
}
```

要点：

- **不要**在两个块里重复写同一套 `handle_path` 逻辑，把原有内容整体搬到域名块里即可；
- IP 块只保留一条 `redir`，避免同一份站点被两个入口分别服务；
- 保存后先 `caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile`，再 `systemctl reload caddy`。

## 三、顺手补上 HTTP → HTTPS 跳转

如果 Caddy 里没有单独的 `:80` 块，Caddy 默认会自动做 301。当前实测是**直接 200 明文返回**，说明 80 端口被某个站点块显式接住了。

确认方式：

```bash
curl -sI http://<服务器地址>/growth/ | head -3
# 期望看到 308/301 与 Location: https://...
# 若看到 200，说明没有跳转
```

补法（放在域名块之外）：

```caddyfile
http://你的域名, http://<服务器地址> {
    redir https://{host}{uri} permanent
}
```

## 四、证书到期这件事的现实风险

比赛评审很可能跨过 2026-10-29。两个保险：

1. **绑域名**（根治）；
2. 如果短期来不及，至少在 10-28 之前手动确认一次证书已续期：

```bash
echo | openssl s_client -connect <服务器地址>:443 2>/dev/null | openssl x509 -noout -enddate
```

如果到期前没有自动续上，可以在服务器上强制重载 Caddy 触发重新申请：

```bash
systemctl reload caddy
# 或
caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
```

## 五、改完之后要验证的四件事

```text
1. https://你的域名/growth/          → 200，证书 CN/SAN 是域名
2. https://你的域名/growth/release.json → releaseId 仍是当前版本
3. http://你的域名/growth/           → 301/308 跳到 https
4. https://<服务器地址>/growth/      → 301 跳到域名（或按你的策略保留）
```

第 2 条最重要：换域名只应改入口，不应改变内容。

## 六、不要把什么写进仓库

```text
✗ 真实服务器 IP
✗ SSH 私钥、密码
✗ 证书私钥文件（fullchain.pem 可以，key.pem 绝对不行）
✗ 腾讯云 SecretId / SecretKey
```

仓库里的部署记录统一用 `<服务器地址>` 占位符，真实值放在不公开的本地记录中。
