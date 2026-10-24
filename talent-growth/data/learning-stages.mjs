/**
 * 细阶段只用于选择参与方式、提问方式和支持材料。
 * 年龄范围是界面上的参考坐标，不是发展阈值、诊断标准或能力等级。
 * 这些字段是加法数据；旧档案没有 stageId 时，不反推一个具体阶段。
 */
export const learningStages = [
  {
    id: 'early-presence',
    parentAgeGroup: 'early',
    label: '在场与发现（参考：0–11 个月）',
    participation: '照护者准备一个短片段，孩子可以看、听、触摸，也可以不参与；记录愿意靠近、转开或暂停的信号。',
    cognition: '留意变化、重复和简单的“发生了什么”，由照护者用描述代替要求。',
    supports: ['大而安全的物件', '柔和声音和自然光', '一两步的互动', '照护者代记'],
    prompt: '这次只提供一个变化，孩子愿意停留或结束时发生了什么？'
  },
  {
    id: 'early-reciprocal',
    parentAgeGroup: 'early',
    label: '回应与轮流（参考：1–2 岁）',
    participation: '孩子可通过声音、动作、指认或拿放物品轮流参与，成人等待并允许改玩法。',
    cognition: '比较“我做—出现什么”，预期下一步，练习轮流、选择和停止。',
    supports: ['大按钮或开关', '布巾、软球和大图卡', '短录音或照片', '可随时收起的材料'],
    prompt: '孩子重复了哪一个回应？你只改变一个条件后，回应有什么不同？'
  },
  {
    id: 'preschool-play',
    parentAgeGroup: 'preschool',
    label: '游戏与假想（参考：3–4 岁）',
    participation: '从身边实物和亲子游戏开始，孩子选材料、扮演角色、改规则，成人负责工具和安全。',
    cognition: '用图像和动作代表事物，排列先后，尝试“如果这样会怎样”。',
    supports: ['纸盒、积木和布料', '三图或动作卡', '成人口述和代写', '可重复的短游戏'],
    prompt: '孩子把材料变成了什么？他怎样解释或改变了原来的玩法？'
  },
  {
    id: 'preschool-symbolic',
    parentAgeGroup: 'preschool',
    label: '表达与共做（参考：5–6 岁）',
    participation: '孩子可以说、画、指认或示范一个想法，再和家人完成一件小作品或生活任务。',
    cognition: '把步骤、分类、理由和简单因果连起来，能比较两种做法。',
    supports: ['图文步骤卡', '大号、可清洗材料', '一位自愿试用者', '成人处理高风险工具'],
    prompt: '孩子选择了哪种做法？他能用什么方式说明理由或发现一处不方便？'
  },
  {
    id: 'child-making',
    parentAgeGroup: 'child',
    label: '具体制作（参考：7–9 岁）',
    participation: '孩子主导一个身边问题，先画、搭或试做，再请家人或同伴试用。',
    cognition: '把观察变成问题，把方案变成可检查的步骤，依据结果改一个地方。',
    supports: ['纸笔、尺和计时器', '纸模型或积木', '家庭材料', '图文混合记录'],
    prompt: '你要解决的具体小问题是什么？第一次试用后，哪一个细节值得改？'
  },
  {
    id: 'child-inquiry',
    parentAgeGroup: 'child',
    label: '比较与查证（参考：10–12 岁）',
    participation: '孩子可以设计一个小调查或对比，邀请同伴反馈并保留没有把握的地方。',
    cognition: '区分观察、猜想和证据，比较替代解释，设计低成本核对。',
    supports: ['表格、地图和来源卡', '简单测量或编程工具', '同伴试用', '成人提供安全边界'],
    prompt: '你原本有哪一个猜想？哪条观察支持或动摇了它？'
  },
  {
    id: 'teen-supported',
    parentAgeGroup: 'teen',
    label: '协作项目（参考：13–15 岁）',
    participation: '在学校、兴趣或同伴协作中共同定一个小范围，自己决定哪些过程和作品可以分享。',
    cognition: '把主张和证据对应起来，分配角色，处理许可、隐私和不同意见。',
    supports: ['共享文档或看板', '手机录音和拍照', '来源与同意清单', '可撤回的发布选项'],
    prompt: '这次项目的最小交付是什么？谁需要被询问或允许，哪些内容不应公开？'
  },
  {
    id: 'teen-self-directed',
    parentAgeGroup: 'teen',
    label: '自主迁移（参考：16–17 岁）',
    participation: '自己设定问题、作品范围和分享边界，把学习或兴趣带到一个真实场景。',
    cognition: '进行取舍、迭代、迁移和复盘，说明哪些结论仍受条件限制。',
    supports: ['日历与版本记录', '数字创作或研究工具', '反馈对象选择权', '发布前自检表'],
    prompt: '你把哪个方法带到了新场景？条件变了以后，哪一部分必须重做？'
  },
  {
    id: 'adult-open-exploration',
    parentAgeGroup: 'adult',
    label: '开放探索',
    participation: '从一个工作、家庭、兴趣或社区小问题开始，选择一个可交付、可暂停的尝试。',
    cognition: '把模糊需要变成小实验，用真实反馈判断是否继续、缩小或换路。',
    supports: ['熟悉的纸笔或数字工具', '小范围样例', '去标识材料', '一位自愿反馈者'],
    prompt: '眼下哪个小问题值得先试一次？什么结果会告诉你继续、修改或放下？'
  },
  {
    id: 'adult-work-care',
    parentAgeGroup: 'adult',
    label: '工作与照护协调',
    participation: '在工作交付、家庭分工或照护安排中，和相关的人共同定边界和下一步。',
    cognition: '同时权衡时间、资源、角色和他人的需要，留下替代方案与交接点。',
    supports: ['日历、共享清单和模板', '低成本替代路径', '隐私与同意提醒', '纸笔备份'],
    prompt: '谁会使用或受影响？怎样把方案缩小到即使被打断也能继续的一步？'
  },
  {
    id: 'adult-transition-relearning',
    parentAgeGroup: 'adult',
    label: '转换与重学',
    participation: '面对换岗、搬迁、重新学习或生活节奏变化时，从已有经验中挑一小块迁移。',
    cognition: '辨认可迁移的规则和需要重学的部分，用可撤销试验减少一次性押注。',
    supports: ['旧作品或经验清单', '示例与分段目标', '可信任的伙伴', '允许回退的版本'],
    prompt: '已有经验中哪一条仍然有用？新环境要求你补哪一个具体环节？'
  },
  {
    id: 'later-new-interest',
    parentAgeGroup: 'later',
    label: '新兴趣与再开始',
    participation: '从兴趣、生活经验或当下想解决的小事开始，可从零学习，也可直接使用已有专长。',
    cognition: '连接旧经验与新方法，按自己的节奏观察、重复和选择是否深入。',
    supports: ['纸笔、口述或熟悉设备', '大字和清晰对比', '短步骤与休息点', '可随时暂停的材料'],
    prompt: '哪个已有经验可以成为今天的入口？怎样把第一步缩到愿意再次尝试的大小？'
  },
  {
    id: 'later-experience-sharing',
    parentAgeGroup: 'later',
    label: '经验分享与传承',
    participation: '教家人、整理故事、参与兴趣小组或社区活动，分享范围由本人和参与者共同决定。',
    cognition: '区分记忆、观察和来源，把个人经验变成别人能理解、复做或继续补充的材料。',
    supports: ['录音、照片和时间线', '大字说明卡', '同意与可匿名记录', '学习伙伴或共同主持'],
    prompt: '这段经验谁愿意听或继续使用？哪些内容需要核对、匿名或只留在当场？'
  }
];

