import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';
import { indexedDB } from 'fake-indexeddb';

const here = path.dirname(fileURLToPath(import.meta.url));
const appData = JSON.parse(fs.readFileSync(path.join(here, '..', 'www', 'data.json'), 'utf8'));

function tick(ms = 10) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function click(window, selector) {
  const element = window.document.querySelector(selector);
  assert.ok(element, `找不到可点击元素：${selector}`);
  element.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
}

test('核心用户流程：建档、浏览、达标、记录与统计', async () => {
  const window = new Window({ url: 'http://localhost/' });
  const browserErrors = [];
  window.addEventListener('error', event => browserErrors.push(event.error || event.message));
  window.addEventListener('unhandledrejection', event => browserErrors.push(event.reason));
  window.indexedDB = indexedDB;
  window.confirm = () => true;
  window.Capacitor = {
    isNativePlatform: () => true,
    Plugins: {
      Camera: { getPhoto: async () => ({ webPath: 'capacitor://test-photo' }) },
      Share: { share: async () => ({}) }
    }
  };
  window.fetch = async input => input === 'data.json'
    ? { ok: true, json: async () => appData }
    : { ok: true, blob: async () => new Blob(['photo'], { type: 'image/jpeg' }) };

  Object.assign(globalThis, {
    window,
    document: window.document,
    localStorage: window.localStorage,
    indexedDB,
    confirm: window.confirm,
    fetch: window.fetch
  });

  window.document.body.innerHTML = '<div id="app"></div>';
  await import(`../www/main.js?smoke=${Date.now()}`);
  await tick();

  assert.match(window.document.body.textContent, /陪孩子探索/);
  click(window, '[data-action="open-profile"]');
  await tick();
  assert.match(window.document.body.textContent, /创建宝贝档案/);
  assert.match(window.document.body.textContent, /创建档案/);

  window.document.querySelector('#baby-name').value = '小芽';
  window.document.querySelector('#baby-birthday').value = '2025-01-01';
  window.document.querySelector('#baby-gender').value = '女';
  click(window, '[data-action="save-profile"]');
  await tick();
  const afterProfileSave = JSON.parse(window.localStorage.getItem('child-growth-app-v2'));
  assert.equal(afterProfileSave.babies[0]?.name, '小芽');
  assert.deepEqual(browserErrors, []);
  assert.match(window.document.body.textContent, /小芽/);

  click(window, '[data-tab="home"]');
  await tick();
  assert.match(window.document.body.textContent, /今天也慢慢长大/);
  click(window, '[data-action="checkin"]');
  await tick();
  assert.match(window.document.body.textContent, /今天已陪伴/);

  click(window, '[data-tab="band"]');
  await tick();
  assert.match(window.document.body.textContent, /里程碑/);
  click(window, '[data-band-section="guide"]');
  await tick();
  assert.match(window.document.body.textContent, /高质量陪伴要点/);
  click(window, '[data-band-section="milestones"]');
  await tick();

  const firstMilestone = window.document.querySelector('[data-milestone]');
  assert.ok(firstMilestone);
  const firstMilestoneId = firstMilestone.dataset.milestone;
  firstMilestone.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await tick();
  assert.match(window.document.body.textContent, /可以怎么引导/);
  window.document.querySelector('#milestone-note').value = '今天能够稳定完成两次。';
  click(window, '[data-action="save-milestone-note"]');
  await tick();
  assert.equal(window.document.querySelector('#milestone-note').value, '今天能够稳定完成两次。');
  click(window, '[data-status="achieved"]');
  await tick();
  assert.match(window.document.body.textContent, /已达标/);

  click(window, '[data-action="record-this-milestone"]');
  await tick();
  assert.match(window.document.body.textContent, /记下这一刻/);
  const recordText = window.document.querySelector('#record-text');
  recordText.value = '今天第一次独立完成，特别开心。';
  recordText.dispatchEvent(new window.Event('input', { bubbles: true }));
  click(window, '[data-action="add-photo"]');
  await tick(40);
  assert.ok(window.document.querySelector('[data-remove-photo]'));
  click(window, '[data-action="save-record"]');
  await tick();
  assert.match(window.document.body.textContent, /今天第一次独立完成/);

  click(window, '[data-tab="stats"]');
  await tick();
  assert.match(window.document.body.textContent, /看见坚持留下的变化/);
  assert.match(window.document.body.textContent, /成长经验/);

  click(window, '[data-tab="profile"]');
  await tick();
  click(window, '[data-action="open-privacy"]');
  await tick();
  assert.match(window.document.body.textContent, /你的家庭数据属于你/);
  assert.match(window.document.body.textContent, /当前版本没有账号系统、云同步、广告或第三方分析服务/);
  click(window, '[data-action="close-privacy"]');
  await tick();
  assert.match(window.document.body.textContent, /数据与隐私/);

  click(window, '[data-tab="record"]');
  click(window, '[data-action="new-record"]');
  const unsavedText = window.document.querySelector('#record-text');
  unsavedText.value = '尚未保存的草稿';
  unsavedText.dispatchEvent(new window.Event('input', { bubbles: true }));
  globalThis.confirm = () => false;
  click(window, '[data-action="close-composer"]');
  await tick();
  assert.ok(window.document.querySelector('[role="dialog"]'), '取消放弃后应保留草稿');
  globalThis.confirm = () => true;
  click(window, '[data-action="close-composer"]');
  await tick();
  assert.equal(window.document.querySelector('[role="dialog"]'), null);

  const saved = JSON.parse(window.localStorage.getItem('child-growth-app-v2'));
  assert.equal(saved.babies.length, 1);
  assert.equal(saved.profiles[saved.activeBabyId].records.length, 1);
  assert.equal(saved.profiles[saved.activeBabyId].records[0].photos.length, 1);
  assert.equal(saved.profiles[saved.activeBabyId].checkins.length, 1);
  assert.equal(saved.profiles[saved.activeBabyId].progress[firstMilestoneId].note, '今天能够稳定完成两次。');
});
