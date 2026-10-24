# 天赋实验室（potential-lab）

帮用户发现天赋线索、用真实任务验证、并给出可执行培养路径的**微信小程序**（uni-app，一套代码可编译为 App）。

产品定义见 [docs/product.md](backend/docs/product.md)，上线合规清单见 [docs/compliance.md](backend/docs/compliance.md)。

## 结构

```
backend/    FastAPI + SQLAlchemy + SQLite（AI 编排/计分/计划全部在此）
  app/services/ai/    AI 适配器：mock（默认，零成本）+ glm（智谱，已实现待接 key）
  content/*.yaml      内容资产：6 方向 / 18 任务+rubric / 组合图谱 / 访谈问题
frontend/   uni-app Vue3 + TS + pinia（5 页面，已验证 H5 与 mp-weixin 双端构建）
docs/       product.md（产品定义）compliance.md（上线合规清单）
```

## 快速启动（Docker 一键，推荐）

```bash
docker compose up -d --build
# H5:        http://localhost:8080
# 后端 API:  http://localhost:8001/docs（经 nginx 同源反代 /api 亦可）
```
数据存于具名卷 backend-data，重启/升级不丢；导出/注销见应用内「画像 → 数据与隐私」。

## 快速启动（本机进程方式）

> 端口冲突提示：若本机 8000 端口被其他项目占用，后端可改用
> `uv run uvicorn app.main:app --port 8001`，并在 `frontend/.env` 中设
> `VITE_API_BASE=http://127.0.0.1:8001` 后重启 `npm run dev:h5`。
> （本机当前即采用 8001 方案运行中）

## 快速启动

### 1. 后端（默认 mock AI + 模拟登录/支付，无需任何 key）

```bash
cd backend
uv sync                                          # 安装依赖（Python 3.12）
uv run uvicorn app.main:app --reload --port 8000 # 启动，API 文档 http://127.0.0.1:8000/docs
uv run pytest                                    # 跑测试（全部用例，含合规回归）
```

### 2. 前端 H5（浏览器验证）

```bash
cd frontend
npm install
npm run dev:h5     # http://localhost:5173
```

### 3. 微信开发者工具预览

```bash
cd frontend && npm run dev:mp-weixin   # 产物在 dist/dev/mp-weixin
```

微信开发者工具 → 导入项目 → 目录选 `frontend/dist/dev/mp-weixin`，AppID 选"测试号"即可。
**必须勾选：详情 → 本地设置 → 不校验合法域名**（因为后端是 http://127.0.0.1:8000）。

## 切换真实 AI（智谱 GLM）

1. 到 https://open.bigmodel.cn/ 注册并创建 API Key
2. `cd backend && cp .env.example .env`，填入：
   ```
   AI_PROVIDER=glm
   GLM_API_KEY=你的key
   GLM_MODEL=glm-4-flash
   ```
3. 重启后端。所有 AI 输出经 Pydantic 强校验，失败自动重试一次，仍失败降级为"先自评"，流程不中断。

## 核心机制速览

- **探测访谈**（6 题）→ AI 抽取候选线索，每条必附依据 + 引用原话，标注"需任务验证"
- **4 周验证周期**：选 ≤3 个方向；每周 = 主方向任务 + 新方向体验 + 周回顾；周期可结业开新一轮
- **任务库 36 个**（每方向 入门×2/进阶×2/迁移×2 变体），任务级轮换，第二轮周期不重样
- **任务流**：独立完成 / AI 辅助分开统计 → 提交 → AI 按 rubric 结构化初评（可重新评估）→ 自评 → 真实读者反馈
- **结业报告**：每个方向给出「继续投入/继续验证/冲刺一下/换法再试/暂停验证」判定 + 依据 + 未验证清单 + 下期计划建议
- **五维画像**：当前表现 / 学习进步 / 迁移保持 / 持续意愿 / 证据充分度——只和自己比，没有天赋分数；每个方向带培养路径与日常练习
- **组合图谱**：15 对组合全覆盖（表达×分析→教学/咨询、设计×编程→独立开发者……）
- **行业潜力测评**（48 题 / 12 行业）：匹配度排行 + 短板提升建议 + 四步训练路径 + 收入行情（含来源口径说明）+ 入行门槛资质
- **儿童版**（家长观察版 3-6 岁 / 自答版 7-12 岁）：8 类型 + 月度培养方案
- **游戏化与留存**：🔥 连续探索（含"连击告急"提醒）、XP 等级、每日目标、成就墙、吉祥物小潜、完成庆祝动效、每周提醒订阅、小程序分享——只奖励验证行为

## 商业化漏斗（开发期全部走模拟支付，正式环境接微信支付）

| 商品 | 定价 | 解锁内容 | 配置位置 |
|---|---|---|---|
| 儿童完整测评报告 | ¥5 / 次 | 8 维度得分 + 类型深度解读 + 态度建议 | `config.py: price_child_assessment_cents` |
| 儿童月度培养方案 | ¥29 / 月 | 8 类型 × 4 周培养计划，每月更新 | `price_child_plan_monthly_cents` |
| 结业深度报告 | ¥9.9 / 份 | 判定依据 + 未验证清单 + 下期计划 + AI 总结 | `price_cycle_report_cents` |

免费体验完整闭环（访谈→任务→画像→结业判定结论）；付费解锁"深度内容"。支付接线与合规见 `docs/compliance.md`。

## 你需要提供的东西（按时间顺序）

| 阶段 | 需要 | 用途 |
|---|---|---|
| 现在 | 无 | mock 模式全流程可用 |
| 真实 AI | 智谱 API key | 切换 GLM |
| 真机预览 | 小程序 AppID | 填入 `frontend/src/manifest.json` 的 `mp-weixin.appid` |
| 对外发布 | 主体注册、服务器、ICP 备案、大模型登记、深度合成类目 | 见 docs/compliance.md 全部清单 |