export const lifeContexts = [
  {
    id: 'learning',
    label: '学习与探索',
    prompt: '把问题拆成一次可以开始、可以回看的学习尝试。',
    ageGroups: ['early', 'preschool', 'child', 'teen', 'adult', 'later']
  },
  {
    id: 'work',
    label: '工作与项目',
    prompt: '从真实交付、协作或流程中的一个小卡点开始，保留边界和反馈。',
    ageGroups: ['teen', 'adult', 'later']
  },
  {
    id: 'family',
    label: '家庭与照护',
    prompt: '让家庭成员知道谁参与、谁可以跳过，以及下一步怎样交接。',
    ageGroups: ['early', 'preschool', 'child', 'teen', 'adult', 'later']
  },
  {
    id: 'creative',
    label: '创作与兴趣',
    prompt: '把一件想做的事变成一小段作品、练习或可分享的过程记录。',
    ageGroups: ['early', 'preschool', 'child', 'teen', 'adult', 'later']
  },
  {
    id: 'community',
    label: '社区与同伴',
    prompt: '围绕共同空间或共同活动做一件可试用、可退出的小事。',
    ageGroups: ['child', 'teen', 'adult', 'later']
  },
  {
    id: 'relearning',
    label: '重学与转换',
    prompt: '从已有经验挑一条可迁移的规则，再补一个新环境需要的步骤。',
    ageGroups: ['teen', 'adult', 'later']
  },
  {
    id: 'limited-time',
    label: '碎片时间',
    prompt: '把任务切成中断后仍能接上的一小步，先留下片段再决定是否继续。',
    ageGroups: ['early', 'preschool', 'child', 'teen', 'adult', 'later']
  },
  {
    id: 'researcher',
    label: '研究与查证',
    prompt: '把观察、来源、猜想和不确定处分开，留下一条可以继续核对的线索。',
    ageGroups: ['child', 'teen', 'adult', 'later']
  }
];

