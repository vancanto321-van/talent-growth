import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const growth = require('../../utils/growth-progress.js');
const storage = require('../../utils/storage.js');

test('方向电量在重排、备注、达标撤销、多宝宝切换及备份恢复后保留', () => {
  const cache = new Map();
  globalThis.wx = {
    getStorageSync: key => cache.has(key) ? JSON.parse(cache.get(key)) : '',
    setStorageSync: (key, value) => cache.set(key, JSON.stringify(value)),
    removeStorageSync: key => cache.delete(key)
  };
  const milestone = { id: 'b0_成长', complete: ['尝试一次', '在不同场景试试', '连续观察'] };
  const definitions = growth.directionsOf(milestone);
  const firstBaby = storage.addBaby({ name: '测试宝宝', birthday: '2025-01-01' });
  const levels = { [definitions[0].id]: 2, [definitions[1].id]: 1 };
  assert.equal(storage.setDirectionLevels(milestone.id, levels), true);
  assert.equal(growth.progressOf(milestone, storage.getStatus(milestone.id)).percent, 25);
  storage.setNote(milestone.id, '练习中的观察');
  storage.setStatus(milestone.id, 'achieved');
  storage.setStatus(milestone.id, '');
  assert.deepEqual(storage.getStatus(milestone.id).directionLevels, levels);
  assert.equal(storage.getStatus(milestone.id).note, '练习中的观察');
  const reordered = { complete: [...milestone.complete].reverse() };
  assert.equal(growth.progressOf(reordered, storage.getStatus(milestone.id)).directions[2].percent, 50);
  const secondBaby = storage.addBaby({ name: '另一宝宝', birthday: '2024-02-01' });
  assert.equal(storage.getStatus(milestone.id), null);
  storage.switchBaby(firstBaby.id);
  const backup = storage.exportAll();
  storage.importAll(backup);
  assert.deepEqual(storage.getStatus(milestone.id).directionLevels, levels);
  storage.switchBaby(secondBaby.id);
  assert.equal(storage.getStatus(milestone.id), null);
  const legacy = growth.progressOf(milestone, { directions: [0] });
  assert.equal(legacy.directions[0].percent, 100);
  assert.equal(legacy.directions[1].percent, 0);
  assert.deepEqual(growth.normalizeLevels({ [definitions[0].id]: 9, [definitions[1].id]: 2, ['__proto__']: 1 }), { [definitions[1].id]: 2 });
});
