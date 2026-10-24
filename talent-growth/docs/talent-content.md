# 全龄潜能实践内容

内容入口：[data/talent-catalog.js](/Users/van/WorkBuddy/2026-07-27-23-05-03/孩子成长小程序/data/talent-catalog.js)。模块导出 `version / ageGroups / directions / tasks / combinations / sources`。

## 内容计数

- 9 个方向：表达、分析、设计、编程、组织、人际、音乐、身体、自然。
- 6 个年龄组：`early`、`preschool`、`child`、`teen`、`adult`、`later`。
- 540 张任务卡：保留原有 135 张，再增加 405 张。六个年龄阶段 × 九个领域，每个组合各 10 张，每个年龄共 90 张。
- 原有成人 36 张 YAML 任务保留原始描述、步骤和 rubric 维度。已有任务 ID 与电量标准不变，避免旧记录失去对应关系。
- 18 个可能的能力组合场景：15 个本地组合改写为“可探索场景”，音乐、身体、自然各增加 1 个组合。
- 每个方向都有四周 `development`：基础、反馈、变化、应用。
- 成人原始 rubric 保留 YAML 的维度和正向、可观察目标（例如“准确性：内容准确，边界条件也交代了”），用于过程反馈，不是心理测量分数或能力判定。

## 年龄与基础分别处理

| 年龄 | 探索思路 | 支持与成果 |
| --- | --- | --- |
| 0–2 岁 | 短时、顺着意愿的共同注意、声音与因果互动 | 照护者观察与代记；只看、只听、拒绝也可以，不要求语言或移动能力 |
| 3–6 岁 | 游戏、实物、想象和生活选择 | 成人处理工具；孩子指认、动作、口述、画图均可 |
| 7–12 岁 | 自己选问题，做具体模型或小作品，获得反馈 | 图文混合记录；家长提供材料与安全支持 |
| 13–17 岁 | 学习、兴趣和同伴协作中的自主项目 | 记录证据和取舍；尊重隐私、分享边界与场地许可 |
| 18–59 岁 | 用实际成果改善工作、家务、兴趣或社区事务 | 验证使用价值、成本和反馈；没有工作场景也有生活入口 |
| 60+ 岁 | 结合经验、兴趣和新学习，解决本人在意的问题 | 纸笔、口述或数字工具任选；保留深入研究、创作和带领的空间 |

每张卡包含 `adaptations: { start, practice, apply }`，说明同一项目如何缩小范围开始、通过反馈打磨、放入真实需求使用。基础由使用者自己选择，可随时切换，不能从年龄推断。低龄并不机械降低数量，长者也不只提供简单任务。

0–2 岁的三个入口显示为“先熟悉玩法 / 重复与变化 / 融入日常”，对应照护者对互动方式的熟悉程度，不是儿童等级。电量记录陪伴、准备与观察过程，不代表婴幼儿能力。

界面保留紧凑横向选择条；“按基础找实验”默认折叠。卡片详情同时显示三种做法，并提供同能力跨年龄的实际卡片入口。基础筛选不改变既有进度。

## 内容维护

- `talent-expansion-early.js`：早期、学前各 72 张新增。
- `talent-expansion-school.js`：儿童、青少年各 72 张新增。
- `talent-expansion-adult.js`：成人 45 张、长者 72 张新增。
- `talent-pathways.js`：按年龄的支持方式、原有卡片的基础调整。原有 rubric 保持不变。
- `talent-catalog.js`：合并导出，仍使用内容格式 version 1；不改本地存储格式。
- `scripts/package-web.mjs`：发布前阻止少于 10 项的年龄/领域组合、重复 ID、缺失内容或缺失三种基础做法进入发布包，发布清单附覆盖表。

## 来源与边界

方向、任务、组合来自用户自有的 `/Users/van/Documents/glm/potential-lab/backend/content/{directions,tasks,combinations}.yaml`；`child_types.yaml` 只作为亲子活动灵感库。内容不把类型当作先天能力、分数或诊断，也不承诺职业、收入或结果。早期卡片是短时自愿的亲子观察；编程在低龄阶段是大物品的因果、分类和路线游戏，不要求屏幕或小零件。

外部参考： [O*NET Interest Profiler](https://www.onetcenter.org/IP.html)（兴趣不等于能力）和 [Harvard Developing Child activities guide](https://developingchild.harvard.edu/resources/handouts-tools/activities-guide-enhancing-and-practicing-executive-function-skills/)（按年龄、可重复、成人陪伴的练习原则）。

## 内容校验命令

```sh
node - <<'JS'
const c = require('./data/talent-catalog');
const ages = ['early','preschool','child','teen','adult','later'];
const ids = c.tasks.map(x => x.id);
if (c.version !== 1 || c.directions.length !== 9 || c.ageGroups.map(x => x.id).join(',') !== ages.join(',')) throw Error('schema/age groups');
if (ids.length !== new Set(ids).size) throw Error('duplicate task id');
for (const d of c.directions) for (const age of ages) {
  const n = c.tasks.filter(x => x.directionId === d.id && x.ageGroups.includes(age)).length;
  if (n < 10) throw Error(`${d.id}/${age}: ${n}`);
}
for (const t of c.tasks) for (const k of ['minutes','materials','steps','deliverable','observe','transfer','reflection','rubric']) if (!t[k] || (Array.isArray(t[k]) && !t[k].length)) throw Error(`${t.id}: missing ${k}`);
console.log({directions:c.directions.length, tasks:c.tasks.length, combinations:c.combinations.length});
JS
```
