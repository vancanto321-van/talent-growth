const STORAGE_KEY = 'talent-growth-v1';
const PREVIOUS_STORAGE_KEY = 'talent-growth-previous-v1';
const MAX_PEOPLE = 20;
const MAX_ATTEMPTS = 5000;
const MAX_TEXT = 1200;
const AGE_GROUPS = ['early', 'preschool', 'child', 'teen', 'adult', 'later'];
const SAFE_ID = /^[A-Za-z0-9_-]{1,80}$/;
const TASK_ID = /^[A-Za-z0-9_\-\u3400-\u9fff]{1,120}$/;
const LEVEL_ID = /^d_[a-z0-9]+(?:_\d+)?$/;
const DIRECTION_ID = /^(?:expression|analysis|design|coding|organization|interpersonal|music|movement|nature)$/;
const PREFERENCE_GOALS = ['daily', 'work', 'creative', 'learning', 'connection', 'companion', 'discover'];
const PREFERENCE_MINUTES = [10, 20, 40, 60];
const PREFERENCE_PARTICIPATION = ['solo', 'together'];
const PREFERENCE_LEVELS = ['start', 'practice', 'apply'];
const ATTEMPT_OUTCOMES = ['untried', 'needs-work', 'useful'];

const clean = (value, max = MAX_TEXT) => typeof value === 'string' ? value.slice(0, max).trim() : '';
const uid = prefix => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

function emptyProfile() {
  return { progress: {}, attempts: [], plan: null, preferences: null };
}

function normalizePreferences(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const minutes = Number(value.minutes);
  if (!PREFERENCE_GOALS.includes(value.goal) || !PREFERENCE_MINUTES.includes(minutes) || !PREFERENCE_PARTICIPATION.includes(value.participation) || !PREFERENCE_LEVELS.includes(value.level)) return null;
  const preferences = {
    goal: value.goal,
    minutes,
    participation: value.participation,
    level: value.level
  };
  const savedAt = Number(value.savedAt);
  if (Number.isFinite(savedAt) && savedAt > 0) preferences.savedAt = savedAt;
  return preferences;
}

function normalizeAttempt(value, allowedTaskIds = null) {
  if (!value || typeof value !== 'object') return null;
  const enjoyment = Number(value.enjoyment);
  const energy = Number(value.energy);
  if (!Number.isInteger(enjoyment) || enjoyment < 1 || enjoyment > 5) return null;
  if (!Number.isInteger(energy) || energy < 1 || energy > 5) return null;
  const taskId = clean(value.taskId, 120);
  if (!TASK_ID.test(taskId) || (allowedTaskIds && !allowedTaskIds.has(taskId))) return null;
  const date = Number(value.date);
  if (!Number.isFinite(date) || date <= 0 || date > Date.now() + 86400000) return null;
  const mode = value.mode === 'independent' || value.mode === 'assisted' ? value.mode : '';
  const note = clean(value.note);
  const artifact = clean(value.artifact);
  if (!mode || (!note && !artifact)) return null;
  return {
    ...value,
    id: SAFE_ID.test(value.id) ? value.id : uid('attempt'),
    taskId,
    date,
    note,
    artifact,
    feedback: clean(value.feedback),
    mode,
    enjoyment,
    energy,
    outcome: ATTEMPT_OUTCOMES.includes(value.outcome) ? value.outcome : 'untried',
    outcomeNote: clean(value.outcomeNote),
    changeNote: clean(value.changeNote),
    artifactTitle: clean(value.artifactTitle, 120),
    durationMinutes: Number.isInteger(Number(value.durationMinutes)) && Number(value.durationMinutes) >= 0 && Number(value.durationMinutes) <= 240 ? Number(value.durationMinutes) : 0
  };
}

