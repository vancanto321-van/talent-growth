#!/usr/bin/env node
/**
 * 从 Obsidian vault 导出「孩子成长」小程序数据
 * 用法:
 *   node scripts/export_data.js                  # 导出到小程序 data/ 目录
 *   node scripts/export_data.js --out /tmp/x     # 导出到指定目录
 *   node scripts/export_data.js --verify         # 只对比不写入(幂等校验)
 *   node scripts/export_data.js --normalize-age  # 统一 age 字段格式(默认保留原样)
 *
 * 生成: data/milestones.js / data/guides.js / data/safety.js / data/items.js
 * 纯 Node 实现,无第三方依赖。
 */
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const isVerify = args.includes('--verify');
const normalizeAge = args.includes('--normalize-age');
const outDir = (() => {
  const i = args.indexOf('--out');
  return i >= 0 ? args[i + 1] : path.join(__dirname, '..', 'data');
})();
const VAULT = '/Users/van/Downloads/一些积累/obsidian/孩子成长';

// 年龄段映射:文件夹名 -> { key, label, stage }
const BAND_MAP = [
  { folder: '0-1岁', key: 'b0', label: '0-1岁', stage: '婴儿期' },
  { folder: '两岁小孩', key: 'b1', label: '1-3岁', stage: '幼儿期' },
  { folder: '3-4岁', key: 'b2', label: '3-4岁', stage: '幼儿园小班' },
  { folder: '4-5岁', key: 'b3', label: '4-5岁', stage: '幼儿园中班' },
  { folder: '5-6岁', key: 'b4', label: '5-6岁', stage: '幼儿园大班' },
  { folder: '6-8岁', key: 'b5', label: '6-8岁', stage: '小学低年级' }
];
const DOMAIN_ORDER = ['大运动', '精细运动', '语言与沟通', '认知与解决问题', '社交与情绪', '生活自理', '艺术与感官'];

// ---------- Markdown 解析工具 ----------

function parseFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) return {};
  const fm = {};
  m[1].split(/\r?\n/).forEach(line => {
    const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (kv) {
      let v = kv[2].trim().replace(/^["']|["']$/g, '');
      if (v === 'true') v = true;
      else if (v === 'false') v = false;
      else if (v.match(/^\[.*\]$/)) {
        try { v = JSON.parse(v); } catch (e) { /* 保留字符串 */ }
      }
      fm[kv[1]] = v;
    }
  });
  return fm;
}

// 按 ## 二级标题切段,返回 [{title, body}]
function splitSections(md) {
  const lines = md.split(/\r?\n/);
  const sections = [];
  let cur = null;
  lines.forEach(line => {
    const h = line.match(/^##\s+(.*)$/);
    if (h) {
      cur = { title: h[1].trim(), body: [] };
      sections.push(cur);
    } else if (cur) {
      cur.body.push(line);
    }
  });
  sections.forEach(s => { s.body = s.body.join('\n').trim(); });
  return sections;
}

function findSection(sections, kw) {
  return sections.find(s => s.title.indexOf(kw) >= 0) || null;
}

// 段落正文:第一个非空、非列表、非表格、非引用的行
function plainText(body) {
  if (!body) return '';
  const lines = body.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('|') || line.startsWith('-') || line.startsWith('*')
      || line.startsWith('>') || /^\d+[.、]/.test(line) || /^#{1,6}/.test(line)) continue;
    return line.replace(/\*\*/g, '').replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, '$1').trim();
  }
  return '';
}

// 无序列表: - xxx 或 * xxx(自动去掉 checkbox "[ ] "/"[x] " 前缀)
function bulletList(body) {
  if (!body) return [];
  const out = [];
  body.split(/\r?\n/).forEach(raw => {
    const line = raw.trim();
    if (/^[-*]\s+(.*)$/.test(line)) {
      const item = line.replace(/^[-*]\s+/, '')
        .replace(/^\[[ xX]?\]\s*/, '')   // 去掉 "- [ ] " 复选框
        .replace(/\*\*/g, '')
        .replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, '$1')
        .trim();
      if (item) out.push(item);
    }
  });
  return out;
}

// 有序列表: 1. xxx
function orderedList(body) {
  if (!body) return [];
  const out = [];
  body.split(/\r?\n/).forEach(raw => {
    const line = raw.trim();
    if (/^\d+[.、]\s+(.*)$/.test(line)) {
      const item = line.replace(/^\d+[.、]\s+/, '')
        .replace(/\*\*/g, '')
        .replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, '$1')
        .trim();
      if (item) out.push(item);
    }
  });
  return out;
}

