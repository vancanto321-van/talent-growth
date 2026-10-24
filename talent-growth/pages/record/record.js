const storage = require('../../utils/storage');
const gamify = require('../../utils/gamify');

Page({
  data: {
    records: [],     // 扁平列表（含 _i 全局索引，供图片预览定位）
    groups: [],      // 按日分组 [{day, dateText, items:[]}]
    showForm: false,
    text: '',
    photos: [],
    // 打卡
    showCheckin: false,
    checkinDate: '',
    checkinItems: [],   // 推荐里程碑 [{id, title, domain}]
    checkedMap: {},     // {milestoneId: true}
    checkinNote: '',
    todayChecked: false,
    checkinStreak: 0
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const records = storage.getRecords().map((r, i) => ({
      ...r,
      _i: i,
      timeText: this.fmtTime(r.date),
      bandLabel: this.bandLabelOf(r.milestoneId)
    }));
    // 按日分组（记录本身已按时间倒序，直接顺序归组即可）
    const groups = [];
    const byDay = {};
    records.forEach(r => {
      const day = this.dayKey(r.date);
      if (!byDay[day]) {
        byDay[day] = { day, dateText: this.dayLabel(r.date), items: [] };
        groups.push(byDay[day]);
      }
      byDay[day].items.push(r);
    });
    const today = this.todayStr();
    this.setData({
      records, groups,
      todayChecked: !!storage.getCheckinOfDate(today),
      checkinStreak: storage.streakDays(today)
    });
  },

  // ---------- 每日打卡 ----------
  todayStr() {
    const d = new Date();
    const p = n => (n < 10 ? '0' + n : n);
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  },

  openCheckin() {
    const app = getApp();
    const child = storage.getChild();
    const date = this.todayStr();
    const existing = storage.getCheckinOfDate(date);
    const selected = {};
    if (existing) (existing.milestoneIds || []).forEach(id => { selected[id] = true; });

    // 推荐：当前年龄段未达标的里程碑（最多 6 条）
    let items = [];
    if (child && child.birthday) {
      const key = app.bandKeyByAge(child.birthday);
      const progress = storage.getProgress();
      items = app.milestonesOfBand(key)
        .filter(m => (progress[m.id] || {}).status !== 'achieved')
        .slice(0, 6)
        .map(m => ({ id: m.id, title: m.title, domain: m.domain }));
    }
    this.setData({
      showCheckin: true,
      checkinDate: date,
      checkinItems: items,
      checkedMap: selected,
      checkinNote: existing ? (existing.note || '') : ''
    });
  },
  closeCheckin() { this.setData({ showCheckin: false }); },
  toggleCheckinItem(e) {
    const id = e.currentTarget.dataset.id;
    const map = Object.assign({}, this.data.checkedMap);
    if (map[id]) delete map[id]; else map[id] = true;
    this.setData({ checkedMap: map });
  },
  onCheckinNote(e) { this.setData({ checkinNote: e.detail.value }); },
  saveCheckin() {
    const ids = Object.keys(this.data.checkedMap);
    storage.saveCheckin(this.data.checkinDate, ids, this.data.checkinNote || '');
    // 同一天只记一条打卡记录（防重复加经验）
    const already = storage.getRecords().some(r => r.checkinDate === this.data.checkinDate);
    if (!already) {
      storage.addRecord({
        text: '📅 每日打卡：完成 ' + (ids.length || 0) + ' 项观察' + (this.data.checkinNote ? '（' + this.data.checkinNote + '）' : ''),
        photos: [],
        milestoneId: '',
        milestoneTitle: '',
        checkinDate: this.data.checkinDate
      });
    }
    wx.showToast({ title: '打卡成功 +' + gamify.XP_PER_RECORD + ' 经验', icon: 'none' });
    this.setData({ showCheckin: false });
    this.refresh();
  },

  fmtTime(ts) {
    const d = new Date(ts);
    const p = n => (n < 10 ? '0' + n : n);
    return p(d.getHours()) + ':' + p(d.getMinutes());
  },
  dayKey(ts) {
    const d = new Date(ts);
    const p = n => (n < 10 ? '0' + n : n);
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  },
  dayLabel(ts) {
    const d = new Date(ts);
    const key = this.dayKey(ts);
    const now = Date.now();
    if (key === this.dayKey(now)) return '今天';
    if (key === this.dayKey(now - 86400000)) return '昨天';
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
  },
  bandLabelOf(mid) {
    if (!mid) return '';
    const app = getApp();
    const m = app.findMilestone(mid);
    return m ? m.bandLabel : '';
  },

  openForm() { this.setData({ showForm: true, text: '', photos: [] }); },
  closeForm() { this.setData({ showForm: false }); },
  noop() {},
  onTextInput(e) { this.setData({ text: e.detail.value }); },

  savePhoto(tempFilePath) {
    return new Promise((resolve, reject) => {
      wx.saveFile({ tempFilePath, success: res => resolve(res.savedFilePath), fail: reject });
    });
  },

  choosePhoto() {
    wx.chooseMedia({
      count: 9 - this.data.photos.length,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: async res => {
        try {
          const saved = await Promise.all(res.tempFiles.map(f => this.savePhoto(f.tempFilePath)));
          this.setData({ photos: this.data.photos.concat(saved) });
        } catch (e) {
          wx.showToast({ title: '照片保存失败，请重试', icon: 'none' });
        }
      }
    });
  },
  removePhoto(e) {
    const i = e.currentTarget.dataset.i;
    const photos = this.data.photos.slice();
    const removed = photos.splice(i, 1)[0];
    this.setData({ photos });
    // 尽力清理保存的文件，路径格式不符或清理失败均静默忽略
    if (removed) wx.removeSavedFile({ filePath: removed, fail: () => {} });
  },

  save() {
    if (!this.data.text && !this.data.photos.length) {
      wx.showToast({ title: '写点什么或加张图吧', icon: 'none' }); return;
    }
    storage.addRecord({ text: this.data.text, photos: this.data.photos, milestoneId: '', milestoneTitle: '' });
    wx.showToast({ title: '+' + gamify.XP_PER_RECORD + ' 经验', icon: 'none' });
    this.setData({ showForm: false, text: '', photos: [] });
    this.refresh();
  },

  previewPhoto(e) {
    wx.previewImage({ current: e.currentTarget.dataset.src, urls: this.data.photos });
  },
  previewItemPhoto(e) {
    const { src, rid } = e.currentTarget.dataset;
    const rec = this.data.records[rid];
    wx.previewImage({ current: src, urls: rec.photos });
  },

  del(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除记录', content: '确定删除这条成长记录吗？', success: res => {
        if (res.confirm) {
          const record = this.data.records.find(x => x.id === id);
          storage.deleteRecord(id);
          if (record && record.photos) record.photos.forEach(filePath => {
            wx.removeSavedFile({ filePath, fail: () => {} });
          });
          this.refresh();
        }
      }
    });
  }
});
