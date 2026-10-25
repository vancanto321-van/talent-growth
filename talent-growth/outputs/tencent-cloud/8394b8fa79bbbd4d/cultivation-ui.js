import cultivation from './cultivation-data.js';
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const url = value => {try{const u=new URL(value);return u.protocol==='https:'?u.href:'';}catch{return '';}};
const labels = {paper:'论文或研究综述',framework:'教学框架', 'practice-guide':'实践指南', 'review-report':'研究综合报告'};

function source(s) {
  const href=url(s.url);
  return `<article class="tg-method-source"><small>${esc(labels[s.type] || '资料')} · ${esc(s.provider || s.institution)}</small>${href ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(s.title)} ↗</a>` : `<b>${esc(s.title)}</b>`}<p>${esc(s.whatItSupports || s.claim)}</p><p class="tg-fine-print">适用边界：${esc(s.limits)}</p></article>`;
}

export function renderCultivationEntry({task,ageGroup}) {
  const domain=cultivation.domains.find(d=>d.domainId===task.learningDomainId);
  if(!domain)return '';
  const child=['early','preschool','child'].includes(ageGroup);
  return `<section class="tg-cultivation-hook"><span class="tg-kicker">可以换一种方式遇见它</span><h3>${esc(domain.hookTitle)}</h3><p>${esc(child ? domain.ageSupport[ageGroup] : domain.hook)}</p><p class="tg-fine-print">任选一个入口即可，不需要把这里和下面步骤都做一遍；先留下一个片段，不必把电量点满。</p><details><summary>想继续时：选择、反馈与再试</summary><p><b>自己选一点</b> ${esc(domain.choice)}</p>${!child ? `<p><b>按自己的处境调整</b> ${esc(domain.ageSupport[ageGroup])}</p>` : ''}<p><b>${ageGroup==='early'?'照护者可以留意':'听一条具体反馈'}</b> ${esc(ageGroup==='early' ? '孩子愿意靠近或想停下时发生了什么？成人怎样调整才更舒适？' : domain.feedback)}</p><p><b>再试一次</b> ${esc(ageGroup==='early' ? '孩子愿意时保持熟悉的材料，只改变一个元素；不要求表现或重复。' : domain.retry)}</p><p><b>走进生活</b> ${esc(ageGroup==='early' ? '在一个熟悉的日常片段借用陪伴方式，孩子仍可不参与。' : domain.transfer)}</p><div class="tg-entry-sources"><b>这个入口参考了什么</b><p>${esc(domain.evidenceNote)}</p>${domain.sourceIds.map(id=>cultivation.sources.find(s=>s.id===id)).filter(Boolean).map(source).join('')}</div></details></section>`;
}

export function renderCultivationResearch() {
  return `<details class="tg-research-foundation"><summary>我们怎样选择培养入口：研究与适用边界</summary><p>下面区分论文、教学框架和实践指南。活动为本站原创设计，参考这些方法；机构名称不代表其验证或推荐本产品。没有一种入口被认定为对所有人最有效。</p><div class="tg-entry-principles"><article><b>给一点真实选择</b><p>可以换材料、表达方式或同伴，也可以暂停。</p></article><article><b>把第一步缩小</b><p>新手有准备和支架，有经验时可以减少提示。</p></article><article><b>让反馈指向作品</b><p>保留原片段，改一处，再看发生了什么。</p></article><article><b>把有用放回情境</b><p>换一个小场景再试，记录适用条件和限制。</p></article></div>${cultivation.principles.map(source).join('')}<p class="tg-fine-print">资料核对：2026-10-23。它们支持设计问题与活动，不提供本产品的测量效度、诊断能力或未来预测。</p></details>`;
}
