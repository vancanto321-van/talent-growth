import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Window } from 'happy-dom';
import { indexedDB } from 'fake-indexeddb';

const data = JSON.parse(fs.readFileSync(new URL('../www/data.json', import.meta.url), 'utf8'));

test('3–12 岁家庭入口进入全年龄探索档案，保留7–12岁选项和旧成长档案入口', async () => {
  const window = new Window({url:'http://localhost/'});
  window.indexedDB = indexedDB;
  window.fetch = async () => ({ok:true,json:async()=>data});
  Object.assign(globalThis,{window,document:window.document,localStorage:window.localStorage,indexedDB,fetch:window.fetch,FormData:window.FormData});
  window.document.body.innerHTML='<div id="app"></div>';
  try {
    await import(`../www/main.js?landing-entry=${Date.now()}`);
    for(let i=0;i<100 && !window.document.querySelector('[data-action="open-parent-growth"]');i++) await new Promise(r=>setTimeout(r,10));
    const root=window.document.querySelector('#app');
    assert.match(root.textContent,/不知道适合什么/);
    assert.equal(root.querySelector('[data-action="open-profile"]').textContent,'0–8 岁成长档案');
    root.querySelector('[data-action="open-parent-growth"]').dispatchEvent(new window.MouseEvent('click',{bubbles:true}));
    for(let i=0;i<100 && !root.querySelector('[data-person-form]');i++) await new Promise(r=>setTimeout(r,10));
    const form=root.querySelector('[data-person-form]');
    assert.ok(form,'首次进入应直接显示探索档案表单，不能误入0–8岁里程碑页');
    assert.equal(form.querySelector('[name="ageGroup"]').value,'preschool');
    assert.ok(form.querySelector('[name="ageGroup"] option[value="child"]'),'7–12岁必须可选');
    assert.equal(root.querySelector('#baby-birthday'),null,'无需提供出生日期');
    assert.equal(JSON.parse(window.localStorage.getItem('talent-growth-v1'))?.people?.length || 0,0,'打开表单不能擅自创建儿童档案');
  } finally {window.document.querySelector('#app').__talentCleanup?.();window.close();}
});
