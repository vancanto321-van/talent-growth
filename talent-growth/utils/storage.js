// 持久化存储：多宝宝档案、里程碑进度、成长记录、已解锁年龄段、每日打卡
// 数据按宝宝隔离：cz_<babyId>_child/_progress/_records/_unlocked/_checkins
// 所有读写均加 try/catch 保护，异常时返回默认值并告警，避免静默失败。
// 兼容迁移：首次启动检测旧版单宝宝 key（cz_child 等），自动迁移为多宝宝格式。

const K_BABIES = 'cz_babies';        // [{id, name, birthday, gender, createdAt}]
const K_ACTIVE = 'cz_active_baby';   // 当前宝宝 id
const growthProgress = require('./growth-progress');

function safeGet(key, def) {
  try {
    const v = wx.getStorageSync(key);
    return (v === '' || v === null || v === undefined) ? def : v;
  } catch (e) {
    console.warn('[storage] 读取失败', key, e);
    return def;
  }
}

function safeSet(key, val) {
  try {
    wx.setStorageSync(key, val);
    return true;
  } catch (e) {
    console.warn('[storage] 写入失败（可能超出容量）', key, e);
    return false;
  }
}

function safeRemove(key) {
  try { wx.removeStorageSync(key); } catch (e) { console.warn('[storage] 删除失败', key, e); }
}

// ---------- 宝宝列表与当前宝宝 ----------

function getBabies() { return safeGet(K_BABIES, []); }
function setBabies(b) { safeSet(K_BABIES, b || []); }

function getActiveId() {
  const babies = getBabies();
  if (!babies.length) return '';
  let id = safeGet(K_ACTIVE, '');
  if (!id || !babies.some(b => b.id === id)) id = babies[0].id;
  return id;
}
function setActiveId(id) { safeSet(K_ACTIVE, id); }

function getActiveBaby() {
  const id = getActiveId();
  return id ? getBabies().find(b => b.id === id) || null : null;
}

function babyKey(babyId, suffix) { return 'cz_' + babyId + '_' + suffix; }

// 首次使用：把旧版单宝宝数据迁移为多宝宝格式（幂等，只执行一次）
function ensureBabies() {
  if (getBabies().length) return;
  const legacyChild = safeGet('cz_child', null);
  if (legacyChild && legacyChild.name) {
    const id = 'b' + Date.now();
    setBabies([{ id, name: legacyChild.name, birthday: legacyChild.birthday || '', gender: legacyChild.gender || '男', createdAt: Date.now() }]);
    setActiveId(id);
    safeSet(babyKey(id, 'child'), legacyChild);
    const prog = safeGet('cz_progress', {});
    if (prog && Object.keys(prog).length) safeSet(babyKey(id, 'progress'), prog);
    const recs = safeGet('cz_records', []);
    if (recs && recs.length) safeSet(babyKey(id, 'records'), recs);
    const un = safeGet('cz_unlocked', []);
    safeSet(babyKey(id, 'unlocked'), un && un.length ? un : ['b0']);
    safeRemove('cz_child'); safeRemove('cz_progress'); safeRemove('cz_records'); safeRemove('cz_unlocked');
  }
}

// 新增宝宝并切换为当前宝宝
function addBaby(info) {
  ensureBabies();
  const babies = getBabies();
  const id = 'b' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  const baby = {
    id, name: (info && info.name) || '宝贝',
    birthday: (info && info.birthday) || '', gender: (info && info.gender) || '男',
    createdAt: Date.now()
  };
  babies.push(baby);
  setBabies(babies);
  setActiveId(id);
  safeSet(babyKey(id, 'child'), { name: baby.name, birthday: baby.birthday, gender: baby.gender });
  safeSet(babyKey(id, 'unlocked'), ['b0']);
  return baby;
}

// 更新宝宝档案（同步宝宝列表与 child 记录）
function updateBaby(id, patch) {
  const babies = getBabies().map(b => b.id === id ? Object.assign({}, b, patch) : b);
  setBabies(babies);
  const c = safeGet(babyKey(id, 'child'), {}) || {};
  safeSet(babyKey(id, 'child'), Object.assign({}, c, patch));
}

function switchBaby(id) {
  if (!getBabies().some(b => b.id === id)) return false;
  setActiveId(id);
  return true;
}

// 删除宝宝（连同其全部数据）
function removeBaby(id) {
  const babies = getBabies().filter(b => b.id !== id);
  setBabies(babies);
  ['child', 'progress', 'records', 'unlocked', 'checkins'].forEach(s => safeRemove(babyKey(id, s)));
  if (getActiveId() === id) setActiveId(babies.length ? babies[0].id : '');
  return true;
}

