/**
 * 微信开发者工具自动化走查脚本（真实平台证据采集）
 *
 * 前置条件（二选一，一次性操作）：
 *   A. 微信开发者工具 → 设置 → 安全设置 → 服务端口开启
 *   B. 详见 docs/compliance.md 上线清单
 *
 * 用法：node walkthrough.js [项目路径]
 * 产物：tools/mpdriver/shots/*.png（各页面模拟器截图）
 */
const automator = require("miniprogram-automator");
const fs = require("fs");
const path = require("path");

const PROJECT = process.argv[2] || "/Users/van/Documents/glm/potential-lab/frontend/dist/build/mp-weixin";
const CLI_PATH = "/Applications/wechatwebdevtools.app/Contents/MacOS/cli";
const OUT = path.join(__dirname, "shots");

const PAGES = [
  ["home", "/pages/index/index"],
  ["explore", "/pages/explore/explore"],
  ["assessment", "/pages/assessment/assessment"],
  ["assessment-result", "/pages/assessment-result/assessment-result"],
  ["profile", "/pages/profile/profile"],
  ["plan", "/pages/plan/plan"],
  ["task", "/pages/task/task?id=1"],
  ["child-assessment", "/pages/child-assessment/child-assessment"],
  ["child-result", "/pages/child-result/child-result?id=1"],
  ["industry", "/pages/industry/industry?code=sales"],
  ["methodology", "/pages/methodology/methodology"],
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  console.log("连接开发者工具…");
  const mini = await automator.launch({ cliPath: CLI_PATH, projectPath: PROJECT });
  console.log("已连接");

  const results = [];
  for (const [name, route] of PAGES) {
    try {
      const page = await mini.reLaunch(route);
      await page.waitFor(1200);
      const shot = path.join(OUT, `${name}.png`);
      await mini.screenshot({ path: shot });
      // 采集页面数据路径与关键文本，作为文字证据
      const el = await page.$("page");
      const wxml = el ? (await el.wxml()).length : 0;
      results.push({ name, route, ok: true, wxmlLen: wxml, shot });
      console.log(`✓ ${name} (${route}) wxml=${wxml}B → ${shot}`);
    } catch (e) {
      results.push({ name, route, ok: false, error: String(e).slice(0, 200) });
      console.log(`✗ ${name}: ${String(e).slice(0, 200)}`);
    }
  }

  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
  const okCount = results.filter((r) => r.ok).length;
  console.log(`\n走查完成：${okCount}/${results.length} 页面正常`);
  await mini.close();
  process.exit(okCount === results.length ? 0 : 1);
})().catch((e) => {
  console.error("失败：", e.message);
  process.exit(1);
});
