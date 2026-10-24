import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.join(here, '..', 'www', 'data.json');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

test('产品内容数据完整且可唯一索引', () => {
  const bands = data.milestones?.bands;
  assert.equal(bands?.length, 6);
  assert.deepEqual(bands.map(band => band.key), ['b0', 'b1', 'b2', 'b3', 'b4', 'b5']);
  assert.deepEqual(
    bands.map(band => band.domains.flatMap(domain => domain.items).length),
    [74, 74, 75, 71, 70, 70]
  );

  const milestones = bands.flatMap(band => {
    assert.equal(band.domains.length, 7, `${band.key} 应包含 7 个成长领域`);
    return band.domains.flatMap(domain => {
      assert.ok(domain.name?.trim());
      return domain.items;
    });
  });
  assert.equal(milestones.length, 434);
  assert.equal(new Set(milestones.map(item => item.id)).size, milestones.length, '里程碑 ID 必须唯一');

  for (const item of milestones) {
    for (const key of ['id', 'title', 'age', 'func', 'passs', 'std', 'nxt']) {
      assert.equal(typeof item[key], 'string', `${item.id} 缺少 ${key}`);
      assert.ok(item[key].trim(), `${item.id} 的 ${key} 为空`);
    }
    assert.ok(Array.isArray(item.guide) && item.guide.length, `${item.id} 缺少引导步骤`);
    assert.ok(Array.isArray(item.complete) && item.complete.length, `${item.id} 缺少完整标准`);
    assert.ok(Array.isArray(item.perf) && item.perf.length, `${item.id} 缺少表现解读`);
  }
});

test('陪伴、安全与物品内容覆盖所有阶段', () => {
  assert.deepEqual(data.guides.map(item => item.band), ['b0', 'b1', 'b2', 'b3', 'b4', 'b5']);
  assert.deepEqual(data.safety.map(item => item.band), ['b0', 'b1', 'b2', 'b3', 'b4', 'b5']);
  assert.equal(data.items.length, 9);

  for (const guide of data.guides) {
    assert.ok(guide.profile?.trim());
    for (const key of ['rhythm', 'points', 'scenarios', 'selfcare']) {
      assert.ok(Array.isArray(guide[key]) && guide[key].length, `${guide.band} 陪伴内容缺少 ${key}`);
    }
  }
  for (const safety of data.safety) {
    for (const key of ['risks', 'home', 'outdoor', 'food', 'toys', 'social', 'firstaid', 'warning']) {
      assert.ok(Array.isArray(safety[key]) && safety[key].length, `${safety.band} 安全内容缺少 ${key}`);
    }
  }
  for (const year of data.items) assert.ok(year.year && year.items?.length, '逐年物品清单不能为空');
});
