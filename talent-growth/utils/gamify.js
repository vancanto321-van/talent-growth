// 游戏化规则：XP、等级、徽章、年龄段解锁
const storage = require('./storage');

const XP_PER_ACHIEVED = 50;   // 标记达标
const XP_PER_OBSERVED = 10;   // 标记已观察
const XP_PER_RECORD = 5;      // 每条成长记录
const UNLOCK_RATIO = 0.5;     // 当前年龄段达标里程碑 ≥ 50% 即解锁下一段

// 等级头衔（按累计 XP 阈值）
const LEVELS = [
  { min: 0,    title: '萌新爸妈',   emoji: '🌱' },
  { min: 200,  title: '入门爸妈',   emoji: '🌿' },
  { min: 500,  title: '熟练爸妈',   emoji: '⭐' },
  { min: 1000, title: '资深爸妈',   emoji: '🌟' },
  { min: 1800, title: '达人爸妈',   emoji: '🏅' },
  { min: 2800, title: '高手爸妈',   emoji: '🏆' },
  { min: 4000, title: '专家爸妈',   emoji: '💎' },
  { min: 6000, title: '传奇爸妈',   emoji: '👑' },
];

// 某年龄段进度
function bandProgress(bandKey, app) {
  const all = app.milestonesOfBand(bandKey);
  const progress = storage.getProgress();
  let achieved = 0, observed = 0;
  all.forEach(m => {
    const s = progress[m.id];
    if (s && s.status === 'achieved') achieved++;
    else if (s && s.status === 'observed') observed++;
  });
  const total = all.length;
  const percent = total ? Math.round(achieved / total * 100) : 0;
  const unlockedRatio = UNLOCK_RATIO;
  const canUnlockNext = total && achieved >= Math.ceil(total * unlockedRatio);
  return { achieved, observed, total, percent, canUnlockNext };
}

// 各领域徽章：该年龄段某领域全部达标即获得
function bandBadges(bandKey, app) {
  const b = app.globalData.bands.find(x => x.key === bandKey);
  const progress = storage.getProgress();
  const badges = [];
  if (!b) return badges;
  b.domains.forEach(d => {
    const allAchieved = d.items.length > 0 && d.items.every(m => {
      const s = progress[m.id]; return s && s.status === 'achieved';
    });
    if (allAchieved) badges.push(d.name);
  });
  return badges;
}

// 总 XP
function totalXp() {
  const progress = storage.getProgress();
  const records = storage.getRecords();
  let xp = 0;
  Object.keys(progress).forEach(k => {
    const s = progress[k];
    if (s.status === 'achieved') xp += XP_PER_ACHIEVED;
    else if (s.status === 'observed') xp += XP_PER_OBSERVED;
  });
  xp += records.length * XP_PER_RECORD;
  return xp;
}

// 等级信息
function levelInfo() {
  const xp = totalXp();
  let cur = LEVELS[0], idx = 0;
  for (let i = 0; i < LEVELS.length; i++) {
    if (xp >= LEVELS[i].min) { cur = LEVELS[i]; idx = i; }
  }
  const next = LEVELS[idx + 1] || null;
  const level = idx + 1;
  const curBase = cur.min;
  const span = next ? (next.min - curBase) : 1;
  const into = xp - curBase;
  const percent = next ? Math.min(100, Math.round(into / span * 100)) : 100;
  return { xp, level, title: cur.title, emoji: cur.emoji,
    nextTitle: next ? next.title : '已达满级',
    nextNeed: next ? (next.min - xp) : 0, percent };
}

// 检查某年龄段是否触发解锁下一段，返回新解锁的 key 或 null
function tryUnlockNext(bandKey, app) {
  const bands = app.globalData.bands;
  const idx = bands.findIndex(b => b.key === bandKey);
  if (idx < 0 || idx >= bands.length - 1) return null; // 已是最后一段
  const nextKey = bands[idx + 1].key;
  const unlocked = storage.getUnlocked();
  if (unlocked.indexOf(nextKey) >= 0) return null; // 已解锁
  const bp = bandProgress(bandKey, app);
  if (bp.canUnlockNext) {
    storage.unlockBand(nextKey);
    return nextKey;
  }
  return null;
}

module.exports = {
  XP_PER_ACHIEVED, XP_PER_OBSERVED, XP_PER_RECORD, UNLOCK_RATIO,
  bandProgress, bandBadges, totalXp, levelInfo, tryUnlockNext,
  LEVELS
};
