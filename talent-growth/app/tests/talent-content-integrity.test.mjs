import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import generated from '../www/talent-data.js';
import growthProgress from '../www/growth-progress.js';
import { normalizeTalentStore } from '../www/talent-store.js';

const require = createRequire(import.meta.url);
const catalog = require('../../data/talent-catalog.js');

test('全龄任务内容和发布数据一致，覆盖每个领域和年龄且有明确成果', () => {
  assert.deepEqual(generated, catalog);
  const directionIds = new Set(catalog.directions.map(item => item.id));
  const ages = catalog.ageGroups.map(item => item.id);
  assert.deepEqual(ages, ['early', 'preschool', 'child', 'teen', 'adult', 'later']);
  assert.equal(directionIds.size, 9);
  assert.ok(catalog.tasks.length >= 117);
  assert.equal(new Set(catalog.tasks.map(task => task.id)).size, catalog.tasks.length);
  for (const task of catalog.tasks) {
    assert.ok(directionIds.has(task.directionId), task.id);
    assert.ok(task.ageGroups.length && task.ageGroups.every(age => ages.includes(age)), task.id);
    assert.ok(Number.isFinite(task.minutes) && task.minutes > 0 && task.minutes <= 180, task.id);
    for (const key of ['materials', 'steps', 'observe', 'reflection', 'rubric']) {
      assert.ok(Array.isArray(task[key]) && task[key].length && task[key].every(item => typeof item === 'string' && item.trim()), `${task.id}: ${key}`);
    }
    for (const key of ['title', 'summary', 'deliverable', 'transfer']) assert.ok(typeof task[key] === 'string' && task[key].trim(), `${task.id}: ${key}`);
    assert.ok(!task.rubric.some(criterion => /[15]\s*分\s*=/.test(criterion)), task.id);
  }
  for (const direction of catalog.directions) {
    assert.equal(direction.development.length, 4);
    for (const age of ages) assert.ok(catalog.tasks.some(task => task.directionId === direction.id && task.ageGroups.includes(age)), `${direction.id}/${age}`);
  }
  for (const combination of catalog.combinations) assert.ok(combination.directionIds.every(id => directionIds.has(id)), combination.id);
});

test('真实目录中的中文任务 ID 能保留儿童电量和尝试，方向白名单不会抹掉标准进度', () => {
  const task = catalog.tasks.find(item => item.ageGroups.includes('preschool'));
  const criterion = growthProgress.directionsOf({ complete: task.rubric })[0];
  const levels = { [criterion.id]: 2 };
  const now = Date.now();
  const snapshot = {
    version: 1,
    people: [{ id: 'test_child', name: '测试儿童', ageGroup: 'preschool' }],
    activeId: 'test_child',
    profiles: { test_child: {
      progress: { [task.id]: { directionLevels: levels, date: now } },
      attempts: [{ id: 'attempt_real_catalog', taskId: task.id, date: now, note: '记录实际活动中的一次回应', mode: 'assisted', enjoyment: 4, energy: 3 }],
      plan: null
    } }
  };
  const restored = normalizeTalentStore(snapshot, { taskIds: new Set(catalog.tasks.map(item => item.id)), directionIds: new Set(catalog.directions.map(item => item.id)) });
  assert.deepEqual(restored.profiles.test_child.progress[task.id].directionLevels, levels);
  assert.equal(restored.profiles.test_child.attempts[0].taskId, task.id);
});
