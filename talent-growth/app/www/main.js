import growthProgress from './growth-progress.js';
import { mountTalent } from './talent-ui.js';

const { directionsOf, normalizeLevels, progressOf } = growthProgress;
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const appRoot = $('#app');
const STORAGE_KEY = 'child-growth-app-v2';
const LEGACY_KEY = 'child-growth-app-v1';
const MAX_BABIES = 12;
const MAX_RECORDS = 5000;
const MAX_BACKUP_BYTES = 10 * 1024 * 1024;
const BAND_YEARS = {
  b0: ['0岁（0-12个月）'],
  b1: ['1岁（12-24个月）', '2岁（24-36个月）'],
  b2: ['3岁'],
  b3: ['4岁'],
  b4: ['5岁'],
  b5: ['6岁', '7岁', '8岁']
};

const state = {
  data: null,
  tab: window.__TAURI_INTERNALS__ ? 'landing' : (window.location.hostname === 'localhost' && window.location.pathname === '/' && localStorage.getItem(STORAGE_KEY)) ? 'talent' : 'landing',
  bandKey: 'b0',
  bandSection: 'milestones',
  domainIndex: 0,
  cardIndex: 0,
  query: '',
  detailId: '',
  noteDraft: null,
  composerOpen: false,
  draftText: '',
  draftDate: localDateKey(),
  draftMilestoneId: '',
  draftPhotoIds: [],
  profileMode: 'edit',
  legalPage: '',
  objectUrls: []
};

let talentController = null;

function uid(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function emptyProfile() {
  return { progress: {}, records: [], checkins: [], unlocked: ['b0'] };
}

function cleanText(value, maxLength) {
  return typeof value === 'string' ? value.slice(0, maxLength) : '';
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function validDateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.getTime()) && localDateKey(date) === value ? value : '';
}

function minimumBirthday() {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 9);
  date.setDate(date.getDate() + 1);
  return localDateKey(date);
}

function safeIdentifier(value, prefix) {
  const candidate = cleanText(value, 120);
  return candidate && /^[A-Za-z0-9_\-\u3400-\u9fff]+$/.test(candidate) ? candidate : uid(prefix);
}

function normalizeProfile(value, { includePhotos = true } = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const progress = {};
  for (const [rawId, rawEntry] of Object.entries(source.progress || {}).slice(0, 2000)) {
    const id = safeIdentifier(rawId, 'milestone');
    const entry = rawEntry && typeof rawEntry === 'object' ? rawEntry : {};
    const status = entry.status === 'achieved' || entry.status === 'observed' ? entry.status : '';
    const note = cleanText(entry.note, 2000).trim();
    const rawLevels = entry.directionLevels !== undefined ? entry.directionLevels : entry.directions;
    const directionLevels = normalizeLevels(rawLevels);
    const legacyDirections = Array.isArray(entry.directions)
      ? [...new Set(entry.directions.map(Number).filter(index => Number.isInteger(index) && index >= 0 && index < 32))].slice(0, 32)
      : [];
    if (!status && !note && !Object.keys(directionLevels).length && !legacyDirections.length) continue;
    const date = Number(entry.date);
    progress[id] = {
      status,
      note,
      date: Number.isFinite(date) && date > 0 ? date : Date.now(),
      ...(Object.keys(directionLevels).length ? { directionLevels } : {}),
      ...(Object.keys(directionLevels).length || !legacyDirections.length ? {} : { directions: legacyDirections })
    };
  }

  const records = (Array.isArray(source.records) ? source.records : []).slice(0, MAX_RECORDS).flatMap(rawRecord => {
    if (!rawRecord || typeof rawRecord !== 'object') return [];
    let text = cleanText(rawRecord.text, 5000).trim();
    const rawPhotos = Array.isArray(rawRecord.photos) ? rawRecord.photos : [];
    const photos = includePhotos && Array.isArray(rawRecord.photos)
      ? [...new Set(rawPhotos
        .map(id => cleanText(id, 120))
        .filter(id => /^photo_[A-Za-z0-9_-]+$/.test(id)))].slice(0, 6)
      : [];
    if (!includePhotos && !text && rawPhotos.length) text = '（这条记录原本只有照片，照片未包含在备份中）';
    if (!text && !photos.length) return [];
    const rawDate = Number(rawRecord.date);
    const milestoneId = rawRecord.milestoneId ? safeIdentifier(rawRecord.milestoneId, 'milestone') : '';
    return [{
      id: safeIdentifier(rawRecord.id, 'record'),
      text,
      date: Number.isFinite(rawDate) && rawDate > 0 ? rawDate : Date.now(),
      photos,
      milestoneId,
      milestoneTitle: cleanText(rawRecord.milestoneTitle, 200)
    }];
  });

  const checkins = [...new Set((Array.isArray(source.checkins) ? source.checkins : [])
    .map(validDateKey)
    .filter(Boolean))].slice(0, 5000);
  const unlocked = [...new Set((Array.isArray(source.unlocked) ? source.unlocked : [])
    .filter(key => /^b[0-5]$/.test(key)))];
  if (!unlocked.includes('b0')) unlocked.unshift('b0');
  unlocked.sort();
  return { progress, records, checkins, unlocked };
}

function normalizeDatabase(value, options = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const sourceProfiles = source.profiles && typeof source.profiles === 'object' && !Array.isArray(source.profiles)
    ? source.profiles
    : {};
  const babies = [];
  const profiles = {};
  const idMap = new Map();
  const usedIds = new Set();

  for (const rawBaby of (Array.isArray(source.babies) ? source.babies : []).slice(0, MAX_BABIES)) {
    if (!rawBaby || typeof rawBaby !== 'object') continue;
    const name = cleanText(rawBaby.name, 20).trim();
    const birthday = validDateKey(rawBaby.birthday);
    if (!name || !birthday || birthday > localDateKey()) continue;
    const oldId = cleanText(rawBaby.id, 120);
    if (oldId && idMap.has(oldId)) continue;
    let id = safeIdentifier(oldId, 'baby');
    while (usedIds.has(id)) id = uid('baby');
    usedIds.add(id);
    if (oldId) idMap.set(oldId, id);
    const createdAt = Number(rawBaby.createdAt);
    babies.push({
      id,
      name,
      birthday,
      gender: rawBaby.gender === '女' ? '女' : '男',
      createdAt: Number.isFinite(createdAt) && createdAt > 0 ? createdAt : Date.now()
    });
    profiles[id] = normalizeProfile(sourceProfiles[oldId], options);
  }

  const mappedActiveId = idMap.get(cleanText(source.activeBabyId, 120));
  return {
    version: 2,
    babies,
    activeBabyId: mappedActiveId && profiles[mappedActiveId] ? mappedActiveId : babies[0]?.id || '',
    profiles
  };
}

// When stored data cannot be read, keep the original text and block automatic
// writes so an empty database never silently replaces a family's records.
let storageReadFailure = false;

function preserveUnreadableData(key, text) {
  try {
    localStorage.setItem(`${key}-unreadable-${Date.now()}`, text);
  } catch (error) {
    console.warn('无法另存读取失败的数据', error);
  }
}

function loadDatabase() {
  let raw = null;
  let storedText = null;
  try {
    storedText = localStorage.getItem(STORAGE_KEY);
    raw = JSON.parse(storedText || 'null');
  } catch (error) {
    console.warn('本地数据读取失败', error);
    if (storedText) preserveUnreadableData(STORAGE_KEY, storedText);
    storageReadFailure = true;
    return { version: 2, babies: [], activeBabyId: '', profiles: {} };
  }
  if (raw?.version === 2 && Array.isArray(raw.babies) && raw.profiles) {
    const normalized = normalizeDatabase(raw);
    // If normalization changed the data (e.g., sanitized malicious IDs),
    // write it back once. This protects against XSS but doesn't overwrite
    // on read failure or empty state.
    const before = JSON.stringify(raw);
    const after = JSON.stringify(normalized);
    if (before !== after) {
      try {
        localStorage.setItem(STORAGE_KEY, after);
      } catch (error) {
        console.warn('规范化后写回失败', error);
      }
    }
    return normalized;
  }
  if (storedText !== null) {
    // Present but in an unexpected shape: keep it rather than overwrite it.
    preserveUnreadableData(STORAGE_KEY, storedText);
    storageReadFailure = true;
    return { version: 2, babies: [], activeBabyId: '', profiles: {} };
  }

  let legacy = null;
  try {
    legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null');
  } catch (error) {
    console.warn('旧版数据读取失败', error);
  }
  if (legacy?.child?.name) {
    const id = uid('baby');
    return normalizeDatabase({
      version: 2,
      babies: [{ id, ...legacy.child, createdAt: Date.now() }],
      activeBabyId: id,
      profiles: {
        [id]: {
          progress: legacy.progress || {},
          records: legacy.records || [],
          checkins: legacy.checkins || [],
          unlocked: legacy.unlocked?.length ? legacy.unlocked : ['b0']
        }
      }
    });
  }
  return { version: 2, babies: [], activeBabyId: '', profiles: {} };
}

const db = loadDatabase();

function persist() {
  if (storageReadFailure) {
    console.warn('读取失败后禁止自动写入，防止覆盖原数据');
    showToast('本地档案读取异常，已暂停保存以保护原数据，请先恢复备份');
    return false;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    return true;
  } catch (error) {
    console.error('本地数据保存失败', error);
    showToast('设备存储空间不足，请先导出备份');
    return false;
  }
}