// 表格 -> [{col1: v, ...}] 表头做 key
function tableRows(body) {
  if (!body) return [];
  const rows = [];
  let header = null;
  body.split(/\r?\n/).forEach(raw => {
    const line = raw.trim();
    if (!/^\|.*\|$/.test(line)) return;
    const cells = line.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
    if (cells.every(c => /^:?-{2,}:?$/.test(c))) return; // 分隔行
    if (!header) { header = cells; return; }
    const row = {};
    header.forEach((h, i) => { row[h] = cells[i] !== undefined ? cells[i] : ''; });
    rows.push(row);
  });
  return rows;
}

// ---------- 里程碑导出 ----------

// 读取现有数据,建立 "bandKey_slug文件名" -> {id, title} 映射,保证 id/title 稳定(不破坏已存进度)
function loadExistingMeta() {
  const file = path.join(outDir, 'milestones.js');
  if (!fs.existsSync(file)) return new Map();
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const obj = JSON.parse(raw.replace(/^module\.exports\s*=\s*/, '').replace(/;\s*$/, ''));
    const map = new Map();
    obj.bands.forEach(b => b.domains.forEach(d => d.items.forEach(m => {
      map.set(b.key + '_' + slugFile(m.stem), { id: m.id, title: m.title });
    })));
    return map;
  } catch (e) {
    console.warn('现有 milestones.js 解析失败,将按规则生成 id/title:', e.message);
    return new Map();
  }
}