function normalizeProfile(value, { taskIds = null, directionIds = null } = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const progress = Object.create(null);
  if (source.progress && typeof source.progress === 'object' && !Array.isArray(source.progress)) {
    for (const [id, raw] of Object.entries(source.progress).slice(0, 2000)) {
      if (!TASK_ID.test(id) || (taskIds && !taskIds.has(id))) continue;
      if (!raw || typeof raw !== 'object') continue;
      const levels = raw.directionLevels && typeof raw.directionLevels === 'object' && !Array.isArray(raw.directionLevels)
        ? Object.fromEntries(Object.entries(raw.directionLevels).slice(0, 32).filter(([criterionId, level]) => LEVEL_ID.test(criterionId) && Number.isInteger(level) && level >= 0 && level <= 4))
        : {};
      if (Object.keys(levels).length) progress[id] = { ...raw, directionLevels: levels, date: Number(raw.date) > 0 ? Number(raw.date) : Date.now() };
    }
  }
  const attempts = (Array.isArray(source.attempts) ? source.attempts : []).slice(0, MAX_ATTEMPTS).map(item => normalizeAttempt(item, taskIds)).filter(Boolean).slice(-MAX_ATTEMPTS);
  const planSource = source.plan && typeof source.plan === 'object' ? source.plan : null;
  const plan = planSource ? {
    ...planSource,
    directionId: directionIds ? (directionIds.has(planSource.directionId) ? planSource.directionId : '') : (DIRECTION_ID.test(planSource.directionId) ? planSource.directionId : ''),
    taskIds: Array.isArray(planSource.taskIds) ? [...new Set(planSource.taskIds.slice(0, 14).filter(id => !taskIds || taskIds.has(id)))].slice(0, 14) : [],
    schedule: Array.isArray(planSource.schedule) ? planSource.schedule.slice(0, 14).flatMap(item => {
      if (!item || typeof item !== 'object' || !Number.isInteger(Number(item.day)) || !(!taskIds || taskIds.has(item.taskId))) return [];
      return [{ day: Math.max(1, Math.min(30, Number(item.day))), taskId: item.taskId, method: clean(item.method, 240) }];
    }) : [],
    startedAt: Number(planSource.startedAt) > 0 ? Number(planSource.startedAt) : Date.now(),
    completedTaskIds: Array.isArray(planSource.completedTaskIds) ? [...new Set(planSource.completedTaskIds.slice(0, 14).filter(id => !taskIds || taskIds.has(id)))] : []
  } : null;
  return { ...source, progress, attempts, plan, preferences: normalizePreferences(source.preferences) };
}

export function normalizeTalentStore(value, options = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const people = [];
  const profiles = Object.create(null);
  const ids = new Set();
  for (const raw of (Array.isArray(source.people) ? source.people : []).slice(0, MAX_PEOPLE)) {
    if (!raw || typeof raw !== 'object') continue;
    const name = clean(raw.name, 40);
    const ageGroup = AGE_GROUPS.includes(raw.ageGroup) ? raw.ageGroup : 'adult';
    if (!name) continue;
    const oldId = clean(raw.id, 80);
    let id = SAFE_ID.test(oldId) ? oldId : uid('person');
    while (ids.has(id)) id = uid('person');
    ids.add(id);
    people.push({ id, name, ageGroup });
    const oldProfile = SAFE_ID.test(oldId) && source.profiles && Object.prototype.hasOwnProperty.call(source.profiles, oldId) ? source.profiles[oldId] : source.profiles?.[id];
    profiles[id] = normalizeProfile(oldProfile, options);
  }
  if (!people.length) {
    people.push({ id: 'self', name: '我', ageGroup: 'adult' });
    profiles.self = normalizeProfile(source.profiles?.self, options);
  }
  const requested = clean(source.activeId, 120);
  const updatedAt = Number(source.updatedAt);
  return {
    ...source,
    version: 1,
    people,
    activeId: people.some(person => person.id === requested) ? requested : people[0].id,
    profiles,
    updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : Date.now()
  };
}

