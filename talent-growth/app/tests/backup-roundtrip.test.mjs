import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';
import { indexedDB } from 'fake-indexeddb';

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

test('文本备份不携带照片，并可安全恢复', async () => {
  const window = new Window({ url: 'http://localhost/' });
  let sharedText = '';
  window.indexedDB = indexedDB;
  window.confirm = () => true;
  window.fetch = async input => input === 'data.json'
    ? { ok: true, json: async () => appData }
    : { ok: false };
  window.Capacitor = {
    isNativePlatform: () => true,
    Plugins: {
      Share: { share: async value => { sharedText = value.text; } }
    }
  };
  window.localStorage.setItem('child-growth-app-v2', JSON.stringify({
    version: 2,
    babies: [{ id: 'baby_original', name: '小芽', birthday: '2025-01-01', gender: '女', createdAt: 1 }],
    activeBabyId: 'baby_original',
    profiles: {
      baby_original: {
        progress: {},
        records: [{ id: 'record_photo_only', text: '', date: Date.now(), photos: ['photo_local_only'], milestoneId: '', milestoneTitle: '' }],
        checkins: [],
        unlocked: ['b0']
      }
    }
  }));

  Object.assign(globalThis, {
    window,
    document: window.document,
    localStorage: window.localStorage,
    indexedDB,
    confirm: window.confirm,
    fetch: window.fetch
  });
  window.document.body.innerHTML = '<div id="app"></div>';
  await import(`../www/main.js?backup=${Date.now()}`);
  await tick();

  click(window, '[data-talent-view="family"]');
  click(window, '[data-talent-action="open-growth"]');
  await tick();
  click(window, '[data-action="export-backup"]');
  await tick();
  const exported = JSON.parse(sharedText);
  assert.equal(exported.photosIncluded, false);
  assert.deepEqual(exported.profiles.baby_original.records[0].photos, []);
  assert.match(exported.profiles.baby_original.records[0].text, /照片未包含在备份中/);

  const restored = {
    version: 2,
    babies: [{ id: 'baby_restored', name: '恢复宝宝', birthday: '2024-02-03', gender: '男', createdAt: 2 }],
    activeBabyId: 'baby_restored',
    profiles: {
      baby_restored: {
        progress: {},
        records: [{ id: 'record_restored', text: '恢复后的记录', date: Date.now(), photos: ['photo_missing'] }],
        checkins: ['2026-01-01'],
        unlocked: ['b0']
      }
    }
  };
  const input = window.document.querySelector('#backup-picker');
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [new window.File([JSON.stringify(restored)], 'backup.json', { type: 'application/json' })]
  });
  input.dispatchEvent(new window.Event('change', { bubbles: true }));
  await tick(80);

  const saved = JSON.parse(window.localStorage.getItem('child-growth-app-v2'));
  assert.equal(saved.babies[0].name, '恢复宝宝');
  assert.equal(saved.activeBabyId, 'baby_restored');
  assert.equal(saved.profiles.baby_restored.records[0].text, '恢复后的记录');
  assert.deepEqual(saved.profiles.baby_restored.records[0].photos, []);
  assert.match(window.document.body.textContent, /恢复宝宝/);
});