// Modify db in memory and persist; rollback the entire db on failure.
// Returns true if the change was persisted, false if rolled back.
function commit(mutator) {
  const snapshot = JSON.parse(JSON.stringify(db));
  try {
    mutator();
    if (persist()) return true;
    Object.assign(db, snapshot);
    return false;
  } catch (error) {
    console.error('commit 失败', error);
    Object.assign(db, snapshot);
    showToast('保存失败，已回滚');
    return false;
  }
}

function activeBaby() {
  return db.babies.find(baby => baby.id === db.activeBabyId) || null;
}

function profileOf(babyId = db.activeBabyId) {
  if (!babyId) return emptyProfile();
  if (!db.profiles[babyId]) db.profiles[babyId] = emptyProfile();
  return db.profiles[babyId];
}

function bands() {
  return state.data?.milestones?.bands || [];
}

function bandOf(key) {
  return bands().find(item => item.key === key) || bands()[0];
}

function allMilestones(key) {
  return bandOf(key)?.domains.flatMap(domain => domain.items) || [];
}

function cloneProgressEntry(entry) {
  if (!entry) return null;
  return {
    ...entry,
    ...(entry.directionLevels ? { directionLevels: { ...entry.directionLevels } } : {})
  };
}

function saveProgressEntry(milestoneId, nextEntry) {
  const profile = profileOf();
  const previous = cloneProgressEntry(profile.progress[milestoneId]);
  if (nextEntry && (nextEntry.status || nextEntry.note || Object.keys(nextEntry.directionLevels || {}).length)) {
    profile.progress[milestoneId] = nextEntry;
  } else {
    delete profile.progress[milestoneId];
  }
  if (persist()) return true;
  if (previous) profile.progress[milestoneId] = previous;
  else delete profile.progress[milestoneId];
  showToast('保存失败，已恢复上一状态');
  return false;
}

function directionProgress(item, entry = profileOf().progress[item.id]) {
  return progressOf(item, entry || {});
}

function directionLevelsFor(item, entry) {
  const levels = {};
  directionProgress(item, entry).directions.forEach(direction => {
    if (direction.level > 0) levels[direction.id] = direction.level;
  });
  return normalizeLevels(levels);
}

function progressEntryFor(item, entry, patch = {}) {
  const source = entry || {};
  const { directions, ...rest } = source;
  const levels = directionLevelsFor(item, source);
  return {
    ...rest,
    ...patch,
    ...(!Object.prototype.hasOwnProperty.call(patch, 'directionLevels') && Object.keys(levels).length ? { directionLevels: levels } : {})
  };
}

function findMilestone(id) {
  for (const band of bands()) {
    for (const domain of band.domains) {
      const milestone = domain.items.find(item => item.id === id);
      if (milestone) return { ...milestone, bandKey: band.key, bandLabel: band.label };
    }
  }
  return null;
}