// ---------- 孩子档案 ----------

function getChild() {
  ensureBabies();
  const id = getActiveId();
  return id ? safeGet(babyKey(id, 'child'), null) : null;
}
function setChild(c) {
  ensureBabies();
  let id = getActiveId();
  if (!id) { addBaby(c || {}); return; }
  safeSet(babyKey(id, 'child'), c || {});
  updateBaby(id, { name: (c || {}).name || '宝贝', birthday: (c || {}).birthday || '', gender: (c || {}).gender || '男' });
}

// ---------- 里程碑进度 ----------

function getProgress() {
  ensureBabies();
  const id = getActiveId();
  return id ? safeGet(babyKey(id, 'progress'), {}) : {};
}
function setProgress(p) {
  const id = getActiveId();
  return id ? safeSet(babyKey(id, 'progress'), p || {}) : false;
}
function setStatus(mid, status, note) {
  const p = getProgress();
  const cur = p[mid] || {};
  const entry = Object.assign({}, cur, { status: status || '', date: Date.now(), note: typeof note === 'string' ? note : (cur.note || '') });
  const hasDirections = Object.keys(growthProgress.normalizeLevels(entry.directionLevels)).length || (Array.isArray(entry.directions) && entry.directions.length);
  if (entry.status || entry.note || hasDirections) p[mid] = entry;
  else delete p[mid];
  return setProgress(p);
}
// 仅保存观察备注：不改变状态，也不产生经验；无状态时创建空状态条目以承载备注
function setNote(mid, note) {
  const p = getProgress();
  const cur = p[mid];
  if (note) {
    p[mid] = Object.assign({}, cur, { status: cur ? cur.status : '', date: cur ? cur.date : Date.now(), note });
  } else if (cur) {
    cur.note = '';
    p[mid] = cur;
  }
  return setProgress(p);
}
function getStatus(mid) {
  const p = getProgress();
  return p[mid] || null;
}
function setDirectionProgress(mid, directions) {
  const p = getProgress();
  const cur = p[mid] || { status: '', date: Date.now(), note: '' };
  cur.directions = Array.isArray(directions) ? directions.filter(i => Number.isInteger(i) && i >= 0 && i < 32) : [];
  p[mid] = cur;
  return setProgress(p);
}
function setDirectionLevels(mid, levels) {
  const p = getProgress();
  const cur = p[mid] || { status: '', date: Date.now(), note: '' };
  p[mid] = Object.assign({}, cur, { directionLevels: growthProgress.normalizeLevels(levels) });
  return setProgress(p);
}

// ---------- 成长记录 ----------

function getRecords() {
  ensureBabies();
  const id = getActiveId();
  return id ? safeGet(babyKey(id, 'records'), []) : [];
}
function setRecords(r) {
  const id = getActiveId();
  if (id) safeSet(babyKey(id, 'records'), r || []);
}
function addRecord(rec) {
  const r = getRecords();
  rec.id = 'r' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  rec.date = Date.now();
  r.unshift(rec);
  setRecords(r);
  return rec;
}
function deleteRecord(id) {
  const r = getRecords().filter(x => x.id !== id);
  setRecords(r);
}

// ---------- 已解锁年龄段 ----------

function getUnlocked() {
  ensureBabies();
  const id = getActiveId();
  if (!id) return ['b0'];
  let u = safeGet(babyKey(id, 'unlocked'), []);
  if (!u || !u.length) u = ['b0'];
  if (u.indexOf('b0') < 0) { u.unshift('b0'); safeSet(babyKey(id, 'unlocked'), u); }
  return u;
}
function setUnlocked(u) {
  const id = getActiveId();
  if (id) safeSet(babyKey(id, 'unlocked'), u || ['b0']);
}
function unlockBand(key) {
  const u = getUnlocked();
  if (u.indexOf(key) < 0) { u.push(key); setUnlocked(u); return true; }
  return false;
}

// ---------- 每日打卡 ----------

// 打卡数据：[{date:'YYYY-MM-DD', milestoneIds:[], note}] 按日期升序
function getCheckins() {
  ensureBabies();
  const id = getActiveId();
  return id ? safeGet(babyKey(id, 'checkins'), []) : [];
}
function getCheckinOfDate(dateStr) {
  const list = getCheckins();
  return list.find(c => c.date === dateStr) || null;
}
// 打卡：dateStr 为 'YYYY-MM-DD'，milestoneIds 为本次勾选的里程碑
function saveCheckin(dateStr, milestoneIds, note) {
  const id = getActiveId();
  if (!id) return null;
  const list = getCheckins();
  const idx = list.findIndex(c => c.date === dateStr);
  const entry = { date: dateStr, milestoneIds: milestoneIds || [], note: note || '' };
  if (idx >= 0) list[idx] = entry; else list.push(entry);
  list.sort((a, b) => (a.date < b.date ? -1 : 1));
  safeSet(babyKey(id, 'checkins'), list);
  return entry;
}
// 连续打卡天数（截至某日期，缺任意一天即中断）
function streakDays(dateStr) {
  const list = getCheckins();
  const daySet = {};
  list.forEach(c => { daySet[c.date] = true; });
  const d = new Date(dateStr.replace(/-/g, '/'));
  let streak = 0;
  while (true) {
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    if (daySet[key]) { streak++; d.setDate(d.getDate() - 1); } else break;
  }
  return streak;
}

