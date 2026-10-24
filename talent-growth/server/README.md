# growth-sync

这是一个可选的、依赖浏览器账号登录的成长方向备份服务。它只监听回环地址，由现有 Caddy 通过 `/growth/api/` 反向代理；服务本身不会伪造同步成功，也不会访问静态网页目录。

启动方式：

```sh
node server/growth-sync.mjs
```

默认监听 `127.0.0.1:18129`，数据目录为 `/opt/child-growth-sync/data`。可使用 `GROWTH_SYNC_HOST`、`GROWTH_SYNC_PORT` 和 `GROWTH_SYNC_DIR` 调整。生产环境的来源固定为 `GROWTH_SYNC_ORIGIN`，默认是 `https://43.159.60.166`。开发环境设置 `GROWTH_SYNC_DEV=1` 或 `NODE_ENV=development`，再用 `GROWTH_SYNC_ALLOWED_ORIGIN`（逗号分隔）加入开发来源；开发模式也允许本机的 `http://127.0.0.1:<port>` 和 `http://localhost:<port>`。

生产环境的会话 cookie 始终带 `Secure`。只有明确设置开发模式时，`COOKIE_SECURE=0` 才会被接受。cookie 名为 `growth_session`，属性是 `HttpOnly; SameSite=Strict; Path=/growth/api`，有效期七天。

## API

对外路径由 Caddy 暴露为 `/growth/api/...`。服务也接受去掉此前缀的本机路径，便于健康检查和开发调试。所有 JSON 请求必须使用 `Content-Type: application/json`；POST、PUT 和 OPTIONS 必须带允许的 `Origin`。

每次调用 `/backup` 或 `/backup/meta`（包括 GET 和 PUT）都必须带 `X-Growth-Account` 请求头，值为当前登录用户名。这样可以防止一个旧页面在另一个页面切换账号后把备份写入错误账号。缺失或不匹配时返回 409 和 `{ "meta": { "accountChanged": true } }`，不会在错误响应中泄露当前会话用户名。

| 方法 | 路径 | 认证 | 返回 |
| --- | --- | --- | --- |
| GET | `/health` | 否 | `{ "ok": true }` |
| GET | `/auth/status` | 否 | 未登录 `{ "authenticated": false }`，已登录返回用户名 |
| POST | `/auth/register` | 否 | `{ "username", "authenticated": true }` |
| POST | `/auth/login` | 否 | `{ "username", "authenticated": true }` |
| POST | `/auth/logout` | 是 | `{ "authenticated": false }` |
| GET | `/backup/meta` | 是 | 当前备份元数据 |
| GET | `/backup` | 是 | `{ "snapshot", "meta" }` |
| PUT | `/backup` | 是 | 新版本元数据 |

注册和登录请求体是 `{ "username": "...", "password": "..." }`。用户名必须是 3–40 个小写 ASCII 字母、数字、点、下划线或连字符；Unicode 用户名会被拒绝。密码是 10–128 个字符。账号密码使用随机 salt 的 scrypt 派生值保存，服务不写入明文密码。

备份写入请求体是 `{ "snapshot": <version-1 snapshot>, "expectedRevision": 0 }`。第一次写入必须使用 `expectedRevision: 0`，之后必须携带上次收到的 revision。revision 不一致返回 409，并只返回当前 `meta`，不会在错误中回显备份内容。成功后 revision 加一。

`GET /backup` 返回当前版本；`GET /backup?revision=N` 可读取最近五个版本中的指定版本，`revision=0` 表示空备份。当前空账号的元数据是：

```json
{
  "revision": 0,
  "updatedAt": null,
  "people": 0,
  "attempts": 0,
  "bytes": 0,
  "versions": []
}
```

## snapshot 约束

服务接收 version `1` 的方向数据：`people` 必须包含 1–20 个档案，每个档案有唯一安全 `id`、非空 `name` 和受支持的 `ageGroup`；`profiles` 的 key 必须与 people 的 id 完全一致。每个 profile 的 `attempts` 最多 5000 条。尝试记录会做日期、模式、评分、任务 id 和文本长度检查；`outcome`、`change`、`artifactTitle`、`duration` 以及 `preferences` 会保留。请求和最终 snapshot 都不能超过约 8 MiB。

每个账号独立保存当前 revision 和最近五个版本。写入先以同一文件系统中的临时文件完成并原子重命名，再更新账号元数据；进程内按账号串行写入。账号目录和会话目录权限为 0700，JSON 文件权限为 0600，数据目录不会创建在静态网页目录下。

## systemd

`growth-sync.service` 假定代码部署到 `/opt/child-growth-sync`，并由 `child-growth` 用户运行。部署前创建该用户和数据目录，确认 Caddy 的 `/growth/api/` 路由在静态文件路由之前，并反向代理到 `127.0.0.1:18129`。此服务不提供邮箱验证、找回密码、分享链接或其他出站服务。

安全限制包括回环监听、严格来源校验、SameSite/HttpOnly cookie、按 IP 的请求和登录限速、仅在回环代理连接上有限信任 `X-Forwarded-For`、8 MiB 请求上限，以及两路并发的 scrypt 队列（单次 scrypt 使用不超过 64 MiB 上限）。日志只记录不含账号密码或会话值的通用错误信息。
