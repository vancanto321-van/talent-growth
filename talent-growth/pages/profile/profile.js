const app = getApp();
const storage = require('../../utils/storage');
const gamify = require('../../utils/gamify');

Page({
  data: {
    child: { name: '', birthday: '', gender: '男' },
    hasChild: false,
    level: { emoji: '🌱', title: '萌新爸妈', level: 1, xp: 0, nextTitle: '入门爸妈', nextNeed: 0, percent: 0 },
    unlockedBands: [],
    allBadges: [],
    stats: { records: 0, achieved: 0, observed: 0 },
    babies: [],
    activeBaby: null
  },

  onShow() {
    const child = storage.getChild() || { name: '', birthday: '', gender: '男' };
    const level = gamify.levelInfo();
    const bands = app.globalData.bands;
    const unlocked = storage.getUnlocked();
    const unlockedBands = unlocked.map(k => bands.find(b => b.key === k)).filter(Boolean);
    // 全部徽章
    const allBadges = [];
    unlocked.forEach(k => {
      gamify.bandBadges(k, app).forEach(name => allBadges.push({ band: bands.find(b => b.key === k).label, name }));
    });
    // 统计
    const progress = storage.getProgress();
    let achieved = 0, observed = 0;
    Object.keys(progress).forEach(k => {
      if (progress[k].status === 'achieved') achieved++;
      else if (progress[k].status === 'observed') observed++;
    });
    this.setData({
      child, hasChild: !!child.name, level, unlockedBands, allBadges,
      stats: { records: storage.getRecords().length, achieved, observed },
      babies: storage.getBabies(),
      activeBaby: storage.getActiveBaby()
    });
  },

  // ---- 多宝宝管理 ----
  switchBaby(e) {
    const id = e.currentTarget.dataset.id;
    if (id === storage.getActiveId()) return;
    storage.switchBaby(id);
    this.onShow();
  },
  addBaby() {
    wx.showModal({
      title: '添加宝宝',
      editable: true,
      placeholderText: '宝宝昵称（小名）',
      success: res => {
        if (!res.confirm) return;
        const name = (res.content || '').trim();
        if (!name) { wx.showToast({ title: '请填写昵称', icon: 'none' }); return; }
        storage.addBaby({ name, birthday: '', gender: '男' });
        wx.showToast({ title: '已添加，请完善档案', icon: 'none' });
        this.onShow();
      }
    });
  },
  removeBaby() {
    const babies = storage.getBabies();
    if (babies.length <= 1) { wx.showToast({ title: '至少保留一个宝宝', icon: 'none' }); return; }
    const active = storage.getActiveBaby();
    wx.showModal({
      title: '删除「' + (active ? active.name : '宝宝') + '」',
      content: '将永久删除该宝宝的全部档案、进度、记录与打卡，不可恢复！确定继续吗？',
      confirmColor: '#D32F2F',
      success: res => {
        if (res.confirm) {
          storage.removeBaby(active.id);
          wx.showToast({ title: '已删除', icon: 'none' });
          this.onShow();
        }
      }
    });
  },

  onName(e) { this.setData({ 'child.name': e.detail.value }); },
  onBirthday(e) { this.setData({ 'child.birthday': e.detail.value }); },
  pickGender(e) { this.setData({ 'child.gender': e.currentTarget.dataset.g }); },
  save() {
    if (!this.data.child.name) { wx.showToast({ title: '请填写宝贝昵称', icon: 'none' }); return; }
    if (!this.data.child.birthday) { wx.showToast({ title: '请选择宝贝生日', icon: 'none' }); return; }
    const birthday = new Date(this.data.child.birthday.replace(/-/g, '/'));
    if (isNaN(birthday.getTime()) || birthday > new Date()) {
      wx.showToast({ title: '生日不能晚于今天', icon: 'none' }); return;
    }
    storage.setChild(this.data.child);
    // 按孩子实际年龄开放可用内容；已有进度不会因修改生日而被锁回去。
    const target = app.bandKeyByAge(this.data.child.birthday);
    const targetBand = app.globalData.bands.find(b => b.key === target);
    if (targetBand) {
      app.globalData.bands.forEach(b => {
        if (b.order <= targetBand.order) storage.unlockBand(b.key);
      });
    }
    wx.showToast({ title: '已保存', icon: 'success' });
    this.setData({ hasChild: true });
    // 保存后立即刷新等级/解锁列表/徽章/统计
    this.onShow();
  },

  goBand(e) {
    wx.navigateTo({ url: '/pages/band/band?key=' + e.currentTarget.dataset.key });
  },
  goStats() {
    wx.navigateTo({ url: '/pages/stats/stats' });
  },
  reset() {
    wx.showModal({
      title: '重置全部数据', content: '将清空孩子档案、所有进度与记录，且不可恢复。确定继续吗？',
      confirmColor: '#D32F2F', success: res => {
        if (res.confirm) {
          storage.resetAll();
          wx.showToast({ title: '已重置', icon: 'none' });
          this.onShow();
        }
      }
    });
  },

  exportData() {
    wx.setClipboardData({
      data: JSON.stringify(storage.exportAll()),
      success: () => wx.showModal({ title: '备份已复制', content: '备份文本已复制到剪贴板，请粘贴保存到安全位置。', showCancel: false })
    });
  },

  importData() {
    wx.getClipboardData({
      success: res => {
        let snapshot;
        try { snapshot = JSON.parse(res.data); }
        catch (e) { wx.showToast({ title: '备份内容无效', icon: 'none' }); return; }
        wx.showModal({
          title: '恢复本地备份',
          content: '恢复会覆盖当前档案、进度和成长记录，确定继续吗？',
          confirmColor: '#D32F2F',
          success: result => {
            if (!result.confirm) return;
            try { storage.importAll(snapshot); }
            catch (e) { wx.showToast({ title: '备份内容无效', icon: 'none' }); return; }
            wx.showToast({ title: '恢复成功', icon: 'success' });
            this.onShow();
          }
        });
      }
    });
  }
});