// 文件名 -> 用于匹配现有数据的 slug 形式(文件名中的 "/" 在 id 里写作 "-")
function slugFile(stem) { return String(stem).replace(/\//g, '-'); }

function exportMilestones() {
  const existing = loadExistingMeta();
  const bands = [];
  BAND_MAP.forEach(bm => {
    const dir = path.join(VAULT, bm.folder, '03-里程碑');
    if (!fs.existsSync(dir)) { console.warn('跳过缺失目录:', dir); return; }
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort(); // UTF-8 字节序
    const domainMap = {};
    DOMAIN_ORDER.forEach(d => { domainMap[d] = []; });

    files.forEach(fname => {
      if (/总览|模板/.test(fname)) return;
      const md = fs.readFileSync(path.join(dir, fname), 'utf8');
      const fm = parseFrontmatter(md);
      const stem = fname.replace(/\.md$/, '');
      const secs = splitSections(md);

      const guideSec = findSection(secs, '怎么引导');
      const completeSec = findSection(secs, '做完整');
      const perfSec = findSection(secs, '表现与解读');
      const actsSec = findSection(secs, '活动推荐');
      const ageSec = findSection(secs, '典型年龄范围');

      let age = fm.target_age || plainText(ageSec ? ageSec.body : '');
      if (normalizeAge) age = normalizeAgeStr(age);

      const perfTable = tableRows(perfSec ? perfSec.body : '').map(r => ({
        show: r['表现'] || '',
        meaning: r['体现什么'] || r['体现'] || '',
        next: r['下一步引导'] || r['下一步'] || ''
      })).filter(r => r.show);

      // id/title 优先沿用现有值,新条目按规则生成
      const meta = existing.get(bm.key + '_' + slugFile(stem));
      const id = meta ? meta.id : bm.key + '_' + slugFile(stem);
      const title = meta ? meta.title
        : (stem.indexOf('-') >= 0 ? stem.slice(stem.indexOf('-') + 1) : stem);

      const item = {
        id,
        band: bm.key,
        bandLabel: bm.label,
        domain: fm.domain || '',
        title,
        stem,
        age,
        func: plainText(findSection(secs, '功能') ? findSection(secs, '功能').body : ''),
        std: plainText(findSection(secs, '达成标准') ? findSection(secs, '达成标准').body : ''),
        guide: orderedList(guideSec ? guideSec.body : ''),
        complete: bulletList(completeSec ? completeSec.body : ''),
        perf: perfTable,
        passs: plainText(findSection(secs, '达标标准') ? findSection(secs, '达标标准').body : ''),
        nxt: plainText(findSection(secs, '后续方向') ? findSection(secs, '后续方向').body : ''),
        acts: bulletList(actsSec ? actsSec.body : '')
      };
      if (domainMap[item.domain]) domainMap[item.domain].push(item);
    });

    const domains = DOMAIN_ORDER
      .filter(d => domainMap[d].length)
      .map(d => ({ name: d, items: domainMap[d] }));
    const count = domains.reduce((n, d) => n + d.items.length, 0);
    bands.push({
      key: bm.key, folder: bm.folder, label: bm.label, stage: bm.stage,
      order: bands.length, count, domains
    });
  });
  return { bands, count: bands.reduce((n, b) => n + b.count, 0) };
}

// ---------- 陪伴指南导出 ----------

function exportGuides() {
  return BAND_MAP.map(bm => {
    const file = path.join(VAULT, bm.folder, '07-家长陪伴指南.md');
    if (!fs.existsSync(file)) return null;
    const secs = splitSections(fs.readFileSync(file, 'utf8'));
    const rhythm = tableRows(findSection(secs, '每日陪伴节奏') ? findSection(secs, '每日陪伴节奏').body : '')
      .map(r => ({ time: r['时段'] || '', do: r['做什么'] || '', act: r['家长可以这样'] || '' }))
      .filter(r => r.time);
    const scenarios = tableRows(findSection(secs, '日常场景话术') ? findSection(secs, '日常场景话术').body : '')
      .map(r => ({ scene: r['场景'] || '', sit: r['典型情况'] || '', do: r['家长可以这样'] || '', avoid: r['尽量避免'] || '' }))
      .filter(r => r.scene);
    return {
      band: bm.key, label: bm.label, stage: bm.stage,
      profile: plainText(findSection(secs, '孩子画像') ? findSection(secs, '孩子画像').body : ''),
      rhythm,
      points: orderedList(findSection(secs, '高质量陪伴要点') ? findSection(secs, '高质量陪伴要点').body : ''),
      scenarios,
      habits: bulletList(findSection(secs, '亲子习惯') ? findSection(secs, '亲子习惯').body : ''),
      selfcare: bulletList(findSection(secs, '家长自我照顾') ? findSection(secs, '家长自我照顾').body : ''),
      resources: bulletList(findSection(secs, '推荐资源') ? findSection(secs, '推荐资源').body : '')
    };
  }).filter(Boolean);
}

// ---------- 安全事项导出 ----------

function exportSafety() {
  return BAND_MAP.map(bm => {
    const file = path.join(VAULT, bm.folder, '08-安全与注意事项.md');
    if (!fs.existsSync(file)) return null;
    const secs = splitSections(fs.readFileSync(file, 'utf8'));
    const risks = tableRows(findSection(secs, '3个安全风险') ? findSection(secs, '3个安全风险').body : '')
      .map(r => ({ name: r['风险'] || '', why: r['为什么危险'] || '', guard: r['关键防护'] || '' }))
      .filter(r => r.name);
    const warning = bulletList(findSection(secs, '发育警示') ? findSection(secs, '发育警示').body : '')
      .map(w => w.replace(/^[⚠️]+\s*/, '').replace(/^⚠️\s*/, ''));
    return {
      band: bm.key, label: bm.label, stage: bm.stage,
      risks,
      home: bulletList(findSection(secs, '居家安全') ? findSection(secs, '居家安全').body : ''),
      outdoor: bulletList(findSection(secs, '户外') ? findSection(secs, '户外').body : ''),
      food: bulletList(findSection(secs, '饮食') ? findSection(secs, '饮食').body : ''),
      toys: bulletList(findSection(secs, '玩具') ? findSection(secs, '玩具').body : ''),
      social: bulletList(findSection(secs, '社交') ? findSection(secs, '社交').body : ''),
      firstaid: bulletList(findSection(secs, '急救') ? findSection(secs, '急救').body : ''),
      warning,
      contacts: plainText(findSection(secs, '求助备忘') ? findSection(secs, '求助备忘').body : '')
    };
  }).filter(Boolean);
}

// ---------- 物品清单导出 ----------

function exportItems() {
  const file = path.join(VAULT, '01-逐年物品清单.md');
  if (!fs.existsSync(file)) return [];
  const secs = splitSections(fs.readFileSync(file, 'utf8'));
  return secs
    .filter(s => /岁/.test(s.title) && !/列说明/.test(s.title))
    .map(s => ({
      year: s.title.trim(),
      items: tableRows(s.body).map(r => ({
        name: r['物品'] || '',
        when: r['引入时机'] || '',
        life: r['使用年限'] || '',
        wear: r['磨损/更新速度'] || '',
        tip: r['选购要点'] || ''
      })).filter(r => r.name)
    }));
}

// ---------- age 格式统一 ----------

function normalizeAgeStr(a) {
  if (!a) return a;
  const s = String(a).trim();
  // 形如 "3-6个月" / "12-18个月" / "1.5~2岁" / "11~15个月（CDC: 9~15个月）" / "6-8岁"
  const m = s.match(/(\d+(?:\.\d+)?)\s*[-~—～至]\s*(\d+(?:\.\d+)?)\s*(个?月|岁)/);
  if (m) {
    const unit = m[3] === '岁' ? '岁' : '个月';
    const a1 = parseFloat(m[1]);
    const a2 = parseFloat(m[2]);
    if (unit === '岁') {
      return a1 + '-' + a2 + '岁';
    }
    return a1 + '-' + a2 + '个月';
  }
  // 单值: "6个月" / "3岁"
  const single = s.match(/(\d+(?:\.\d+)?)\s*(个?月|岁)/);
  if (single) return single[2] === '岁' ? single[1] + '岁' : single[1] + '个月';
  return s;
}

// ---------- 输出 ----------

function write(name, data) {
  const out = 'module.exports = ' + JSON.stringify(data, null, 2) + ';\n';
  const file = path.join(outDir, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (isVerify) return out;
  fs.writeFileSync(file, out, 'utf8');
  return out;
}

function diffWithExisting(name, outText) {
  const file = path.join(outDir, name);
  if (!fs.existsSync(file)) return { status: 'NEW', detail: '文件不存在(新增)' };
  const cur = fs.readFileSync(file, 'utf8');
  if (cur === outText) return { status: 'IDENTICAL' };
  // 逐条对比 JSON 结构
  try {
    const a = JSON.parse(outText.replace(/^module\.exports\s*=\s*/, '').replace(/;\s*$/, ''));
    const b = JSON.parse(cur.replace(/^module\.exports\s*=\s*/, '').replace(/;\s*$/, ''));
    const diffs = collectDiffs(a, b, '');
    return { status: 'DIFF', detail: diffs.slice(0, 30), total: diffs.length };
  } catch (e) {
    return { status: 'PARSE_ERR', detail: e.message };
  }
}

function collectDiffs(a, b, p) {
  const out = [];
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) out.push(p + ': 数组长度 ' + a.length + ' vs ' + b.length);
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) out.push(...collectDiffs(a[i], b[i], p + '[' + i + ']'));
    return out;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    keys.forEach(k => {
      if (!(k in a)) out.push(p + '.' + k + ': 现有多余');
      else if (!(k in b)) out.push(p + '.' + k + ': 导出多余');
      else out.push(...collectDiffs(a[k], b[k], p + '.' + k));
    });
    return out;
  }
  if (String(a) !== String(b)) out.push(p + ': "' + a + '" vs "' + b + '"');
  return out;
}

