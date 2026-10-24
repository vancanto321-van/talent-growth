const app = getApp();
const storage = require('../../utils/storage');
const gamify = require('../../utils/gamify');
const growthProgress = require('../../utils/growth-progress');

Page({
  data: {
    m: null,
    status: '',          // '' | observed | achieved
    showNote: false,
    noteText: '',
    bandKey: '',
    directions: [],
    batteryPercent: 0,
    batteryText: '电量待积累',
    showIntro: false,
    completedDirections: 0,
    directionStages: [{level:0,label:'未开始'},{level:1,label:'试过了'},{level:2,label:'练习中'},{level:3,label:'接近完成'},{level:4,label:'已完成'}]
  },

  onLoad(opts) {
    const m = app.findMilestone(opts.id);
    if (!m) { wx.showToast({ title: '未找到', icon: 'none' }); return; }
    const st = storage.getStatus(m.id);
    const summary = growthProgress.progressOf(m, st);
    this.setData({
      m,
      bandKey: m.band,
      status: st ? st.status : '',
      noteText: st ? (st.note || '') : '',
      directions: summary.directions,
      completedDirections: summary.completed,
      batteryPercent: summary.percent,
      batteryText: summary.percent === 100 ? '满电啦 ✨' : summary.percent ? '慢慢充电中' : '从一次尝试开始'
    });
    wx.setNavigationBarTitle({ title: m.title });
  },

  setDirectionStage(e) {
    const id = e.currentTarget.dataset.id;
    const level = Number(e.currentTarget.dataset.level);
    if (!this.data.directions.some(d => d.id === id) || !Number.isInteger(level) || level < 0 || level > 4) return;
    const levels = {};
    this.data.directions.forEach(d => { levels[d.id] = d.id === id ? level : d.level; });
    if (!storage.setDirectionLevels(this.data.m.id, levels)) { wx.showToast({ title: '保存失败，请稍后再试', icon: 'none' }); return; }
    const summary = growthProgress.progressOf(this.data.m, { directionLevels: levels });
    this.setData({ directions: summary.directions, completedDirections: summary.completed, batteryPercent: summary.percent, batteryText: summary.percent === 100 ? '满电啦 ✨' : summary.percent ? '慢慢充电中' : '从一次尝试开始' });
  },
  toggleIntro() { this.setData({ showIntro: !this.data.showIntro }); },

  toggleStatus(e) {
    const target = e.currentTarget.dataset.s; // observed | achieved
    const m = this.data.m;
    const newStatus = this.data.status === target ? '' : target;

    // 取消状态会减少经验，需确认
    if (!newStatus && this.data.status) {
      wx.showModal({
        title: '取消' + (this.data.status === 'achieved' ? '达标' : '观察'),
        content: '将撤销该状态，对应经验会相应减少，确定吗？',
        confirmColor: '#D32F2F',
        success: res => { if (res.confirm) this.applyStatus(m, newStatus); }
      });
      return;
    }
    this.applyStatus(m, newStatus);
  },

  applyStatus(m, newStatus) {
    if (!storage.setStatus(m.id, newStatus, this.data.noteText)) { wx.showToast({ title: '保存失败，请稍后再试', icon: 'none' }); return; }
    this.setData({ status: newStatus });

    if (newStatus === 'achieved') {
      const xp = gamify.XP_PER_ACHIEVED;
      wx.showToast({ title: '+' + xp + ' 经验！达标 🎉', icon: 'none' });
      this.checkUnlock();
    } else if (newStatus === 'observed') {
      wx.showToast({ title: '+' + gamify.XP_PER_OBSERVED + ' 经验', icon: 'none' });
    } else {
      wx.showToast({ title: '已取消', icon: 'none' });
    }
  },

  checkUnlock() {
    const next = gamify.tryUnlockNext(this.data.bandKey, app);
    if (next) {
      const nb = app.globalData.bands.find(b => b.key === next);
      wx.showModal({
        title: '🎉 解锁新关卡！',
        content: '恭喜完成本阶段目标，已解锁下一关卡：' + (nb ? nb.label + ' · ' + nb.stage : next),
        showCancel: false,
        confirmText: '太棒了'
      });
    }
  },

  openNote() { this.setData({ showNote: !this.data.showNote }); },
  onNoteInput(e) { this.setData({ noteText: e.detail.value }); },
  saveNote() {
    // 只保存备注，不隐式改变状态、不产生经验
    if (!storage.setNote(this.data.m.id, this.data.noteText)) { wx.showToast({ title: '保存失败，请稍后再试', icon: 'none' }); return; }
    this.setData({ showNote: false });
    wx.showToast({ title: '已保存', icon: 'success' });
  },

  recordMoment() {
    const m = this.data.m;
    // 按实际状态生成文案，避免未达标也写「里程碑达标」
    const prefix = this.data.status === 'achieved' ? '里程碑达标'
      : (this.data.status === 'observed' ? '观察里程碑' : '记录了里程碑');
    storage.addRecord({
      text: prefix + '：' + m.title + (this.data.noteText ? '（' + this.data.noteText + '）' : ''),
      photos: [],
      milestoneId: m.id,
      milestoneTitle: m.title
    });
    wx.showToast({ title: '+' + gamify.XP_PER_RECORD + ' 经验，已记入成长', icon: 'none' });
  }
});
