import growthProgress from './growth-progress.js';
import { createTalentStore } from './talent-store.js';
import { preferenceOptions, recommendTasks, describeTaskStart, buildWeeklyReport } from './talent-insights.js';
import { renderSetup, renderReport, renderJournal, renderAttemptFields, renderCloud } from './talent-journey.js';
import { cloudRequest } from './talent-cloud.js';
import learning from './learning-data.js';
import { buildTalentPlanets } from './talent-planets.js';
import { renderTalentPlanets } from './talent-planets-ui.js';
import { renderCultivationEntry, renderCultivationResearch } from './cultivation-ui.js';
import { normalizeExploration, explorationSnapshot, renderLearningAtlas, renderLearningTrail, renderTaskParticipation, wanderingTasks } from './learning-ui.js';

const { normalizeLevels, progressOf } = growthProgress;
const AGE_LABELS = {
  early: '0–2 岁', preschool: '3–6 岁', child: '7–12 岁',
  teen: '13–17 岁', adult: '18–59 岁', later: '60 岁以上'
};

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const hasDirection = (task,id) => task.directionId === id || Array.isArray(task.directionIds) && task.directionIds.includes(id);
const text = (value, max = 1200) => typeof value === 'string' ? value.slice(0, max).trim() : '';
const array = value => Array.isArray(value) ? value : [];
const localDateKey = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const todayKey = () => localDateKey();

function normalizeData(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    ...source,
    ageGroups: array(source.ageGroups),
    directions: array(source.directions),
    tasks: array(source.tasks),
    combinations: array(source.combinations),
    sources: array(source.sources)
  };
}

function taskModel(task) {
  const criteria = array(task.rubric).length ? task.rubric : (array(task.complete).length ? task.complete : task.steps);
  return { ...task, complete: criteria, rubric: criteria };
}

function taskProgress(task, entry) {
  return progressOf(taskModel(task), entry || {});
}

function battery(percent) {
  return `<span class="tg-battery" role="img" aria-label="${Math.round(percent)}%"><i style="width:${Math.max(0, Math.min(100, percent))}%"></i></span>`;
}

const SCENES = {
  daily: { label: '日常生活', directions: ['organization', 'interpersonal', 'movement', 'nature'] },
  learning: { label: '学习创造', directions: ['expression', 'analysis', 'design', 'music'] },
  work: { label: '工作应用', directions: ['coding', 'organization', 'expression', 'analysis'] },
  companion: { label: '陪伴探索', directions: null }
};
const LEVELS = { start: '初次接触', practice: '已有基础', apply: '真实应用' };
const CAREGIVER_LEVELS = { start: '先熟悉玩法', practice: '重复与变化', apply: '融入日常' };

