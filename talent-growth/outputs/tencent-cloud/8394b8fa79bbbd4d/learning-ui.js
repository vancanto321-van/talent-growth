import { describeTaskStart } from './talent-insights.js';
import { renderCultivationResearch } from './cultivation-ui.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const arr = value => Array.isArray(value) ? value : [];
const safeUrl = value => { try { const u = new URL(value); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; } };
const typeLabels = {course:'课程',textbook:'教材',collection:'专题馆藏',guide:'实践指南',work:'原典·著作'};
const baseLabels = {start:'初次接触',practice:'已有经验，继续打磨',apply:'用于真实需要'};

export function normalizeExploration(value, ageGroup, learning, legacyBase) {
  const raw = value && typeof value === 'object' ? value : {};
  const stages = learning.stages.filter(s => s.parentAgeGroup === ageGroup);
  const contexts = learning.contexts.filter(c => c.ageGroups.includes(ageGroup));
  return {
    stageId: stages.some(s => s.id === raw.stageId) ? raw.stageId : '',
    lifeContexts: [...new Set(arr(raw.lifeContexts).filter(id => contexts.some(c => c.id === id)))].slice(0, 3),
    learningBase: Object.hasOwn(baseLabels, raw.learningBase) ? raw.learningBase : Object.hasOwn(baseLabels, legacyBase) ? legacyBase : 'start'
  };
}

export function explorationSnapshot(profile, ageGroup, learning) {
  const p = normalizeExploration(profile.exploration, ageGroup, learning, profile.preferences?.level);
  return {...p,ageGroup};
}

function resourcesFor(worldId, age, learning) {
  const all = learning.resources.filter(r => r.domainId === worldId);
  const young = ['early','preschool','child','teen'].includes(age);
  const suitable = all.filter(r => !young || ['all','family'].includes(r.audience) || (age === 'teen' && r.audience === 'teen-adult'));
  const adult = all.filter(r => !suitable.includes(r));
  const sort = list => list.sort((a,b) => Number(b.language === '中文') - Number(a.language === '中文'));
  return {suitable:sort(suitable),adult:sort(adult)};
}

function renderResource(r, caregiver = false) {
  const url = safeUrl(r.url);
  if (!url) return '';
  return `<article class="tg-reading-item"><div class="tg-reading-tags"><span>${esc(typeLabels[r.type] || '资料')}</span><span>${esc(r.language)}</span>${caregiver ? '<span>成人进阶·先看基础要求</span>' : `<span>${esc({adult:'成人进阶','teen-adult':'青少年及成人',family:'家庭共用',all:'按参与方式选择'}[r.audience] || '资料')}</span>`}</div><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(r.title)} ↗</a><small>${esc(r.provider)} · 核对 ${esc(r.checkedOn)}</small><details><summary>怎样使用与访问条件</summary><p>${esc(r.note)}</p></details></article>`;
}

function renderBookshelf(world, age, learning) {
  const resources = resourcesFor(world.id, age, learning);
  return `<div class="tg-bookshelf"><p class="tg-fine-print">大学课程、开放教材、馆藏与原典由外部机构提供；下面注明语言和访问条件。按基础选一节或一页，不必一次学完整门课。</p>${resources.suitable.map(r => renderResource(r)).join('') || '<p class="tg-fine-print">当前没有已核实的儿童专用课程。先用上面的陪伴或实践入口。</p>'}${resources.adult.length ? `<details class="tg-caregiver-reading"><summary>${age === 'teen' ? '想进阶再看：先读基础要求' : '陪伴者也想深入读：非儿童任务'}（${resources.adult.length} 项）</summary><p class="tg-fine-print">${age === 'teen' ? '这些是成人级课程或教材。先核对阅读与学科基础，再决定是否选一页试读。' : '这些资料供陪伴者自己学习，不是当前年龄的学习任务。'}</p>${resources.adult.map(r => renderResource(r,true)).join('')}</details>` : ''}</div>`;
}

