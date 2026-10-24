import { learningWorlds } from './learning-seeds.mjs';
import { learningStages, lifeContexts, coverageNotes } from './learning-stages.mjs';
import { learningResources } from './learning-resources.mjs';

const ages = ['early', 'preschool', 'child', 'teen', 'adult', 'later'];
const directions = new Set(['expression', 'analysis', 'design', 'coding', 'organization', 'interpersonal', 'music', 'movement', 'nature']);
const nonempty = value => typeof value === 'string' && Boolean(value.trim());
const ids = new Set();
for (const world of learningWorlds) {
  if (!/^[a-z]+$/.test(world.id) || ids.has(world.id)) throw new Error('Invalid learning world ID');
  ids.add(world.id);
  if (!world.directionIds?.length || world.directionIds.some(id => !directions.has(id))) throw new Error('Unknown ability in ' + world.id);
  for (const age of ages) {
    const entry = world.entries?.[age];
    for (const key of ['title', 'summary', 'deliverable', 'transfer']) if (!nonempty(entry?.[key])) throw new Error(`Missing ${world.id}/${age}/${key}`);
    for (const key of ['materials', 'steps', 'observe']) if (!Array.isArray(entry?.[key]) || !entry[key].length || !entry[key].every(nonempty)) throw new Error(`Missing ${world.id}/${age}/${key}`);
  }
}
for (const resource of learningResources) {
  if (!ids.has(resource.domainId) || new URL(resource.url).protocol !== 'https:') throw new Error('Invalid learning resource ' + resource.id);
}
for (const world of learningWorlds) if (!ids.has(world.bridge?.domainId) || world.bridge.domainId === world.id) throw new Error('Invalid learning bridge ' + world.id);

function pathsFor(entry, age, steps) {
  const supports = {
    early:'照护者在旁准备和代记，孩子可以只看、只听或不参与，出现停止信号就结束。',
    preschool:'成人准备材料并处理工具，孩子用指认、动作、画图或口述参与，成人代记。',
    child:'由自己决定范围，可以画图或口述，请成人提供材料与安全支持。',
    teen:'自己决定作品和分享边界，先征得参与者同意，不使用私密材料。',
    adult:'使用熟悉工具和去标识材料，把范围缩到一个真实的小需要。',
    later:'口述、纸笔或熟悉工具任选，按舒适节奏暂停；可以用已有专长，也可以从零开始。'
  }[age];
  const preparation = `先准备${entry.materials[0]}，并完成必要准备：“${steps[0]}”。`;
  const start = {label:age === 'early' ? '先熟悉陪伴方式' : '先做一小段', firstStep:`${supports} ${steps[0]}`, cardPrompt:steps[0], output:age === 'early' ? '照护者的一条回应或停止信号，不要求孩子产出。' : `先留片段即可，不要求一次完成全部：${entry.deliverable}`};
  const practice = age === 'early' ? {label:'愿意时，再变一点',firstStep:`${supports} 先确认材料和距离与上次一样舒适；没有上次记录就先做原来的短片段，愿意继续时只改变一个元素。`,cardPrompt:'先保持熟悉的材料与距离，孩子愿意时只改变一个元素。',output:'照护者对同一陪伴片段的两条观察，可以记录不参与。'} : {label:'带着反馈改一处', firstStep:`${supports} ${preparation} 没有旧片段，就先按完整步骤做小样；有片段后，再围绕“${steps[1]}”只改一个条件。`,cardPrompt:`先准备材料；没有旧片段就先做小样，再选一处调整。`,output:age === 'preschool' ? '孩子的一处改玩法，由成人用图或一句话留下前后差异。' : '一个原片段、一次修改，以及为什么改的记录；可以图文或口述。'};
  const apply = age === 'early' ? {label:'回到熟悉日常',firstStep:`${supports} 先把原来材料和停止方式准备好，在一个熟悉的日常片段短暂邀请；没有熟悉片段就先按原来的做法陪伴。`,cardPrompt:'先准备熟悉材料与停止方式，再在日常片段中短暂邀请。',output:'一条日常陪伴情境与自愿回应记录，不设孩子完成目标。'} : {label:'准备好后，用一次',firstStep:`${supports} ${preparation} 先确认有一个可用片段；没有就先按完整步骤做小样。之后才选一个小范围试用：“${entry.transfer}”。`,cardPrompt:'先确认材料、边界与可用小样，再选一次真实使用。',output:age === 'preschool' ? '一次家庭游戏或生活里的使用，由成人记下孩子的选择与回应。' : '一次实际使用的情境、回应和限制；不把成功或失败当成能力结论。'};
  return Object.fromEntries(Object.entries({start,practice,apply}).map(([id,path]) => [id,{...path,method:path.firstStep}]));
}

export const learningTasks = learningWorlds.flatMap(world => ages.map(age => {
  const entry = world.entries[age];
  const early = age === 'early';
  const steps = entry.steps.map(step => step.replace(/先用\s*5\s*分钟/g, '先').replace(/先5分钟/g, '先'));
  const learningPaths=pathsFor(entry,age,steps);
  return {
    ...entry, steps, id: `world_${world.id}_${age}`, directionId: world.directionIds[0], directionIds:world.directionIds, topics:world.topics, bridge:world.bridge, learningPaths, ageGroups: [age], level: 'start', learningDomainId: world.id,
    reflection: early ? ['孩子愿意继续或停止时，你观察到了什么？', '下次怎样给孩子更多不参与的空间？'] : [world.question, '这次的方法可以用到哪个相近场景？'],
    rubric: early ? ['照护者留下了一条参与或停止信号记录', '材料与节奏随当下状态调整', '允许不参与并保留随时停止的空间'] : [`留下一个可回看的片段：${entry.deliverable}`, `回看一条具体线索：${entry.observe[0]}`, '说明一个限制或下一次准备调整的地方'],
    adaptations:Object.fromEntries(Object.entries(learningPaths).map(([id,path])=>[id,path.method]))
  };
}));
const processedWorlds = learningWorlds.map(world=>({...world,entries:Object.fromEntries(ages.map(age=>[age,learningTasks.find(task=>task.id===`world_${world.id}_${age}`)]))}));
export const learningData = { worlds: processedWorlds, stages: learningStages, contexts: lifeContexts, coverage: coverageNotes, resources: learningResources, editedOn: '2026-10-22' };