function exactAge(birthday) {
  if (!birthday) return null;
  const birth = new Date(`${birthday}T00:00:00`);
  const now = new Date();
  if (Number.isNaN(birth.getTime()) || birth > now) return null;
  let years = now.getFullYear() - birth.getFullYear();
  let months = now.getMonth() - birth.getMonth();
  if (now.getDate() < birth.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return { years, months };
}

function ageText(birthday) {
  const age = exactAge(birthday);
  if (!age) return '还未设置生日';
  if (age.years < 1) return age.months ? `${age.months}个月` : '不满1个月';
  return `${age.years}岁${age.months ? `${age.months}个月` : ''}`;
}

function ageBandKey(birthday) {
  const age = exactAge(birthday);
  const years = age?.years || 0;
  if (years < 1) return 'b0';
  if (years < 3) return 'b1';
  if (years < 4) return 'b2';
  if (years < 5) return 'b3';
  if (years < 6) return 'b4';
  return 'b5';
}

function unlockForAge(birthday, profile = profileOf()) {
  const target = bandOf(ageBandKey(birthday));
  if (!target) return;
  for (const band of bands()) {
    if (band.order <= target.order && !profile.unlocked.includes(band.key)) {
      profile.unlocked.push(band.key);
    }
  }
  profile.unlocked.sort((a, b) => bandOf(a).order - bandOf(b).order);
}

function currentBandKey() {
  const baby = activeBaby();
  if (!baby) return 'b0';
  const profile = profileOf();
  unlockForAge(baby.birthday, profile);
  const ageKey = ageBandKey(baby.birthday);
  if (profile.unlocked.includes(ageKey)) return ageKey;
  return profile.unlocked[profile.unlocked.length - 1] || 'b0';
}

function bandProgress(key) {
  const profile = profileOf();
  const items = allMilestones(key);
  const achieved = items.filter(item => profile.progress[item.id]?.status === 'achieved').length;
  const observed = items.filter(item => profile.progress[item.id]?.status === 'observed').length;
  return {
    achieved,
    observed,
    total: items.length,
    percent: items.length ? Math.round((achieved / items.length) * 100) : 0
  };
}

function totalXp() {
  const profile = profileOf();
  const progressXp = Object.values(profile.progress).reduce((sum, item) => {
    if (item.status === 'achieved') return sum + 50;
    if (item.status === 'observed') return sum + 10;
    return sum;
  }, 0);
  return progressXp + profile.records.length * 5 + profile.checkins.length * 2;
}

function levelInfo() {
  const levels = [
    [0, '萌新爸妈', '🌱'], [200, '入门爸妈', '🌿'], [500, '熟练爸妈', '⭐'],
    [1000, '资深爸妈', '🌟'], [1800, '达人爸妈', '🏅'], [2800, '高手爸妈', '🏆'],
    [4000, '专家爸妈', '💎'], [6000, '传奇爸妈', '👑']
  ];
  const xp = totalXp();
  let index = 0;
  levels.forEach((level, current) => { if (xp >= level[0]) index = current; });
  const current = levels[index];
  const next = levels[index + 1];
  return {
    xp,
    level: index + 1,
    title: current[1],
    emoji: current[2],
    nextTitle: next?.[1] || '已达满级',
    nextNeed: next ? next[0] - xp : 0,
    percent: next ? Math.min(100, Math.round(((xp - current[0]) / (next[0] - current[0])) * 100)) : 100
  };
}

function today() {
  return localDateKey();
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function formatDate(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '日期未知';
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' });
}

function cleanupObjectUrls() {
  state.objectUrls.forEach(url => URL.revokeObjectURL(url));
  state.objectUrls = [];
}

const mediaStore = {
  open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('child-growth-media', 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains('photos')) database.createObjectStore('photos');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },
  async put(blob) {
    const id = uid('photo');
    const database = await this.open();
    await new Promise((resolve, reject) => {
      const transaction = database.transaction('photos', 'readwrite');
      transaction.objectStore('photos').put(blob, id);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
    return id;
  },
  async get(id) {
    const database = await this.open();
    const result = await new Promise((resolve, reject) => {
      const request = database.transaction('photos').objectStore('photos').get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return result;
  },
  async remove(id) {
    const database = await this.open();
    await new Promise((resolve, reject) => {
      const transaction = database.transaction('photos', 'readwrite');
      transaction.objectStore('photos').delete(id);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  },
  async clear() {
    const database = await this.open();
    await new Promise((resolve, reject) => {
      const transaction = database.transaction('photos', 'readwrite');
      transaction.objectStore('photos').clear();
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  }
};

function nativePlugin(name) {
  try {
    return window.Capacitor?.Plugins?.[name] || window.Capacitor?.registerPlugin?.(name) || null;
  } catch (error) {
    console.warn(`${name} 插件不可用`, error);
    return null;
  }
}

function showToast(message) {
  $('.toast')?.remove();
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;
  document.body.appendChild(toast);
  window.requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => toast.remove(), 2300);
}

function scrollPageTop() {
  try { window.scrollTo(0, 0); } catch (error) { /* 测试环境可能没有滚动实现 */ }
}

function navigation() {
  const items = [
    ['home', '⌂', '首页'], ['band', '◇', '成长'], ['record', '＋', '记录'],
    ['stats', '▥', '统计'], ['profile', '☺', '我的']
  ];
  return `<nav class="tabbar" aria-label="主导航">${items.map(([key, icon, label]) => `
    <button class="${state.tab === key ? 'active' : ''}" data-tab="${key}" aria-label="${label}" ${state.tab === key ? 'aria-current="page"' : ''}>
      <b>${icon}</b><span>${label}</span>
    </button>`).join('')}</nav>`;
}

function layout(content, options = {}) {
  appRoot.className = 'legacy-growth-shell';
  cleanupObjectUrls();
  const baby = activeBaby();
  appRoot.innerHTML = `
    <header class="app-header">
      <div><img class="brand-mark talent-mark" src="talent-mark.svg" alt="" /><strong>天赋生长 · 家庭成长培养</strong></div>
      <div class="header-actions"><button data-action="open-talent" class="text-button">全年龄天赋培养</button><button data-action="open-profile" class="child-pill">${baby ? `${baby.gender === '女' ? '👧' : '👦'} ${escapeHtml(baby.name)}` : '创建孩子档案'}</button></div>
    </header>
    <main id="main-content" class="${options.wide ? 'wide' : ''}">${content}</main>
    ${options.hideNav ? '' : navigation()}
    <input id="photo-picker" type="file" accept="image/*" multiple hidden />
    <input id="backup-picker" type="file" accept="application/json,.json" hidden />`;
}

function needsProfile() {
  if (activeBaby()) return false;
  layout(`
    <section class="onboarding">
      <img src="app-icon.png" alt="孩子成长" />
      <div class="eyebrow">儿童成长天赋培养</div>
      <h1>陪孩子把一颗种子，照料成自己的花园</h1>
      <p>从年龄与当下状态开始，记录一次舒适的陪伴、孩子愿意继续或想停下的信号。</p>
      <button class="primary large" data-action="open-profile">创建孩子培养档案</button>
      <small>所有数据默认保存在你的设备上</small>
    </section>`);
  return true;
}

function dailyRecommendation() {
  const key = currentBandKey();
  const profile = profileOf();
  return allMilestones(key).find(item => !profile.progress[item.id]?.status) || allMilestones(key)[0];
}

function renderHome() {
  talentController?.destroy?.();
  talentController = null;
  if (needsProfile()) return;
  const baby = activeBaby();
  const level = levelInfo();
  const key = currentBandKey();
  const band = bandOf(key);
  const progress = bandProgress(key);
  const profile = profileOf();
  const checked = profile.checkins.includes(today());
  const recommendation = dailyRecommendation();
  layout(`
    <section class="hero">
      <div class="avatar">${baby.gender === '女' ? '👧' : '👦'}</div>
      <div class="hero-copy">
        <p class="hero-kicker">${ageText(baby.birthday)} · ${level.emoji} ${level.title}</p>
        <h1>${escapeHtml(baby.name)}，今天也慢慢长大</h1>
      </div>
      <div class="xp-bar" role="progressbar" aria-label="当前等级经验进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${level.percent}"><i style="width:${level.percent}%"></i></div>
      <small>Lv.${level.level} · ${level.xp} 经验${level.nextNeed ? ` · 距「${level.nextTitle}」还差 ${level.nextNeed}` : ' · 已达满级'}</small>
    </section>

    <section class="catalog-section">
      <div class="page-heading catalog-heading"><div><div class="eyebrow">成长目录</div><h2>按年龄浏览</h2><p>从当前阶段开始，也可以提前看看后面的成长方向</p></div><span class="soft-tag">${bands().length} 个阶段</span></div>
      <div class="age-directory" aria-label="按年龄浏览成长阶段">${bands().map(item => {
        const itemProgress = bandProgress(item.key);
        const unlocked = profile.unlocked.includes(item.key);
        return `<button class="age-directory-card ${item.key === key ? 'active' : ''} ${unlocked ? '' : 'locked'}" data-action="open-band" data-band-key="${escapeHtml(item.key)}" aria-label="${escapeHtml(item.label)}${unlocked ? '' : '，尚未解锁'}">
          <span class="age-directory-icon">${['🌱', '🧸', '🎈', '🪁', '🌻', '🚀'][item.order] || '✨'}</span><b>${escapeHtml(item.label)}</b><small>${escapeHtml(item.stage)}</small>
          <span class="age-directory-meter"><i style="width:${itemProgress.percent}%"></i></span><em>${unlocked ? `${itemProgress.percent}% 已探索` : '完成上一阶段解锁'}</em>
        </button>`;
      }).join('')}</div>
    </section>

    <section class="card domain-directory">
      <div class="row-between"><div><div class="eyebrow">兴趣入口</div><h2>按领域浏览</h2></div><span class="muted">当前 ${escapeHtml(band.label)}</span></div>
      <div class="domain-directory-grid">${band.domains.map((domain, index) => `<button data-action="open-domain" data-domain-name="${escapeHtml(domain.name)}"><span>${['🏃', '🖐️', '💬', '🧩', '💛', '🍴', '🎨'][index] || '✨'}</span><b>${escapeHtml(domain.name)}</b><small>${domain.items.length} 个小目标</small></button>`).join('')}</div>
    </section>

    <section class="card stage-card" data-action="open-current-band" role="button" tabindex="0" aria-label="进入当前成长阶段：${escapeHtml(band.label)}">
      <div class="card-row">
        <div><div class="eyebrow">当前成长阶段</div><h2>${band.label} · ${band.stage}</h2></div>
        <div class="progress-ring" style="--value:${progress.percent * 3.6}deg" role="progressbar" aria-label="当前阶段达标进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress.percent}"><span>${progress.percent}%</span></div>
      </div>
      <div class="progress" role="progressbar" aria-label="当前阶段达标进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress.percent}"><i style="width:${progress.percent}%"></i></div>
      <p class="row-between"><span>已达标 ${progress.achieved}/${progress.total} 项</span><span class="accent">进入成长地图 →</span></p>
    </section>

    <section class="quick-grid">
      <button class="${checked ? 'done' : ''}" data-action="checkin"><span>📅</span><b>${checked ? '今天已陪伴' : '今日打卡'}</b><small>${checked ? '坚持得很棒' : '记录一次用心陪伴'}</small></button>
      <button data-action="new-record"><span>📝</span><b>随手记录</b><small>留住成长瞬间</small></button>
      <button data-tab="stats"><span>📊</span><b>成长趋势</b><small>看看最近的变化</small></button>
    </section>

    <section class="card recommendation" data-milestone="${escapeHtml(recommendation?.id)}" role="button" tabindex="0" aria-label="查看今日建议：${escapeHtml(recommendation?.title || '自由陪伴')}">
      <div class="row-between"><div class="section-title">今天可以观察</div><span class="soft-tag">约 10 分钟</span></div>
      <h3>${escapeHtml(recommendation?.title || '自由陪伴')}</h3>
      <p>${escapeHtml(recommendation?.func || '跟随孩子的兴趣，一起完成一件简单的小事。')}</p>
      <div class="accent">查看引导方法 →</div>
    </section>

    <section class="card gentle-note">
      <div class="section-title">给家长的小提醒</div>
      <p>里程碑是观察工具，不是考试。孩子有自己的节奏；发现持续偏离或技能倒退时，再寻求专业评估。</p>
    </section>`);
}

function bandHeader(band, progress) {
  const profile = profileOf();
  return `
    <div class="band-switcher">${bands().map(item => `
      <button data-band="${escapeHtml(item.key)}" class="${item.key === band.key ? 'active' : ''} ${profile.unlocked.includes(item.key) ? '' : 'locked'}" ${item.key === band.key ? 'aria-pressed="true"' : 'aria-pressed="false"'} ${profile.unlocked.includes(item.key) ? '' : 'aria-disabled="true"'}>
        ${profile.unlocked.includes(item.key) ? '' : '🔒 '}${escapeHtml(item.label)}
      </button>`).join('')}</div>
    <section class="page-heading">
      <div><div class="eyebrow">第 ${band.order + 1} 阶段</div><h1>${escapeHtml(band.label)} · ${escapeHtml(band.stage)}</h1><p>达标 ${progress.achieved}/${progress.total} · 已观察 ${progress.observed}</p></div>
      <div class="progress-ring" style="--value:${progress.percent * 3.6}deg" role="progressbar" aria-label="${escapeHtml(band.label)}达标进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress.percent}"><span>${progress.percent}%</span></div>
    </section>
    <div class="segment-control" role="tablist" aria-label="成长内容">
      ${[['milestones', '里程碑'], ['guide', '陪伴'], ['safety', '安全'], ['items', '物品']].map(([key, label]) => `
        <button class="${state.bandSection === key ? 'active' : ''}" data-band-section="${key}" role="tab" aria-selected="${state.bandSection === key}">${label}</button>`).join('')}
    </div>`;
}

function milestoneListHtml() {
  const band = bandOf(state.bandKey);
  const profile = profileOf();
  const keyword = state.query.trim().toLowerCase();
  let items = keyword
    ? allMilestones(state.bandKey).filter(item => `${item.title} ${item.age} ${item.func}`.toLowerCase().includes(keyword))
    : band.domains[state.domainIndex]?.items || [];
  return `<div id="milestone-browser">
    <div class="search-box"><span aria-hidden="true">⌕</span><input id="milestone-search" value="${escapeHtml(state.query)}" placeholder="搜索能力、关键词或月龄" aria-label="搜索里程碑" maxlength="80" /><button data-action="clear-search" aria-label="清空搜索" ${state.query ? '' : 'hidden'}>×</button></div>
    ${milestoneResultsHtml(band, profile, keyword, items)}</div>`;
}

// Everything below the search box. Re-rendered on search input so the
// input element (focus, caret, IME composition) is never replaced.
function milestoneResultsHtml(band, profile, keyword, items) {
  return `<div id="milestone-results">
    <div class="chips">${band.domains.map((domain, index) => `
      <button class="${index === state.domainIndex && !keyword ? 'active' : ''}" data-domain="${index}" aria-pressed="${index === state.domainIndex && !keyword}">${escapeHtml(domain.name)}</button>`).join('')}</div>
    ${items.length ? `<div class="rail-heading"><div><b>挑一张成长卡</b><small>左右滑动，遇见今天的小目标</small></div><span id="milestone-counter">1 / ${items.length}</span></div>
    <div class="milestone-rail-wrap"><button class="rail-control rail-prev" data-action="previous-card" aria-label="上一张成长卡">‹</button><div id="milestone-list" class="milestone-rail" tabindex="0" aria-label="成长卡片列表">${items.map((item, index) => {
      const status = profile.progress[item.id]?.status || '';
      return `<button class="milestone-card ${status} ${index === 0 ? 'is-active' : ''}" data-milestone="${escapeHtml(item.id)}" data-card-index="${index}" aria-label="${escapeHtml(item.title)}，${escapeHtml(item.age)}">
        <span class="milestone-card-top"><span>${escapeHtml(item.domain)}</span><em>${status === 'achieved' ? '已点亮' : status === 'observed' ? '观察中' : '待探索'}</em></span>
        <small class="milestone-card-age">${escapeHtml(item.age)}</small><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.func)}</p>
        <span class="milestone-card-bottom">打开成长指南 <b>→</b></span><i class="milestone-card-orb">${status === 'achieved' ? '✦' : '✧'}</i>
      </button>`;
    }).join('')}</div><button class="rail-control rail-next" data-action="next-card" aria-label="下一张成长卡">›</button></div>
    <div class="rail-dots" aria-label="成长卡片位置">${items.map((item, index) => `<button class="${index === 0 ? 'active' : ''}" data-card-dot="${index}" aria-label="第 ${index + 1} 张成长卡"></button>`).join('')}</div>` : '<div id="milestone-list" class="empty">没有找到相关里程碑</div>'}</div>`;
}

function bindMilestoneRail() {
  const rail = $('#milestone-list');
  if (!rail || !rail.classList.contains('milestone-rail')) return;
  const cards = $$('.milestone-card', rail);
  const updateActive = () => {
    if (!cards.length) return;
    const center = rail.scrollLeft + rail.clientWidth / 2;
    let nearest = 0;
    let distance = Infinity;
    cards.forEach((card, index) => {
      const cardCenter = card.offsetLeft + card.offsetWidth / 2;
      const delta = Math.abs(cardCenter - center);
      if (delta < distance) { distance = delta; nearest = index; }
    });
    state.cardIndex = nearest;
    cards.forEach((card, index) => card.classList.toggle('is-active', index === nearest));
    $$('.rail-dots button').forEach((dot, index) => dot.classList.toggle('active', index === nearest));
    const counter = $('#milestone-counter');
    if (counter) counter.textContent = `${nearest + 1} / ${cards.length}`;
  };
  rail.addEventListener('scroll', updateActive, { passive: true });
  requestAnimationFrame(updateActive);
  rail._cardUpdateActive = updateActive;
}

function scrollMilestoneCard(index) {
  const rail = $('#milestone-list');
  if (!rail || !rail.classList.contains('milestone-rail')) return;
  const cards = $$('.milestone-card', rail);
  const target = cards[Math.max(0, Math.min(index, cards.length - 1))];
  target?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
}

function renderGuide() {
  const guide = state.data.guides.find(item => item.band === state.bandKey);
  if (!guide) return '<section class="card empty">暂无陪伴指南</section>';
  return `
    <section class="card content-card"><div class="eyebrow">本阶段孩子画像</div><p class="lead">${escapeHtml(guide.profile)}</p></section>
    <section class="card content-card"><div class="section-title">高质量陪伴要点</div>${guide.points.map((item, index) => `<div class="number-row"><b>${index + 1}</b><span>${escapeHtml(item)}</span></div>`).join('')}</section>
    <section class="card content-card"><div class="section-title">一天的陪伴节奏</div>${guide.rhythm.map(item => `<div class="timeline-row"><time>${escapeHtml(item.time)}</time><div><b>${escapeHtml(item.do)}</b><p>${escapeHtml(item.act)}</p></div></div>`).join('')}</section>
    <section class="card content-card"><div class="section-title">常见场景怎么说</div>${guide.scenarios.map(item => `<details><summary>${escapeHtml(item.scene)}</summary><p><b>可以这样：</b>${escapeHtml(item.do)}</p><p class="muted"><b>尽量避免：</b>${escapeHtml(item.avoid)}</p></details>`).join('')}</section>
    <section class="card content-card"><div class="section-title">家长也要照顾好自己</div>${guide.selfcare.map(item => `<p class="check-line">♡ ${escapeHtml(item)}</p>`).join('')}</section>`;
}

function renderSafety() {
  const safety = state.data.safety.find(item => item.band === state.bandKey);
  if (!safety) return '<section class="card empty">暂无安全内容</section>';
  return `
    <section class="risk-grid">${safety.risks.map(item => `<article><span>!</span><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.guard)}</p></article>`).join('')}</section>
    ${[['居家安全', safety.home], ['户外与交通', safety.outdoor], ['饮食与窒息', safety.food], ['玩具与用品', safety.toys], ['社交与人身', safety.social]].map(([title, list]) => `
      <section class="card content-card"><div class="section-title">${title}</div>${list.map(item => `<p class="check-line">□ ${escapeHtml(item)}</p>`).join('')}</section>`).join('')}
    <section class="card warning-card"><div class="section-title">急救要点</div>${safety.firstaid.map(item => `<p>• ${escapeHtml(item)}</p>`).join('')}</section>
    <section class="card danger-card"><div class="section-title">出现这些信号建议就医评估</div>${safety.warning.map(item => `<p>⚠ ${escapeHtml(item)}</p>`).join('')}<small>${escapeHtml(safety.contacts)}</small></section>`;
}

function renderItems() {
  const wanted = BAND_YEARS[state.bandKey] || [];
  const years = state.data.items.filter(item => wanted.includes(item.year));
  return years.map(year => `<section class="card content-card"><div class="section-title">${escapeHtml(year.year)}物品建议</div>${year.items.map(item => `
    <details class="item-row"><summary><span><b>${escapeHtml(item.name)}</b><small>${escapeHtml(item.when || '')}</small></span><span>›</span></summary><p>${escapeHtml(item.tip)}</p><small>使用年限：${escapeHtml(item.life)} · 更新：${escapeHtml(item.wear)}</small></details>`).join('')}</section>`).join('') || '<section class="card empty">暂无物品建议</section>';
}

function renderBand() {
  talentController?.destroy?.();
  talentController = null;
  if (needsProfile()) return;
  const profile = profileOf();
  const band = bandOf(state.bandKey);
  const progress = bandProgress(state.bandKey);
  if (!profile.unlocked.includes(state.bandKey)) {
    const lastUnlocked = profile.unlocked[profile.unlocked.length - 1] || 'b0';
    layout(`${bandHeader(band, progress)}<section class="card locked-card"><div>🔒</div><h2>这个阶段还没有开放</h2><p>完成上一阶段至少 50% 的里程碑后即可解锁。</p><button class="secondary" data-band="${escapeHtml(lastUnlocked)}">返回当前阶段</button></section>`);
    return;
  }
  let content = milestoneListHtml();
  if (state.bandSection === 'guide') content = renderGuide();
  if (state.bandSection === 'safety') content = renderSafety();
  if (state.bandSection === 'items') content = renderItems();
  layout(`${bandHeader(band, progress)}<section class="band-content">${content}</section>`, { wide: state.bandSection !== 'milestones' });
  bindMilestoneRail();
}

function batteryIconHtml(percent, label = '') {
  const safePercent = Math.max(0, Math.min(100, Number(percent) || 0));
  return `<span class="battery-icon" role="img" aria-label="${escapeHtml(label || `${safePercent}%`)}"><i style="width:${safePercent}%"></i></span>`;
}

function directionStageHtml(direction) {
  return [0, 1, 2, 3, 4].map(level => `<button class="direction-stage ${direction.level === level ? 'active' : ''}" data-direction-id="${escapeHtml(direction.id)}" data-direction-level="${level}" aria-label="${escapeHtml(direction.title)}，${level * 25}%" aria-pressed="${direction.level === level}">${level * 25}%</button>`).join('');
}

function renderMilestoneDetail() {
  const item = findMilestone(state.detailId);
  if (!item) {
    state.detailId = '';
    renderBand();
    return;
  }
  const profile = profileOf();
  const current = profile.progress[item.id] || {};
  const performances = item.perf || [];
  const milestoneProgress = directionProgress(item, current);
  layout(`
    <button class="back-button" data-action="close-detail">← 返回 ${escapeHtml(item.bandLabel)}</button>
    <section class="card detail-card">
      <div class="eyebrow">${escapeHtml(item.domain)} · ${escapeHtml(item.age)}</div>
      <h1>${escapeHtml(item.title)}</h1>
      <div class="status-banner ${current.status || ''}">${current.status === 'achieved' ? '✓ 已达标' : current.status === 'observed' ? '• 已观察' : '等待你的观察'}</div>
      <details class="detail-intro" open><summary>这项能力有什么意义</summary><p>${escapeHtml(item.func)}</p></details>
      <section class="detail-battery card"><div class="battery-heading"><div><h2>成长电量</h2><p>每个方向按自己的节奏点亮，整体电量取平均进度。</p></div><strong>${milestoneProgress.percent}%</strong></div><div class="battery-large">${batteryIconHtml(milestoneProgress.percent, `整体进度 ${milestoneProgress.percent}%`)}</div><small class="battery-caption">${milestoneProgress.completed}/${milestoneProgress.total} 个方向已完成</small></section>
      <section class="directions-card"><div class="section-title">几个可以尝试的方向</div>${milestoneProgress.directions.map(direction => `<article class="direction-item"><div class="direction-row"><div><b>${escapeHtml(direction.title)}</b><small>${escapeHtml(direction.label)} · ${direction.percent}%</small></div>${batteryIconHtml(direction.percent, `${direction.title} ${direction.percent}%`)}</div><p>${escapeHtml(item.complete?.[direction.index] || item.guide?.[direction.index] || '')}</p><div class="direction-stages">${directionStageHtml(direction)}</div></article>`).join('')}<p class="direction-foot">方向完成度只记录练习过程；底部的观察/达标状态仍由你单独确认。</p></section>
      <h2>可以怎么引导</h2><ol>${(item.guide || []).map(step => `<li>${escapeHtml(step)}</li>`).join('')}</ol>
      <h2>怎样算做完整</h2><div class="check-panel">${(item.complete || []).map(step => `<p>□ ${escapeHtml(step)}</p>`).join('')}</div>
      ${performances.length ? `<h2>可能的表现与下一步</h2><div class="performance-list">${performances.map(row => `<article><b>${escapeHtml(row.show || row['表现'])}</b><p>${escapeHtml(row.meaning || row['体现什么'])}</p><small>${escapeHtml(row.next || row['下一步引导'])}</small></article>`).join('')}</div>` : ''}
      <h2>达标参考</h2><p>${escapeHtml(item.passs || item.std)}</p>
      ${item.nxt ? `<div class="next-tip">${escapeHtml(item.nxt)}</div>` : ''}
      <label class="note-label">观察备注<textarea id="milestone-note" placeholder="写下今天看到的细节…" maxlength="2000">${escapeHtml(state.noteDraft !== null ? state.noteDraft : (current.note || ''))}</textarea></label>
      <button class="secondary full" data-action="save-milestone-note">保存观察备注</button>
      <div class="detail-actions">
        <button class="secondary ${current.status === 'observed' ? 'selected' : ''}" data-status="observed">👀 ${current.status === 'observed' ? '已观察' : '标记观察'}</button>
        <button class="primary ${current.status === 'achieved' ? 'selected' : ''}" data-status="achieved">⭐ ${current.status === 'achieved' ? '已达标' : '标记达标'}</button>
      </div>
      <button class="text-button full" data-action="record-this-milestone">＋ 为这个里程碑写成长记录</button>
    </section>`, { hideNav: true });
}

function composerHtml() {
  if (!state.composerOpen) return '';
  const options = allMilestones(currentBandKey()).map(item => `<option value="${escapeHtml(item.id)}" ${state.draftMilestoneId === item.id ? 'selected' : ''}>${escapeHtml(item.title)}</option>`).join('');
  return `<div class="sheet-backdrop" data-action="close-composer"><section class="composer" data-stop role="dialog" aria-modal="true" aria-labelledby="composer-title">
    <div class="sheet-handle" aria-hidden="true"></div><div class="row-between"><div><div class="eyebrow">成长记录</div><h2 id="composer-title">记下这一刻</h2></div><button class="close-button" data-action="close-composer" aria-label="关闭成长记录">×</button></div>
    <label>日期<input id="record-date" type="date" max="${today()}" value="${escapeHtml(state.draftDate)}" /></label>
    <label>发生了什么<textarea id="record-text" placeholder="今天宝贝做了什么、说了什么？" maxlength="5000">${escapeHtml(state.draftText)}</textarea></label>
    <label>关联里程碑（可选）<select id="record-milestone"><option value="">不关联</option>${options}</select></label>
    <div class="draft-photos">${state.draftPhotoIds.map(id => `<div class="photo-tile"><img data-photo-id="${escapeHtml(id)}" alt="待保存照片" /><button data-remove-photo="${escapeHtml(id)}" aria-label="移除这张照片">×</button></div>`).join('')}<button class="add-photo" data-action="add-photo">📷<small>添加照片</small></button></div>
    <p class="privacy-hint">照片只保存在当前设备，不会自动上传。</p>
    <button class="primary large full" data-action="save-record">保存成长记录</button>
  </section></div>`;
}

function renderRecord() {
  talentController?.destroy?.();
  talentController = null;
  if (needsProfile()) return;
  const profile = profileOf();
  layout(`
    <section class="page-heading record-heading"><div><div class="eyebrow">成长时间线</div><h1>每一个瞬间都值得记住</h1><p>${profile.records.length} 条记录</p></div><button class="primary" data-action="new-record">＋ 记录</button></section>
    <section class="record-timeline">${[...profile.records].sort((a, b) => b.date - a.date).map(record => `<article class="card record-card">
      <div class="record-meta"><time datetime="${localDateKey(new Date(record.date))}">${formatDate(record.date)}</time><button data-delete-record="${escapeHtml(record.id)}" aria-label="删除这条成长记录">删除</button></div>
      ${record.text ? `<p>${escapeHtml(record.text)}</p>` : ''}
      ${record.photos?.length ? `<div class="record-photos">${record.photos.map(id => `<img data-photo-id="${escapeHtml(id)}" alt="成长照片" />`).join('')}</div>` : ''}
      ${record.milestoneTitle ? `<button class="linked-milestone" data-milestone="${escapeHtml(record.milestoneId)}">🏅 ${escapeHtml(record.milestoneTitle)}</button>` : ''}
    </article>`).join('') || '<div class="empty"><span>📝</span><h3>还没有成长记录</h3><p>从一句话或一张照片开始吧。</p><button class="primary" data-action="new-record">写第一条记录</button></div>'}</section>
    ${composerHtml()}`);
  hydratePhotos();
}

function weeklyRecordData() {
  const profile = profileOf();
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() || 7) - 1));
  return Array.from({ length: 8 }, (_, index) => {
    const start = new Date(monday);
    start.setDate(monday.getDate() - (7 - index) * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    return {
      label: `${start.getMonth() + 1}/${start.getDate()}`,
      count: profile.records.filter(record => record.date >= start.getTime() && record.date < end.getTime()).length
    };
  });
}

function checkinStreak() {
  const dates = new Set(profileOf().checkins);
  let streak = 0;
  const cursor = new Date();
  if (!dates.has(localDateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (dates.has(localDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function renderStats() {
  if (needsProfile()) return;
  const key = currentBandKey();
  const band = bandOf(key);
  const progress = bandProgress(key);
  const profile = profileOf();
  const level = levelInfo();
  const weeks = weeklyRecordData();
  const max = Math.max(1, ...weeks.map(week => week.count));
  layout(`
    <section class="page-heading"><div><div class="eyebrow">成长数据</div><h1>看见坚持留下的变化</h1><p>${band.label} · ${progress.percent}% 已达标</p></div></section>
    <section class="metric-grid"><article><b>${checkinStreak()}</b><span>连续陪伴</span><small>天</small></article><article><b>${level.xp}</b><span>成长经验</span><small>XP</small></article><article><b>${profile.records.length}</b><span>成长记录</span><small>条</small></article></section>
    <section class="card content-card"><div class="section-title">${band.label}领域进度</div>${band.domains.map(domain => {
      const achieved = domain.items.filter(item => profile.progress[item.id]?.status === 'achieved').length;
      const percent = Math.round((achieved / domain.items.length) * 100);
      return `<div class="stat-row"><span>${escapeHtml(domain.name)}</span><div class="mini-progress" role="progressbar" aria-label="${escapeHtml(domain.name)}进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><i style="width:${percent}%"></i></div><small>${achieved}/${domain.items.length}</small></div>`;
    }).join('')}</section>
    <section class="card content-card"><div class="section-title">近 8 周记录趋势</div><div class="bar-chart" role="img" aria-label="${weeks.map(week => `${week.label}：${week.count}条`).join('，')}">${weeks.map(week => `<div><span class="bar" style="height:${Math.max(5, Math.round((week.count / max) * 100))}%"><b>${week.count || ''}</b></span><small>${week.label}</small></div>`).join('')}</div></section>
    <section class="card content-card"><div class="section-title">数据怎么看</div><p class="muted">增长不是直线。建议结合持续观察、孩子状态和专业儿保意见理解这些数据，不与其他孩子横向比较。</p></section>`);
}

function profileForm(baby) {
  const creating = state.profileMode === 'new' || !baby;
  return `<section class="card profile-form">
    <div class="row-between"><div class="section-title">${creating ? '创建宝贝档案' : '宝贝档案'}</div>${state.profileMode === 'new' ? '<button class="text-button" data-action="cancel-new-baby">取消</button>' : ''}</div>
    <label>昵称<input id="baby-name" value="${escapeHtml(baby?.name || '')}" placeholder="宝贝的小名" maxlength="20" /></label>
    <label>生日<input id="baby-birthday" type="date" min="${minimumBirthday()}" max="${today()}" value="${escapeHtml(baby?.birthday || '')}" /></label>
    <label>性别<select id="baby-gender"><option value="男" ${baby?.gender !== '女' ? 'selected' : ''}>男</option><option value="女" ${baby?.gender === '女' ? 'selected' : ''}>女</option></select></label>
    <button class="primary large full" data-action="save-profile">${creating ? '创建档案' : '保存档案'}</button>
  </section>`;
}

function renderProfile() {
  talentController?.destroy?.();
  talentController = null;
  const baby = activeBaby();
  const level = baby ? levelInfo() : null;
  layout(`
    <section class="profile-hero">
      <div class="avatar">${baby ? (baby.gender === '女' ? '👧' : '👦') : '👶'}</div>
      <h1>${escapeHtml(baby?.name || '欢迎加入')}</h1>
      <p>${baby ? `${ageText(baby.birthday)} · ${level.emoji} ${level.title} Lv.${level.level}` : '先创建一个宝贝档案'}</p>
    </section>
    ${db.babies.length ? `<section class="baby-switcher"><div class="row-between"><div class="section-title">我的宝宝</div><button class="text-button" data-action="new-baby">＋ 添加</button></div><div>${db.babies.map(item => `<button class="baby-card ${item.id === db.activeBabyId ? 'active' : ''}" data-baby="${escapeHtml(item.id)}" aria-pressed="${item.id === db.activeBabyId}"><span>${item.gender === '女' ? '👧' : '👦'}</span><b>${escapeHtml(item.name)}</b><small>${ageText(item.birthday)}</small></button>`).join('')}</div></section>` : ''}
    ${profileForm(state.profileMode === 'new' ? null : baby)}
    ${baby ? `<section class="card content-card"><div class="section-title">数据与隐私</div><p class="muted">档案、进度和照片默认只保存在当前设备。文本备份不包含照片，请妥善保管。</p><button class="secondary full" data-action="export-backup">导出数据备份</button><button class="secondary full" data-action="import-backup">从文件恢复备份</button><button class="danger full" data-action="delete-baby">删除当前宝宝</button></section>` : ''}
    <section class="card content-card"><div class="section-title">关于孩子成长</div><p class="muted">覆盖 0–8 岁成长里程碑、陪伴指南、安全提醒与物品建议。内容仅供家庭观察参考，不替代医疗诊断。</p><button class="text-button full" data-action="open-privacy">查看隐私与数据说明</button><small class="version">版本 1.0.0 · iOS 基础版</small></section>`);
}

function renderPrivacy() {
  talentController?.destroy?.();
  talentController = null;
  layout(`
    <button class="back-button" data-action="close-privacy">← 返回我的</button>
    <article class="card detail-card legal-copy">
      <div class="eyebrow">隐私与数据说明</div>
      <h1>你的家庭数据属于你</h1>
      <p class="muted">更新日期：2026 年 8 月 13 日</p>
      <h2>数据保存在哪里</h2>
      <p>宝宝档案、里程碑进度、打卡与成长记录保存在当前设备；照片保存在 App 的本地存储空间。当前版本没有账号系统、云同步、广告或第三方分析服务。</p>
      <h2>相机与相册权限</h2>
      <p>只有当你主动添加成长照片时，App 才会请求相机或相册权限。照片不会被自动上传，也不会用于识别、广告或画像。</p>
      <h2>备份与分享</h2>
      <p>导出的 JSON 备份包含宝宝档案、进度和文字记录，不包含照片。只有你主动选择分享目标时，备份才会交给系统分享面板；请避免发送到不可信的位置。</p>
      <h2>删除与恢复</h2>
      <p>你可以删除单条成长记录或整个宝宝档案。删除宝宝档案时，其关联的本地照片也会删除。恢复备份会覆盖当前档案并清理旧照片，操作前会再次确认。</p>
      <h2>儿童与健康信息</h2>
      <p>本 App 应由家长或监护人使用。成长里程碑和安全内容仅作日常观察参考，不构成医疗诊断；如发现技能倒退或持续异常，请咨询专业医疗人员。</p>
      <h2>政策变更</h2>
      <p>如果未来增加云同步、推送或分析功能，我们会在启用前更新本说明并清楚告知数据用途。你可通过 App Store 的产品支持页面联系开发者。</p>
    </article>`, { hideNav: true, wide: true });
}

async function hydratePhotos() {
  for (const image of $$('[data-photo-id]')) {
    try {
      const blob = await mediaStore.get(image.dataset.photoId);
      if (!blob || !image.isConnected) continue;
      const url = URL.createObjectURL(blob);
      state.objectUrls.push(url);
      image.src = url;
    } catch (error) {
      image.alt = '照片读取失败';
    }
  }
}

function renderLanding() {
  talentController?.destroy?.();
  talentController = null;
  appRoot.className = 'talent-growth-shell';
  appRoot.innerHTML = `
    <div class="tg-shell tg-landing-shell">
      <header class="tg-header tg-landing-header">
        <a class="tg-brand" href="#">天赋生长 <span>家庭成长培养</span></a>
      </header>
      <main class="tg-landing-main">
        <section class="tg-landing-hero">
          <span class="tg-kicker">每个人都是自己天赋的园丁</span>
          <h1>为不同的花园，<em>找到合适的照料方式</em></h1>
          <p>不评分、不比较，只记录真实发生的那一次尝试。</p>
        </section>
        <hr class="tg-landing-rule" />
        <section class="tg-entry-grid" aria-label="选择培养方向">
          <article class="tg-entry tg-entry-child" aria-labelledby="tg-entry-child-title">
            <span class="tg-entry-icon" aria-hidden="true">🌱</span>
            <span class="tg-kicker">给家长与家庭 · 3–12 岁</span>
            <h2 id="tg-entry-child-title">儿童档案</h2>
            <p>把年龄、兴趣线索和每一次陪伴，留成这个孩子的成长档案。</p>
            <ul class="tg-entry-points">
              <li>从当下状态开始，不套模板</li>
              <li>记录愿意继续、想停下和作品变化</li>
              <li>不评分、不排名、不诊断</li>
            </ul>
            <div class="tg-entry-actions">
              <button class="tg-button tg-button-primary" data-action="open-parent-growth">为孩子找到起点 →</button>
              <button class="tg-button tg-button-quiet" data-action="open-profile">创建孩子培养档案</button>
            </div>
          </article>
          <article class="tg-entry tg-entry-all" aria-labelledby="tg-entry-all-title">
            <span class="tg-entry-icon" aria-hidden="true">🌿</span>
            <span class="tg-kicker">给每一个人</span>
            <h2 id="tg-entry-all-title">全年龄天赋培养</h2>
            <p>从幼儿到晚年，选一件今天能开始的小事。</p>
            <ul class="tg-entry-points">
              <li>6 个年龄阶段，同一套培养逻辑</li>
              <li>每次 10–20 分钟，可以随时停</li>
              <li>记录真实尝试，不生成天赋分数</li>
            </ul>
            <div class="tg-entry-actions">
              <button class="tg-button tg-button-primary" data-action="open-all-growth">进入全年龄探索 →</button>
            </div>
          </article>
        </section>
        <p class="tg-landing-note">天赋没有固定答案，培养也不必一次完成。先选择一个适合当下的入口。</p>
        <button class="tg-landing-family" data-action="open-family-space">已有家庭档案？进入家庭空间 →</button>
      </main>
      <footer class="tg-footer">把一次真实尝试，留给下一步。</footer>
    </div>`;
}
function render() {
  if (state.tab === 'landing') return renderLanding();
  if (state.tab === 'talent') return renderTalent();
  if (!state.data) return;
  if (state.legalPage === 'privacy') return renderPrivacy();
  if (state.detailId) return renderMilestoneDetail();
  if (state.tab === 'home') return renderHome();
  if (state.tab === 'band') return renderBand();
  if (state.tab === 'record') return renderRecord();
  if (state.tab === 'stats') return renderStats();
  return renderProfile();
}

function renderTalent() {
  appRoot.className = 'talent-growth-shell';
  talentController?.destroy?.();
  talentController = mountTalent({
    root: appRoot,
    onOpenGrowth: () => { state.tab = 'profile'; state.detailId = ''; state.legalPage = ''; renderProfile(); scrollPageTop(); }
  });
}

function openComposer(milestone = null) {
  state.tab = 'record';
  state.composerOpen = true;
  state.draftText = milestone ? `今天观察到：${milestone.title}` : '';
  state.draftMilestoneId = milestone?.id || '';
  state.draftDate = today();
  state.draftPhotoIds = [];
  state.detailId = '';
  renderRecord();
  $('#record-text')?.focus();
}

async function closeComposer({ force = false } = {}) {
  const unsavedText = cleanText($('#record-text')?.value || state.draftText, 5000).trim();
  if (!force && (unsavedText || state.draftPhotoIds.length)
    && !confirm('这条成长记录还没有保存，确定放弃吗？')) return;
  for (const id of state.draftPhotoIds) {
    try { await mediaStore.remove(id); } catch (error) { console.warn('清理未保存照片失败', error); }
  }
  state.composerOpen = false;
  state.draftText = '';
  state.draftMilestoneId = '';
  state.draftPhotoIds = [];
  renderRecord();
}

async function addPhoto() {
  if (state.draftPhotoIds.length >= 6) {
    showToast('每条记录最多添加 6 张照片');
    return;
  }
  const camera = nativePlugin('Camera');
  if (window.Capacitor?.isNativePlatform?.() && camera) {
    try {
      const photo = await camera.getPhoto({
        quality: 72,
        width: 1600,
        correctOrientation: true,
        resultType: 'uri',
        source: 'PROMPT',
        presentationStyle: 'popover'
      });
      const response = await fetch(photo.webPath);
      if (!response.ok) throw new Error('照片读取失败');
      const id = await mediaStore.put(await response.blob());
      state.draftPhotoIds.push(id);
      renderRecord();
      return;
    } catch (error) {
      if (`${error}`.toLowerCase().includes('cancel')) return;
      console.warn('调用相机失败，改用文件选择', error);
    }
  }
  $('#photo-picker')?.click();
}

async function addPickedFiles(files) {
  const available = Math.max(0, 6 - state.draftPhotoIds.length);
  try {
    for (const file of [...files].slice(0, available)) {
      if (!file.type.startsWith('image/')) continue;
      state.draftPhotoIds.push(await mediaStore.put(file));
    }
  } catch (error) {
    console.error('照片保存失败', error);
    showToast('照片保存失败，请检查设备存储空间');
  }
  renderRecord();
}

async function saveRecord() {
  const text = cleanText($('#record-text')?.value || state.draftText, 5000).trim();
  const dateValue = $('#record-date')?.value || state.draftDate;
  const milestoneId = $('#record-milestone')?.value || '';
  if (!text && !state.draftPhotoIds.length) {
    showToast('写点什么或添加一张照片吧');
    return;
  }
  if (!validDateKey(dateValue) || dateValue > today()) {
    showToast('请选择有效的记录日期');
    return;
  }
  if (profileOf().records.length >= MAX_RECORDS) {
    showToast('成长记录已达到上限，请先导出备份并整理旧记录');
    return;
  }
  const milestone = findMilestone(milestoneId);
  const record = {
    id: uid('record'),
    text,
    date: new Date(`${dateValue}T12:00:00`).getTime(),
    photos: [...state.draftPhotoIds],
    milestoneId,
    milestoneTitle: milestone?.title || ''
  };
  if (!commit(() => profileOf().records.unshift(record))) {
    return; // keep draft if persist failed
  }
  state.composerOpen = false;
  state.draftPhotoIds = [];
  state.draftText = '';
  state.draftMilestoneId = '';
  showToast('成长记录已保存 ＋5 经验');
  renderRecord();
}

function saveProfile() {
  const name = cleanText($('#baby-name')?.value, 20).trim();
  const birthday = validDateKey($('#baby-birthday')?.value);
  const gender = $('#baby-gender')?.value || '男';
  if (!name) return showToast('请填写宝贝昵称');
  if (!birthday) return showToast('请选择宝贝生日');
  if (birthday > today()) return showToast('生日不能晚于今天');
  if (birthday < minimumBirthday()) return showToast('当前版本支持 0–8 岁儿童档案');

  if (state.profileMode === 'new' || !activeBaby()) {
    if (db.babies.length >= MAX_BABIES) return showToast(`最多可创建 ${MAX_BABIES} 个宝宝档案`);
    const id = uid('baby');
    const writeOk = commit(() => {
      db.babies.push({ id, name, birthday, gender, createdAt: Date.now() });
      db.activeBabyId = id;
      db.profiles[id] = emptyProfile();
    });
    if (!writeOk) return;
  } else {
    if (!commit(() => Object.assign(activeBaby(), { name, birthday, gender }))) return;
  }
  unlockForAge(birthday, profileOf());
  state.profileMode = 'edit';
  state.bandKey = currentBandKey();
  showToast('档案已保存');
  renderProfile();
}

async function exportBackup() {
  const backup = normalizeDatabase(db, { includePhotos: false });
  const text = JSON.stringify({ ...backup, exportedAt: Date.now(), photosIncluded: false });
  const share = nativePlugin('Share');
  if (window.Capacitor?.isNativePlatform?.() && share) {
    try {
      await share.share({ title: '孩子成长数据备份', text, dialogTitle: '保存或发送备份' });
    } catch (error) {
      // User cancelled the share sheet or the plugin failed; data is unchanged.
      console.warn('分享备份未完成', error);
    }
    return;
  }
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `孩子成长备份-${today()}.json`;
  link.click();
  // Delay revoke for iOS Safari download to complete
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function validateBackup(value) {
  return value?.version === 2
    && Array.isArray(value.babies)
    && value.babies.length <= MAX_BABIES
    && value.profiles
    && typeof value.profiles === 'object'
    && !Array.isArray(value.profiles);
}

async function importBackup(file) {
  try {
    if (file.size > MAX_BACKUP_BYTES) throw new Error('文件过大');
    const value = JSON.parse(await file.text());
    if (!validateBackup(value)) throw new Error('格式不正确');
    const restored = normalizeDatabase(value, { includePhotos: false });
    if (restored.babies.length !== value.babies.length) throw new Error('档案字段不正确');
    if (!confirm('恢复备份会覆盖当前档案、进度和记录，确定继续吗？')) return;
    
    // Persist first; only clear photos if write succeeded.
    const writeOk = commit(() => {
      db.version = 2;
      db.babies = restored.babies;
      db.activeBabyId = restored.activeBabyId;
      db.profiles = restored.profiles;
    });
    if (!writeOk) return;
    
    try {
      await mediaStore.clear();
    } catch (error) {
      console.warn('清理旧照片失败', error);
    }
    
    state.profileMode = 'edit';
    state.bandKey = currentBandKey();
    storageReadFailure = false; // successful restore clears read-failure flag
    showToast('备份恢复成功');
    renderProfile();
  } catch (error) {
    console.error('导入备份失败', error);
    showToast('备份文件无效');
  }
}

function toggleDirectionLevel(directionId, level) {
  const item = findMilestone(state.detailId);
  if (!item || !directionId) return;
  const profile = profileOf();
  const current = profile.progress[item.id] || {};
  state.noteDraft = cleanText($('#milestone-note')?.value, 2000);
  const levels = directionLevelsFor(item, current);
  const direction = directionsOf(item).find(candidate => candidate.id === directionId);
  if (!direction) return;
  levels[direction.id] = Math.max(0, Math.min(4, Number(level) || 0));
  const next = progressEntryFor(item, current, { directionLevels: levels, date: Date.now() });
  if (!saveProgressEntry(item.id, next)) {
    renderMilestoneDetail();
    return;
  }
  renderMilestoneDetail();
}

function toggleMilestoneStatus(status) {
  const item = findMilestone(state.detailId);
  if (!item) return;
  const profile = profileOf();
  const old = profile.progress[item.id] || {};
  const nextStatus = old.status === status ? '' : status;
  const note = cleanText($('#milestone-note')?.value, 2000).trim();
  state.noteDraft = note;
  const next = progressEntryFor(item, old, { status: nextStatus, note, date: Date.now() });
  if (!saveProgressEntry(item.id, next)) {
    renderMilestoneDetail();
    return;
  }

  if (nextStatus === 'achieved') {
    const progress = bandProgress(item.bandKey);
    if (progress.achieved >= Math.ceil(progress.total * 0.5)) {
      const next = bands().find(band => band.order === bandOf(item.bandKey).order + 1);
      if (next && !profile.unlocked.includes(next.key)) {
        if (commit(() => profile.unlocked.push(next.key))) {
          showToast(`新阶段已解锁：${next.label}`);
        }
      } else showToast('已标记达标 ＋50 经验');
    } else showToast('已标记达标 ＋50 经验');
  } else if (nextStatus === 'observed') showToast('已标记观察 ＋10 经验');
  else showToast('状态已取消');
  state.noteDraft = null;
  renderMilestoneDetail();
}

function saveMilestoneNote() {
  const item = findMilestone(state.detailId);
  if (!item) return;
  const profile = profileOf();
  const current = profile.progress[item.id] || {};
  const note = cleanText($('#milestone-note')?.value, 2000).trim();
  if (!saveProgressEntry(item.id, progressEntryFor(item, current, { note, date: Date.now() }))) {
    renderMilestoneDetail();
    return;
  }
  showToast(note ? '观察备注已保存' : '观察备注已清空');
  state.noteDraft = null;
  renderMilestoneDetail();
}

appRoot.addEventListener('click', async event => {
  if (event.target.closest('[data-stop]') && event.target.closest('[data-action="close-composer"]') === null) event.stopPropagation();
  const directionStage = event.target.closest('[data-direction-id]');
  if (directionStage) {
    toggleDirectionLevel(directionStage.dataset.directionId, Number(directionStage.dataset.directionLevel));
    return;
  }
  const cardDot = event.target.closest('[data-card-dot]');
  if (cardDot) {
    scrollMilestoneCard(Number(cardDot.dataset.cardDot));
    return;
  }
  const tabButton = event.target.closest('[data-tab]');
  if (tabButton) {
    state.tab = tabButton.dataset.tab;
    state.detailId = '';
    state.legalPage = '';
    if (state.tab === 'band') state.bandKey = currentBandKey();
    render();
    scrollPageTop();
    return;
  }
  const milestoneButton = event.target.closest('[data-milestone]');
  if (milestoneButton?.dataset.milestone) {
    const milestone = findMilestone(milestoneButton.dataset.milestone);
    state.bandKey = milestone?.bandKey || state.bandKey;
    state.detailId = milestoneButton.dataset.milestone;
    state.noteDraft = null;
    renderMilestoneDetail();
    scrollPageTop();
    return;
  }
  const bandButton = event.target.closest('[data-band]');
  if (bandButton) {
    state.bandKey = bandButton.dataset.band;
    state.query = '';
    state.domainIndex = 0;
    state.cardIndex = 0;
    state.tab = 'band';
    renderBand();
    return;
  }
  const domainButton = event.target.closest('[data-domain]');
  if (domainButton) {
    state.domainIndex = Number(domainButton.dataset.domain);
    state.query = '';
    state.cardIndex = 0;
    renderBand();
    return;
  }
  const sectionButton = event.target.closest('[data-band-section]');
  if (sectionButton) {
    state.bandSection = sectionButton.dataset.bandSection;
    renderBand();
    return;
  }
  const statusButton = event.target.closest('[data-status]');
  if (statusButton) {
    toggleMilestoneStatus(statusButton.dataset.status);
    return;
  }
  const babyButton = event.target.closest('[data-baby]');
  if (babyButton) {
    if (!commit(() => {
      db.activeBabyId = babyButton.dataset.baby;
      state.profileMode = 'edit';
      state.bandKey = currentBandKey();
    })) return;
    renderProfile();
    return;
  }
  const deleteRecordButton = event.target.closest('[data-delete-record]');
  if (deleteRecordButton) {
    if (!confirm('确定删除这条成长记录吗？')) return;
    const profile = profileOf();
    const record = profile.records.find(item => item.id === deleteRecordButton.dataset.deleteRecord);
    const photoIds = record?.photos || [];
    const writeOk = commit(() => {
      profile.records = profile.records.filter(item => item.id !== deleteRecordButton.dataset.deleteRecord);
    });
    if (!writeOk) return;
    try {
      for (const id of photoIds) await mediaStore.remove(id);
    } catch (error) {
      console.warn('删除照片失败', error);
    }
    renderRecord();
    return;
  }
  const removePhotoButton = event.target.closest('[data-remove-photo]');
  if (removePhotoButton) {
    const id = removePhotoButton.dataset.removePhoto;
    state.draftPhotoIds = state.draftPhotoIds.filter(item => item !== id);
    try { await mediaStore.remove(id); } catch (error) { console.warn('移除草稿照片失败', error); }
    renderRecord();
    return;
  }

  const landingTalentView = event.target.closest('[data-talent-view]')?.dataset.talentView;
  if (landingTalentView === 'family' && state.tab === 'landing') {
    state.tab = 'talent';
    renderTalent();
    appRoot.querySelector('[data-talent-view="family"]')?.click();
    return;
  }

  const action = event.target.closest('[data-action]')?.dataset.action;
  if (!action) return;
  if (action === 'open-growth') { state.tab = 'home'; state.detailId = ''; state.legalPage = ''; renderHome(); scrollPageTop(); return; }
  if (action === 'open-family-space') { state.tab = 'talent'; state.detailId = ''; state.legalPage = ''; renderTalent(); appRoot.querySelector('[data-talent-action="open-family"]')?.click(); return; }
  if (action === 'open-parent-growth') { state.tab = 'home'; state.detailId = ''; state.legalPage = ''; renderHome(); scrollPageTop(); return; }
  if (action === 'open-all-growth') { state.tab = 'talent'; state.detailId = ''; state.legalPage = ''; renderTalent(); scrollPageTop(); return; }
  if (action === 'open-band') {
    const key = event.target.closest('[data-band-key]')?.dataset.bandKey;
    if (!key) return;
    if (!profileOf().unlocked.includes(key)) {
      showToast('完成上一阶段目标后解锁');
      return;
    }
    state.tab = 'band';
    state.bandKey = key;
    state.bandSection = 'milestones';
    state.domainIndex = 0;
    state.cardIndex = 0;
    state.query = '';
    renderBand();
    scrollPageTop();
    return;
  }
  if (action === 'open-domain') {
    const name = event.target.closest('[data-domain-name]')?.dataset.domainName;
    const index = bandOf(currentBandKey())?.domains.findIndex(domain => domain.name === name) ?? -1;
    if (index < 0) return;
    state.tab = 'band';
    state.bandKey = currentBandKey();
    state.bandSection = 'milestones';
    state.domainIndex = index;
    state.cardIndex = 0;
    state.query = '';
    renderBand();
    scrollPageTop();
    return;
  }
  if (action === 'previous-card' || action === 'next-card') {
    const direction = action === 'next-card' ? 1 : -1;
    scrollMilestoneCard(state.cardIndex + direction);
    return;
  }
  if (action === 'open-profile') { state.tab = 'profile'; state.detailId = ''; state.legalPage = ''; renderProfile(); scrollPageTop(); }
  if (action === 'open-talent') { state.tab = 'talent'; state.detailId = ''; state.legalPage = ''; renderTalent(); scrollPageTop(); }
  if (action === 'open-current-band') { state.tab = 'band'; state.bandKey = currentBandKey(); renderBand(); scrollPageTop(); }
  if (action === 'checkin') {
    const profile = profileOf();
    if (!profile.checkins.includes(today())) {
      if (commit(() => profile.checkins.push(today()))) {
        showToast('今日陪伴打卡成功 ＋2 经验');
      }
    }
    renderHome();
  }
  if (action === 'new-record') openComposer();
  if (action === 'close-composer') await closeComposer();
  if (action === 'add-photo') await addPhoto();
  if (action === 'save-record') await saveRecord();
  if (action === 'save-milestone-note') saveMilestoneNote();
  if (action === 'close-detail') { state.detailId = ''; state.noteDraft = null; renderBand(); scrollPageTop(); }
  if (action === 'record-this-milestone') openComposer(findMilestone(state.detailId));
  if (action === 'clear-search') { state.query = ''; renderBand(); }
  if (action === 'new-baby') { state.profileMode = 'new'; renderProfile(); }
  if (action === 'cancel-new-baby') { state.profileMode = 'edit'; renderProfile(); }
  if (action === 'save-profile') saveProfile();
  if (action === 'export-backup') await exportBackup();
  if (action === 'import-backup') $('#backup-picker')?.click();
  if (action === 'open-privacy') { state.detailId = ''; state.legalPage = 'privacy'; renderPrivacy(); scrollPageTop(); }
  if (action === 'close-privacy') { state.legalPage = ''; renderProfile(); scrollPageTop(); }
  if (action === 'delete-baby') {
    const baby = activeBaby();
    if (!baby || !confirm(`确定删除 ${baby.name} 的全部档案、进度和记录吗？`)) return;
    const profile = profileOf();
    const photoIds = profile.records.flatMap(r => r.photos || []);
    const writeOk = commit(() => {
      db.babies = db.babies.filter(item => item.id !== baby.id);
      delete db.profiles[baby.id];
      db.activeBabyId = db.babies[0]?.id || '';
      state.bandKey = currentBandKey();
    });
    if (!writeOk) return;
    try {
      for (const id of photoIds) await mediaStore.remove(id);
    } catch (error) {
      console.warn('清理照片失败', error);
    }
    renderProfile();
  }
});

appRoot.addEventListener('keydown', event => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const target = event.target.closest('[role="button"][tabindex="0"]');
  if (!target) return;
  event.preventDefault();
  target.click();
});

document.addEventListener('keydown', async event => {
  if (event.key !== 'Escape' || !state.composerOpen) return;
  event.preventDefault();
  await closeComposer();
});

// Re-render only the results below the search box so the input keeps
// focus, caret position and any in-progress IME composition.
function refreshMilestoneResults(input) {
  state.query = cleanText(input.value, 80);
  const results = $('#milestone-results');
  if (!results) return;
  const temporary = document.createElement('div');
  temporary.innerHTML = milestoneListHtml();
  const next = $('#milestone-results', temporary);
  if (!next) return;
  results.replaceWith(next);
  const clear = $('#milestone-browser [data-action="clear-search"]');
  if (clear) clear.hidden = !state.query;
  state.cardIndex = 0;
  bindMilestoneRail();
}

appRoot.addEventListener('compositionend', event => {
  if (event.target.id === 'milestone-search') refreshMilestoneResults(event.target);
});

appRoot.addEventListener('input', event => {
  if (event.target.id === 'milestone-search') {
    // Wait for compositionend while typing pinyin etc.
    if (event.isComposing) return;
    refreshMilestoneResults(event.target);
  }
  if (event.target.id === 'record-text') state.draftText = event.target.value;
  if (event.target.id === 'record-date') state.draftDate = event.target.value;
  if (event.target.id === 'record-milestone') state.draftMilestoneId = event.target.value;
  if (event.target.id === 'milestone-note') state.noteDraft = cleanText(event.target.value, 2000);
});

appRoot.addEventListener('change', async event => {
  if (event.target.id === 'photo-picker') {
    await addPickedFiles(event.target.files);
    event.target.value = '';
  }
  if (event.target.id === 'backup-picker' && event.target.files[0]) {
    await importBackup(event.target.files[0]);
    event.target.value = '';
  }
});

fetch('data.json')
  .then(response => {
    if (!response.ok) throw new Error('内容数据加载失败');
    return response.json();
  })
  .then(data => {
    state.data = data;
    if (activeBaby()) unlockForAge(activeBaby().birthday, profileOf());
    state.bandKey = currentBandKey();
    // Write back only when the stored data was readable and normalization or
    // migration actually changed it. Unreadable data is never overwritten.
    if (!storageReadFailure && JSON.stringify(db) !== localStorage.getItem(STORAGE_KEY)) persist();
    render();
  })
  .catch(error => {
    console.error(error);
    appRoot.innerHTML = '<div class="fatal"><h1>内容加载失败</h1><p>请退出应用后重新打开。</p></div>';
  });
