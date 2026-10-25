/*
 * Small, deterministic helpers for the talent direction screens.
 *
 * This module deliberately does not score a person. It only matches age,
 * preferences and available time to catalog activities, and summarizes the
 * records that were explicitly saved by the person or caregiver.
 */

const GOAL_DIRECTIONS = Object.freeze({
  daily: Object.freeze(['organization', 'interpersonal', 'movement', 'nature']),
  work: Object.freeze(['coding', 'organization', 'expression', 'analysis', 'interpersonal']),
  creative: Object.freeze(['design', 'expression', 'music', 'nature']),
  learning: Object.freeze(['analysis', 'expression', 'coding', 'music', 'nature']),
  connection: Object.freeze(['interpersonal', 'expression', 'music']),
  companion: Object.freeze(['interpersonal', 'expression', 'movement', 'music', 'nature']),
  discover: Object.freeze(['expression', 'analysis', 'design', 'coding', 'organization', 'interpersonal', 'music', 'movement', 'nature'])
});

export const preferenceOptions = Object.freeze({
  goals: Object.freeze([
    { id: 'daily', label: '日常生活', directions: GOAL_DIRECTIONS.daily },
    { id: 'work', label: '工作应用', directions: GOAL_DIRECTIONS.work },
    { id: 'creative', label: '创作表达', directions: GOAL_DIRECTIONS.creative },
    { id: 'learning', label: '学习探索', directions: GOAL_DIRECTIONS.learning },
    { id: 'connection', label: '沟通连接', directions: GOAL_DIRECTIONS.connection },
    { id: 'companion', label: '陪伴互动', directions: GOAL_DIRECTIONS.companion },
    { id: 'discover', label: '还在发现', directions: GOAL_DIRECTIONS.discover }
  ]),
  timeBudgets: Object.freeze([10, 20, 40, 60]),
  participation: Object.freeze([
    { id: 'solo', label: '自己完成' },
    { id: 'together', label: '一起完成' }
  ]),
  levels: Object.freeze([
    { id: 'start', label: '先熟悉' },
    { id: 'practice', label: '重复练习' },
    { id: 'apply', label: '放到真实场景' }
  ])
});

const LEVELS = new Set(preferenceOptions.levels.map(item => item.id));
const PARTICIPATION = new Set(preferenceOptions.participation.map(item => item.id));
const GOALS = new Set(preferenceOptions.goals.map(item => item.id));
const AGE_GROUPS = new Set(['early', 'preschool', 'child', 'teen', 'adult', 'later']);
const MINUTE_BUDGETS = new Set(preferenceOptions.timeBudgets);
const EMPTY_ARRAY = Object.freeze([]);
const RECENT_SIGNAL_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const DIRECTION_DIVERSITY_SCORE_GAP = 6;

function asArray(value) {
  return Array.isArray(value) ? value : EMPTY_ARRAY;
}

