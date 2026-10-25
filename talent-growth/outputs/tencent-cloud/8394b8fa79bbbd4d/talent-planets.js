/*
 * The talent atlas is an evidence view, rather than a talent score.
 *
 * Only a current-age learning task with a dated note or artifact can light a
 * planet.  The older direction tasks are retained as neighbouring context
 * when their primary direction is known, but they never become direct
 * evidence for a learning domain.
 */

const KNOWN_PRIMARY_DIRECTIONS = new Set([
  'expression', 'analysis', 'design', 'coding', 'organization',
  'interpersonal', 'music', 'movement', 'nature'
]);

const EARLY_AGES = new Set(['early']);
const FAMILY_AGES = new Set(['early', 'preschool', 'child']);
const EMPTY = Object.freeze([]);

function array(value) {
  return Array.isArray(value) ? value : EMPTY;
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function finiteTime(value) {
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function dateKey(time) {
  const date = new Date(time);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function ageMatches(task, ageGroup) {
  if (!task || !ageGroup) return false;
  if (array(task.ageGroups).length) return task.ageGroups.includes(ageGroup);
  if (typeof task.ageGroup === 'string') return task.ageGroup === ageGroup;
  return false;
}

function directionIds(world) {
  return new Set(array(world?.directionIds).filter(id => typeof id === 'string' && id));
}

function recorded(attempt, nowTime, taskById) {
  if (!attempt || typeof attempt !== 'object') return null;
  const taskId = text(attempt.taskId);
  const task = taskById.get(taskId);
  if (!task) return null;
  const time = finiteTime(attempt.date);
  if (time === null || time <= 0 || time > nowTime) return null;
  // A rating alone is not a record.  Keep the rule aligned with the store:
  // the person must have left an observation or a result/artifact.
  if (!text(attempt.note) && !text(attempt.artifact)) return null;
  return { attempt, task, time };
}

function dedupeRecorded(items) {
  const byId = new Map();
  const withoutId = [];
  items.forEach((item, index) => {
    const id = text(item?.attempt?.id);
    if (!id) {
      // Missing or malformed ids are separate imported records. Do not make
      // one id-less row erase another row.
      withoutId.push({ item, index });
      return;
    }
    const previous = byId.get(id);
    if (!previous || item.time >= previous.item.time || (item.time === previous.item.time && index > previous.index)) {
      byId.set(id, { item, index });
    }
  });
  return [
    ...[...byId.values()].map(entry => entry.item),
    ...withoutId.map(entry => entry.item)
  ];
}

function hasChange(item) {
  return Boolean(text(item?.attempt?.changeNote));
}

function hasFeedback(item) {
  return Boolean(text(item?.attempt?.feedback));
}

function hasArtifact(item) {
  return Boolean(text(item?.attempt?.artifact) || text(item?.attempt?.artifactTitle));
}

function hasAppliedEvidence(item) {
  return item?.attempt?.outcome === 'useful' && Boolean(text(item?.attempt?.outcomeNote));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function firstTask(tasks, predicate) {
  return tasks.find(predicate) || tasks[0] || null;
}

function taskForAction(tasks, state, latestTaskId) {
  if (!tasks.length) return null;
  if (state === 'repeat' && latestTaskId) {
    const latest = tasks.find(task => task.id === latestTaskId);
    if (latest) return latest;
  }
  if (state === 'check-use') {
    return firstTask(tasks, task => task.level === 'apply' || task.learningPaths?.apply);
  }
  if (state === 'refine') {
    return firstTask(tasks, task => task.level === 'practice' || task.learningPaths?.practice);
  }
  return firstTask(tasks, task => task.level === 'start' || task.learningPaths?.start);
}

function actionFor({ state, tasks, latestTaskId, world }) {
  const task = taskForAction(tasks, state, latestTaskId);
  const title = text(task?.title) || '这项小实验';
  const labels = {
    start: '开始一次小实验',
    repeat: `再做一次：${title}`,
    'check-use': `放到一个小场景：${title}`,
    refine: `改一处再试：${title}`
  };
  const reasons = {
    start: `还没有${text(world?.title) || '这个领域'}的直接记录，可以先从一件可停下的小事开始。`,
    repeat: '已有直接尝试，下一次可以沿用熟悉材料并只改一个地方。',
    'check-use': '已经留下重复尝试和变化或反馈，可以自选一个小范围场景检查是否有帮助。',
    refine: '已经有实际使用记录，可以回看限制并改一处再试。'
  };
  return {
    kind: state,
    taskId: task?.id || null,
    label: labels[state],
    reason: reasons[state]
  };
}

function evidenceFor(counts) {
  const evidence = [
    { label: '直接尝试', value: counts.attempts },
    { label: '不同日期', value: counts.days },
    { label: '具体变化', value: counts.changes },
    { label: '反馈', value: counts.feedback },
    { label: '作品或结果', value: counts.artifacts },
    { label: '实际使用', value: counts.applied }
  ];
  if (counts.relatedAttempts) evidence.push({ label: '相关能力经历', value: counts.relatedAttempts });
  return evidence;
}

function recordsFor(direct) {
  return [...direct]
    .sort((a, b) => b.time - a.time)
    .slice(0, 3)
    .map(item => {
      const attempt = item.attempt;
      return {
        attemptId: text(attempt.id) || null,
        taskId: text(attempt.taskId),
        date: attempt.date,
        note: text(attempt.note),
        artifact: text(attempt.artifact),
        changeNote: text(attempt.changeNote),
        feedback: text(attempt.feedback),
        outcome: text(attempt.outcome) || 'untried',
        outcomeNote: text(attempt.outcomeNote)
      };
    });
}

function cautionsFor({ direct, ageGroup }) {
  const latest = direct[direct.length - 1]?.attempt;
  if (!latest) return [];
  const cautions = [];
  const early = EARLY_AGES.has(ageGroup);
  const enjoyment = Number(latest.enjoyment);
  const energy = Number(latest.energy);
  if (Number.isInteger(enjoyment) && enjoyment >= 1 && enjoyment <= 2) {
    cautions.push(early
      ? '最近一次照护记录中的参与意愿较低，可以缩短时间、换材料或先停下。'
      : '最近一次自述的继续意愿较低，可以缩短时间、换材料或先停下。');
  }
  if (Number.isInteger(energy) && energy >= 1 && energy <= 2) {
    cautions.push(early
      ? '最近一次记录中的照护者余力较低，先照顾当下状态，再决定是否继续。'
      : '最近一次自述的能量较低，先照顾当下状态，再决定是否继续。');
  }
  return cautions;
}

function opportunitiesFor(world, ageGroup) {
  const project = world?.project && typeof world.project === 'object' ? world.project : {};
  const entry = world?.entries?.[ageGroup] && typeof world.entries[ageGroup] === 'object'
    ? world.entries[ageGroup]
    : {};
  const bridge = world?.bridge && typeof world.bridge === 'object' ? world.bridge : {};
  const candidates = [];
  if (FAMILY_AGES.has(ageGroup)) {
    candidates.push(entry.steps?.[0], entry.steps?.[1], entry.transfer);
  } else {
    candidates.push(project.practicePrompt, project.usePrompt, entry.transfer);
  }
  if (text(bridge.reason)) candidates.push(`顺着相邻领域试一小步：${text(bridge.reason)}`);
  return unique(candidates.map(text)).slice(0, 3);
}

function explanationFor({ state, counts, relatedAttempts, ageGroup }) {
  const early = EARLY_AGES.has(ageGroup);
  const stateText = {
    unexplored: '目前还没有这个领域的直接记录，不能据此说存在短板。',
    encountered: '目前已有直接尝试记录，但还未满足不同日期以及具体变化或反馈的条件，先把它当作遇见这个领域的线索。',
    returning: '已有不同日期的重复尝试，并留下至少两条具体变化或反馈，适合继续回看。',
    applied: '已有不同日期的多次尝试，其中有明确的实际使用记录，适合继续检查限制和调整。'
  }[state];
  const context = early ? '早期档案侧重照护者与孩子的参与过程，不把它当作孩子能力结论。' : '';
  const related = relatedAttempts
    ? `另有${relatedAttempts}次旧方向任务的相关能力经历，只作邻近线索，不点亮本领域。`
    : '';
  const rule = '状态阈值是产品规则，不是经过验证的测量；不用于人与人归一化比较，也不构成总分或能力排序。';
  return [stateText, context, related, rule].filter(Boolean).join(' ');
}

function confidenceFor(state, ageGroup) {
  if (EARLY_AGES.has(ageGroup)) return {
    unexplored: '尚无照护参与线索',
    encountered: '已有照护参与线索',
    returning: '重复照护参与线索',
    applied: '实际使用照护线索'
  }[state];
  return {
    unexplored: '尚无直接线索',
    encountered: '已有直接线索',
    returning: '重复尝试线索',
    applied: '实际使用线索'
  }[state];
}

/**
 * Build the evidence state for all learning worlds.
 *
 * @returns {{planets: Array<object>}}
 */
export function buildTalentPlanets({ catalog, learning, profile, ageGroup, now = Date.now() } = {}) {
  const worlds = array(learning?.worlds).filter(world => world && text(world.id));
  const tasks = array(catalog?.tasks).filter(task => task && text(task.id));
  const taskById = new Map(tasks.map(task => [task.id, task]));
  const nowTime = finiteTime(now) ?? Date.now();
  const attempts = dedupeRecorded(array(profile?.attempts)
    .map(attempt => recorded(attempt, nowTime, taskById))
    .filter(Boolean))
    .sort((a, b) => a.time - b.time);
  const knownDirections = new Set([
    ...KNOWN_PRIMARY_DIRECTIONS,
    ...array(catalog?.directions).map(direction => text(direction?.id)).filter(Boolean)
  ]);

  return {
    planets: worlds.map(world => {
      const worldId = text(world.id);
      const direct = attempts.filter(item => ageMatches(item.task, ageGroup) && item.task.learningDomainId === worldId);
      const directTaskIds = new Set(direct.map(item => item.attempt.taskId));
      const worldDirections = directionIds(world);
      const related = attempts.filter(item => {
        if (!ageMatches(item.task, ageGroup) || item.task.learningDomainId || directTaskIds.has(item.attempt.taskId)) return false;
        const primary = text(item.task.directionId);
        return knownDirections.has(primary) && worldDirections.has(primary);
      });
      const days = unique(direct.map(item => dateKey(item.time)));
      const changes = direct.filter(hasChange).length;
      const feedback = direct.filter(hasFeedback).length;
      const artifacts = direct.filter(hasArtifact).length;
      const applied = direct.filter(hasAppliedEvidence).length;
      const concreteEntries = direct.filter(item => hasChange(item) || hasFeedback(item));
      const hasApplied = applied > 0 && direct.length >= 2 && days.length >= 2;
      const state = hasApplied
        ? 'applied'
        : direct.length >= 2 && days.length >= 2 && concreteEntries.length >= 2
          ? 'returning'
          : direct.length
            ? 'encountered'
            : 'unexplored';
      const currentTasks = tasks.filter(task => ageMatches(task, ageGroup) && task.learningDomainId === worldId);
      const latest = direct[direct.length - 1];
      const counts = {
        attempts: direct.length,
        days: days.length,
        changes,
        artifacts,
        feedback,
        applied,
        relatedAttempts: related.length
      };
      return {
        id: worldId,
        title: text(world.title) || worldId,
        color: text(world.color),
        state,
        stateLabel: { unexplored: '未探索', encountered: '已遇见', returning: '正在回访', applied: '已有应用' }[state],
        brightness: { unexplored: 0, encountered: 1, returning: 2, applied: 3 }[state],
        counts,
        evidence: evidenceFor(counts),
        records: recordsFor(direct),
        cautions: cautionsFor({ direct, ageGroup }),
        opportunities: opportunitiesFor(world, ageGroup),
        nextAction: actionFor({ state: state === 'unexplored' ? 'start' : state === 'encountered' ? 'repeat' : state === 'returning' ? 'check-use' : 'refine', tasks: currentTasks, latestTaskId: latest?.attempt?.taskId, world }),
        recentTaskId: latest?.attempt?.taskId || null,
        confidenceLabel: confidenceFor(state, ageGroup),
        explanation: explanationFor({ state, counts, relatedAttempts: related.length, ageGroup })
      };
    })
  };
}