export function createTalentStore(options = {}) {
  const normalizedOptions = {
    taskIds: options.taskIds ? new Set(options.taskIds) : null,
    directionIds: options.directionIds ? new Set(options.directionIds) : null
  };
  let data = normalizeTalentStore({}, normalizedOptions);
  let lastError = '';
  let backupError = '';
  let readFailure = false;
  let storageBaselineKnown = false;
  let lastStoredText = null;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    lastStoredText = stored;
    storageBaselineKnown = true;
    if (stored !== null) {
      const raw = JSON.parse(stored);
      const hasSnapshotShape = raw?.version === 1 && Array.isArray(raw.people) && raw.people.length > 0 && raw.profiles && typeof raw.profiles === 'object' && !Array.isArray(raw.profiles);
      if (hasSnapshotShape) data = normalizeTalentStore(raw, normalizedOptions);
      else readFailure = true;
    }
  } catch (error) {
    readFailure = true;
  }
  if (readFailure) lastError = '本地方向数据读取失败，已使用空白档案；请先恢复备份或明确替换';

  function currentStorageText() {
    try {
      return { readable: true, text: localStorage.getItem(STORAGE_KEY) };
    } catch (error) {
      return { readable: false, text: null };
    }
  }

  function isCurrentStorage() {
    if (readFailure || !storageBaselineKnown) return false;
    const current = currentStorageText();
    return current.readable && current.text === lastStoredText;
  }

  function assertCurrentStorage() {
    if (!storageBaselineKnown) {
      lastError = '本地方向数据读取失败，未覆盖原有数据；请刷新后重试或明确替换';
      return false;
    }
    const current = currentStorageText();
    if (!current.readable) {
      lastError = '本地方向数据读取失败，未覆盖原有数据；请刷新后重试或明确替换';
      return false;
    }
    if (current.text !== lastStoredText) {
      lastError = '另一个窗口已更新方向数据，请刷新后再试';
      return false;
    }
    return true;
  }

  function savePreviousSnapshot() {
    try {
      localStorage.setItem(PREVIOUS_STORAGE_KEY, JSON.stringify(normalizeTalentStore(data, normalizedOptions)));
      backupError = '';
      return true;
    } catch (error) {
      backupError = '上一份方向数据备份失败，当前保存仍会继续';
      return false;
    }
  }

  function write(next, { force = false, backup = true } = {}) {
    if (!assertCurrentStorage()) return false;
    if (readFailure && !force) {
      lastError = '本地方向数据读取失败，未覆盖原有数据；请先恢复备份或明确替换';
      return false;
    }
    const normalized = normalizeTalentStore(next, normalizedOptions);
    const previousUpdatedAt = Number(data.updatedAt);
    normalized.updatedAt = Math.max(Date.now(), Number.isFinite(previousUpdatedAt) && previousUpdatedAt > 0 ? previousUpdatedAt + 1 : 0);
    if (backup && !readFailure) savePreviousSnapshot();
    try {
      if (!assertCurrentStorage()) return false;
      const serialized = JSON.stringify(normalized);
      localStorage.setItem(STORAGE_KEY, serialized);
      data = normalized;
      lastStoredText = serialized;
      storageBaselineKnown = true;
      lastError = '';
      readFailure = false;
      return true;
    } catch (error) {
      lastError = '保存失败，已恢复上一状态';
      return false;
    }
  }

  return {
    key: STORAGE_KEY,
    previousKey: PREVIOUS_STORAGE_KEY,
    get data() { return data; },
    get lastError() { return lastError; },
    get backupError() { return backupError; },
    isCurrent() { return isCurrentStorage(); },
    activePerson() { return data.people.find(person => person.id === data.activeId) || data.people[0]; },
    profile(personId = data.activeId) { if (!data.profiles[personId]) data.profiles[personId] = emptyProfile(); return data.profiles[personId]; },
    update(mutator) {
      const previous = data;
      const draft = typeof structuredClone === 'function' ? structuredClone(data) : JSON.parse(JSON.stringify(data));
      mutator(draft);
      return write(draft) ? true : (data = previous, false);
    },
    switchPerson(id) { return data.people.some(person => person.id === id) && write({ ...data, activeId: id }); },
    addPerson(person) {
      if (data.people.length >= MAX_PEOPLE) return null;
      const id = uid('person');
      const next = { ...data, people: [...data.people, { id, name: clean(person.name, 40) || '新档案', ageGroup: AGE_GROUPS.includes(person.ageGroup) ? person.ageGroup : 'adult' }], activeId: id, profiles: { ...data.profiles, [id]: emptyProfile() } };
      return write(next) ? next.people[next.people.length - 1] : null;
    },
    replace(snapshot) { return write(snapshot, { force: true }); },
    recoverPrevious() {
      let stored;
      try {
        stored = localStorage.getItem(PREVIOUS_STORAGE_KEY);
      } catch (error) {
        lastError = '上一份方向数据读取失败，当前档案未改变';
        return false;
      }
      if (stored === null) {
        lastError = '没有可恢复的上一份方向数据';
        return false;
      }
      let previous;
      try {
        previous = JSON.parse(stored);
      } catch (error) {
        lastError = '上一份方向数据格式无效，当前档案未改变';
        return false;
      }
      if (!previous || previous.version !== 1) {
        lastError = '上一份方向数据格式无效，当前档案未改变';
        return false;
      }
      const result = write(previous, { force: true });
      if (!result) {
        try { localStorage.setItem(PREVIOUS_STORAGE_KEY, stored); } catch (error) { backupError = '恢复失败且上一份备份无法保留'; }
      }
      return result;
    },
    exportSnapshot() { return { ...normalizeTalentStore(data, normalizedOptions), exportedAt: Date.now() }; },
    clearError() { lastError = ''; backupError = ''; }
  };
}

export const talentAgeGroups = AGE_GROUPS;
