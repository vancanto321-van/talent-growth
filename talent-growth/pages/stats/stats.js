const app = getApp();
const storage = require('../../utils/storage');
const gamify = require('../../utils/gamify');

Page({
  data: {
    hasChild: false,
    band: null,         // {label, stage, percent, achieved, total}
    domainStats: [],    // [{name, achieved, total, percent}]
    weekData: [],       // [{label, count, percent}] 近12周
    checkinStreak: 0,
    level: null,
    badgeCount: 0
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const child = storage.getChild();
    const bands = app.globalData.bands;
    const unlocked = storage.getUnlocked();
    // 当前关卡 = 已解锁中 order 最高
    const cur = unlocked.map(k => bands.find(b => b.key === k))
      .filter(Boolean).sort((a, b) => b.order - a.order)[0] || null;
    const progress = storage.getProgress();

    // 领域达标分布（当前关卡）
    const domainStats = cur ? cur.domains.map(d => {
      let achieved = 0;
      d.items.forEach(m => { if ((progress[m.id] || {}).status === 'achieved') achieved++; });
      const total = d.items.length;
      return { name: d.name, achieved, total, percent: total ? Math.round(achieved / total * 100) : 0 };
    }) : [];

    // 近 12 周记录数（周一到周日）
    const records = storage.getRecords();
    const weekData = [];
    const now = new Date();
    const thisMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() || 7) - 1));
    for (let w = 11; w >= 0; w--) {
      const start = new Date(thisMonday.getTime() - w * 7 * 86400000);
      const end = new Date(start.getTime() + 7 * 86400000);
      const count = records.filter(r => {
        const d = new Date(r.date);
        return d >= start && d < end;
      }).length;
      weekData.push({ label: (start.getMonth() + 1) + '/' + start.getDate(), count, percent: 0 });
    }
    const max = Math.max(1, ...weekData.map(x => x.count));
    weekData.forEach(x => { x.percent = Math.max(4, Math.round(x.count / max * 100)); });

    const bp = cur ? gamify.bandProgress(cur.key, app) : { percent: 0, achieved: 0, total: 0 };
    let badgeCount = 0;
    unlocked.forEach(k => { badgeCount += gamify.bandBadges(k, app).length; });

    this.setData({
      hasChild: !!(child && child.name),
      band: cur ? {
        label: cur.label, stage: cur.stage,
        percent: bp.percent, achieved: bp.achieved, total: bp.total
      } : null,
      domainStats,
      weekData,
      checkinStreak: storage.streakDays(this.todayStr()),
      level: gamify.levelInfo(),
      badgeCount
    });
  },

  todayStr() {
    const d = new Date();
    const p = n => (n < 10 ? '0' + n : n);
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  },

  goBand() {
    const child = storage.getChild();
    const target = child && child.birthday ? app.bandKeyByAge(child.birthday) : 'b0';
    wx.navigateTo({ url: '/pages/band/band?key=' + target });
  }
});
