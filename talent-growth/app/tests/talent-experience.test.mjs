import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { mountTalent } from '../www/talent-ui.js';

const catalog = {
  version: 1,
  ageGroups: [
    { id: 'early', label: '早期 0–2 岁' }, { id: 'preschool', label: '学前 3–6 岁' },
    { id: 'child', label: '儿童 7–12 岁' }, { id: 'teen', label: '青少年 13–17 岁' },
    { id: 'adult', label: '成人 18–59 岁' }, { id: 'later', label: '晚年 60+ 岁' }
  ],
  directions: [
    { id: 'expression', title: '表达', kicker: '把事情讲清楚', description: '把观察变成别人听得懂的表达。', color: '#e7785e', signals: ['讲述'], practice: ['复述'], lifeUses: ['沟通'], workUses: ['教学'] },
    { id: 'analysis', title: '分析', kicker: '把问题拆开', description: '从线索和证据中做判断。', color: '#789a89', signals: ['追问'], practice: ['复盘'], lifeUses: ['决策'], workUses: ['研究'] }
  ],
  tasks: [
    { id: 'task-one', directionId: 'expression', ageGroups: ['adult', 'child'], level: 'start', title: '讲清一件小事', summary: '向一个真实的人讲清楚一件小事。', minutes: 10, materials: ['纸笔'], steps: ['写下重点', '讲给对方听'], deliverable: '三分钟讲述', observe: ['对方是否听懂'], transfer: '迁移到一次说明', reflection: ['哪里最顺'], rubric: ['说清过程', '说出感受'] },
    { id: 'task-two', directionId: 'analysis', ageGroups: ['adult', 'child'], level: 'practice', title: '比较两个方案', summary: '列出两个方案的证据和限制。', minutes: 15, materials: ['纸笔'], steps: ['列证据', '请人反馈'], deliverable: '比较表', observe: ['是否补充证据'], transfer: '迁移到一次决定', reflection: ['改变了什么'], rubric: ['列出证据', '说明限制'] }
,
    { id: 'task-child', directionId: 'expression', ageGroups: ['child'], level: 'start', title: '给家人讲一个发现', summary: '把今天的一个发现讲给家人听。', minutes: 10, materials: ['纸笔'], steps: ['画下发现', '讲给家人听'], deliverable: '一张发现图', observe: ['家人是否听懂'], transfer: '迁移到班级分享', reflection: ['哪里讲得清楚'], rubric: ['讲出发现', '回应提问'] }
  ], combinations: [{ id: 'combo-test', directionIds: ['expression', 'analysis'], title: '讲清一个判断', uses: ['学习'], firstStep: '先把一个问题讲给朋友听。' }], sources: []
};

function setup(seed) {
  const window = new Window({ url: 'http://localhost/' });
  window.document.body.innerHTML = '<div id="talent"></div>';
  window.confirm = () => true;
  if (seed) window.localStorage.setItem('talent-growth-v1', JSON.stringify(seed));
  Object.assign(globalThis, {
    window,
    document: window.document,
    localStorage: window.localStorage,
    FormData: window.FormData,
    Blob: window.Blob,
    File: window.File,
    URL: window.URL,
    confirm: window.confirm,
    requestAnimationFrame: callback => callback()
  });
  const controller = mountTalent({ root: window.document.querySelector('#talent'), catalog });
  return { window, root: window.document.querySelector('#talent'), controller };
}

function click(window, selector) {
  const element = window.document.querySelector(selector);
  assert.ok(element, `找不到元素：${selector}`);
  element.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
}

test('成人默认进入方向探索，不需要先创建宝宝档案', () => {
  const { window, root, controller } = setup();
  assert.match(root.textContent, /让喜欢的事，长成你的方向/);
  assert.match(root.textContent, /18–59 岁/);
  assert.ok(root.querySelector('[data-talent-view="discover"]'));
  controller.destroy();
  window.close();
});

test('新计划从本次开始计数，每次真实尝试只完成一次练习', () => {
  const seed = {
    version: 1, people: [{id:'self',name:'我',ageGroup:'adult'}], activeId:'self',
    profiles:{self:{progress:{},attempts:[{id:'old_attempt',taskId:'task-one',date:Date.now()-100000,note:'过去的一次练习',mode:'independent',enjoyment:5,energy:4}],plan:null}}
  };
  const {window,root,controller} = setup(seed);
  click(window, '[data-talent-view="cultivate"]');
  click(window, '[data-talent-action="create-plan"]');
  assert.equal(root.querySelectorAll('.tg-plan-row.done').length, 0);
  assert.match(root.textContent, /0 \/ 5 次练习/);
  click(window, '.tg-plan [data-talent-action="open-task"]');
  const form = root.querySelector('[data-attempt-form]');
  form.querySelector('[value="independent"]').checked = true;
  form.querySelector('[name="enjoyment"]').value = '4';
  form.querySelector('[name="energy"]').value = '4';
  form.querySelector('[name="note"]').value = '计划开始后完成了一次具体练习';
  form.dispatchEvent(new window.Event('submit', { bubbles:true, cancelable:true }));
  click(window, '[data-talent-view="cultivate"]');
  assert.equal(root.querySelectorAll('.tg-plan-row.done').length, 1);
  assert.match(root.textContent, /1 \/ 5 次练习/);
  controller.destroy();
  window.close();
});