function asText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function finiteNumber(value) {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function wholeNumber(value) {
  const number = finiteNumber(value);
  return number !== null && Number.isInteger(number) ? number : null;
}

function validDateValue(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function localDateKey(value) {
  const date = validDateValue(value);
  if (!date) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function startOfLocalDay(value) {
  const date = validDateValue(value);
  if (!date) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addLocalDays(value, days) {
  const date = startOfLocalDay(value);
  if (!date) return null;
  date.setDate(date.getDate() + days);
  return date;
}

function formatPeriodLabel(start, end) {
  const startDate = startOfLocalDay(start);
  const endDate = startOfLocalDay(end);
  if (!startDate || !endDate) return '';
  const sameYear = startDate.getFullYear() === endDate.getFullYear();
  const year = String(startDate.getFullYear());
  const startText = `${startDate.getMonth() + 1}月${startDate.getDate()}日`;
  const endText = `${endDate.getMonth() + 1}月${endDate.getDate()}日`;
  return sameYear ? `${year}年${startText}—${endText}` : `${year}年${startText}—${endDate.getFullYear()}年${endText}`;
}

function normalizeNow(value) {
  const date = validDateValue(value);
  return date || new Date();
}

function normalizeCatalog(catalog) {
  const source = catalog && typeof catalog === 'object' ? catalog : {};
  return {
    directions: asArray(source.directions).filter(item => item && typeof item === 'object'),
    tasks: asArray(source.tasks).filter(item => item && typeof item === 'object'),
    ageGroups: asArray(source.ageGroups).filter(item => item && typeof item === 'object')
  };
}

function normalizeAge(ageGroup) {
  return AGE_GROUPS.has(ageGroup) ? ageGroup : asText(ageGroup);
}

function normalizePreferences(profile, supplied) {
  const fromProfile = profile && typeof profile === 'object' && profile.preferences && typeof profile.preferences === 'object'
    ? profile.preferences
    : {};
  const source = supplied && typeof supplied === 'object' ? { ...fromProfile, ...supplied } : fromProfile;
  const goals = asArray(source.goals).filter(goal => GOALS.has(goal));
  const goal = GOALS.has(source.goal) ? source.goal : goals[0] || 'discover';
  const minutesValue = wholeNumber(source.minutes);
  const minutes = MINUTE_BUDGETS.has(minutesValue) ? minutesValue : 20;
  const participation = PARTICIPATION.has(source.participation) ? source.participation : 'solo';
  const level = LEVELS.has(source.level) ? source.level : 'start';
  return { goal, goals: goals.length ? [...new Set(goals)] : [goal], minutes, participation, level };
}

function taskAgeMatch(task, ageGroup) {
  return Boolean(task && asArray(task.ageGroups).includes(ageGroup));
}

function taskMinutes(task) {
  const minutes = wholeNumber(task?.minutes);
  return minutes && minutes > 0 ? minutes : 10;
}

function directionTitle(catalog, directionId) {
  return catalog.directions.find(item => item.id === directionId)?.title || directionId || '这个方向';
}

function taskText(task) {
  return [task?.title, task?.summary, task?.transfer, ...asArray(task?.steps), ...asArray(task?.materials)].filter(Boolean).join('');
}

function getRecentAttempts(profile) {
  return asArray(profile?.attempts).filter(item => item && typeof item === 'object');
}

function attemptTimestamp(attempt) {
  const date = finiteNumber(attempt?.date);
  if (date !== null) return date;
  const timestamp = validDateValue(attempt?.date)?.getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function isFutureAttempt(attempt, now) {
  const timestamp = attemptTimestamp(attempt);
  return timestamp !== null && timestamp > now.getTime();
}

function evidenceText(attempt) {
  return [attempt?.changeNote, attempt?.outcomeNote, attempt?.feedback].map(asText).find(Boolean) || '';
}

function practiceEvidence(attempt) {
  // A process note records what happened. It does not by itself describe a
  // change between attempts. Keep this count tied to an explicit change note.
  return asText(attempt?.changeNote).length > 0;
}

function resultEvidence(attempt) {
  return [attempt?.artifact, attempt?.artifactTitle, attempt?.feedback, attempt?.outcomeNote].some(value => asText(value).length > 0)
    || ['useful', 'needs-work'].includes(attempt?.outcome);
}

function levelLabel(level) {
  return preferenceOptions.levels.find(item => item.id === level)?.label || '先熟悉';
}

function goalLabel(goal) {
  return preferenceOptions.goals.find(item => item.id === goal)?.label || '还在发现';
}

function participationLabel(value) {
  return preferenceOptions.participation.find(item => item.id === value)?.label || '自己完成';
}

function shortenedMethod(task, level, minutes, ageGroup) {
  const base = taskMinutes(task);
  const adaptation = asText(task?.adaptations?.[level] || task?.adaptations?.start);
  const firstStep = task?.learningPaths?.[level]?.firstStep || asArray(task?.steps)[0] || asText(task?.summary) || '先完成一个可停下来的小步骤';
  const childHint = ['early', 'preschool', 'child'].includes(ageGroup) ? '，孩子可以只看、只听或随时停下' : '';
  if (base <= minutes) {
    return adaptation || `按${levelLabel(level)}进行约${base}分钟，完成后留下一个可回看的观察或结果${childHint}。`;
  }
  return `缩短版（${minutes}分钟）：只做这一小步：“${firstStep}”，到时间就停下并留下一个小记录${childHint}。原任务约${base}分钟，剩余步骤下次再做。`;
}

export function describeTaskStart({task, profile = {}, ageGroup, preferences} = {}) {
  const age = normalizeAge(ageGroup);
  if (!task || !age || !taskAgeMatch(task, age)) return null;
  const prefs = normalizePreferences(profile, preferences);
  const base = taskMinutes(task);
  const adaptedMinutes = Math.min(base, prefs.minutes);
  const startingStep = task.learningPaths?.[prefs.level]?.firstStep || asArray(task.steps)[0] || task.summary;
  return {task, adaptedMinutes, learningBase:prefs.level, startingStep, cardStep:task.learningPaths?.[prefs.level]?.cardPrompt || startingStep, isShortVersion:base > prefs.minutes, method:shortenedMethod(task, prefs.level, adaptedMinutes, age)};
}

function recommendationReasons(task, preferences, ageGroup, profile, shortened, catalog, now, attempts, taskById, recentAttempts) {
  const reasons = [];
  const signals = recentSelfReportSignals(task, attempts, taskById, now, recentAttempts);
  if (signals.needsWork) reasons.push('你最近把这项尝试标为“使用后还想改进”，可以带着这条记录再试一次');
  if (signals.needsWorkEvidence) reasons.push('这次还留下了改动、结果或反馈记录，适合沿着它继续调整');
  if (signals.usefulSimilar) reasons.push('你最近把同一方向的尝试标为“确实有帮助”，可以换一项相近任务继续使用');
  if (signals.feedback && !signals.needsWorkEvidence) reasons.push('这项尝试最近留过补充记录，适合继续回看和调整');
  if (signals.highEnjoyment) reasons.push(ageGroup === 'early' ? '近期照护记录中的参与意愿评分较高，可以再观察一次' : '你最近在这个方向自评愿意继续');
  const goalDirections = new Set(preferences.goals.flatMap(goal => GOAL_DIRECTIONS[goal] || EMPTY_ARRAY));
  if (goalDirections.has(task.directionId)) reasons.push(`贴合“${goalLabel(preferences.goal)}”目标，先在${directionTitle(catalog, task.directionId)}方向做一次具体尝试`);
  else if (preferences.goal === 'discover') reasons.push('保留一个新的方向作为探索入口');
  if (task.level === preferences.level) reasons.push(`符合“${levelLabel(preferences.level)}”的练习阶段`);
  else if (task.level === 'start') reasons.push('从较小范围开始，方便按当下状态调整');
  if (preferences.participation === 'together') reasons.push('步骤中有可共同观察、交流或互相反馈的空间');
  else if (!['early', 'preschool'].includes(ageGroup)) reasons.push('可以按自己的节奏完成，并留下过程记录');
  if (shortened) reasons.push(`可在${preferences.minutes}分钟内完成明确的缩短版`);
  const lowEnergy = isLowEnergy(profile, now);
  if (lowEnergy) reasons.push('近期能量记录偏低，先选短步骤并保留停止点');
  if (!reasons.length) reasons.push('与当前年龄阶段匹配，并能留下可回看的真实记录');
  return reasons.slice(0, 4);
}

function isLowEnergy(profile, nowValue = Date.now()) {
  if (profile?.lowEnergy === true || profile?.energyState === 'low' || profile?.energy === 'low') return true;
  const preference = profile?.preferences;
  if (preference?.lowEnergy === true || preference?.energy === 'low') return true;
  const now = normalizeNow(nowValue).getTime();
  const cutoff = now - (14 * 24 * 60 * 60 * 1000);
  const recent = getRecentAttempts(profile)
    .filter(item => {
      const timestamp = attemptTimestamp(item);
      return timestamp !== null && timestamp >= cutoff && timestamp <= now
        && wholeNumber(item.energy) !== null && wholeNumber(item.energy) >= 1 && wholeNumber(item.energy) <= 5;
    })
    .sort((a, b) => (attemptTimestamp(b) || 0) - (attemptTimestamp(a) || 0))
    .slice(0, 3);
  return recent.length > 0 && recent.reduce((sum, item) => sum + Number(item.energy), 0) / recent.length <= 2;
}

function recentSignalAttempts(attempts, now) {
  const nowTime = now.getTime();
  const cutoff = nowTime - RECENT_SIGNAL_WINDOW_MS;
  return attempts
    .filter(attempt => {
      const timestamp = attemptTimestamp(attempt);
      return timestamp !== null && timestamp >= cutoff && timestamp <= nowTime;
    })
    .sort((a, b) => (attemptTimestamp(b) || 0) - (attemptTimestamp(a) || 0));
}

function recentSelfReportSignals(task, attempts, taskById, now, suppliedRecentAttempts) {
  // These are explicit, recent self-reports used as small routing clues, not
  // evidence of ability or progress.
  const recent = suppliedRecentAttempts || recentSignalAttempts(attempts, now);
  const taskAttempts = recent.filter(attempt => attempt.taskId === task.id).slice(0, 3);
  const directionAttempts = recent
    .filter(attempt => taskById.get(attempt.taskId)?.directionId === task.directionId)
    .slice(0, 3);
  const enjoyment = directionAttempts
    .map(attempt => wholeNumber(attempt.enjoyment))
    .filter(value => value !== null && value >= 1 && value <= 5);
  const averageEnjoyment = enjoyment.length
    ? enjoyment.reduce((sum, value) => sum + value, 0) / enjoyment.length
    : null;
  const needsWork = taskAttempts.some(attempt => attempt.outcome === 'needs-work');
  const needsWorkEvidence = taskAttempts.some(attempt => attempt.outcome === 'needs-work' && evidenceText(attempt));
  const usefulSimilar = directionAttempts.some(attempt => attempt.taskId !== task.id && attempt.outcome === 'useful');
  return {
    needsWork,
    needsWorkEvidence,
    usefulSimilar,
    feedback: taskAttempts.some(attempt => asText(attempt.feedback)),
    highEnjoyment: averageEnjoyment !== null && averageEnjoyment >= 4,
    lowEnjoyment: averageEnjoyment !== null && averageEnjoyment <= 2
  };
}

function recommendationScore(task, preferences, profile, ageGroup, attempts, now, taskById, recentAttempts) {
  const goalDirections = new Set(preferences.goals.flatMap(goal => GOAL_DIRECTIONS[goal] || EMPTY_ARRAY));
  const taskAttempts = attempts.filter(attempt => attempt.taskId === task.id && !isFutureAttempt(attempt, now));
  const text = taskText(task);
  let score = 0;
  if (goalDirections.has(task.directionId)) score += 35;
  if (preferences.goal === 'discover') score += 5;
  if (task.level === preferences.level) score += 15;
  if (task.level === 'start') score += 5;
  if (preferences.participation === 'together' && /家人|伙伴|同伴|一起|请一位|真实的人|听者|读者/.test(text)) score += 8;
  if (preferences.participation === 'solo' && !['early', 'preschool'].includes(ageGroup) && /自己|独立|个人|独自/.test(text)) score += 8;
  if (taskAttempts.length === 0) score += 12;
  else score -= Math.min(10, taskAttempts.length * 3);
  const base = taskMinutes(task);
  if (base <= preferences.minutes) score += 10;
  else score -= Math.min(8, Math.ceil((base - preferences.minutes) / 10));
  if (isLowEnergy(profile, now)) {
    if (base <= Math.min(preferences.minutes, 20)) score += 16;
    else score -= Math.min(20, Math.ceil((base - Math.min(preferences.minutes, 20)) / 5));
    if (task.level === 'start') score += 8;
    if (task.level === 'apply') score -= 6;
  }
  const signals = recentSelfReportSignals(task, attempts, taskById, now, recentAttempts);
  // Bound the adjustment so one record cannot outweigh age, goal, time, or
  // level matching, and repeated records cannot compound it indefinitely.
  const selfReportAdjustment = (signals.needsWork ? 4 : 0)
    + (signals.needsWorkEvidence ? 2 : 0)
    + (signals.usefulSimilar ? 3 : 0)
    + (signals.feedback ? 1 : 0)
    + (signals.highEnjoyment ? 2 : 0)
    - (signals.lowEnjoyment ? 2 : 0);
  score += Math.max(-2, Math.min(7, selfReportAdjustment));
  // Stable tie breaker: catalog order is kept by the caller.
  return score;
}

export function recommendTasks({ catalog: rawCatalog, profile = {}, ageGroup, preferences, limit = 3, now = Date.now() } = {}) {
  const catalog = normalizeCatalog(rawCatalog);
  const age = normalizeAge(ageGroup);
  const prefs = normalizePreferences(profile, preferences);
  const current = normalizeNow(now);
  const max = Math.max(0, Math.min(20, wholeNumber(limit) ?? 3));
  if (!max || !age) return [];
  const attempts = getRecentAttempts(profile);
  const recentAttempts = recentSignalAttempts(attempts, current);
  const sameAge = catalog.tasks.filter(task => taskAgeMatch(task, age));
  const taskById = new Map(catalog.tasks.map(task => [task.id, task]));
  const ranked = sameAge.map((task, index) => ({ task, index, score: recommendationScore(task, prefs, profile, age, attempts, current, taskById, recentAttempts) }));
  ranked.sort((a, b) => b.score - a.score || taskMinutes(a.task) - taskMinutes(b.task) || a.index - b.index);

  const selected = [];
  const usedDirections = new Set();
  while (selected.length < max && selected.length < ranked.length) {
    const remaining = ranked.filter(entry => !selected.includes(entry));
    const best = remaining[0];
    const diverse = remaining.find(entry => !usedDirections.has(entry.task.directionId)
      && entry.score >= best.score - DIRECTION_DIVERSITY_SCORE_GAP);
    const entry = diverse || best;
    selected.push(entry);
    usedDirections.add(entry.task.directionId);
  }
  return selected.map(({ task }) => {
    const start = describeTaskStart({task,profile,ageGroup:age,preferences:prefs});
    return {...start,reasons:recommendationReasons(task,prefs,age,profile,start.isShortVersion,catalog,current,attempts,taskById,recentAttempts)};
  });
}

function windowAttempts(attempts, catalog, ageGroup, start, end) {
  const startTime = start.getTime();
  const endTime = addLocalDays(end, 1).getTime();
  const knownTasks = new Map(catalog.tasks.filter(task => taskAgeMatch(task, ageGroup)).map(task => [task.id, task]));
  return attempts.filter(attempt => {
    const task = knownTasks.get(attempt.taskId);
    const timestamp = attemptTimestamp(attempt);
    return Boolean(task && timestamp !== null && timestamp >= startTime && timestamp < endTime);
  }).map(attempt => ({ attempt, task: knownTasks.get(attempt.taskId), timestamp: attemptTimestamp(attempt) }));
}

function countSummary(entries) {
  const dates = new Set(entries.map(item => localDateKey(item.timestamp)).filter(Boolean));
  const tasks = new Set(entries.map(item => item.task.id));
  const directions = new Set(entries.map(item => item.task.directionId).filter(Boolean));
  return {
    attempts: entries.length,
    days: dates.size,
    tasks: tasks.size,
    directions: directions.size,
    artifacts: entries.filter(item => asText(item.attempt.artifact) || asText(item.attempt.artifactTitle)).length,
    feedback: entries.filter(item => asText(item.attempt.feedback)).length,
    outcomes: entries.filter(item => ['useful', 'needs-work'].includes(item.attempt.outcome) || asText(item.attempt.outcomeNote)).length
  };
}

function compareMode(first, latest) {
  const firstMode = first?.mode === 'independent' ? '独立记录' : first?.mode === 'assisted' ? '有人陪伴记录' : '';
  const latestMode = latest?.mode === 'independent' ? '独立记录' : latest?.mode === 'assisted' ? '有人陪伴记录' : '';
  if (!firstMode || !latestMode) return '暂无独立性记录';
  if (firstMode === latestMode) return `两次均为${latestMode}`;
  return `从${firstMode}变为${latestMode}`;
}

function buildComparisons(entries) {
  const byTask = new Map();
  for (const entry of entries) {
    const list = byTask.get(entry.task.id) || [];
    list.push(entry);
    byTask.set(entry.task.id, list);
  }
  return [...byTask.values()].filter(list => list.length >= 2).map(list => {
    list.sort((a, b) => a.timestamp - b.timestamp);
    const first = list[0].attempt;
    const latest = list[list.length - 1].attempt;
    const latestChangeNote = asText(latest.changeNote);
    const feedback = asText(latest.feedback) || asText(first.feedback);
    return {
      task: list[list.length - 1].task,
      first,
      latest,
      independenceChange: compareMode(first, latest),
      changeNote: latestChangeNote || '有重复记录，尚未写具体前后变化',
      feedback,
      hasComparableEvidence: Boolean(latestChangeNote)
    };
  });
}

function averageRating(entries, key) {
  const values = entries.map(item => wholeNumber(item.attempt?.[key])).filter(value => value !== null && value >= 1 && value <= 5);
  if (!values.length) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function directionSignal(entries, previousEntries) {
  if (!entries.length) return previousEntries.length ? '本周没有新增尝试，先保留上周记录' : '还没有这周的尝试';
  const practice = entries.filter(item => practiceEvidence(item.attempt)).length;
  const result = entries.filter(item => resultEvidence(item.attempt)).length;
  if (!practice && !result) return `${entries.length}次尝试已记录，具体变化或结果证据还很少`;
  if (!result) return `${entries.length}次尝试有过程记录，结果证据还在积累`;
  if (!practice) return `${entries.length}次尝试留下了结果，过程记录还可以补充`;
  return `${entries.length}次尝试同时留下过程与结果记录`;
}

function nextStepForDirection(direction, entries, ageGroup) {
  if (!entries.length) return '先做一个同年龄的小实验，留下过程观察。';
  const hasResult = entries.some(item => resultEvidence(item.attempt));
  if (!hasResult) return '沿用这次的步骤，再补一条作品、结果或他人反馈。';
  if (['early', 'preschool', 'child'].includes(ageGroup)) return '保留孩子的选择和停止信号，再邀请一次小变化。';
  return '换一个相近场景再试一次，记录哪一处做法需要调整。';
}

function directionReport(catalog, entries, previousEntries, ageGroup) {
  return catalog.directions.map(direction => {
    const current = entries.filter(item => item.task.directionId === direction.id);
    const previous = previousEntries.filter(item => item.task.directionId === direction.id);
    return {
      id: direction.id,
      title: direction.title || direction.id,
      attempts: current.length,
      enjoyment: averageRating(current, 'enjoyment'),
      energy: averageRating(current, 'energy'),
      practiceEvidence: current.filter(item => practiceEvidence(item.attempt)).length,
      resultEvidence: current.filter(item => resultEvidence(item.attempt)).length,
      signal: directionSignal(current, previous),
      nextStep: nextStepForDirection(direction, current, ageGroup)
    };
  });
}

function reportSummary(current, previous, comparisons, ageGroup) {
  const summary = [];
  if (!current.attempts) {
    summary.push('这周还没有同年龄阶段的尝试记录。');
    if (previous.attempts) summary.push(`上周记录了${previous.attempts}次尝试，可以从其中一个小步骤重新开始。`);
    else summary.push('目前证据很少，先完成一次小实验，再决定下一步。');
  } else {
    summary.push(`这周记录了${current.attempts}次尝试，分布在${current.days}个日期、${current.tasks}个任务和${current.directions}个方向。`);
    if (current.artifacts || current.feedback || current.outcomes) summary.push(`其中有${current.artifacts}次作品或结果记录、${current.feedback}次反馈、${current.outcomes}次结果标记。`);
    else summary.push('目前主要是尝试次数，作品、结果或反馈证据还在积累。');
  }
  if (previous.attempts) {
    const delta = current.attempts - previous.attempts;
    summary.push(`与前一周相比，尝试次数${delta === 0 ? '相同' : delta > 0 ? `增加${delta}次` : `减少${Math.abs(delta)}次`}。`);
  }
  const comparable = comparisons.filter(item => item.hasComparableEvidence).length;
  if (comparisons.length && comparable) summary.push(`有${comparable}个重复任务带有最新变化记录，可以继续对照。`);
  else if (comparisons.length) summary.push('有重复任务，但尚未写具体前后变化记录，暂不判断变化。');
  if (!current.attempts && ['early', 'preschool', 'child'].includes(ageGroup)) summary.push('儿童记录以当下回应和照护者观察为线索，不用于给孩子排名或下结论。');
  return summary;
}

export function buildWeeklyReport({ catalog: rawCatalog, profile = {}, ageGroup, now = Date.now() } = {}) {
  const catalog = normalizeCatalog(rawCatalog);
  const age = normalizeAge(ageGroup);
  const nowDate = normalizeNow(now);
  const currentEnd = startOfLocalDay(nowDate);
  const currentStart = addLocalDays(currentEnd, -6);
  const previousEnd = addLocalDays(currentStart, -1);
  const previousStart = addLocalDays(previousEnd, -6);
  const attempts = getRecentAttempts(profile).filter(attempt => !isFutureAttempt(attempt, nowDate));
  const currentEntries = windowAttempts(attempts, catalog, age, currentStart, currentEnd);
  const previousEntries = windowAttempts(attempts, catalog, age, previousStart, previousEnd);
  const current = countSummary(currentEntries);
  const previous = countSummary(previousEntries);
  const comparisonEntries = windowAttempts(attempts, catalog, age, previousStart, currentEnd);
  const comparisons = buildComparisons(comparisonEntries);
  const directions = directionReport(catalog, currentEntries, previousEntries, age);
  const prefs = normalizePreferences(profile);
  const next = recommendTasks({ catalog, profile, ageGroup: age, preferences: prefs, limit: 1, now: nowDate.getTime() })[0] || null;
  return {
    period: {
      start: localDateKey(currentStart),
      end: localDateKey(currentEnd),
      label: formatPeriodLabel(currentStart, currentEnd)
    },
    current,
    previous,
    comparisons,
    directions,
    summary: reportSummary(current, previous, comparisons, age),
    next
  };
}

export default { preferenceOptions, recommendTasks, buildWeeklyReport };
