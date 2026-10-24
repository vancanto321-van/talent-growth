const app = getApp();
const storage = require('../../utils/storage');
const gamify = require('../../utils/gamify');

Page({
  data: {
    hasChild: false,
    child: null,
    ageText: '',
    level: null,         // {xp,level,title,emoji,nextTitle,nextNeed,percent}
    currentBand: null,   // band meta + progress
    ageBands: [],
    domainCatalog: [],
    totalAchieved: 0,
    nextBand: null,      // band meta (locked)
    recordCount: 0,
    badgeCount: 0,
    unlockRatio: Math.round(gamify.UNLOCK_RATIO * 100)
  },

  onShow() {
    const child = storage.getChild();
    const storedProgress = storage.getProgress();
    const bands = app.globalData.bands;
    // 当前关卡 = 已解锁中 order 最高的一段（按 band.order 排序，而非解锁数组顺序）
    const unlockedBands = storage.getUnlocked()
      .map(k => bands.find(x => x.key === k))
      .filter(Boolean)
      .sort((a, b) => b.order - a.order);
    const curBand = unlockedBands[0] || null;
    const curIdx = curBand ? bands.findIndex(b => b.key === curBand.key) : -1;
    const nextBand = curIdx >= 0 && curIdx < bands.length - 1 ? bands[curIdx + 1] : null;
    const bp = curBand ? gamify.bandProgress(curBand.key, app) : { achieved: 0, total: 0, percent: 0 };
    const unlockedKeys = storage.getUnlocked();
    const ageBands = bands.map((b, index) => {
      const p = gamify.bandProgress(b.key, app);
      return { key: b.key, label: b.label, stage: b.stage, icon: ['🌱','🧸','🎈','🪁','🌻','🚀'][index] || '✨', achieved: p.achieved, total: p.total, percent: p.percent, unlocked: unlockedKeys.indexOf(b.key) >= 0 };
    });

    // 徽章总数（所有解锁段）
    let badges = 0;
    unlockedBands.forEach(b => { badges += gamify.bandBadges(b.key, app).length; });

    this.setData({
      hasChild: !!(child && child.name),
      child,
      ageText: child && child.birthday ? app.ageText(child.birthday) : '',
      level: gamify.levelInfo(),
      currentBand: curBand ? {
        key: curBand.key, label: curBand.label, stage: curBand.stage,
        order: curBand.order, count: curBand.count,
        achieved: bp.achieved, total: bp.total, percent: bp.percent
      } : null,
      nextBand: nextBand ? { key: nextBand.key, label: nextBand.label, stage: nextBand.stage } : null,
      ageBands,
      domainCatalog: curBand ? curBand.domains.map((domain, index) => ({ name: domain.name, index, count: domain.items.length, icon: ['🏃','🖐️','💬','🧩','💛','🍴','🎨'][index] || '✨' })) : [],
      totalAchieved: Object.keys(storedProgress).filter(k => storedProgress[k].status === 'achieved').length,
      recordCount: storage.getRecords().length,
      badgeCount: badges
    });
  },

  goProfile() { wx.switchTab({ url: '/pages/profile/profile' }); },
  goBand() {
    const k = this.data.currentBand && this.data.currentBand.key;
    if (k) wx.navigateTo({ url: '/pages/band/band?key=' + k });
  },
  openBand(e) {
    const key = e.currentTarget.dataset.key;
    const b = app.globalData.bands.find(x => x.key === key);
    if (!b) return;
    if (storage.getUnlocked().indexOf(key) < 0) { wx.showToast({ title: '完成上一阶段目标后解锁', icon: 'none' }); return; }
    wx.navigateTo({ url: '/pages/band/band?key=' + key });
  },
  openDomain(e) {
    const key = this.data.currentBand && this.data.currentBand.key;
    if (key) wx.navigateTo({ url: '/pages/band/band?key=' + key + '&domain=' + Number(e.currentTarget.dataset.index) });
  },
  goRecord() { wx.switchTab({ url: '/pages/record/record' }); },
  goCheckin() { wx.switchTab({ url: '/pages/record/record' }); },
  goNextBand() {
    const nb = this.data.nextBand;
    if (!nb) { wx.showToast({ title: '已是最终关卡', icon: 'none' }); return; }
    const need = this.data.currentBand.total
      ? Math.ceil(this.data.currentBand.total * gamify.UNLOCK_RATIO) - this.data.currentBand.achieved
      : 0;
    wx.showToast({ title: '再达标 ' + Math.max(0, need) + ' 项即可解锁', icon: 'none' });
  }
});