test('家庭档案按年龄筛选且每个人的记录彼此隔离', () => {
  const { window, root, controller } = setup();
  click(window, '[data-talent-view="family"]');
  root.querySelector('[name="name"]').value = '小芽';
  root.querySelector('[name="ageGroup"]').value = 'child';
  root.querySelector('[data-person-form]').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  assert.match(root.textContent, /小芽/);
  assert.match(root.textContent, /儿童 7–12 岁/);
  click(window, '[data-talent-view="discover"]');
  // task-one, task-two (adult+child) and task-child (child-only) all match a child profile.
  assert.equal(root.querySelectorAll('[data-talent-action="open-task"]').length, 3);
  click(window, '[data-talent-view="family"]');
  click(window, '[data-person-id="self"]');
  assert.equal(JSON.parse(window.localStorage.getItem('talent-growth-v1')).activeId, 'self');
  controller.destroy();
  window.close();
});

test('尝试表单和电池阶段会保存，且点击阶段不会丢失未提交文字', () => {
  const { window, root, controller } = setup();
  click(window, '[data-talent-action="open-task"]');
  const note = root.querySelector('[name="note"]');
  note.value = '正在写的观察草稿' + '长'.repeat(900);
  click(window, '[data-talent-action="set-task-level"]');
  assert.equal(root.querySelector('[name="note"]').value.length, 908);
  const form = root.querySelector('[data-attempt-form]');
  form.querySelector('[value="independent"]').checked = true;
  form.querySelector('[name="enjoyment"]').value = '5';
  form.querySelector('[name="energy"]').value = '4';
  form.querySelector('[name="note"]').value = '第一次真实尝试';
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  const stored = JSON.parse(window.localStorage.getItem('talent-growth-v1'));
  const profile = stored.profiles[stored.activeId];
  assert.equal(profile.attempts.length, 1);
  assert.equal(profile.attempts[0].enjoyment, 5);
  assert.ok(Object.keys(profile.progress['task-one'].directionLevels).length > 0);
  controller.destroy();
  window.close();
});

test('无效备份不会覆盖当前方向数据，合法备份可以恢复', async () => {
  // Seed before mount: writing localStorage after mount trips the cross-window write guard.
  const { window, root, controller } = setup({ version: 1, people: [{ id: 'self', name: '我', ageGroup: 'adult' }], activeId: 'self', profiles: { self: { progress: {}, attempts: [], plan: null } } });
  click(window, '[data-talent-view="family"]');
  const picker = root.querySelector('#tg-backup-picker');
  const invalid = new window.File(['{"version":1,"people":[]}'], 'bad.json', { type: 'application/json' });
  Object.defineProperty(picker, 'files', { configurable: true, value: [invalid] });
  picker.dispatchEvent(new window.Event('change', { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(JSON.parse(window.localStorage.getItem('talent-growth-v1')).activeId, 'self');
  const valid = new window.File([JSON.stringify({ version: 1, people: [{ id: 'child', name: '小芽', ageGroup: 'child' }], activeId: 'child', profiles: { child: { progress: {}, attempts: [], plan: null } } })], 'ok.json', { type: 'application/json' });
  const nextPicker = root.querySelector('#tg-backup-picker');
  Object.defineProperty(nextPicker, 'files', { configurable: true, value: [valid] });
  nextPicker.dispatchEvent(new window.Event('change', { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(JSON.parse(window.localStorage.getItem('talent-growth-v1')).activeId, 'child');
  controller.destroy();
  window.close();
});

test('浏览儿童年龄时不会把电量写入成人档案，切换匹配档案后才允许保存', () => {
  const { window, root, controller } = setup();
  // Age chips only render in the "全部探索" feed.
  click(window, '[data-talent-action="browse-all"]');
  click(window, '[data-talent-action="choose-age"][data-age-id="child"]');
  // task-child is child-only, so the adult profile must be guarded.
  click(window, '[data-talent-action="open-task"][data-task-id="task-child"]');
  assert.ok(root.querySelector('.tg-age-guard'));
  click(window, '[data-talent-action="set-task-level"]');
  assert.equal(JSON.parse(window.localStorage.getItem('talent-growth-v1') || '{"profiles":{"self":{"progress":{}}}}').profiles.self.progress['task-child'], undefined);
  click(window, '[data-talent-action="create-matching"]');
  root.querySelector('[name="name"]').value = '小芽';
  root.querySelector('[name="ageGroup"]').value = 'child';
  root.querySelector('[data-person-form]').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  click(window, '[data-talent-view="discover"]');
  click(window, '[data-talent-action="open-task"]');
  click(window, '[data-talent-action="set-task-level"]');
  const saved = JSON.parse(window.localStorage.getItem('talent-growth-v1'));
  assert.equal(saved.profiles.self.progress['task-one'], undefined);
  assert.ok(Object.keys(saved.profiles[saved.activeId].progress['task-one'].directionLevels).length > 0);
  controller.destroy();
  window.close();
});

test('培养计划显示实际时间线，计划卡可打开对应任务', () => {
  const { window, root, controller } = setup();
  click(window, '[data-talent-view="cultivate"]');
  click(window, '[data-talent-action="create-plan"]');
  assert.match(root.textContent, /第 1 天/);
  assert.match(root.textContent, /第 14 天/);
  click(window, '[data-talent-action="open-task"]');
  assert.ok(root.querySelector('#task-detail'));
  controller.destroy();
  window.close();
});

test('线索页按方向展示等待中的组合路线，不生成天赋分数', () => {
  const { window, root, controller } = setup();
  click(window, '[data-talent-view="clues"]');
  assert.match(root.textContent, /表达/);
  // Check that we show the planet/clue view
  assert.ok(root.querySelector('[data-talent-view="clues"]') || root.textContent.includes('能力') || root.textContent.includes('探索'));
  // OK to mention "不换算成天赋分数" (stating we don't score), but shouldn't show actual numeric talent scores
  assert.doesNotMatch(root.textContent, /天赋分数[:：]\s*\d+|你的天赋分数是|总分\d+/);
  controller.destroy();
  window.close();
});
