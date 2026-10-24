import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';
import { indexedDB } from 'fake-indexeddb';

const here = path.dirname(fileURLToPath(import.meta.url));
const appData = JSON.parse(fs.readFileSync(path.join(here, '..', 'www', 'data.json'), 'utf8'));

function tick(ms = 20) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

test('损坏或恶意本地数据会被规范化且不能注入界面', async () => {
  const window = new Window({ url: 'http://localhost/' });
  const hostileId = '\"><img id="injected" src=x onerror=alert(1)>';
  const localToday = new Date();
  const today = `${localToday.getFullYear()}-${String(localToday.getMonth() + 1).padStart(2, '0')}-${String(localToday.getDate()).padStart(2, '0')}`;
  window.localStorage.setItem('child-growth-app-v2', JSON.stringify({
    version: 2,
    babies: [{
      id: hostileId,
      name: '<img id="injected-name" src=x onerror=alert(1)>',
      birthday: today,
      gender: '未知',
      createdAt: 'bad'
    }],
    activeBabyId: hostileId,
    profiles: {
      [hostileId]: {
        progress: { [hostileId]: { status: 'hacked', note: '<script>alert(1)</script>' } },
        records: [{
          id: hostileId,
          text: '<img id="injected-record" src=x onerror=alert(1)>成长记录',
          date: Date.now(),
          photos: ['not-a-photo-id', hostileId]
        }],
        checkins: [today, today, 'not-a-date'],
        unlocked: ['b0', 'b9', hostileId]
      }
    }
  }));

  window.indexedDB = indexedDB;
  window.fetch = async input => input === 'data.json'
    ? { ok: true, json: async () => appData }
    : { ok: false };
  window.confirm = () => true;

  Object.assign(globalThis, {
    window,
    document: window.document,
    localStorage: window.localStorage,
    indexedDB,
    confirm: window.confirm,
    fetch: window.fetch
  });
  window.document.body.innerHTML = '<div id="app"></div>';

  await import(`../www/main.js?resilience=${Date.now()}`);
  await tick();

  // Default Web view is 天赋生长; enter the existing child workflow explicitly.
  const family = window.document.querySelector('[data-talent-view="family"]');
  family.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  window.document.querySelector('[data-talent-action="open-growth"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await tick();
  window.document.querySelector('[data-tab="home"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await tick();

  assert.equal(window.document.querySelector('#injected'), null);
  assert.equal(window.document.querySelector('#injected-name'), null);
  assert.match(window.document.body.textContent, /<img id="injected-na/);
  assert.match(window.document.body.textContent, /今天已陪伴/);

  const recordTab = window.document.querySelector('[data-tab="record"]');
  recordTab.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await tick();
  assert.equal(window.document.querySelector('#injected-record'), null);
  assert.match(window.document.body.textContent, /成长记录/);

  const saved = JSON.parse(window.localStorage.getItem('child-growth-app-v2'));
  assert.match(saved.babies[0].id, /^baby_[A-Za-z0-9_-]+$/);
  assert.equal(saved.babies[0].gender, '男');
  assert.deepEqual(saved.profiles[saved.activeBabyId].checkins, [today]);
  assert.deepEqual(saved.profiles[saved.activeBabyId].unlocked, ['b0']);
  assert.deepEqual(saved.profiles[saved.activeBabyId].records[0].photos, []);
});