function renderContext({learning, profile, person}) {
  const p = normalizeExploration(profile.exploration,person.ageGroup,learning,profile.preferences?.level);
  const stage = learning.stages.find(s => s.id === p.stageId);
  return `<details class="tg-learning-context"><summary>细分阶段与参与方式 <span>${esc(stage?.label || '按当前年龄，暂不细分')} · ${esc(baseLabels[p.learningBase])}</span></summary><p>年龄帮助选择参与方式，基础和处境由你决定。儿童范围只是参考，不是发展阈值；成人与长者可以从零开始，也可以直接深入。</p><form data-learning-context-form><div class="tg-context-fields"><label>更贴近现在的阶段<select name="stageId"><option value="">暂不细分</option>${learning.stages.filter(s => s.parentAgeGroup === person.ageGroup).map(s => `<option value="${esc(s.id)}" ${s.id === p.stageId ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}</select></label><label>这次的学习基础<select name="learningBase">${Object.entries(baseLabels).map(([id,label]) => `<option value="${id}" ${id === p.learningBase ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div><fieldset><legend>眼下的生活处境（最多选三项）</legend><div class="tg-context-options">${learning.contexts.filter(c => c.ageGroups.includes(person.ageGroup)).map(c => `<label><input type="checkbox" name="lifeContexts" value="${esc(c.id)}" ${p.lifeContexts.includes(c.id) ? 'checked' : ''}><span>${esc(c.label)}</span></label>`).join('')}</div></fieldset><p data-context-feedback class="tg-fine-print" role="status"></p><button class="tg-button tg-button-quiet">保存这个视角</button></form>${stage ? `<div class="tg-stage-note"><b>${esc(stage.label)}</b><p>${esc(stage.participation)}</p><p>${esc(stage.cognition)}</p><small>可借助：${stage.supports.map(esc).join(' · ')}</small></div>` : ''}</details>`;
}

export function renderLearningAtlas({learning, catalog, profile, person, selectedWorldId = ''}) {
  const world = learning.worlds.find(w => w.id === selectedWorldId);
  const attempts = arr(profile.attempts);
  const savedWorlds = new Set(attempts.map(a => catalog.tasks.find(t => t.id === a.taskId)?.learningDomainId).filter(Boolean));
  const coverage = learning.coverage.find(c => c.domainId === world?.id);
  return `<section class="tg-atlas"><button class="tg-back" data-talent-view="discover">← 回到三件小事</button><div class="tg-atlas-heading"><span class="tg-kicker">好奇心可以慢慢长开</span><h2>先遇见一点，<em>再向世界展开</em></h2><p>一页诗、一条街、一盆植物，都可以是入口。不用按顺序学，也不需要每个领域都开花。</p></div><div class="tg-atlas-summary"><span>${learning.worlds.length} 个探索领域</span><span>${learning.resources.length} 项核实资料</span><span>${savedWorlds.size ? `在 ${savedWorlds.size} 个新领域留下过记录` : `${learning.stages.length} 种阶段视角`}</span></div>${renderContext({learning,profile,person})}<div class="tg-world-rail" role="group" aria-label="探索领域">${learning.worlds.map(w => `<button class="${w.id === world?.id ? 'active' : ''}" style="--tg-color:${esc(w.color)}" data-talent-action="learning-world" data-world-id="${esc(w.id)}">${esc(w.title)}</button>`).join('')}</div>${world ? `<section class="tg-world-detail" style="--tg-color:${esc(world.color)}"><button class="tg-inline-link" data-talent-action="learning-world" data-world-id="">查看所有领域 ↑</button><span class="tg-kicker">${esc(world.kicker)}</span><h3>${esc(world.title)}</h3><p>${esc(world.description)}</p><div class="tg-world-topics">${world.topics.map(t => `<span>${esc(t)}</span>`).join('')}</div><p class="tg-world-question">${esc(world.question)}</p><section class="tg-world-entry"><span class="tg-kicker">从现在能做的一点开始</span><h4>${esc(world.entries[person.ageGroup].title)}</h4><p>${esc(world.entries[person.ageGroup].summary)}</p><button class="tg-button tg-button-primary" data-talent-action="open-task" data-task-id="world_${esc(world.id)}_${esc(person.ageGroup)}">打开这次小实验 →</button></section><details class="tg-world-route"><summary>愿意再深入：读一点、做一点、用一次</summary>${renderProject(world,person.ageGroup)}${renderBookshelf(world,person.ageGroup,learning)}</details><button class="tg-world-bridge" data-talent-action="learning-world" data-world-id="${esc(world.bridge.domainId)}"><small>顺着兴趣，拐进另一个领域</small><b>${esc(learning.worlds.find(w => w.id === world.bridge.domainId)?.title)} →</b><span>${esc(world.bridge.reason)}</span></button><details class="tg-coverage"><summary>这个领域已经有什么，还缺什么</summary><p>${esc(coverage?.covered || '已有一条分龄原创项目和资料入口。')}</p><p>继续补充：${esc(coverage?.missing || '更多主题、练习、原典与系统课程。')}</p></details></section>` : `<div class="tg-world-grid">${learning.worlds.map(w => `<button class="tg-world-card" style="--tg-color:${esc(w.color)}" data-talent-action="learning-world" data-world-id="${esc(w.id)}"><small>${esc(w.kicker)}</small><strong>${esc(w.title)}</strong><p>${esc(w.question)}</p><span>${esc(w.topics.slice(0,3).join(' · '))}</span><b>从一点开始 ↗</b></button>`).join('')}</div>`}${renderCultivationResearch()}<p class="tg-atlas-honesty">这是一张逐步扩展的地图：目前每个领域有一条原创项目、六种年龄入口和已核实资料；尚不是完整学科课程，更不能全面解析一个人的天赋。</p></section>`;
}

function renderProject(world, age) {
  if (age === 'early') return `<div class="tg-learning-route"><article><b>先陪伴</b><p>${esc(world.entries.early.summary)}</p></article><article><b>再观察</b><p>孩子愿意时，只改变一种材料；不要求回答、模仿、上课或完成作品。</p></article><article><b>回到日常</b><p>${esc(world.entries.early.transfer)}</p></article></div>`;
  if (['preschool','child'].includes(age)) return `<div class="tg-learning-route"><article><b>看或听一点</b><p>从身边材料或一幅图开始，${esc(world.entries[age].steps[0])}</p></article><article><b>自己试一试</b><p>${esc(world.entries[age].steps[1])}</p></article><article><b>用在生活里</b><p>${esc(world.entries[age].transfer)}</p></article></div>`;
  return `<p class="tg-fine-print">可继续的主题项目：${esc(world.project.title)}</p><div class="tg-learning-route">${[['读一点',world.project.readPrompt],['做一点',world.project.practicePrompt],['用一次',world.project.usePrompt]].map(([title,body]) => `<article><b>${title}</b><p>${esc(body)}</p></article>`).join('')}</div><p class="tg-fine-print">想继续追问：${esc(world.project.question)}。这三条可以来回走，不是必须依次通关的课程。</p>`;
}

export function renderLearningTrail({task,learning,profile,person,selectedBase}) {
  const world = learning.worlds.find(w => w.id === task.learningDomainId);
  if (!world || !task.ageGroups.includes(person.ageGroup)) return '';
  const p = normalizeExploration(profile.exploration,person.ageGroup,learning,profile.preferences?.level);
  const stage = learning.stages.find(s => s.id === p.stageId);
  if(Object.hasOwn(baseLabels,selectedBase))p.learningBase=selectedBase;
  const method = task.learningPaths?.[p.learningBase]?.method || task.adaptations[p.learningBase];
  return `<details class="tg-learning-trail"><summary>从这次小事，继续向 ${esc(world.title)} 展开</summary>${stage ? `<div class="tg-stage-note"><b>这个阶段可以怎样参与</b><p>${esc(stage.participation)}</p><p>${esc(stage.prompt)}</p></div>` : ''}<p><b>${esc(baseLabels[p.learningBase])}</b> · ${esc(method)}</p><div class="tg-signal-tags">${arr(task.directionIds).map(id=>`<span>${esc(({expression:'表达',analysis:'分析',design:'设计',coding:'编程',organization:'规划',interpersonal:'协作',music:'音乐',movement:'动作',nature:'自然观察'})[id] || id)}</span>`).join('')}</div><p class="tg-fine-print">这次可留下：${esc(task.learningPaths?.[p.learningBase]?.output || task.deliverable)}</p>${p.lifeContexts.map(id => `<p class="tg-fine-print">${esc(learning.contexts.find(c => c.id === id)?.prompt)}</p>`).join('')}${renderProject(world,person.ageGroup)}${renderBookshelf(world,person.ageGroup,learning)}<button class="tg-button tg-button-quiet" data-talent-action="learning-world" data-world-id="${esc(world.bridge.domainId)}">顺藤摸瓜：${esc(learning.worlds.find(w => w.id === world.bridge.domainId)?.title)} →</button></details>`;
}

export function renderTaskParticipation({task,learning,profile,person}) {
  if (!task.ageGroups.includes(person.ageGroup)) return '';
  const p = normalizeExploration(profile.exploration,person.ageGroup,learning,profile.preferences?.level);
  const stage = learning.stages.find(s => s.id === p.stageId);
  if (!stage) return '';
  return `<details class="tg-participation"><summary>按“${esc(stage.label)}”调整这一步</summary><p>${esc(stage.participation)}</p><p>${esc(stage.prompt)}</p><small>工具支持：${stage.supports.map(esc).join(' · ')}</small></details>`;
}

export function wanderingTasks({catalog,learning,profile,person,round = 0,now = new Date()}) {
  const p = normalizeExploration(profile.exploration,person.ageGroup,learning,profile.preferences?.level);
  const key = `${person.id}:${now.getFullYear()}-${now.getMonth()}-${now.getDate()}:${round}`;
  let seed = [...key].reduce((h,c) => Math.imul(h ^ c.charCodeAt(0),16777619) >>> 0,2166136261);
  const random = () => { seed = (Math.imul(seed,1664525)+1013904223) >>> 0; return seed / 4294967296; };
  const available = learning.worlds.map(w => ({world:w,task:catalog.tasks.find(t => t.id === `world_${w.id}_${person.ageGroup}`)})).filter(x => x.task);
  const untried = available.filter(x => !arr(profile.attempts).some(a => a.taskId === x.task.id));
  const pool = (untried.length >= 3 ? untried : available).map(x => ({...x,order:random()})).sort((a,b) => a.order-b.order);
  const first = pool[0];
  const nearby = pool.find(x => x.world.id === first?.world.bridge.domainId) || pool[1];
  const third = pool.find(x => x !== first && x !== nearby);
  const minutes = profile.preferences?.minutes || 10;
  return [first,nearby,third].filter(Boolean).map((x,i) => ({...describeTaskStart({task:x.task,profile,ageGroup:person.ageGroup,preferences:{...profile.preferences,minutes,level:p.learningBase}}),reasons:[i === 0 ? `偶然遇见 · 先从${x.world.title}的一件小事开始` : i === 1 ? `顺藤摸瓜 · ${first.world.bridge.domainId === x.world.id ? first.world.bridge.reason : '换一种材料，看看会不会生出新的问题'}` : `留一点意外 · 试试${x.world.title}，也可以随时换掉`]}));
}