// ---------- main ----------

const milestones = exportMilestones();
const guides = exportGuides();
const safety = exportSafety();
const items = exportItems();

const total = milestones.bands.reduce((n, b) => n + b.count, 0);
console.log('里程碑:', milestones.bands.map(b => b.key + '=' + b.count).join(' '), '合计', total);
console.log('指南:', guides.length, '段 | 安全:', safety.length, '段 | 物品:', items.length, '档');

const files = [
  ['milestones.js', milestones],
  ['guides.js', guides],
  ['safety.js', safety],
  ['items.js', items]
];

let allOk = true;
files.forEach(([name, data]) => {
  const outText = write(name, data);
  if (isVerify) {
    const r = diffWithExisting(name, outText);
    if (r.status === 'IDENTICAL') { console.log('✓', name, '一致'); }
    else { allOk = false; console.log('✗', name, r.status, r.total !== undefined ? '(' + r.total + ' 处差异)' : ''); (r.detail || []).slice(0, 20).forEach(d => console.log('   ', d)); }
  } else {
    console.log('✓ 已写入', path.join(outDir, name), '(' + JSON.stringify(data).length + ' bytes)');
  }
});

if (isVerify) {
  console.log(allOk ? '\n幂等校验通过:与现有数据完全一致' : '\n幂等校验存在差异(见上)');
  process.exit(allOk ? 0 : 1);
}
