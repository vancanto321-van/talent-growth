const milestones = require('./data/milestones.js');
const guides = require('./data/guides.js');
const safety = require('./data/safety.js');
const items = require('./data/items.js');

App({
  globalData: {
    milestones, guides, safety, items,
    bands: milestones.bands, // [{key,label,stage,order,count,domains}]
  },

  // 根据 bandKey 取该年龄段全部里程碑（扁平）
  milestonesOfBand(bandKey) {
    const b = this.globalData.bands.find(x => x.key === bandKey);
    if (!b) return [];
    const all = [];
    b.domains.forEach(d => d.items.forEach(m => all.push(m)));
    return all;
  },

  // 按 id 查里程碑，并附带 band 信息
  findMilestone(id) {
    for (const b of this.globalData.bands) {
      for (const d of b.domains) {
        for (const m of d.items) {
          if (m.id === id) return Object.assign({ bandLabel: b.label, stage: b.stage }, m);
        }
      }
    }
    return null;
  },

  // 根据 bandKey 取陪伴指南
  guideOf(bandKey) {
    return this.globalData.guides.find(g => g.band === bandKey) || null;
  },
  // 根据 bandKey 取安全事项
  safetyOf(bandKey) {
    return this.globalData.safety.find(s => s.band === bandKey) || null;
  },
  // bandKey -> 对应的物品年份段（用于物品 tab）
  yearsOfBand(bandKey) {
    const map = { b0: ['0岁（0-12个月）'], b1: ['1岁（12-24个月）','2岁（24-36个月）'],
      b2: ['3岁'], b3: ['4岁'], b4: ['5岁'], b5: ['6岁','7岁','8岁'] };
    const want = map[bandKey] || [];
    return this.globalData.items.filter(y => want.indexOf(y.year) >= 0);
  },

  // 由生日计算"几岁几个月"
  ageText(birthday) {
    if (!birthday) return '未设置';
    const b = new Date(birthday.replace(/-/g, '/'));
    const now = new Date();
    if (isNaN(b.getTime()) || b > now) return '未设置';
    let years = now.getFullYear() - b.getFullYear();
    let months = now.getMonth() - b.getMonth();
    if (now.getDate() < b.getDate()) months -= 1;
    if (months < 0) { years -= 1; months += 12; }
    if (years <= 0) return months <= 0 ? '不满1个月' : months + '个月';
    return years + '岁' + (months > 0 ? months + '个月' : '');
  },

  // 由生日推断当前所属年龄段 key
  bandKeyByAge(birthday) {
    if (!birthday) return 'b0';
    const b = new Date(birthday.replace(/-/g, '/'));
    const now = new Date();
    if (isNaN(b.getTime()) || b > now) return 'b0';
    let years = now.getFullYear() - b.getFullYear();
    if (now.getMonth() < b.getMonth() ||
      (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) years -= 1;
    if (years < 1) return 'b0';
    if (years < 3) return 'b1';
    if (years < 4) return 'b2';
    if (years < 5) return 'b3';
    if (years < 6) return 'b4';
    return 'b5';
  }
});
