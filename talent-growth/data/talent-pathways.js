// Age changes the setting and support; familiarity is chosen independently.
const ageApproaches = {
  early: '照护者发起短时互动，孩子可以只看、只听或不参与。按当下状态调整；记录回应与停止信号，不要求说话、移动或完成作品。',
  preschool: '从游戏和身边实物出发，让孩子挑材料、改玩法。成人处理工具与安全环节，可以用指认、动作或口述代替文字。',
  child: '孩子主导一个具体问题，先画、搭或试做，再向家人或同伴询问反馈。成人提供材料与安全支持，过程记录可以图文混合。',
  teen: '用学习、兴趣和同伴协作中的真实需要做项目，自己决定范围与分享边界。记录理由和反馈，遇到公开发布或场地问题先取得许可。',
  adult: '从工作、家务、兴趣或社区中的实际需要出发，用一个可交付的小成果验证方法。可用虚构或去标识材料，基础由既有经验决定。',
  later: '把经验、兴趣和当下想解决的事放在中心，纸笔、口述和数字工具都可选。可从零学习，也可带着既有专长做深入项目，节奏由自己决定。'
};

// Existing tasks keep their IDs, rubric and steps so saved batteries remain valid.
function legacyAdaptations(task) {
  const [first = task.summary, second = first, third = second] = task.steps;
  const age = task.ageGroups[0];
  if (age === 'early') return {
    start: `照护者先准备并示范这一小步：“${first}”。孩子可只看或只听，不要求模仿；把是否愿意继续记下来。`,
    practice: `孩子愿意再次参与时，只改变一个熟悉元素，参考“${second}”；不同时增加声音、物品和时长，移开视线或不适就暂停。`,
    apply: `在合适的日常片段中借用“${third}”的互动方式；只记一条当时的回应或拒绝，不要求产出，也不据此判断能力。`
  };
  if (age === 'preschool') return {
    start: `成人把材料缩到一两样，示范“${first}”；孩子可以指认或口述，由成人代记，愿意时做一小段即可。`,
    practice: `围绕“${second}”，请孩子选择一个不同材料或玩法，先说或画自己的想法，再试一次；由成人处理需要工具的环节。`,
    apply: `借“${third}”把作品或玩法用到家庭游戏中；邀请一个自愿参与的家人，说出一处喜欢和一处想改的地方。`
  };
  if (age === 'child') return {
    start: `先只完成“${first}”，可以画图或用实物示意；需要时请成人协助准备材料，由自己决定先试哪一步。`,
    practice: `重点打磨“${second}”，留下尝试前后的两个版本，并请一位家人或同伴指出具体哪里更好用。`,
    apply: `完成“${third}”后，把“${task.deliverable}”用于一次真实的家庭或班级小需求，记下使用者的反馈再修改一处。`
  };
  const choices = age === 'later' ? '口述、纸笔或熟悉的数字工具任选一种' : '纸笔或熟悉的工具任选一种';
  return {
    start: `${choices}，先做“${first}”；把对象缩到一个、时长缩到一小段，留下一份草稿，暂时不追求完整成品。`,
    practice: `围绕“${second}”做两个有明显差异的版本，请实际使用者或一位自愿伙伴比较，记录反馈带来的具体修改。`,
    apply: `以“${third}”完成交付，把“${task.deliverable}”放到一个真实需求中试用，说明使用边界与成本，并根据反馈再迭代。`
  };
}

module.exports = { ageApproaches, legacyAdaptations };