// ---------- 备份与恢复 ----------

function clearAllData() {
  const babies = getBabies();
  babies.forEach(b => {
    ['child', 'progress', 'records', 'unlocked', 'checkins'].forEach(s => safeRemove(babyKey(b.id, s)));
  });
  safeRemove(K_BABIES);
  safeRemove(K_ACTIVE);
  // 旧版 key 一并清理
  safeRemove('cz_child'); safeRemove('cz_progress'); safeRemove('cz_records'); safeRemove('cz_unlocked');
}

// 导出全量备份（多宝宝 v2 格式）
function exportAll() {
  const babies = getBabies();
  const data = {};
  babies.forEach(b => {
    data[b.id] = {
      child: safeGet(babyKey(b.id, 'child'), null),
      progress: safeGet(babyKey(b.id, 'progress'), {}),
      records: safeGet(babyKey(b.id, 'records'), []),
      unlocked: safeGet(babyKey(b.id, 'unlocked'), ['b0']),
      checkins: safeGet(babyKey(b.id, 'checkins'), [])
    };
  });
  return { version: 2, exportedAt: Date.now(), babies, activeId: getActiveId(), data };
}

// 恢复备份：兼容 v1（旧单宝宝）与 v2（多宝宝）
function importAll(snapshot) {
  if (!snapshot) throw new Error('备份内容无效');
  if (snapshot.version === 1) {
    if (snapshot.child && typeof snapshot.child !== 'object') throw new Error('孩子档案格式不正确');
    if (!snapshot.progress || typeof snapshot.progress !== 'object' || Array.isArray(snapshot.progress)) throw new Error('里程碑数据格式不正确');
    if (!Array.isArray(snapshot.records) || !Array.isArray(snapshot.unlocked)) throw new Error('备份数据不完整');
    clearAllData();
    const baby = addBaby(snapshot.child || {});
    safeSet(babyKey(baby.id, 'progress'), snapshot.progress);
    safeSet(babyKey(baby.id, 'records'), snapshot.records);
    safeSet(babyKey(baby.id, 'unlocked'), snapshot.unlocked.length ? snapshot.unlocked : ['b0']);
    return;
  }
  if (snapshot.version !== 2) throw new Error('备份版本不支持');
  if (!Array.isArray(snapshot.babies) || !snapshot.data || typeof snapshot.data !== 'object') throw new Error('备份数据不完整');
  snapshot.babies.forEach(b => {
    const d = snapshot.data[b.id];
    if (!d || typeof d.progress !== 'object' || !Array.isArray(d.records) || !Array.isArray(d.unlocked) || !Array.isArray(d.checkins)) {
      throw new Error('备份数据不完整');
    }
  });
  clearAllData();
  setBabies(snapshot.babies);
  setActiveId(snapshot.babies.some(b => b.id === snapshot.activeId) ? snapshot.activeId : snapshot.babies[0].id);
  snapshot.babies.forEach(b => {
    const d = snapshot.data[b.id];
    safeSet(babyKey(b.id, 'child'), d.child || {});
    safeSet(babyKey(b.id, 'progress'), d.progress);
    safeSet(babyKey(b.id, 'records'), d.records);
    safeSet(babyKey(b.id, 'unlocked'), d.unlocked.length ? d.unlocked : ['b0']);
    safeSet(babyKey(b.id, 'checkins'), d.checkins);
  });
}

function resetAll() { clearAllData(); }

module.exports = {
  // 宝宝管理
  getBabies, getActiveId, getActiveBaby, addBaby, updateBaby, switchBaby, removeBaby,
  // 档案与进度
  getChild, setChild,
  getProgress, setProgress, setStatus, setNote, getStatus, setDirectionProgress, setDirectionLevels,
  getRecords, setRecords, addRecord, deleteRecord,
  getUnlocked, setUnlocked, unlockBand,
  // 打卡
  getCheckins, getCheckinOfDate, saveCheckin, streakDays,
  // 备份
  exportAll, importAll, resetAll
};
