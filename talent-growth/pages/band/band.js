const app = getApp();
const storage = require('../../utils/storage');
const gamify = require('../../utils/gamify');
const growthProgress = require('../../utils/growth-progress');

Page({
  data: {
    key: '',
    band: null,        // meta
    guide: null,
    safety: null,
    itemYears: [],
    domains: [],       // [{name, items:[{...+status}]}]
    filteredItems: [], // 当前展示(领域筛选/搜索过滤后)的里程碑
    keyword: '',       // 搜索关键词
    cardIndex: 0,
    progress: { achieved: 0, total: 0, percent: 0 },
    tab: 0,            // 0里程碑 1陪伴 2安全 3物品
    activeDomain: 0,
    unlocked: true,
    badges: [],
    unlockRatio: Math.round(gamify.UNLOCK_RATIO * 100)
  },

  onLoad(opts) {
    const key = opts.key || 'b0';
    const band = app.globalData.bands.find(b => b.key === key);
    if (!band) { wx.showToast({ title: '年龄段不存在', icon: 'none' }); return; }
    this.setData({
      key, band,
      guide: app.guideOf(key),
      safety: app.safetyOf(key),
      itemYears: app.yearsOfBand(key),
      domains: band.domains.map(d => ({ name: d.name, items: d.items })),
      activeDomain: Math.max(0, Math.min(band.domains.length - 1, Number(opts.domain) || 0))
    });
    wx.setNavigationBarTitle({ title: band.label + ' · ' + band.stage });
  },

  onShow() {
    const key = this.data.key;
    if (!key) return;
    const unlocked = storage.getUnlocked();
    const bp = gamify.bandProgress(key, app);
    const progress = storage.getProgress();
    const domains = this.data.band.domains.map(d => ({
      name: d.name,
      items: d.items.map(m => Object.assign({}, m, {
        status: (progress[m.id] && progress[m.id].status) || '',
        batteryPercent: growthProgress.progressOf(m, progress[m.id]).percent
      }))
    }));
    this.setData({
      unlocked: unlocked.indexOf(key) >= 0,
      progress: bp,
      domains,
      badges: gamify.bandBadges(key, app)
    });
    this.applyFilter(false);
  },

  switchTab(e) {
    this.setData({ tab: Number(e.currentTarget.dataset.t) });
  },
  pickDomain(e) {
    this.setData({ activeDomain: Number(e.currentTarget.dataset.i) });
    this.applyFilter();
  },
  onCardChange(e) { this.setData({ cardIndex: e.detail.current }); },
  previousCard() { this.setData({ cardIndex: Math.max(0, this.data.cardIndex - 1) }); },
  nextCard() { this.setData({ cardIndex: Math.min(this.data.filteredItems.length - 1, this.data.cardIndex + 1) }); },

  onSearchInput(e) {
    this.setData({ keyword: e.detail.value });
    this.applyFilter();
  },
  clearSearch() {
    this.setData({ keyword: '' });
    this.applyFilter();
  },

  // 计算展示列表：有关键词时全关卡搜索，否则按领域展示
  applyFilter(resetPosition = true) {
    const previousItem = this.data.filteredItems[this.data.cardIndex];
    const kw = (this.data.keyword || '').trim().toLowerCase();
    let items;
    if (kw) {
      items = [];
      const progress = storage.getProgress();
      this.data.band.domains.forEach(d => {
        d.items.forEach(m => {
          if ((m.title || '').toLowerCase().indexOf(kw) >= 0 ||
              String(m.age || '').toLowerCase().indexOf(kw) >= 0) {
            items.push(Object.assign({}, m, {
              status: (progress[m.id] || {}).status || '',
              batteryPercent: growthProgress.progressOf(m, progress[m.id]).percent
            }));
          }
        });
      });
    } else {
      const cur = this.data.domains[this.data.activeDomain];
      items = cur ? cur.items : [];
    }
    const previousIndex = previousItem ? items.findIndex(item => item.id === previousItem.id) : -1;
    this.setData({ filteredItems: items, cardIndex: !resetPosition && previousIndex >= 0 ? previousIndex : 0 });
  },

  openMilestone(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/milestone/milestone?id=' + encodeURIComponent(id) });
  }
});