function mountTalent({ root, onOpenGrowth, catalog } = {}) {
  if (!root) throw new Error('Talent root is required');
  root.__talentCleanup?.();
  const store = createTalentStore();
  const state = { view: 'discover', ageFilter: store.activePerson()?.ageGroup || 'adult', scene: '', levelFilter: '', directionId: '', taskId: '', cardIndex: 0, notice: store.lastError || '', attemptDraft: null, savedAttemptId: '', taskSuggestion: null, catalogError: false, requestedAge: '', feed: store.profile()?.preferences ? 'for-you' : 'roam', learningWorldId:'', wanderingRound:0, taskOrigin:'', clueTab:'planets', planetId:'', cloud: { authenticated:false, username:'', meta:null, loading:false, busy:false, error:'', register:false, checked:false } };
  let data = catalog ? normalizeData(catalog) : null;
  let destroyed = false;
  let loadAttempt = 0;

  const activePerson = () => store.activePerson();
  const profile = () => store.profile(activePerson()?.id);
  const direction = id => data.directions.find(item => item.id === id) || data.directions[0];
  const recommendations = () => { const wander = state.feed === 'roam' ? wanderingTasks({catalog:data,learning,profile:profile(),person:activePerson(),round:state.wanderingRound}) : []; const p=normalizeExploration(profile().exploration,activePerson().ageGroup,learning,profile().preferences?.level);return wander.length ? wander : recommendTasks({catalog:data,profile:profile(),ageGroup:activePerson().ageGroup,preferences:profile().exploration ? {...profile().preferences,level:p.learningBase} : profile().preferences}); };
  const isPersonalFeed = () => ['for-you','roam'].includes(state.feed);
  const tasks = () => isPersonalFeed() && state.ageFilter === activePerson().ageGroup ? recommendations().map(item=>item.task) : data.tasks.filter(item => (!state.ageFilter || array(item.ageGroups).includes(state.ageFilter)) && (!state.directionId || hasDirection(item,state.directionId)) && (!state.levelFilter || item.level === state.levelFilter || item.learningPaths?.[state.levelFilter]) && (!state.scene || !SCENES[state.scene]?.directions || SCENES[state.scene].directions.includes(item.directionId)));
  const levelLabels = () => state.ageFilter === 'early' ? CAREGIVER_LEVELS : LEVELS;
  const selectedTask = () => data.tasks.find(item => item.id === state.taskId);
  const directionTasks = id => data.tasks.filter(item => hasDirection(item,id) && array(item.ageGroups).includes(activePerson()?.ageGroup));

  function notify(message) { state.notice = message; render(); }
  async function loadCatalog() {
    if (catalog) return;
    try {
      state.catalogError = false;
      loadAttempt += 1;
      const module = await import(`./talent-data.js?retry=${loadAttempt}`);
      const loaded = module.default || module;
      if (!destroyed && loaded?.tasks?.length && loaded?.directions?.length) { data = normalizeData(loaded); state.notice = ''; render(); }
      else if (!destroyed) { state.catalogError = true; state.notice = '方向目录格式不完整'; render(); }
    } catch (error) {
      if (!destroyed) { state.catalogError = true; state.notice = '方向目录读取失败，请重试'; render(); }
    }
  }
  function persist(mutator, success = '') {
    if (!store.update(mutator)) { state.notice = store.lastError || '保存失败，已恢复上一状态'; render(); return false; }
    state.notice = success;
    return true;
  }
  function renderProfileStrip() {
    const person = activePerson();
    return `<div class="tg-profile-strip"><div><span class="tg-kicker">当前视角</span><strong>${esc(person.name)}</strong><small>${esc(AGE_LABELS[person.ageGroup] || person.ageGroup)}</small></div><div class="tg-profile-people">${store.data.people.map(item => `<button class="${item.id === person.id ? 'active' : ''}" data-talent-action="switch-person" data-person-id="${esc(item.id)}">${esc(item.name)}</button>`).join('')}<button data-talent-action="toggle-family">＋ 档案</button></div></div>`;
  }
  function renderHero() {
    if (profile().preferences) { const p=profile().preferences; const goal=preferenceOptions.goals.find(x=>x.id===p.goal)?.label || '方向探索'; return `<section class="tg-hero tg-hero-personal"><div class="tg-hero-copy"><span class="tg-kicker">${esc(activePerson().name)} · ${esc(goal)} · ${p.minutes} 分钟</span><h1>每次陪伴，<em>都有新的生长</em></h1><button class="tg-inline-link" data-talent-action="open-setup">调整陪伴目标与起点 →</button></div></section>`; }
    return `<section class="tg-hero"><div class="tg-hero-copy"><span class="tg-kicker">家庭成长培养 · ${esc(AGE_LABELS[activePerson().ageGroup])}</span><h1>陪孩子把一颗种子，<em>照料成自己的花园</em></h1><p>从一次具体的小实验开始，记录孩子愿意继续、想停下和作品变化，再决定下一步怎样陪伴。</p><div class="tg-hero-actions"><button class="tg-button tg-button-primary" data-talent-action="open-family">为孩子找到起点</button><button class="tg-button tg-button-quiet" data-talent-action="open-setup">先看看探索</button></div></div><div class="tg-orbit" aria-hidden="true"><span class="tg-seed">✦</span><i></i><b></b><small></small></div></section>`;
  }
  function renderNav() {
    return `<nav class="tg-nav" aria-label="方向导航">${[['discover', '发现'], ['cultivate', '培养'], ['clues', '星球'], ['family', '家人']].map(([key, label]) => `<button class="${(state.view === key || (key === 'discover' && state.view === 'atlas') || (key === 'clues' && state.view === 'journal')) ? 'active' : ''}" data-talent-view="${key}"><span>${label}</span></button>`).join('')}</nav>`;
  }
  function renderDirectionCards() {
    const selected = data.directions.find(item => item.id === state.directionId);
    return `<section class="tg-ability-filter"><div class="tg-choice-row"><span class="tg-choice-label">能力</span><div class="tg-choice-window"><div class="tg-direction-grid tg-choice-rail" data-tg-choices="direction" role="group" aria-label="能力方向，左右滑动查看更多"><button class="tg-direction-card ${!state.directionId ? 'selected' : ''}" style="--tg-color:#789a89" aria-pressed="${!state.directionId}" data-talent-action="choose-direction" data-direction-id=""><strong>全部能力</strong><small>${data.tasks.filter(task => array(task.ageGroups).includes(state.ageFilter)).length}</small></button>${data.directions.map(item => `<button class="tg-direction-card ${item.id === state.directionId ? 'selected' : ''}" style="--tg-color:${esc(item.color || '#eb8061')}" aria-pressed="${item.id === state.directionId}" title="${esc(item.description)}" data-talent-action="choose-direction" data-direction-id="${esc(item.id)}"><i aria-hidden="true"></i><strong>${esc(item.title)}</strong><small>${data.tasks.filter(task => hasDirection(task,item.id) && array(task.ageGroups).includes(state.ageFilter)).length}</small></button>`).join('')}</div></div></div><p class="tg-direction-caption">${selected ? esc(selected.description) : '从感兴趣的能力开始，做一次看得见结果的小实验。'}</p></section>`;
  }
  function renderTaskRail() {
    const items = tasks();
    if (!items.length) return '<div class="tg-empty">这些条件下暂时没有实验，可以放宽基础或场景再看看。<button class="tg-button tg-button-quiet" data-talent-action="clear-filters">查看这个年龄的全部实验</button></div>';
    const index = Math.min(state.cardIndex, items.length - 1);
    const personal = isPersonalFeed() && state.ageFilter === activePerson().ageGroup;
    const suggestions = personal ? recommendations() : [];
    return `<section class="tg-task-explorer"><div class="tg-section-head"><div><span class="tg-kicker">今日实验</span><h2>${personal ? state.feed === 'roam' ? '今天的三个小入口' : '适合今天的三个开始' : state.directionId ? esc(direction(state.directionId).title) : '从一个小目标开始'}</h2></div><span class="tg-counter">${index + 1} / ${items.length}</span></div><div class="tg-rail-wrap"><button class="tg-rail-control" data-talent-action="previous-task" aria-label="上一个实验">‹</button><div class="tg-task-rail" data-tg-rail tabindex="0">${items.map((item, itemIndex) => { const progress = taskProgress(item, profile().progress[item.id]); const rec=suggestions.find(x=>x.task.id===item.id); return `<button class="tg-task-card ${itemIndex === index ? 'is-active' : ''}" data-talent-action="open-task" data-task-id="${esc(item.id)}" data-card-index="${itemIndex}"><span class="tg-task-meta"><em>${esc(item.learningDomainId ? (rec ? levelLabels()[rec.learningBase] || '分龄小实验' : '多种基础可选') : levelLabels()[item.level] || '一起探索')}</em><small>${rec?.adaptedMinutes || item.minutes || 10} 分钟${rec?.isShortVersion ? '起步版' : ''}</small></span><strong>${esc(item.title)}</strong><p>${esc(rec?.isShortVersion ? '这次先做：' + (rec.cardStep || rec.startingStep || array(item.steps)[0] || item.summary) : item.summary)}</p>${rec ? `<div class="tg-recommend-reasons">${rec.reasons.slice(0,1).map(reason=>`<span>${esc(reason)}</span>`).join('')}</div>` : ''}<div class="tg-task-foot"><span>${profile().attempts.filter(a=>a.taskId===item.id).length} 次尝试 · 完成 ${progress.percent}%</span>${battery(progress.percent)}<b>打开 →</b></div></button>`; }).join('')}</div><button class="tg-rail-control" data-talent-action="next-task" aria-label="下一个实验">›</button></div><div class="tg-dots" ${items.length > 12 ? 'hidden' : ''}>${(items.length > 12 ? [] : items).map((item, itemIndex) => `<button class="${itemIndex === index ? 'active' : ''}" data-talent-action="goto-task" data-card-index="${itemIndex}" aria-label="第 ${itemIndex + 1} 个实验"></button>`).join('')}</div></section>`;
  }
  function renderDiscover() {
    if (state.taskId) return `<div class="tg-view tg-focused-view">${renderTaskDetail()}</div>`;
    const personal = isPersonalFeed();
    return `<div class="tg-view ${personal ? 'tg-personal-view' : ''}"><div class="tg-feed-toggle"><button class="${isPersonalFeed()?'active':''}" data-talent-action="personal-feed">三件小事</button><button class="${state.feed==='all'?'active':''}" data-talent-action="browse-all">全部探索</button><button data-talent-view="atlas">探索地图 ↗</button></div>${personal ? `<p class="tg-feed-context">为 ${esc(activePerson().name)} · ${esc(AGE_LABELS[activePerson().ageGroup])} ${state.feed === 'roam' ? '随机灵感，不是能力判断' : '挑选 · 左右滑动换一个开始'}</p><div class="tg-curiosity-actions"><button class="tg-inline-link" data-talent-action="wander">随手换三件 ↻</button><button class="tg-inline-link" data-talent-view="atlas">沿着兴趣，慢慢展开 →</button></div>` : `<section class="tg-compact-filters" aria-label="探索条件"><div class="tg-choice-row"><span class="tg-choice-label">年龄</span><div class="tg-choice-window"><div class="tg-age-tabs tg-choice-rail" data-tg-choices="age" role="group" aria-label="年龄阶段，左右滑动查看更多">${data.ageGroups.map(item => `<button class="${item.id === state.ageFilter ? 'active' : ''}" aria-pressed="${item.id === state.ageFilter}" data-talent-action="choose-age" data-age-id="${esc(item.id)}">${esc(item.label)}</button>`).join('')}</div></div></div>${renderDirectionCards()}${renderExplorationOptions()}</section>`}${renderTaskRail()}</div>`;
  }
  function renderExplorationOptions() {
    const labels = levelLabels();
    return `<details class="tg-exploration-options"><summary>更多筛选 <span>${esc(SCENES[state.scene]?.label || '不限场景')} · ${esc(labels[state.levelFilter] || '不限基础')}</span></summary><div class="tg-choice-row tg-scene-row"><span class="tg-choice-label">场景</span><div class="tg-choice-window"><div class="tg-scene-tabs tg-choice-rail" data-tg-choices="scene" role="group" aria-label="生活场景">${Object.entries(SCENES).map(([id, scene]) => `<button class="${state.scene === id ? 'active' : ''}" aria-pressed="${state.scene === id}" data-talent-action="choose-scene" data-scene-id="${id}">${scene.label}</button>`).join('')}</div></div></div><div class="tg-choice-rail" role="group" aria-label="探索基础">${[['', '不限基础'], ...Object.entries(labels)].map(([id, label]) => `<button class="${state.levelFilter === id ? 'active' : ''}" aria-pressed="${state.levelFilter === id}" data-talent-action="choose-level" data-level-id="${id}">${label}</button>`).join('')}</div><p>${state.ageFilter === 'early' ? '这里区分照护者对玩法的熟悉程度。孩子可以只看、只听或停止，不以表现升级。' : '基础由你选择，可以随时更换。每张卡也提供简化、打磨和迁移三种做法。'}</p></details>`;
  }
  function renderAdaptations(task) {
    const age = data.ageGroups.find(item => array(task.ageGroups).includes(item.id));
    const labels = age?.id === 'early' ? CAREGIVER_LEVELS : LEVELS;
    const ways = task.adaptations || {};
    return `<section class="tg-adaptations"><span class="tg-kicker">适合自己的做法</span><p class="tg-age-approach">${esc(age?.approach || age?.note || '')}</p><div>${Object.entries(labels).map(([id, label]) => `<article class="${state.levelFilter === id ? 'selected' : ''}"><h3>${label}</h3><p>${esc(ways[id] || task.steps?.[0] || task.summary)}</p></article>`).join('')}</div><small>${age?.id === 'early' ? '电量记录的是陪伴与观察过程，不是孩子的能力成绩。' : '尝试记录说明当下的经验；可跨基础选择，也可以缩小目标后再来。'}</small></section>`;
  }
  function renderAgeComparison(task) {
    return `<details class="tg-age-comparison"><summary>同一能力，不同年龄怎样探索</summary><p>主题可以相近，参与方式、支持和成果会随年龄调整；每个年龄都能按自己的基础选择。</p>${data.ageGroups.map(age => {
      const peer = data.tasks.find(item => item.directionId === task.directionId && array(item.ageGroups).includes(age.id) && item.level === task.level) || data.tasks.find(item => item.directionId === task.directionId && array(item.ageGroups).includes(age.id));
      return `<article><b>${esc(age.label)}</b><p>${esc(age.approach || age.note)}</p>${peer ? `<button data-talent-action="compare-age" data-age-id="${esc(age.id)}" data-task-id="${esc(peer.id)}">看看：${esc(peer.title)} →</button>` : ''}</article>`;
    }).join('')}</details>`;
  }
  function needsMatchingProfile(task) {
    return Boolean(task && !array(task.ageGroups).includes(activePerson()?.ageGroup));
  }
  function renderAgeGuard(task) {
    if (!needsMatchingProfile(task)) return '';
    const matching = store.data.people.find(person => person.ageGroup === state.ageFilter);
    return `<aside class="tg-age-guard" role="alert"><b>先为 ${esc(AGE_LABELS[state.ageFilter] || state.ageFilter)} 选择一个档案</b><p>你现在记录的是“${esc(activePerson().name)}”的 ${esc(AGE_LABELS[activePerson().ageGroup])} 视角。切换或创建匹配阶段后，才会保存这次实验。</p><div>${matching ? `<button class="tg-button tg-button-primary" data-talent-action="switch-matching" data-person-id="${esc(matching.id)}">切换到${esc(matching.name)}</button>` : ''}<button class="tg-button tg-button-quiet" data-talent-action="create-matching">创建${esc(AGE_LABELS[state.ageFilter] || '此阶段')}档案</button></div></aside>`;
  }
  function renderTaskDetail() {
    const task = selectedTask();
    if (!task) return '';
    const progress = taskProgress(task, profile().progress[task.id] || {});
    const exploration=normalizeExploration(profile().exploration,activePerson().ageGroup,learning,profile().preferences?.level);
    const suggestion = state.taskSuggestion?.task.id === task.id ? state.taskSuggestion : (profile().preferences || task.learningDomainId) ? describeTaskStart({task,profile:profile(),ageGroup:activePerson().ageGroup,preferences:{...profile().preferences,minutes:profile().preferences?.minutes || 10,level:state.levelFilter || (profile().exploration ? exploration.learningBase : profile().preferences?.level || 'start')}}) : null;
    const previousAttempts = profile().attempts.filter(attempt => attempt.taskId === task.id).sort((a,b) => a.date-b.date);
    const short = suggestion?.isShortVersion;
    const steps = array(task.steps);
    const saved = previousAttempts.some(a => a.id === state.savedAttemptId);
    const fullSteps = `<ol>${steps.map(item => `<li>${esc(item)}</li>`).join('')}</ol>`;
    return `<section class="tg-task-detail" id="task-detail"><button class="tg-back" data-talent-action="close-task">${state.taskOrigin === 'planets' ? '← 返回能力星球' : state.taskOrigin === 'atlas' ? '← 返回探索地图' : '← 返回实验卡'}</button><div class="tg-detail-top"><span class="tg-kicker">${esc(direction(task.directionId)?.title || '方向')} · ${suggestion?.adaptedMinutes || task.minutes || 10} 分钟${short ? '起步版' : ''}</span><h2>${esc(task.title)}</h2><p>${short ? '先做下面的一小步，留下片段也算一次真实尝试。' : '按步骤尝试一次，再决定要不要继续。'}</p></div>${renderAgeGuard(task)}${renderCultivationEntry({task,ageGroup:activePerson().ageGroup})}${renderTaskParticipation({task,learning,profile:profile(),person:activePerson()})}${saved ? renderReflection(task, previousAttempts, true) : ''}<section class="tg-do-now" id="tg-do-now"><div class="tg-section-head"><span class="tg-kicker">01 · 这次这样做</span><span class="tg-step-budget">${short ? `完整项目约 ${task.minutes} 分钟，可分次完成` : '按自己的节奏，随时可以停下'}</span></div>${short ? `<p class="tg-current-method">这次只做${task.learningDomainId && suggestion.learningBase !== 'start' ? '下面这一小步' : '第一步'}，约 ${suggestion.adaptedMinutes} 分钟。${activePerson().ageGroup === 'early' ? '预算包含照护者的准备和记录；孩子参与可以很短，也可以不参与。' : ['preschool','child'].includes(activePerson().ageGroup) ? '孩子可以只看、只听或随时停下。' : '不必一次做完整个项目。'}</p>` : suggestion ? `<p class="tg-current-method">${esc(suggestion.method)}</p>` : ''}<div class="tg-materials"><b>准备</b><span>${array(task.materials).map(esc).join(' · ') || '从身边已有的材料开始'}</span></div>${short ? `<ol><li>${esc(suggestion.startingStep || steps[0] || task.summary)}</li><li>到 ${suggestion.adaptedMinutes} 分钟时先停下，写一句观察或留下这个阶段的结果。</li></ol><details class="tg-full-version"><summary>展开完整步骤 · 之后可以接着做</summary>${fullSteps}</details>` : fullSteps}<div class="tg-takeaway"><b>这次可以留下</b><p>${esc(task.learningPaths?.[suggestion?.learningBase]?.output || (short ? '一条具体观察，或第一步产生的片段。完整作品留到后续继续。' : task.deliverable || '一份可以回看的结果。'))}</p></div><button class="tg-button tg-button-primary" data-talent-action="jump-record">做完了，记下这次发现 ↓</button></section>${renderLearningTrail({task,learning,profile:profile(),person:activePerson(),selectedBase:suggestion?.learningBase || state.levelFilter})}<details class="tg-detail-more"><summary>项目简介、观察提示与不同基础的做法</summary><h3>项目简介</h3><p>${esc(task.summary)}</p><h3>为什么值得试试</h3><p>${esc(task.transfer || task.summary)}</p><h3>可以留意</h3><ul>${array(task.observe).map(item => `<li>${esc(item)}</li>`).join('')}</ul>${renderAdaptations(task)}</details>${renderAttemptForm(task)}${!saved ? renderReflection(task, previousAttempts) : ''}<details class="tg-progress-details"><summary><span>完成标准 · ${progress.percent}% 电量</span>${battery(progress.percent)}</summary><p class="tg-fine-print">已留下 ${previousAttempts.length} 次尝试。电量由你按下方标准单独记录；保存笔记不会自动充电。${activePerson().ageGroup === 'early' ? '这里记录陪伴过程，不评价孩子的能力。' : '电量表示这件事的完成情况，不是天赋分数。'}</p><div class="tg-criteria"><h3>按实际完成情况点亮</h3>${progress.directions.map(item => `<article><div><b>${esc(item.title)}</b><small>${esc(item.label)} · ${item.percent}%</small></div>${battery(item.percent)}<div class="tg-stages">${[0,1,2,3,4].map(level => `<button class="${item.level === level ? 'active' : ''}" data-talent-action="set-task-level" data-task-id="${esc(task.id)}" data-direction-id="${esc(item.id)}" data-level="${level}">${level * 25}%</button>`).join('')}</div></article>`).join('')}</div></details>${renderAgeComparison(task)}</section>`;
  }
  function renderAttemptForm(task) {
    const draft = state.attemptDraft;
    const editing = draft?.personId === activePerson().id && draft?.taskId === task.id ? draft.attemptId : '';
    return renderAttemptFields({task,profile:profile(),early:activePerson().ageGroup==='early',editing});
  }
  function renderReflection(task, attempts, saved = false) {
    if (!attempts.length) return '';
    const latest = attempts.find(a => a.id === state.savedAttemptId) || attempts[attempts.length - 1];
    const early = activePerson().ageGroup === 'early';
    let title = '有了一条观察，再找一个具体结果';
    let advice = early ? '下次留意孩子愿意继续或想停下的信号，记录当时的情境。' : '下一次可以让一个人试用，或把作品放进真实场景，看看具体发生了什么。';
    let action = 'edit-attempt', label = '补充这次的结果与反馈';
    if (latest.energy <= 2) {
      title = '下次，先把范围缩小一点';
      advice = early ? '这次记录的照护者余力偏低。下次缩短陪伴片段，顺着孩子的停止信号结束。' : '这次能量记录偏低。下次只重复第一步，或少做一个部分，再比较感受。';
      action = 'repeat-step'; label = '回到步骤，选一个更小的开始';
    } else if (latest.outcome === 'needs-work') {
      title = '让一个真实问题，带着你改下一版';
      advice = '你标记了“用过了，还想改进”。从使用记录或反馈中只选一个问题，保留原版，再做一个改动。';
      action = 'repeat-step'; label = '带着这个问题再试一次';
    } else if (latest.outcome === 'useful') {
      title = '把这次有用的方法，再用一次';
      advice = early ? '你记录了实际帮助。可以在相近的日常情境再邀请一次，观察意愿是否相同。' : '你记录了实际帮助。换一个相近情境再用一次，保留适用条件和遇到的限制。';
      action = 'repeat-step'; label = '回到步骤，准备下一次应用';
    } else if (latest.changeNote) {
      title = '保留这次变化，继续看它怎样被使用';
      advice = '你已经写下具体差异。把前后版本一起保留，再记录一次实际使用结果，帮助自己判断哪些改动值得继续。';
    }
    return `<section class="tg-reflection ${saved ? 'tg-saved-reflection' : ''}" id="tg-reflection"><span class="tg-kicker">${saved ? '✓ 记录已保存 · ' : '最近一次记录 · '}${attempts.length} 次尝试</span><h3>${esc(title)}</h3><p>${esc(advice)}</p>${latest.outcomeNote || latest.changeNote || latest.note ? `<blockquote><small>你留下的线索</small><p>${esc(latest.outcomeNote || latest.changeNote || latest.note)}</p></blockquote>` : ''}<div class="tg-result-actions"><button class="tg-button tg-button-primary" data-talent-action="${action}" data-attempt-id="${esc(latest.id)}">${label}</button><button class="tg-inline-link" data-talent-action="edit-attempt" data-attempt-id="${esc(latest.id)}">修改这条记录</button></div><div class="tg-reflection-links"><button data-talent-view="journal">回看作品与变化 →</button><button data-talent-view="clues" data-clue-tab="weekly">本周线索 →</button>${task.learningDomainId ? `<button data-talent-action="planet-select" data-planet-id="${esc(task.learningDomainId)}">去看这颗星球 →</button>` : ''}<button data-talent-action="next-experiment" data-task-id="${esc(task.id)}">同一能力的其他实验 →</button></div></section>`;
  }
  function planProgress(plan) {
    if (!plan) return { steps: [], completed: 0 };
    const counts = {};
    profile().attempts.filter(attempt => attempt.date >= plan.startedAt && plan.taskIds.includes(attempt.taskId)).forEach(attempt => {
      counts[attempt.taskId] = (counts[attempt.taskId] || 0) + 1;
    });
    const occurrences = {};
    const steps = (plan.schedule || []).map(step => {
      occurrences[step.taskId] = (occurrences[step.taskId] || 0) + 1;
      return { ...step, done: (counts[step.taskId] || 0) >= occurrences[step.taskId] };
    });
    return { steps, completed: steps.filter(step => step.done).length };
  }
  function renderCultivate() {
    const chosen = direction(state.directionId || data.directions[0]?.id);
    const plan = profile().plan;
    const planTasks = plan ? plan.taskIds.map(id => data.tasks.find(item => item.id === id)).filter(Boolean) : [];
    const planStatus = planProgress(plan);
    const completed = planStatus.completed;
    const age = data.ageGroups.find(item => item.id === activePerson().ageGroup);
    const sameAgeTasks = directionTasks(chosen.id);
    const basic = sameAgeTasks.find(item => item.level === 'start') || sameAgeTasks[0];
    const practiceTask = sameAgeTasks.find(item => item.level === 'practice') || basic;
    const applied = sameAgeTasks.find(item => item.level === 'apply') || practiceTask;
    const early = age?.id === 'early';
    const practice = [basic, practiceTask, applied].filter(Boolean).map(item => item.title);
    const uses = [...new Set(sameAgeTasks.map(item => item.transfer).filter(Boolean))].slice(0, 3);
    const development = [
      { title: '1 · 选择舒服的入口', frequency: early ? '孩子可只看、只听或不参与' : '基础由自己选择，可随时调整', actions: [age?.approach || age?.note || '从自己在意的小问题开始'] },
      { title: early ? '2 · 先熟悉玩法' : '2 · 先试一个小范围', frequency: early ? '一小段互动，随时停止' : '按精力分段，不急着交付', actions: [basic?.adaptations?.start || basic?.summary || '先准备材料'] },
      { title: early ? '3 · 重复与变化' : '3 · 带着反馈打磨', frequency: early ? '顺着孩子的意愿再邀请' : '选一个改动，保留前后版本', actions: [practiceTask?.adaptations?.practice || practiceTask?.summary || '回看一次体验'] },
      { title: early ? '4 · 融入日常' : '4 · 用到实际需要中', frequency: early ? '记录陪伴过程，不评价孩子能力' : '以实际使用和体验决定下一步', actions: [applied?.adaptations?.apply || applied?.summary || '换一个合适场景'] }
    ];
    return `<div class="tg-view"><section class="tg-section-head"><div><span class="tg-kicker">14 天培养</span><h2>把喜欢的方向，变成可重复的练习</h2></div></section><div class="tg-direction-picker">${data.directions.map(item => `<button class="${item.id === chosen.id ? 'active' : ''}" data-talent-action="choose-direction" data-direction-id="${esc(item.id)}">${esc(item.title)}</button>`).join('')}</div><section class="tg-cultivate-card" style="--tg-color:${esc(chosen.color || '#eb8061')}"><span class="tg-kicker">${esc(early ? '亲子陪伴 · ' + age.label : chosen.kicker || '')}</span><h2>${esc(chosen.title)}</h2><p>${esc(early ? age?.approach : chosen.description || '')}</p><div class="tg-practice-columns"><div><b>适合这个年龄的起点</b>${practice.map(item => `<span>· ${esc(item)}</span>`).join('')}</div><div><b>生活中可以怎样用</b>${uses.map(item => `<span>· ${esc(item)}</span>`).join('')}</div></div><p class="tg-plan-basis">计划使用${esc(age?.label || '当前年龄')}的实验${state.levelFilter ? ' · 基础：' + esc((early ? CAREGIVER_LEVELS : LEVELS)[state.levelFilter]) : ' · 可从初次接触逐步尝试'}</p><div class="tg-development">${development.map(item => `<article><b>${esc(item.title)}</b><small>${esc(item.frequency || '')}</small>${array(item.actions).map(action => `<span>· ${esc(action)}</span>`).join('')}</article>`).join('')}</div><button class="tg-button tg-button-primary" data-talent-action="create-plan" data-direction-id="${esc(chosen.id)}">${plan ? '重新生成 14 天计划' : '生成 14 天计划'}</button></section>${plan ? `<section class="tg-plan"><div class="tg-section-head"><div><span class="tg-kicker">进行中</span><h3>14 天路线</h3></div><small>${completed} / ${planStatus.steps.length} 次练习已留下证据</small></div><div class="tg-timeline">${planStatus.steps.map(item => { const task = data.tasks.find(candidate => candidate.id === item.taskId); const done = item.done; return `<article class="tg-plan-row ${done ? 'done' : ''}"><span>第 ${item.day} 天</span><div><b>${esc(task?.title || '实验')}</b><small>${esc(item.method || task?.deliverable || '')}</small></div>${done ? '<em>已留下证据</em>' : `<button data-talent-action="open-task" data-task-id="${esc(item.taskId)}">开始</button>`}</article>`; }).join('')}</div></section>` : '<div class="tg-empty">还没有计划。选一个方向，生成三次具体实验。</div>'}</div>`;
  }
  function renderClues() {
    const weekly = state.clueTab === 'weekly';
    const tabs = `<div class="tg-evidence-tabs"><button class="${!weekly ? 'active' : ''}" data-talent-action="clue-tab" data-clue-tab="planets">能力星球</button><button class="${weekly ? 'active' : ''}" data-talent-action="clue-tab" data-clue-tab="weekly">探索周报</button><button data-talent-view="journal">作品与变化</button></div>`;
    if (!weekly) return `<div class="tg-view">${tabs}${renderTalentPlanets({catalog:data,learning,profile:profile(),person:activePerson(),selectedId:state.planetId})}${renderCultivationResearch()}</div>`;
    const report = buildWeeklyReport({catalog:data,profile:profile(),ageGroup:activePerson().ageGroup});
    return `<div class="tg-view">${tabs}${renderReport({report,person:activePerson()})}<details class="tg-combination-details"><summary>继续看看：能力怎样组合使用</summary><div class="tg-combinations">${data.combinations.map(combo=>`<article><b>${esc(combo.title)}</b><p>${esc(combo.firstStep)}</p><small>${esc(array(combo.uses).join('、'))}</small></article>`).join('')}</div></details></div>`;
  }
  function renderFamily() {
    return `<div class="tg-view"><section class="tg-section-head"><div><span class="tg-kicker">家人</span><h2>每个人都可以从小实验开始</h2></div></section><section class="tg-people-list">${store.data.people.map(person => `<button class="${person.id === activePerson().id ? 'active' : ''}" data-talent-action="switch-person" data-person-id="${esc(person.id)}"><strong>${esc(person.name)}</strong><small>${esc(AGE_LABELS[person.ageGroup])}</small></button>`).join('')}</section><form class="tg-person-form" data-person-form><h3>添加一个视角</h3><label>称呼<input name="name" maxlength="40" required placeholder="例如：小满、妈妈、爷爷" /></label><label>年龄阶段<select name="ageGroup">${data.ageGroups.map(item => `<option value="${esc(item.id)}" ${item.id === (state.requestedAge || 'adult') ? 'selected' : ''}>${esc(item.label)}</option>`).join('')}</select></label><button class="tg-button tg-button-primary">保存档案</button></form>${renderCloud({cloud:state.cloud,store})}<section class="tg-data-card"><h3>本地备份与恢复</h3><p>未上传的记录保存在当前浏览器。导出一份文件留在自己手中，也可以恢复上一次本地保存。</p><button class="tg-button tg-button-quiet" data-talent-action="export">导出方向备份</button><button class="tg-button tg-button-quiet" data-talent-action="import">恢复方向备份</button><button class="tg-button tg-button-quiet" data-talent-action="recover-previous">恢复上一次本地保存</button>${store.backupError ? `<p role="status">${esc(store.backupError)}</p>` : ''}<input id="tg-backup-picker" type="file" accept="application/json,.json" hidden /></section><button class="tg-grow-link" data-talent-action="open-growth">进入儿童成长档案 →</button></div>`;
  }
  function render() {
    if (destroyed) return;
    if (!data) {
      root.innerHTML = `<div class="tg-app tg-load-error"><section><span class="tg-kicker">天赋生长</span><h1>${state.catalogError ? '内容暂时没有准备好' : '探索卡正在准备'}</h1><p>${state.catalogError ? '方向目录暂时无法读取，请稍后重试。' : '正在为你打开可以开始的小实验…'}</p>${state.catalogError ? '<button class="tg-button tg-button-primary" data-talent-action="retry-data">重新读取</button>' : ''}<button class="tg-button tg-button-quiet" data-action="open-profile">进入孩子成长</button></section></div>`;
      return;
    }
    const formDrafts = ['[data-cloud-auth-form]','[data-person-form]'].map(selector=>({selector,values:[...root.querySelectorAll(`${selector} input, ${selector} select`)].map(field=>({name:field.name,value:field.value}))}));
    const choiceOffsets = Object.fromEntries([...root.querySelectorAll('[data-tg-choices]')].map(rail => [rail.dataset.tgChoices, rail.scrollLeft]));
    const view = state.view === 'atlas' ? renderLearningAtlas({learning,catalog:data,profile:profile(),person:activePerson(),selectedWorldId:state.learningWorldId}) : state.view === 'setup' ? renderSetup({person:activePerson(),preferences:profile().preferences,learningBase:normalizeExploration(profile().exploration,activePerson().ageGroup,learning,profile().preferences?.level).learningBase,options:preferenceOptions}) : state.view === 'journal' ? renderJournal({catalog:data,profile:profile(),person:activePerson(),learning}) : state.view === 'cultivate' ? renderCultivate() : state.view === 'clues' ? renderClues() : state.view === 'family' ? renderFamily() : renderDiscover();
    root.innerHTML = `<div class="tg-app"><header class="tg-header"><a class="tg-brand" href="#" data-talent-action="home">天赋生长 <span>方向实验室</span></a>${renderProfileStrip()}</header>${state.view === 'discover' && !state.taskId ? renderHero() : ''}${renderNav()}${state.notice ? `<div class="tg-notice" role="status">${esc(state.notice)}<button data-talent-action="clear-notice">×</button></div>` : ''}<main class="tg-main">${view}</main><footer class="tg-footer">把一次陪伴，留给下一步。<button data-action="open-profile">进入孩子成长档案</button></footer></div>`;
    bindChoiceRails(choiceOffsets);
    bindRail();
    restoreAttemptDraft();
    for(const draft of formDrafts) {const form=root.querySelector(draft.selector);if(form)for(const item of draft.values){const field=form.elements.namedItem(item.name);if(field)field.value=item.value;}}
  }
  function bindChoiceRails(offsets) {
    root.querySelectorAll('[data-tg-choices]').forEach(rail => {
      rail.scrollLeft = offsets[rail.dataset.tgChoices] || 0;
      const selected = rail.querySelector('[aria-pressed="true"]');
      if (selected) {
        const bounds = rail.getBoundingClientRect();
        const item = selected.getBoundingClientRect();
        if (item.left < bounds.left || item.right > bounds.right) {
          rail.scrollLeft += item.left + item.width / 2 - bounds.left - bounds.width / 2;
        }
      }
      rail.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        const buttons = [...rail.querySelectorAll('button')];
        const index = buttons.indexOf(event.target);
        if (index < 0) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, index + (event.key === 'ArrowRight' ? 1 : -1)));
        buttons[next]?.focus({ preventScroll: true });
        buttons[next]?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
      });
    });
  }
  function captureAttemptDraft() {
    const form = root.querySelector('[data-attempt-form]');
    if (!form) return;
    const values = new FormData(form);
    state.attemptDraft = {
      taskId: form.dataset.taskId,
      personId: activePerson().id,
      attemptId: form.dataset.attemptId || '',
      mode: values.get('mode') || '',
      enjoyment: values.get('enjoyment') || '',
      energy: values.get('energy') || '',
      note: text(values.get('note')),
      artifact: text(values.get('artifact')),
      feedback: text(values.get('feedback')),
      artifactTitle: text(values.get('artifactTitle'),120), changeNote:text(values.get('changeNote')), outcomeNote:text(values.get('outcomeNote')), outcome:values.get('outcome') || 'untried', durationMinutes:values.get('durationMinutes') || ''
    };
  }
  function restoreAttemptDraft() {
    const draft = state.attemptDraft;
    const form = root.querySelector('[data-attempt-form]');
    if (!draft || !form || draft.personId !== activePerson().id || draft.taskId !== form.dataset.taskId) return;
    const mode = [...form.querySelectorAll('[name="mode"]')].find(input => input.value === draft.mode);
    if (mode) mode.checked = true;
    for (const key of ['enjoyment', 'energy', 'note', 'artifact', 'feedback', 'artifactTitle', 'changeNote', 'outcomeNote', 'outcome', 'durationMinutes']) {
      const field = form.elements.namedItem(key);
      if (field) field.value = draft[key] || '';
    }
  }
  function bindRail() {
    const rail = root.querySelector('[data-tg-rail]');
    if (!rail) return;
    const cards = [...rail.querySelectorAll('[data-card-index]')];
    const update = () => {
      if (!cards.length) return;
      if (!rail.clientWidth || !cards.some(card => card.offsetWidth || card.getBoundingClientRect?.().width)) {
        const fallbackIndex = Math.max(0, Math.min(state.cardIndex, cards.length - 1));
        cards.forEach((card, index) => card.classList.toggle('is-active', index === fallbackIndex));
        root.querySelectorAll('.tg-dots button').forEach((dot, index) => dot.classList.toggle('active', index === fallbackIndex));
        const fallbackCounter = root.querySelector('.tg-counter'); if (fallbackCounter) fallbackCounter.textContent = `${fallbackIndex + 1} / ${cards.length}`;
        return;
      }
      const railRect = rail.getBoundingClientRect?.();
      const center = railRect && railRect.width ? railRect.left + railRect.width / 2 : rail.scrollLeft + rail.clientWidth / 2;
      let nearest = 0;
      cards.forEach((card, index) => {
        const rect = card.getBoundingClientRect?.();
        const cardCenter = rect && rect.width ? rect.left + rect.width / 2 : card.offsetLeft + card.offsetWidth / 2;
        const nearestRect = cards[nearest].getBoundingClientRect?.();
        const nearestCenter = nearestRect && nearestRect.width ? nearestRect.left + nearestRect.width / 2 : cards[nearest].offsetLeft + cards[nearest].offsetWidth / 2;
        if (Math.abs(cardCenter - center) < Math.abs(nearestCenter - center)) nearest = index;
      });
      state.cardIndex = nearest;
      cards.forEach((card, index) => card.classList.toggle('is-active', index === nearest));
      root.querySelectorAll('.tg-dots button').forEach((dot, index) => dot.classList.toggle('active', index === nearest));
      const counter = root.querySelector('.tg-counter'); if (counter) counter.textContent = `${nearest + 1} / ${cards.length}`;
    };
    rail.addEventListener('scroll', update, { passive: true });
    rail.addEventListener('keydown', event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      state.cardIndex += event.key === 'ArrowRight' ? 1 : -1;
      scrollTask(state.cardIndex);
    });
    const rememberedIndex = Math.max(0, Math.min(state.cardIndex, cards.length - 1));
    const restore = () => {
      const target = cards[rememberedIndex];
      if (target && rail.clientWidth && target.offsetWidth) {
        const cardRect = target.getBoundingClientRect();
        const railRect = rail.getBoundingClientRect();
        const left = rail.scrollLeft + cardRect.left + cardRect.width / 2 - railRect.left - rail.clientWidth / 2;
        const previousBehavior = rail.style.scrollBehavior;
        rail.style.scrollBehavior = 'auto';
        rail.scrollLeft = Math.max(0, Math.min(left, rail.scrollWidth - rail.clientWidth));
        update();
        rail.style.scrollBehavior = previousBehavior;
      } else update();
    };
    (typeof window.requestAnimationFrame === 'function' ? window.requestAnimationFrame.bind(window) : callback => setTimeout(callback, 0))(restore);
  }
  function scrollTask(index) {
    const rail = root.querySelector('[data-tg-rail]'); if (!rail) return;
    const cards = [...rail.querySelectorAll('[data-card-index]')];
    const bounded = Math.max(0, Math.min(index, cards.length - 1));
    state.cardIndex = bounded;
    const target = cards[bounded];
    target?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }
  function savePreferences(form) {
    const values=new FormData(form);
    const preferences={goal:values.get('goal'),minutes:Number(values.get('minutes')),participation:['early','preschool'].includes(activePerson().ageGroup)?'together':values.get('participation'),level:values.get('level'),savedAt:Date.now()};
    if(!preferenceOptions.goals.some(x=>x.id===preferences.goal) || !preferenceOptions.timeBudgets.includes(preferences.minutes) || !preferenceOptions.participation.some(x=>x.id===preferences.participation) || !preferenceOptions.levels.some(x=>x.id===preferences.level)) {notify('请先选择目标、时间和基础');return;}
    if(persist(draft=>{draft.profiles[draft.activeId].preferences=preferences;if(draft.profiles[draft.activeId].exploration)draft.profiles[draft.activeId].exploration.learningBase=preferences.level;},'')) {
      state.view='discover';state.feed='for-you';state.ageFilter=activePerson().ageGroup;state.directionId='';state.scene='';state.levelFilter='';state.cardIndex=0;render();root.querySelector('.tg-main')?.scrollIntoView({block:'start'});
    }
  }
  function validateCloudMeta(value) {
    if(!value || !Number.isInteger(value.revision) || value.revision<0 || !Number.isInteger(value.people) || !Number.isInteger(value.attempts)) throw new Error('云端版本信息异常，未改变本机记录');
    return value;
  }
  function resetJourney() {
    Object.assign(state,{attemptDraft:null,savedAttemptId:'',taskSuggestion:null,taskId:'',directionId:'',scene:'',levelFilter:'',cardIndex:0,requestedAge:'',ageFilter:activePerson().ageGroup,feed:profile().preferences?'for-you':'roam',learningWorldId:'',wanderingRound:0,taskOrigin:'',clueTab:'planets',planetId:''});
  }
  function localCounts(snapshot) {return {people:snapshot.people.length,attempts:Object.values(snapshot.profiles).reduce((n,p)=>n+array(p.attempts).length,0)};}
  async function refreshCloud(force=false) {
    if(state.cloud.loading || (state.cloud.checked&&!force))return;
    state.cloud.loading=true;state.cloud.error='';
    try {
      const status=await cloudRequest('auth/status');
      if(typeof status.authenticated!=='boolean')throw new Error('云端登录状态异常');
      Object.assign(state.cloud,{authenticated:status.authenticated,username:status.username||'',meta:null,checked:true});
      if(status.authenticated)state.cloud.meta=validateCloudMeta(await cloudRequest('backup/meta',{account:state.cloud.username}));
    } catch(error) {state.cloud.error=error.message;}
    finally {state.cloud.loading=false;if(!destroyed&&state.view==='family')render();}
  }
  async function authenticateCloud(form) {
    if(state.cloud.busy||state.cloud.loading)return;
    const values=new FormData(form);const username=String(values.get('username')||'').toLowerCase();const password=String(values.get('password')||'');
    state.cloud.busy=true;state.cloud.error='';render();
    try {
      const status=await cloudRequest(state.cloud.register?'auth/register':'auth/login',{method:'POST',body:{username,password}});
      if(status.authenticated!==true || typeof status.username!=='string')throw new Error('云端登录状态异常，尚未确认登录成功');
      Object.assign(state.cloud,{authenticated:true,username:status.username,checked:true});
      state.cloud.meta=validateCloudMeta(await cloudRequest('backup/meta',{account:state.cloud.username}));state.notice='已登录。你可以上传本机记录，或恢复已有云端版本。';
    } catch(error) {state.cloud.error=error.message;}
    finally {state.cloud.busy=false;if(!destroyed&&state.view==='family')render();}
  }
  async function handleCloud(action) {
    if(state.cloud.busy)return;
    if(action==='cloud-refresh') {state.cloud.checked=false;await refreshCloud(true);return;}
    const requestedRevision=Number(root.querySelector('[data-cloud-revision]')?.value);
    state.cloud.busy=true;state.cloud.error='';render();
    try {
      if(action==='cloud-logout') {
        const result=await cloudRequest('auth/logout',{method:'POST',body:{}});
        if(result.authenticated!==false)throw new Error('云端退出状态异常');
        Object.assign(state.cloud,{authenticated:false,username:'',meta:null,checked:true});state.notice='已退出云端账号，本机记录仍保留';
      } else if(action==='cloud-upload') {
        if(store.isCurrent && !store.isCurrent())throw new Error('另一个窗口已更新本机记录，请刷新页面后再上传。');
        const account=state.cloud.username; const known=state.cloud.meta;const fresh=validateCloudMeta(await cloudRequest('backup/meta',{account:state.cloud.username}));state.cloud.meta=fresh;
        if(known&&known.revision!==fresh.revision)throw new Error('另一台设备更新了云端版本。请先查看新版本，导出本机备份后再决定上传或恢复。');
        if(store.isCurrent && !store.isCurrent())throw new Error('另一个窗口已更新本机记录，请刷新后再上传。');
        const snapshot=store.exportSnapshot(),counts=localCounts(snapshot);
        const prompt=`将上传到账号“${account}”：本机 ${counts.people} 个档案、${counts.attempts} 次尝试。${fresh.revision ? `云端第 ${fresh.revision} 版（${fresh.people} 个档案、${fresh.attempts} 次尝试）会被新版本替代，服务器保留最近五个版本。` : '这是首次云端备份。'}不会自动合并另一台设备的记录。确定上传吗？`;
        if(state.view!=='family'||!window.confirm(prompt))return;
        if(store.isCurrent && !store.isCurrent())throw new Error('确认期间另一个窗口更新了记录，本次未上传，请刷新后再试。');
        const saved=validateCloudMeta(await cloudRequest('backup',{method:'PUT',account,body:{snapshot,expectedRevision:fresh.revision}}));
        if(saved.revision!==fresh.revision+1)throw new Error('云端未返回预期的新版本，请刷新云端状态确认');
        state.cloud.meta=saved;state.notice=`本次记录已保存到云端第 ${saved.revision} 版${store.data.updatedAt!==snapshot.updatedAt?'；上传期间本机有新改动，请稍后再备份':''}`;
      } else if(action==='cloud-download') {
        if(store.isCurrent && !store.isCurrent())throw new Error('另一个窗口已更新本机记录，请刷新页面后再恢复。');
        const account=state.cloud.username;const backup=await cloudRequest(Number.isInteger(requestedRevision)&&requestedRevision>0?`backup?revision=${requestedRevision}`:'backup',{account}),meta=validateCloudMeta(backup.meta),snapshot=backup.snapshot;
        if(!meta.revision || snapshot?.version!==1 || !array(snapshot.people).length || !snapshot.profiles || typeof snapshot.profiles!=='object')throw new Error('云端没有可恢复的完整备份，本机记录未改变');
        if(state.view!=='family')return;
        const localRevision=store.data.updatedAt,counts=localCounts(store.exportSnapshot());
        if(!window.confirm(`将用账号“${account}”的云端第 ${meta.revision} 版（${meta.people} 个档案、${meta.attempts} 次尝试）替换本机当前 ${counts.people} 个档案、${counts.attempts} 次尝试。建议先导出本机备份。是否恢复？`))return;
        if(store.data.updatedAt!==localRevision)throw new Error('确认期间本机记录发生变化，请重新选择恢复');
        if(!store.replace(snapshot))throw new Error(store.lastError||'恢复失败，本机记录未改变');
        state.cloud.meta=meta;resetJourney();state.notice=`已恢复云端第 ${meta.revision} 版到本机`;
      }
    } catch(error) {
      if(error.status===401)Object.assign(state.cloud,{authenticated:false,username:'',meta:null});
      if(error.meta?.accountChanged) {Object.assign(state.cloud,{authenticated:false,username:'',meta:null,checked:false});state.cloud.error='浏览器的登录账号已在另一窗口改变，本次未上传或恢复。请刷新云端状态后确认账号。';}
      else {if(error.status===409&&error.meta)state.cloud.meta=error.meta;
      state.cloud.error=error.status===409?'云端刚被另一台设备更新，本次未覆盖，请刷新后再决定。':error.message;}
    } finally {state.cloud.busy=false;if(!destroyed&&state.view==='family')render();}
  }
  async function exportBackup() {
    const blob = new Blob([JSON.stringify(store.exportSnapshot(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `方向实验室备份-${todayKey()}.json`; link.click();
    // Delay revoke so iOS Safari / WebView can finish the download.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importBackup(file) {
    try {
      if (!file || file.size > 10 * 1024 * 1024) throw new Error('文件过大');
      const parsed = JSON.parse(await file.text());
      if (parsed.version !== 1 || !Array.isArray(parsed.people) || !parsed.profiles || typeof parsed.profiles !== 'object') throw new Error('格式不正确');
      const peoplePreview = parsed.people.slice(0, 20).filter(person => person && typeof person === 'object').map(person => text(person.name, 40)).filter(Boolean);
      if (!peoplePreview.length || !window.confirm(`将恢复 ${peoplePreview.length} 个档案（${peoplePreview.join('、')}），覆盖当前方向尝试与计划。确定继续吗？`)) return;
      if (store.replace(parsed)) { resetJourney(); state.notice = '方向备份已恢复'; render(); } else notify(store.lastError || '恢复失败');
    } catch (error) { notify('备份文件无效，当前档案未改变'); }
  }
  function attemptExploration(taskId) {
    const context=explorationSnapshot(profile(),activePerson().ageGroup,learning);
    const chosenBase=state.taskSuggestion?.task.id===taskId ? state.taskSuggestion.learningBase : state.levelFilter;
    if(['start','practice','apply'].includes(chosenBase))context.learningBase=chosenBase;
    return context;
  }
  function saveAttempt(form) {
    const values = new FormData(form); const taskId = form.dataset.taskId;
    const mode = values.get('mode'); const enjoyment = Number(values.get('enjoyment')); const energy = Number(values.get('energy'));
    if (!mode || !Number.isInteger(enjoyment) || enjoyment < 1 || enjoyment > 5 || !Number.isInteger(energy) || energy < 1 || energy > 5) { captureAttemptDraft(); notify('请先选择完成方式、享受程度和能量感受'); return; }
    if (needsMatchingProfile(data.tasks.find(item => item.id === taskId))) { captureAttemptDraft(); notify('请先切换或创建匹配年龄的档案'); return; }
    const note = text(values.get('note')); const artifact = text(values.get('artifact'));
    if (!note && !artifact) { captureAttemptDraft(); notify('请写一句过程观察，或留下作品/结果，才算一次真实尝试'); return; }
    const existingId = form.dataset.attemptId;
    const existing = existingId ? profile().attempts.find(a => a.id === existingId && a.taskId === taskId) : null;
    if (existingId && !existing) { notify('原记录已变化，请重新打开后再修改'); return; }
    const attempt = { ...(existing || {}), artifactTitle:text(values.get('artifactTitle'),120), changeNote:text(values.get('changeNote')), outcomeNote:text(values.get('outcomeNote')), outcome:['untried','needs-work','useful'].includes(values.get('outcome')) ? values.get('outcome') : 'untried', durationMinutes:Math.min(240,Math.max(0,Math.round(Number(values.get('durationMinutes'))||0))), id: existing?.id || `attempt_${Date.now()}`, taskId, date: existing?.date || Date.now(), note, artifact, feedback: text(values.get('feedback')), mode, enjoyment, energy, exploration: existing ? existing.exploration : attemptExploration(taskId) };
    captureAttemptDraft();
    if (persist(draft => { const personProfile = draft.profiles[draft.activeId] || { progress: {}, attempts: [], plan: null }; personProfile.attempts = existing ? personProfile.attempts.map(a => a.id === existing.id ? attempt : a) : [...(personProfile.attempts || []), attempt].slice(-5000); if (personProfile.plan?.taskIds?.includes(taskId)) personProfile.plan.completedTaskIds = [...new Set([...(personProfile.plan.completedTaskIds || []), taskId])]; draft.profiles[draft.activeId] = personProfile; }, existing ? '这条记录已更新，未增加尝试次数' : '这次尝试已留下')) { state.attemptDraft = null; state.savedAttemptId = attempt.id; render(); root.querySelector('#tg-reflection')?.scrollIntoView({block:'start',behavior:'auto'}); }
  }
  function setTaskLevel(taskId, directionId, level) {
    captureAttemptDraft();
    const task = data.tasks.find(item => item.id === taskId); if (!task) return;
    if (needsMatchingProfile(task)) { notify('请先切换或创建匹配年龄的档案'); return; }
    const current = profile().progress[taskId] || {}; const progress = taskProgress(task, current); const levels = Object.fromEntries(progress.directions.filter(item => item.level > 0).map(item => [item.id, item.level])); levels[directionId] = Math.max(0, Math.min(4, Number(level) || 0));
    if (persist(draft => {
      const personProfile = draft.profiles[draft.activeId] || { progress: {}, attempts: [], plan: null };
      const existing = personProfile.progress?.[taskId] || {};
      personProfile.progress = personProfile.progress || {};
      personProfile.progress[taskId] = { ...existing, directionLevels: normalizeLevels(levels), date: Date.now() };
      draft.profiles[draft.activeId] = personProfile;
    })) render();
  }
  function createPlan(directionId) {
    const candidates = data.tasks.filter(item => hasDirection(item,directionId) && array(item.ageGroups).includes(activePerson().ageGroup));
    const matching = state.levelFilter ? candidates.filter(item => item.level === state.levelFilter) : candidates;
    const graded = state.levelFilter ? matching : ['start', 'practice', 'apply'].map(level => matching.find(item => item.level === level)).filter(Boolean);
    const selected = [...new Map([...graded, ...matching].map(item => [item.id, item])).values()].slice(0, 3);
    if (!selected.length) { notify('这个年龄阶段暂时没有三次匹配实验'); return; }
    const methods = activePerson().ageGroup === 'early' ? ['照护者先熟悉玩法，孩子可以只看或不参与', '孩子愿意时再邀请，记录一条回应或停止信号', '在一个舒适的日常片段借用玩法，不要求完成', '根据上次意愿信号减少一个刺激或缩短互动', '回看陪伴记录，保留孩子愿意的方式，也可以换活动'] : ['先做一遍并留下产出', '重复一次并请人反馈', '换一个生活场景再做', '根据反馈改一处', '迁移到真实需求并复盘'];
    const schedule = [1, 4, 7, 10, 14].map((day, index) => ({ day, taskId: selected[index % selected.length].id, method: methods[index] }));
    if (persist(draft => { const personProfile = draft.profiles[draft.activeId] || { progress: {}, attempts: [], plan: null }; personProfile.plan = { directionId, taskIds: selected.map(item => item.id), schedule, startedAt: Date.now(), completedTaskIds: [] }; draft.profiles[draft.activeId] = personProfile; }, '14 天计划已生成')) { state.view = 'cultivate'; render(); }
  }
  function showTask(taskId,{origin=state.view==='atlas'?'atlas':'',level=state.view==='discover'?state.levelFilter:normalizeExploration(profile().exploration,activePerson().ageGroup,learning,profile().preferences?.level).learningBase}={}) {
    const task=data.tasks.find(t=>t.id===taskId);
    if(!task){notify('这个实验暂时无法读取，请回到地图重新选择');return;}
    state.taskOrigin=origin;
    state.taskSuggestion=level ? describeTaskStart({task,profile:profile(),ageGroup:activePerson().ageGroup,preferences:{...profile().preferences,minutes:profile().preferences?.minutes || 10,level}}) : recommendations().find(x=>x.task.id===taskId) || null;
    state.taskId=taskId;
    state.directionId=state.directionId && hasDirection(task,state.directionId) ? state.directionId : task.directionId;
    if(!array(task.ageGroups).includes(state.ageFilter))state.ageFilter=array(task.ageGroups).includes(activePerson().ageGroup)?activePerson().ageGroup:task.ageGroups[0];
    state.levelFilter=level && (task.level===level || task.learningPaths?.[level])?level:'';
    state.scene='';
    if(isPersonalFeed()&&!tasks().some(t=>t.id===taskId))state.feed='all';
    state.cardIndex=Math.max(0,tasks().findIndex(t=>t.id===taskId));state.view='discover';render();root.querySelector('#task-detail')?.scrollIntoView({block:'start'});
  }
  function handleClick(event) {
    const view = event.target.closest('[data-talent-view]')?.dataset.talentView;
    if (view) { if(view==='clues')state.clueTab=event.target.closest('[data-clue-tab]')?.dataset.clueTab || 'planets'; state.view = view; if (view === 'family') refreshCloud(); state.taskId = ''; state.cardIndex = 0; render(); root.querySelector('.tg-main')?.scrollIntoView({block:'start'}); return; }
    const action = event.target.closest('[data-talent-action]')?.dataset.talentAction;
    if (!action) return;
    if (action === 'clue-tab') {state.clueTab=event.target.closest('[data-clue-tab]').dataset.clueTab==='weekly'?'weekly':'planets';state.view='clues';state.taskId='';render();return;}
    if (action === 'planet-select') {state.planetId=event.target.closest('[data-planet-id]').dataset.planetId;state.view='clues';state.clueTab='planets';state.taskId='';render();root.querySelector('#tg-planet-detail')?.scrollIntoView({block:'start'});return;}
    if (action === 'planet-next') {
      const id=event.target.closest('[data-planet-id]').dataset.planetId;
      const planet=buildTalentPlanets({catalog:data,learning,profile:profile(),ageGroup:activePerson().ageGroup}).planets.find(p=>p.id===id);
      if(planet?.nextAction.taskId)showTask(planet.nextAction.taskId,{origin:'planets',level:{start:'start',repeat:'practice','check-use':'apply',refine:'practice'}[planet.nextAction.kind]||'start'});
      return;
    }
    if (action === 'learning-world') { state.learningWorldId=event.target.closest('[data-world-id]').dataset.worldId;state.view='atlas';state.taskId='';render();root.querySelector('.tg-world-detail, .tg-world-grid')?.scrollIntoView({block:'start'});return; }
    if (action === 'wander') { state.feed='roam';state.ageFilter=activePerson().ageGroup;state.wanderingRound+=1;state.cardIndex=0;state.taskId='';state.directionId='';state.scene='';state.levelFilter='';state.notice='';render();root.querySelector('.tg-task-explorer')?.scrollIntoView({block:'start'});return; }
    if (action === 'jump-record') { const form=root.querySelector('[data-attempt-form]');form?.scrollIntoView({block:'start',behavior:'auto'});form?.querySelector('[name="note"]')?.focus({preventScroll:true});return; }
    if (action === 'repeat-step') { state.savedAttemptId='';state.attemptDraft=null; render(); root.querySelector('#tg-do-now')?.scrollIntoView({block:'start',behavior:'auto'}); return; }
    if (action === 'edit-attempt') {
      const id=event.target.closest('[data-attempt-id]').dataset.attemptId;
      const attempt=profile().attempts.find(a=>a.id===id && a.taskId===state.taskId);
      if(!attempt)return;
      state.attemptDraft={...attempt,personId:activePerson().id,attemptId:id};render();
      const form=root.querySelector('[data-attempt-form]');form?.scrollIntoView({block:'start',behavior:'auto'});return;
    }
    if (action === 'cancel-edit') { state.attemptDraft=null;render();return; }
    if (action === 'open-setup') { state.view='setup'; state.taskId=''; render(); root.querySelector('.tg-main')?.scrollIntoView({block:'start'}); return; }
    if (action === 'browse-all') { state.feed='all'; state.view='discover'; state.taskId=''; state.cardIndex=0; render(); return; }
    if (action === 'personal-feed') {state.feed=profile().preferences?'for-you':'roam';state.view='discover';state.ageFilter=activePerson().ageGroup;state.directionId='';state.scene='';state.levelFilter='';state.cardIndex=0;state.taskId='';render();return;}
    if (action === 'cloud-toggle') { if(!state.cloud.busy) {state.cloud.register=!state.cloud.register;state.cloud.error='';render();} return; }
    if (action?.startsWith('cloud-')) { handleCloud(action); return; }
    if (action === 'recover-previous') { if(window.confirm('将用上一次本地保存替换当前记录。建议先导出备份。确定恢复吗？')) {if(store.recoverPrevious()) {resetJourney();state.notice='已恢复上一次本地保存';} else state.notice=store.lastError; render();} return; }
    if (action === 'home') { state.view = 'discover'; state.taskId = ''; render(); window.scrollTo(0,0); return; }
    if (action === 'jump-discover') { state.view = 'discover'; state.scene = ''; state.levelFilter = ''; state.directionId = ''; state.cardIndex = 0; const first = tasks()[0]; state.taskId = first?.id || ''; render(); root.querySelector('#task-detail')?.scrollIntoView({ block: 'start' }); return; }
    if (action === 'open-growth') { if (onOpenGrowth) onOpenGrowth(); else root.querySelector('[data-action="open-profile"]')?.click(); return; }
    if (action === 'open-family') { state.view = 'family'; refreshCloud(); render(); return; }
    if (action === 'retry-data') { state.catalogError=false;render();loadCatalog(); return; }
    if (action === 'clear-notice') { state.notice = ''; render(); return; }
    if (action === 'choose-level') { state.feed='all'; state.levelFilter = event.target.closest('[data-level-id]').dataset.levelId; state.cardIndex = 0; state.taskId = ''; render(); return; }
    if (action === 'compare-age') {
      const button = event.target.closest('[data-task-id]');
      state.feed='all';state.taskSuggestion=null;state.ageFilter = button.dataset.ageId; state.levelFilter = ''; state.scene = ''; state.taskId = button.dataset.taskId; state.cardIndex = 0;
      render(); root.querySelector('#task-detail')?.scrollIntoView({ block: 'start' }); return;
    }
    if (action === 'clear-filters') { state.levelFilter = ''; state.scene = ''; state.directionId = ''; state.cardIndex = 0; render(); return; }
    if (action === 'choose-age') { state.feed='all'; state.ageFilter = event.target.closest('[data-age-id]').dataset.ageId; state.levelFilter = ''; state.scene = ''; state.cardIndex = 0; state.taskId = ''; render(); return; }
    if (action === 'choose-scene') { state.feed='all'; state.scene = event.target.closest('[data-scene-id]').dataset.sceneId; state.directionId = ''; state.cardIndex = 0; state.taskId = ''; render(); return; }
    if (action === 'choose-direction') { state.feed='all'; state.directionId = event.target.closest('[data-direction-id]').dataset.directionId; state.cardIndex = 0; state.taskId = ''; if (state.view === 'cultivate') render(); else render(); return; }
    if (action === 'open-task') {showTask(event.target.closest('[data-task-id]').dataset.taskId);return;}
    if (action === 'close-task') { state.taskId = ''; if(state.taskOrigin==='planets'){state.view='clues';state.clueTab='planets';state.taskOrigin='';render();root.querySelector('#tg-planet-detail')?.scrollIntoView({block:'start'});return;} if(state.taskOrigin==='atlas'){state.view='atlas';state.taskOrigin='';render();root.querySelector('.tg-world-detail')?.scrollIntoView({block:'start'});return;} render(); root.querySelector('.tg-task-explorer')?.scrollIntoView({block:'start'}); return; }
    if (action === 'previous-task' || action === 'next-task') { state.cardIndex += action === 'next-task' ? 1 : -1; scrollTask(state.cardIndex); return; }
    if (action === 'goto-task') { state.cardIndex = Number(event.target.closest('[data-card-index]').dataset.cardIndex); scrollTask(state.cardIndex); return; }
    if (action === 'set-task-level') { const button = event.target.closest('[data-task-id]'); setTaskLevel(button.dataset.taskId, button.dataset.directionId, button.dataset.level); return; }
    if (action === 'next-experiment') { const current = data.tasks.find(item => item.id === event.target.closest('[data-task-id]')?.dataset.taskId); const candidates = data.tasks.filter(item => item.directionId === current?.directionId && array(item.ageGroups).includes(state.ageFilter)); state.feed='all'; state.scene=''; state.levelFilter=''; const next = candidates.find(item => item.id !== current?.id && !profile().attempts.some(attempt => attempt.taskId === item.id)) || candidates.find(item => item.id !== current?.id) || candidates[0]; state.directionId = current?.directionId || state.directionId; state.view = 'discover'; state.taskSuggestion=null; state.taskId = next?.id || ''; state.cardIndex=Math.max(0,tasks().findIndex(t=>t.id===state.taskId));render();root.querySelector('#task-detail')?.scrollIntoView({block:'start'});return; }
    if (action === 'create-plan') { createPlan(event.target.closest('[data-direction-id]').dataset.directionId); return; }
    if (action === 'switch-person' || action === 'switch-matching') { const keepTask = action === 'switch-matching' ? state.taskId : ''; if(!store.switchPerson(event.target.closest('[data-person-id]').dataset.personId)){notify(store.lastError||'档案切换失败');return;} state.ageFilter = activePerson().ageGroup; state.requestedAge = ''; state.attemptDraft=null;state.savedAttemptId='';state.taskSuggestion=null;state.planetId='';state.clueTab='planets'; state.taskId = keepTask; state.feed=profile().preferences?'for-you':'roam'; state.directionId='';state.levelFilter='';state.scene='';state.cardIndex=0; render(); return; }
    if (action === 'create-matching') { state.requestedAge = state.ageFilter; state.view = 'family'; render(); return; }
    if (action === 'toggle-family') { state.view = 'family'; refreshCloud(); render(); return; }
    if (action === 'export') { exportBackup(); return; }
    if (action === 'import') { root.querySelector('#tg-backup-picker')?.click(); return; }
  }
  function saveExploration(form) {
    const values=new FormData(form),contexts=values.getAll('lifeContexts');
    if(contexts.length>3){form.querySelector('[data-context-feedback]').textContent='生活处境最多选择三项，方便把这次范围缩小';return;}
    const exploration=normalizeExploration({stageId:values.get('stageId'),lifeContexts:contexts,learningBase:values.get('learningBase')},activePerson().ageGroup,learning);
    if(persist(draft=>{draft.profiles[draft.activeId].exploration=exploration;if(draft.profiles[draft.activeId].preferences)draft.profiles[draft.activeId].preferences.level=exploration.learningBase;},'已保存参与视角，基础由你选择，不按年龄评分')){state.taskSuggestion=null;state.levelFilter='';render();}
  }
  function handleSubmit(event) { if(event.target.matches('[data-learning-context-form]')){event.preventDefault();saveExploration(event.target);return;} if (event.target.matches('[data-preferences-form]')) {event.preventDefault();savePreferences(event.target);return;} if(event.target.matches('[data-cloud-auth-form]')){event.preventDefault();authenticateCloud(event.target);return;} if (event.target.matches('[data-attempt-form]')) { event.preventDefault(); saveAttempt(event.target); } if (event.target.matches('[data-person-form]')) { event.preventDefault(); const values = new FormData(event.target); const person = store.addPerson({ name: values.get('name'), ageGroup: values.get('ageGroup') }); if (person) { event.target.reset();resetJourney();state.ageFilter = person.ageGroup;state.feed='roam';state.directionId='';state.scene='';state.levelFilter='';state.requestedAge='';state.notice = '新档案已建立，可为这个视角选择起点'; render(); } else notify('新档案保存失败'); } }
  function handleInput(event) { if(event.target.closest('[data-attempt-form]'))captureAttemptDraft(); }
  function handleChange(event) { handleInput(event); if (event.target.id === 'tg-backup-picker' && event.target.files?.[0]) importBackup(event.target.files[0]); }
  root.addEventListener('input', handleInput); root.addEventListener('click', handleClick); root.addEventListener('submit', handleSubmit); root.addEventListener('change', handleChange);
  root.__talentCleanup = () => { root.removeEventListener('input', handleInput); root.removeEventListener('click', handleClick); root.removeEventListener('submit', handleSubmit); root.removeEventListener('change', handleChange); delete root.__talentCleanup; };
  render();
  if (catalog) render(); else loadCatalog();
  return { destroy() { destroyed = true; root.__talentCleanup?.(); } };
}

export { mountTalent, normalizeData, taskModel, taskProgress };