/**
 * 覆盖说明与 learning-resources.mjs 的固定 domainId 对齐。
 * 每项只表示一个分龄原创入口和资料入口，不表示完整课程、能力测验或人生全景解析。
 */
export const coverageNotes = [
  { domainId: 'literature', status: 'starter', covered: '已有故事、诗歌朗读和文本表达的分龄入口，并可接文学公开课程或阅读资源。', missing: '缺少按体裁、作品细读、文学史和长期阅读共同体组织的完整课程。' },
  { domainId: 'philosophy', status: 'starter', covered: '已有争议观点、多视角论证和价值取舍的分龄入口，并可接哲学问题资源。', missing: '缺少概念谱系、原典阅读、哲学对话和持续讨论路径。' },
  { domainId: 'history', status: 'starter', covered: '已有家庭时间线、口述史和来源核对入口，并可接历史公开课程或档案资源。', missing: '缺少时期、地域、史料类型和相互矛盾证据组成的系统课程。' },
  { domainId: 'visual', status: 'starter', covered: '已有海报、说明牌、观察卡和版式入口，并可接美术馆术语及作品资源。', missing: '缺少材料技法、艺术史、观看方法和连续作品集路径。' },
  { domainId: 'music', status: 'starter', covered: '已有聆听、节奏、声音设计和家庭歌单入口，并可接音乐聆听资源。', missing: '缺少系统乐理、曲式、演奏路径和多文化音乐脉络。' },
  { domainId: 'mathematics', status: 'starter', covered: '已有数量、路线、表格和生活决策中的数学入口，并可接开放教材资源。', missing: '缺少从算术到证明、建模和持续练习的完整课程。' },
  { domainId: 'science', status: 'starter', covered: '已有观察、变量、验证和生态小实验入口，并可接开放科学课程或教材。', missing: '缺少分科概念、实验安全体系和从问题到证据的长期项目。' },
  { domainId: 'digital', status: 'starter', covered: '已有编程、自动化、数字资料整理和工具查错入口，并可接编程公开课程。', missing: '缺少计算机科学主线、工程协作、信息素养和系统性项目阶梯。' },
  { domainId: 'craft', status: 'starter', covered: '已有纸盒、包装、维修步骤和材料制作入口，并可接博物馆手作资源。', missing: '缺少按材料、工具、工艺和师徒反馈展开的连续手艺课程。' },
  { domainId: 'agriculture', status: 'starter', covered: '已有植物照护、土壤覆盖、园艺分段和自然观察入口，并可接农业推广资料。', missing: '缺少作物周期、农事工具、地域条件、食物系统和生产协作课程。' },
  { domainId: 'home', status: 'starter', covered: '已有家务流程、收纳、清洁和家庭安排入口，并可接家庭生活技能资源。', missing: '缺少按家庭阶段、工具安全、预算和长期维护组织的生活课程。' },
  { domainId: 'relationships', status: 'starter', covered: '已有倾听、反馈、边界、分歧修复和轮流参与入口，并可接关系练习资源。', missing: '缺少关系类型、长期练习、冲突升级和专业支持边界的完整路径。' },
  { domainId: 'society', status: 'starter', covered: '已有公共说明、社区路线、同伴协作和小型公共项目入口，并可接社会学开放教材。', missing: '缺少制度、群体、历史结构、权力和公共行动的系统学习路径。' },
  { domainId: 'movement', status: 'starter', covered: '已有动作、节奏、路线、休息和包容性活动入口，并可接一般运动指导资源。', missing: '缺少按个人目标、环境、工具、训练反馈和专业建议组织的完整课程。' }
];
