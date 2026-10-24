import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';
import { indexedDB } from 'fake-indexeddb';
import growthProgress from '../www/growth-progress.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const appData = JSON.parse(fs.readFileSync(path.join(here, '..', 'www', 'data.json'), 'utf8'));

function tick(ms = 30) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function click(window, selector) {
  const element = window.document.querySelector(selector);
  assert.ok(element, `找不到元素：${selector}`);
  element.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
}

function mountWindow() {
  const window = new Window({ url: 'http://localhost/' });
  window.indexedDB = indexedDB;
  window.confirm = () => true;
  window.fetch = async input => input === 'data.json'
    ? { ok: true, json: async () => appData }
    : { ok: false };
  Object.assign(globalThis, {
    window,
    document: window.document,
    localStorage: window.localStorage,
    indexedDB,
    confirm: window.confirm,
    fetch: window.fetch
  });
  window.document.body.innerHTML = '<div id="app"></div>';
  return window;
}

test('旧版方向数组会显示为完成阶段，并在备注与状态变更后保留方向电量', async () => {
  const window = mountWindow();
  const milestone = appData.milestones.bands[0].domains[0].items[0];
  const babyId = 'baby_direction';
  window.localStorage.setItem('child-growth-app-v2', JSON.stringify({
    version: 2,
    babies: [{ id: babyId, name: '小芽', birthday: '2026-05-01', gender: '女', createdAt: 1 }],
    activeBabyId: babyId,
    profiles: {
      [babyId]: {
        progress: { [milestone.id]: { status: 'observed', note: '旧版备注', directions: [0, 2] } },
        records: [], checkins: [], unlocked: ['b0']
      }
    }
  }));

  await import(`../www/main.js?directions=${Date.now()}`);
  await tick();
  click(window, '[data-talent-view="family"]');
  click(window, '[data-talent-action="open-growth"]');
  await tick();
  click(window, '[data-tab="home"]');
  await tick();
  assert.equal(window.document.querySelectorAll('[data-action="open-band"]').length, 6);
  assert.equal(window.document.querySelectorAll('[data-action="open-domain"]').length, 7);
  click(window, '[data-tab="band"]');
  await tick();
  assert.ok(window.document.querySelector('.milestone-rail'));
  click(window, '[data-milestone]');
  await tick();

  assert.equal(window.document.querySelectorAll('.direction-item').length, 4);
  assert.equal(window.document.querySelectorAll('.direction-stage.active[data-direction-level="4"]').length, 2);
  const firstDirection = growthProgress.directionsOf(milestone)[0];
  const firstStage = window.document.querySelector(`[data-direction-id="${firstDirection.id}"][data-direction-level="2"]`);
  assert.ok(firstStage);
  firstStage.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await tick();

  const note = window.document.querySelector('#milestone-note');
  note.value = '补充观察';
  click(window, '[data-action="save-milestone-note"]');
  await tick();
  click(window, '[data-status="achieved"]');
  await tick();

  const saved = JSON.parse(window.localStorage.getItem('child-growth-app-v2'));
  const entry = saved.profiles[babyId].progress[milestone.id];
  assert.equal(entry.status, 'achieved');
  assert.equal(entry.note, '补充观察');
  assert.equal(entry.directionLevels[firstDirection.id], 2);
  assert.equal(Object.keys(entry.directionLevels).length, 2);
  assert.match(window.document.body.textContent, /成长电量/);
});

test('方向电量会进入文本备份并在恢复后保持阶段', async () => {
  const window = mountWindow();
  const milestone = appData.milestones.bands[0].domains[0].items[0];
  const firstDirection = growthProgress.directionsOf(milestone)[0];
  const babyId = 'baby_backup_direction';
  let sharedText = '';
  window.Capacitor = { isNativePlatform: () => true, Plugins: { Share: { share: async value => { sharedText = value.text; } } } };
  window.localStorage.setItem('child-growth-app-v2', JSON.stringify({
    version: 2,
    babies: [{ id: babyId, name: '小芽', birthday: '2026-05-01', gender: '女', createdAt: 1 }],
    activeBabyId: babyId,
    profiles: {
      [babyId]: {
        progress: { [milestone.id]: { status: 'observed', note: '电量备注', directionLevels: { [firstDirection.id]: 3 } } },
        records: [], checkins: [], unlocked: ['b0']
      }
    }
  }));
  await import(`../www/main.js?direction-backup=${Date.now()}`);
  await tick();
  click(window, '[data-talent-view="family"]');
  click(window, '[data-talent-action="open-growth"]');
  await tick();
  click(window, '[data-action="export-backup"]');
  await tick();
  const exported = JSON.parse(sharedText);
  assert.equal(exported.profiles[babyId].progress[milestone.id].directionLevels[firstDirection.id], 3);
  assert.equal(exported.profiles[babyId].progress[milestone.id].note, '电量备注');
});
