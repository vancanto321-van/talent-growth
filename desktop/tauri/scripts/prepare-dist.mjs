import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const here = import.meta.dirname;
const tauriDir = path.resolve(here, '..');
const repoRoot = path.resolve(tauriDir, '..', '..');
const source = path.join(repoRoot, 'talent-growth', 'app', 'www');
const target = path.join(tauriDir, 'dist');

// 守卫：只允许从仓库内这一份 Web 目录打包，避免误打包到同名的旧副本。
if (!fs.existsSync(path.join(source, 'index.html'))) {
  throw new Error(`Web 目录不存在或不完整：${source}`);
}
if (!fs.existsSync(path.join(source, 'talent.css')) || !fs.readFileSync(path.join(source, 'talent.css'), 'utf8').includes('tg-entry-grid')) {
  throw new Error(`Web 目录不是当前版本（缺少首页双入口样式）：${source}`);
}

execFileSync(process.execPath, [path.join(repoRoot, 'talent-growth', 'app', 'scripts', 'sync-data.mjs')], { stdio: 'inherit' });

fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });
fs.cpSync(source, target, { recursive: true });

// 构建标记：用于校验 DMG 里嵌的确实是这一份 dist。
const marker = `\n/* build=${process.env.TG_BUILD || 'dev'} at=${new Date().toISOString()} source=${source} */\n`;
fs.appendFileSync(path.join(target, 'talent.css'), marker);

console.log('[prepare-dist] source:', source);
console.log('[prepare-dist] dist  :', target);
console.log('[prepare-dist] marker:', marker.trim());
