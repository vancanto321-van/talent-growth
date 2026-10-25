import { buildTalentPlanets } from './talent-planets.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const color = value => /^#[0-9a-f]{3,8}$/i.test(value || '') ? value : '#789a89';
const symbols = ['✧','◈','◷','✺','♫','∞','✳','⌘','◇','❋','⌂','☍','⌁','↝'];

function reminders(planet) {
  const result = [...planet.cautions];
  if (!planet.counts.attempts) result.push('这里尚无直接尝试记录。可以先看看材料、时间和支持是否合适，也可以暂时不探索。');
  else {
    if (!planet.counts.changes) result.push('还没有具体的前后变化记录。下次可以保留原片段，只改一处再比较。');
    if (!planet.counts.feedback) result.push('目前没有收到反馈的记录。可以邀请一个自愿的人试用、复述或提出一个问题。');
    if (!planet.counts.applied) result.push('尚未明确记录“用过且有帮助”的具体结果，可以先在一个小范围场景验证。');
  }
  return result.slice(0,3);
}

export function renderTalentPlanets({catalog,learning,profile,person,selectedId = ''}) {
  const model = buildTalentPlanets({catalog,learning,profile,ageGroup:person.ageGroup});
  const planets = model.planets;
  const latestId = planets.flatMap(p=>(p.records || []).map(r=>({id:p.id,date:r.date}))).sort((a,b)=>b.date-a.date)[0]?.id;
  const chosen = planets.find(p=>p.id===selectedId) || planets.find(p=>p.id===latestId) || planets[0];
  if (!chosen) return '<div class="tg-empty">探索地图正在准备。</div>';
  const touched = planets.filter(p=>p.counts.attempts>0).length;
  const early = person.ageGroup === 'early';
  return `<section class="tg-planets"><header class="tg-planets-heading"><div><span class="tg-kicker">${esc(person.name)} 的探索轨迹</span><h2>${early ? '陪伴里的星球' : '我的能力星球'}</h2><p>每一次好奇，都可以留下一点光。${early ? '这里记录照护者的陪伴与观察。' : '亮度记录探索经历，不评定先天天赋。'}</p></div><button class="tg-inline-link" data-talent-view="atlas">去探索地图 →</button></header><div class="tg-universe"><div class="tg-universe-top"><span>${touched ? `在 ${touched} 个领域留下过直接记录` : '从一颗感兴趣的星球开始'}</span><small>不必全部点亮 · 不与别人比较</small></div><div class="tg-planet-grid" role="group" aria-label="14个探索领域星球">${planets.map((p,i)=>`<button class="tg-planet-node ${p.id === chosen.id ? 'selected' : ''}" style="--planet-color:${color(p.color)}" data-brightness="${p.brightness}" data-talent-action="planet-select" data-planet-id="${esc(p.id)}" aria-pressed="${p.id === chosen.id}" aria-label="${esc(p.title)}，${esc(p.stateLabel)}，${p.counts.attempts}次直接尝试"><span class="tg-orb" aria-hidden="true"><i></i><b>${symbols[i%symbols.length]}</b></span><strong>${esc(p.title)}</strong><small>${esc(p.stateLabel)}</small>${p.counts.relatedAttempts && !p.counts.attempts ? '<em>有相关经历</em>' : ''}</button>`).join('')}</div><div class="tg-planet-legend"><span>未探索</span><span>已遇见</span><span>正在回访</span><span>已有应用</span></div></div><section class="tg-planet-detail" id="tg-planet-detail" style="--planet-color:${color(chosen.color)}"><div class="tg-planet-detail-head"><div><span class="tg-kicker">${esc(chosen.confidenceLabel)}</span><h3>${esc(chosen.title)}</h3></div><span class="tg-planet-state">${esc(chosen.stateLabel)}</span></div><p class="tg-planet-interpretation">${chosen.state === 'unexplored' ? '暗一些，说明我们还缺少这个领域的直接记录。它可能只是还没被遇见，无需把它当成自己的缺点。' : chosen.state === 'encountered' ? '这颗星球已经有了相遇的记录。可以再试一次，慢慢分清：喜欢的是内容、材料、伙伴，还是这次做法。' : chosen.state === 'returning' ? '你在不同日子回来过，也留下了变化或反馈。值得继续比较哪些条件帮助你投入，哪些方法需要调整。' : '记录里已有实际使用的具体自述。可以沿着有帮助的部分继续，同时保留不适用的条件。'}</p><h4>这束光来自什么</h4><div class="tg-planet-evidence">${chosen.evidence.map(e=>`<article><b>${Number(e.value)||0}</b><span>${esc(e.label)}</span></article>`).join('')}</div>${chosen.counts.relatedAttempts ? '<p class="tg-fine-print">旧方向活动作为相关经历单独保留；它们不自动证明已经探索过这门学科，也不重复计入直接尝试。</p>' : ''}${chosen.records?.length ? `<details class="tg-planet-records"><summary>回看这颗星球的原始记录（最近 ${chosen.records.length} 条）</summary>${chosen.records.map(r=>`<article><small>${esc(new Date(r.date).toLocaleDateString('zh-CN'))} · ${esc(catalog.tasks.find(t=>t.id===r.taskId)?.title || '小实验')}</small>${r.note ? `<p>${esc(r.note)}</p>` : ''}${r.artifact ? `<p><b>作品或结果</b> ${esc(r.artifact)}</p>` : ''}${r.changeNote ? `<p><b>变化</b> ${esc(r.changeNote)}</p>` : ''}${r.feedback ? `<p><b>反馈</b> ${esc(r.feedback)}</p>` : ''}${r.outcomeNote ? `<p><b>实际使用自述</b> ${esc(r.outcomeNote)}</p>` : ''}</article>`).join('')}</details>` : ''}<div class="tg-planet-next"><span class="tg-kicker">下一小步，由你决定</span><p>${esc(chosen.nextAction.reason)}</p>${chosen.nextAction.taskId ? `<button class="tg-button tg-button-primary" data-talent-action="planet-next" data-planet-id="${esc(chosen.id)}">${esc(chosen.nextAction.label)} →</button>` : ''}<button class="tg-inline-link" data-talent-action="learning-world" data-world-id="${esc(chosen.id)}">先看这个领域的资料与做法 →</button></div><div class="tg-planet-columns"><article><span class="tg-kicker">可以通向的尝试</span><h4>${chosen.counts.attempts ? '让这次发现走进生活' : '感兴趣时，可以这样展开'}</h4><ul>${chosen.opportunities.map(t=>`<li>${esc(t)}</li>`).join('')}</ul><small>这是可尝试的场景，不是职业匹配、收入或未来成就预测。</small></article><article><span class="tg-kicker">现在值得留意</span><h4>看清条件，再决定往哪里走</h4><ul>${reminders(chosen).map(t=>`<li>${esc(t)}</li>`).join('')}</ul></article></div><details class="tg-planet-rules"><summary>亮度怎样产生，哪些结论还不能下</summary><p>${esc(chosen.explanation)}</p><ol><li>没有直接记录：未探索。</li><li>已有直接记录：已遇见。</li><li>至少两次、跨两个日期，且至少两条记录有变化或反馈：正在回访。</li><li>至少两次、跨两个日期，且有“用过有帮助”及具体结果自述：已有应用。</li></ol><p>这些阈值只是本站展示规则，不是研究验证的阶段、能力等级或百分位。电量、打卡量和年龄不换算成天赋分数；暂停一段时间也不会自动扣光。</p></details></section></section>`;
}
