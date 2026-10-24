// These are short, repeatable invitations for noticing and cultivating interests.
// They are activity prompts, not ability tests, developmental screens, or talent labels.
export const domainCultivation = [
  {
    domainId: 'literature',
    hookTitle: '把一件小事讲成两种声音',
    hook: '选一件今天发生的小事，用 2 分钟画出或写下三个画面；再用 3 分钟分别讲给“很熟悉的人”和“完全不知道的人”，每次只换一个词、例子或顺序。最后留下一句听众复述的话。',
    choice: '可以选家庭物品、路上见闻、梦或一段喜欢的文字；也可以只画、只说、用方言或录音，不必追求完整故事。',
    feedback: '听众复述时，哪一个细节被听见了，哪一个地方需要补充？',
    retry: '把最容易误解的一处改成一个动作、比喻或更具体的词，再讲一遍，比较听众的复述是否改变。',
    transfer: '把同一方法带到绘本讲述、家庭口述史、说明一个游戏规则或给同事交接任务。',
    ageSupport: {
      early: '照护者只展示一张熟悉照片或图卡，说一句短话后等待；孩子看、发声、靠近或转开都算回应，成人记录并可随时结束，不测语言能力。',
      preschool: '孩子用三张生活图按先后讲一段，成人只复述听到的事实，孩子可以换图、用动作或不继续。',
      child: '孩子给同一件物品做“家人版”和“陌生人版”说明，邀请听众指出一处听不懂的地方。',
      teen: '选一个真实主题做两版短文本或音频，比较语气、证据和省略如何改变读者理解。',
      adult: '用一次真实沟通材料做受众改写，找一位自愿读者复述，再保留修改理由。',
      later: '用熟悉物品或照片讲一段可分享的记忆；可由他人代记，自己决定哪些内容公开、匿名或不记录。'
    },
    sourceIds: ['pz-see-think-wonder'],
    evidenceNote: '借鉴 Project Zero 把观察、解释和疑问分开的短流程；页面说明它用于深化理解和启动探究，不能证明文学能力、语言天赋或长期迁移效果。'
  },
  {
    domainId: 'philosophy',
    hookTitle: '从一个“为什么公平”开始',
    hook: '找一件低风险的日常分配事（最后一块点心、谁先选游戏），每个人先写或画一个“我认为公平是……”；轮流说理由，其他人只能先复述再追问。8 分钟结束时，每人说一个仍未解决的问题。',
    choice: '可选公平、自由、勇敢、照顾或“什么算知道”；可以从绘本、物品或当天事件开始，也可以独自写下两个相反答案。',
    feedback: '你复述的内容，是否真的包含了对方的理由？对方会怎样修正你的理解？',
    retry: '把讨论中的一个词写成例子和反例，再问“这个例子会不会改变你的判断”，只推进一个概念。',
    transfer: '把“提出问题—给理由—复述—修正”带到班级规则、团队决策、家庭边界或公共议题讨论。',
    ageSupport: {
      early: '照护者用两件安全物品做“要不要、还要不要”的选择，接受孩子伸手、看、拒绝或不回应；成人不替孩子下哲学结论。',
      preschool: '读一小段故事后问“谁觉得这样公平”，孩子可用玩偶、动作或一句话表达，成人帮助轮流和复述。',
      child: '围绕一个具体分配情境提出自己的问题，至少听到另一种理由，再说哪一点仍不确定。',
      teen: '选择一个公共或校园规则，分别写支持与质疑理由，主持一次有轮流、追问和暂停权的短对话。',
      adult: '用一个真实取舍做概念澄清，把价值词拆成可观察的例子、代价和未决处。',
      later: '从生活经验或故事谈一个价值问题，允许沉默、重复和不同记忆；把对话当作共同探究而非说服。'
    },
    sourceIds: ['iapc-community'],
    evidenceNote: 'IAPC 的原始方法是以文本或经验提出问题，再由“探究共同体”通过理由、例子、澄清和相互倾听推进；它依赖引导者与安全的对话规范，不能把一次发言表现当作哲学能力测量。'
  },
  {
    domainId: 'history',
    hookTitle: '一件旧物的三次核对',
    hook: '选一件有来历的物品或一张公开老照片。用 2 分钟分别记下“我直接看见什么、我猜它说明什么、我还想知道什么”；再找第二个来源（背面文字、旧地图、家人讲述或馆藏说明）核对一条说法。',
    choice: '可以研究家庭物品、社区建筑、旧广告或一段公开新闻；来源可以不同意，先并列记录，不急着选出唯一故事。',
    feedback: '哪句话是来源直接说的，哪句话是你的推断？第二个来源支持、补充还是冲突？',
    retry: '只替换一个来源或问题，重新写一条“证据—结论—仍未知”，看结论是否需要收窄。',
    transfer: '把来源、背景、相互印证的顺序带到口述史、展览说明、网络历史帖或家族档案整理。',
    ageSupport: {
      early: '照护者展示一件熟悉物品，说出可见特征并等待孩子触摸或转开；只做共同观察，不要求认识过去或说出答案。',
      preschool: '孩子把两张家庭照片按“先—后”排好，问一位家人一条可分享的来历，再标记“听到的”和“自己想的”。',
      child: '用一张老照片和一个家人说法做两栏记录，指出一个相同点和一个仍需核对的地方。',
      teen: '选一件公共事件的两份材料，练习作者、时间、背景、证据和相互印证，写出带限定词的历史主张。',
      adult: '为家庭或社区故事建立断言—来源表，保留原话、整理者推断、矛盾与撤回边界。',
      later: '由本人决定是否讲述一件旧物；可以用照片、录音或代笔，优先核对可公开事实，尊重不愿记录的部分。'
    },
    sourceIds: ['dig-reading-like-a-historian'],
    evidenceNote: 'Digital Inquiry Group 的 Reading Like a Historian 课程明确使用史料来源、语境化、相互印证和细读；它是课堂课程框架，材料的代表性、可得性和历史争议仍需单独处理，不是记忆力测验。'
  },
  {
    domainId: 'visual',
    hookTitle: '同一张图，三次看见',
    hook: '找一张作品、照片、图表或生活界面。安静看 60 秒，写下三条“我看见的形状、颜色、位置”；再写一条解释和一条疑问，最后用箭头圈出最支持解释的细节。',
    choice: '可画图、拍照、看展品或观察家中物件；可只描述局部，也可比较两个版本，不需要知道艺术家或设计师是谁。',
    feedback: '如果把解释遮住，只留下观察，别人能指出同一处证据吗？',
    retry: '只改变观看距离、裁剪范围或背景，再做一次三栏记录，比较哪些判断保持不变。',
    transfer: '把观察—解释—疑问用于海报、说明牌、产品界面、自然观察和看新闻图片。',
    ageSupport: {
      early: '照护者给一张大而清晰的图，顺着孩子看向、触摸或转开说“你在看这里”；不要求命名颜色或图形。',
      preschool: '孩子从“看见什么、像什么、想问什么”中任选两句，用贴纸或画线标出细节。',
      child: '用观察卡描述一件作品，再请同伴找出一处“你这样想的证据”。',
      teen: '比较同一信息的两种版式，记录视觉层级怎样影响你先看到什么、相信什么或错过什么。',
      adult: '为真实用户做一张简短说明图，先让人独立找信息，再依据一条观察反馈改稿。',
      later: '用大字、大对比和舒适时长看一件熟悉图像；可以口述观察，由陪伴者记录，不把视听差异解释成审美能力。'
    },
    sourceIds: ['pz-see-think-wonder'],
    evidenceNote: 'Project Zero 的 See–Think–Wonder 具体要求先描述可见事实，再用证据解释并提出疑问；它支持观看与讨论的结构，不能给出审美等级或视觉天赋结论。'
  },
  {
    domainId: 'music',
    hookTitle: '听出一段节奏的骨架',
    hook: '选一段 30–60 秒的音乐。第一遍只拍稳定脉搏，第二遍用纸笔标出重复、停顿或速度变化，第三遍在杯子、拍手或身体动作上改一个节奏并录下 20 秒。',
    choice: '可以选熟悉歌曲、器乐、环境声或家人唱的片段；可以只听、轻敲、哼唱或用软件画波形，音量和动作按舒适程度调整。',
    feedback: '别人能指出你改的是速度、重音、停顿还是音色？你希望听众先注意哪一处？',
    retry: '保持节奏骨架，只换音色或停顿位置，再听两版，写下听感有什么变化。',
    transfer: '把“听—标记—改一处—再听”带到合奏、播客片头、声音日记、舞蹈配乐或公共空间提示音。',
    ageSupport: {
      early: '照护者用很短、低音量的声音或哼唱，停下来等待孩子靠近、发声、移动或转开；不要求跟拍或辨音。',
      preschool: '孩子选择拍手、跺脚或摇大号乐器跟随一段短节奏，再自由改变一次并说“哪里不同”。',
      child: '听一段音乐画出重复和停顿，和同伴交换图，看看对方能否按图拍出大致结构。',
      teen: '用免费工具或乐器做两版短循环，写清一个节奏选择和一个混音或聆听限制。',
      adult: '为真实场景制作一段 20 秒声音草稿，让一位听众描述听到的结构，再迭代一处。',
      later: '选熟悉音乐，按坐姿、手指或只听的版本参与；优先舒适、记忆和连接，不把拍不准当作能力证据。'
    },
    sourceIds: ['berklee-groove'],
    evidenceNote: 'Berklee PULSE 的练习把聆听、身体或打击乐表现、节奏组合和即兴创作连起来；课程材料有特定音乐文化和教学顺序，不能代表全部音乐传统或预测音乐潜能。'
  },
  {
    domainId: 'mathematics',
    hookTitle: '一个问题，至少两条路',
    hook: '用 1–2 分钟画出一个可数情境（例如 12 个物品怎样分组），接着 5 分钟找出两种不同解法；最后把其中一个数字换掉，看看方法是否仍然成立。',
    choice: '可以用积木、硬币、路线、时间表或家务分配；答案可以画、说、摆或写，先保留“还没想通”的地方。',
    feedback: '你的方法在哪一步开始依赖这个数字？换一个数字后，哪条关系仍然成立？',
    retry: '只改变一个限制（总数、组数、顺序或允许重复），再画一条新路线并说明为什么。',
    transfer: '把找多条路和检验限制用于预算、烹饪比例、交通路线、数据表或工作排程。',
    ageSupport: {
      early: '照护者用两三个大物品做“放进去、拿出来、还有几个”的变化，顺着孩子看、抓或拒绝；不问对错。',
      preschool: '孩子用大物品找两种分组或排列方式，成人请他用摆放、动作或一句话展示变化。',
      child: '做一个低门槛、可继续扩展的 NRICH 风格问题，记录第一条想法、卡点和第二条尝试。',
      teen: '选择一个生活比例或组合问题，给出图示、计算和边界条件，比较两种方法的效率与局限。',
      adult: '把真实决定转成可计算的变量，先做小模型，再用另一个数字或情境检验它。',
      later: '用熟悉的分配、路线或时间问题，允许口算、纸笔、实物或他人协助；把过程和便利性放在结果前。'
    },
    sourceIds: ['nrich-lthc'],
    evidenceNote: 'NRICH 的 Low Threshold High Ceiling 框架强调人人能开始、可以继续扩展、遇到卡点是问题解决的一部分；适切性取决于先备经验和任务设计，不能把速度或答对次数当作数学天赋。'
  },
  {
    domainId: 'science',
    hookTitle: '先猜一小步，再动一个变量',
    hook: '选一个安全现象（纸片下落、影子、声音杯或冰块融化）。先画出“我猜会怎样”，再只改变一个条件做两次观察，最后把结果分为“看见的、推测的、还不知道的”。',
    choice: '可用家中低风险材料或户外现象；不做入口、火、电、尖锐工具或化学品活动，照护者先检查材料和环境。',
    feedback: '哪一个观察真正区分了两个解释？如果再做一次，你只会改哪个条件？',
    retry: '保持问题不变，只缩短观察时间或换一个位置，看看结果是否可能由光线、风或测量方式造成。',
    transfer: '把“现象—猜想—单变量—记录—修订”带到植物照护、天气、食物变化、机械故障或工作实验。',
    ageSupport: {
      early: '成人展示一个安全、低刺激的变化，孩子可以追视、触摸或转开；由成人记录实际发生什么，不把回应当作科学能力。',
      preschool: '孩子观察一件可重复的现象，先画猜想，成人帮助一次只改变一个条件并说出“我们看见了什么”。',
      child: '用纸张、光影或声音做两次短实验，画出变量、结果和一个还需查证的问题。',
      teen: '从现象写一个可检验问题，设计两组小样本观察，说明控制条件、测量误差和不能推出的结论。',
      adult: '把工作或生活中的疑惑改写成低成本试验，保留原始记录和反例，不把一次结果推广过远。',
      later: '用舒适、可暂停的观察活动记录天气、植物或声音变化；可由他人协助操作，重视好奇和安全。'
    },
    sourceIds: ['exploratorium-tinkering', 'pz-see-think-wonder'],
    evidenceNote: 'Exploratorium 的 Tinkering 研究把动手试做、提问、坚持和社会支架作为可观察过程，Project Zero 提供从观察到解释和提问的记录结构；这些是活动与教学框架，不是实验室诊断或科学能力量表。'
  },
  {
    domainId: 'digital',
    hookTitle: '让一个小想法跑起来',
    hook: '在 Scratch 或熟悉的数字工具里，用 2 分钟写下输入、规则和想要的结果；用 5 分钟做一个只有一条互动的版本；最后请别人按你的说明操作一次，记录一个卡点。',
    choice: '可以做动画、声音按钮、计时器、分类器或纸上伪代码；没有设备时用卡片模拟“如果—那么—否则”。',
    feedback: '别人在哪一步按照说明仍不知道下一步？是规则、界面还是输入没有说清？',
    retry: '只改一个规则或提示文字，再让同一个人测试；保留旧版与新版的差异。',
    transfer: '把拆输入、规则、输出和测试带到表格、自动化、信息检索、数字故事或工作流程。',
    ageSupport: {
      early: '照护者用可按压或可停止的数字声音、灯光或图片，等待孩子主动触发或移开；不要求完成指令或理解程序。',
      preschool: '孩子用图卡排“按一下—发生什么”，成人代为操作，孩子可改一张卡或只观察。',
      child: '做一个有一条规则的小 Scratch 作品，请同伴测试并说出一处不清楚。',
      teen: '把真实小麻烦做成最小可用脚本或交互原型，记录输入边界、错误和下一轮修复。',
      adult: '选一个重复工作，先画流程再实现最小自动化；让非作者按说明操作并记录隐含假设。',
      later: '使用熟悉设备或由陪伴者代操作，做一个提醒、照片排序或声音按钮；把隐私、可撤回和易读性放在前面。'
    },
    sourceIds: ['harvard-creative-computing'],
    evidenceNote: 'Harvard Creative Computing Curriculum 将计算作为表达、兴趣和逐步熟练的活动，提供 Scratch 项目结构；其课堂资源不等于编程能力测验，也不能由一次作品推断职业适配。'
  },
  {
    domainId: 'craft',
    hookTitle: '用手让材料告诉你下一步',
    hook: '选纸、纸盒、线、布或可回收材料，先做一个 2 分钟“没有目标的试拼”；再给它一个小用途（承重、连接、收纳或发出声音），做一版，最后说出一次失败怎样改变了设计。',
    choice: '可以折、绑、编、缝、拼或修补；材料、手部力量和工具安全由参与者决定，作品可以很小、临时或不必保存。',
    feedback: '哪一个具体动作或材料变化让它更能工作？你从哪里知道，而不是凭感觉猜？',
    retry: '只换一个材料厚度、连接方式或支撑点，重新试用并比较哪种限制被改善、哪种新问题出现。',
    transfer: '把试拼—试用—记录—再改带到维修、包装、舞台道具、产品原型、家务收纳或园艺支架。',
    ageSupport: {
      early: '成人提供无小零件、无锐边的大布、纸筒或软积木，跟随孩子抓、推、拍或移开；全程照护，不要求制作结果。',
      preschool: '孩子用大号纸盒和胶带做一个可推、可躲或可装物的小结构，成人只帮忙处理工具和安全。',
      child: '用三种材料做一个能完成单一任务的小物件，先试用再改一个连接处。',
      teen: '围绕真实使用者和限制做纸样原型，记录材料选择、失败点、试用者反馈和下一版取舍。',
      adult: '用可拆卸材料快速制作解决一个真实小麻烦的原型，让使用者试做任务并留下可复盘的迭代记录。',
      later: '选择轻、易握、视线清楚的材料，按坐姿、休息和协助需要制作；重视手感与生活用途，不以精细度排名。'
    },
    sourceIds: ['exploratorium-tinkering'],
    evidenceNote: 'Exploratorium 的 Tinkering 学习研究把想法、材料操作、坚持、提问和社会支持作为可观察的学习过程；研究描述的是特定博物馆环境和框架，不能把作品完成度当作固定创造力。'
  },
  {
    domainId: 'agriculture',
    hookTitle: '照护一小块生长',
    hook: '选一盆安全植物或一小块土。用 2 分钟观察叶色、土壤湿度和光线，做一项低风险照护，再用 3 分钟画下“今天看见了什么、我做了什么、下次要查什么”。',
    choice: '可选发芽、浇水、覆盖、测量、辨认或记录昆虫；按当地季节、植物需求和可用空间调整，不采摘未知植物。',
    feedback: '你记录的是植物的可见变化，还是对原因的猜测？下一次怎样区分水分、光线和时间的影响？',
    retry: '连续两次只改变一个照护条件（位置、浇水量或记录时间），比较变化并保留失败记录。',
    transfer: '把观察—照护—记录迁移到阳台种植、社区花园、食物来源、堆肥、校园生态或家庭食材规划。',
    ageSupport: {
      early: '照护者用安全的大叶植物或照片，让孩子看、摸或转开；成人负责土、种子和工具，孩子的参与不作测验。',
      preschool: '孩子画一片叶子或数几勺土，和成人一起给植物一个可重复的小照护任务。',
      child: '做一张“日期—看见—照护—下一问”植物日志，连续两次只改变一个条件。',
      teen: '选择本地适宜作物，查一条 Extension 资料，设计小面积对照观察并注明季节和土壤限制。',
      adult: '把家庭或社区种植目标拆成光、水、土、时间和维护责任，保留一页可复盘记录。',
      later: '选择易照护植物和可坐着完成的观察，安排提醒或伙伴协助；重视与季节、食物和邻里的连接。'
    },
    sourceIds: ['osu-vegetable-gardening'],
    evidenceNote: 'Oregon State University Extension 的园艺指南支持按日期记录、测量生长和从当地条件选种；气候、土壤和品种差异很大，园艺成功不等于农业知识或生物学能力。'
  },
  {
    domainId: 'home',
    hookTitle: '把一顿饭变成共同计划',
    hook: '用 5–10 分钟把一顿简单饭拆成“选什么、需要什么、谁愿意做哪一步、怎样安全收尾”。让每个人选一项可做的工作，最后问一句“这个安排哪里会让人累或不舒服”。',
    choice: '可选早餐、点心、冷食或只做采购清单；没有烹饪条件时用图片、纸卡或冰箱现有材料模拟。',
    feedback: '每个人是否知道自己的下一步，也知道可以拒绝、换任务或求助的方式？',
    retry: '只改变一个限制（预算、时间、饮食需要或人数），重新排一次任务，保留谁的需要被照顾以及谁还缺支持。',
    transfer: '把分工、材料、顺序和复盘带到收纳、洗衣、家务轮值、照护安排和家庭会议。',
    ageSupport: {
      early: '照护者让孩子看、闻或触摸安全的大物品，成人完成刀具、热源和清洁，孩子可以只观察或停止。',
      preschool: '孩子选一项安全小任务，如撕菜叶、摆餐巾或把图卡排顺序，成人负责卫生和工具。',
      child: '共同做一张简单餐点流程卡，孩子选择一项可独立完成的步骤并请家人反馈。',
      teen: '在预算、营养偏好和时间限制下做一顿饭的计划，实际执行后复盘任务是否公平。',
      adult: '把一次家务或照护流程写成共享清单，询问每个人的边界、负担和备选方案。',
      later: '按体力、视听和工具习惯选择坐着、分段或有人协助的任务；目标是舒适参与和家庭连接。'
    },
    sourceIds: ['usu-family-meals'],
    evidenceNote: 'Utah State University Extension 的 Create Family Meals 提供按年龄分配厨房、采购和计划任务的手册；它是家庭教育实践资源，食物偏好、过敏、预算和文化差异需要本地化，不能把执行顺利当作家庭功能诊断。'
  },
  {
    domainId: 'relationships',
    hookTitle: '先听懂，再回应',
    hook: '邀请一个自愿的人分享一件低风险小事。前 2 分钟只听并记下关键词，接着用一句话复述“我听见你在意……”，请对方纠正；最后问“你想要陪伴、建议还是一起想办法”。',
    choice: '可以面对面、文字、语音或和玩偶练习；分享者可以跳过、暂停或只说事实，关系安全优先于完成流程。',
    feedback: '对方说“你理解对了”还是“还有一处不对”？你的回应有没有抢走对方决定下一步的权利？',
    retry: '只改变一个听法（少问一个问题、放慢速度或先确认情绪），再比较对方是否更容易补充。',
    transfer: '把复述、确认、选择支持方式带到同伴冲突、团队协作、亲子沟通、客户访谈和照护交接。',
    ageSupport: {
      early: '照护者观察孩子的靠近、回避、哭声或放松，短句命名可能的感受并等待；不要求孩子回应或安慰成人。',
      preschool: '用玩偶演“我想要/我不想要”，孩子练习复述一个动作并接受“不是这样”的修正。',
      child: '和同伴轮流讲一件小事，听者先复述、再问想要哪种帮助，允许说“不想继续”。',
      teen: '在安全话题上练习暂停、核对理解和表达边界；冲突升级或涉及伤害时改为求助可信成人。',
      adult: '选择一段真实但可承受的对话，记录哪里做了准确复述，哪里需要道歉、补充或重新约定。',
      later: '用熟悉节奏、清楚音量和可见提示交流；把停顿、重复和不回答都当作有效边界。'
    },
    sourceIds: ['iapc-community'],
    evidenceNote: 'IAPC 的共同探究强调轮流、倾听、复述、在他人观点上继续和尊重地不同意；这里把课堂对话结构缩成低风险关系练习，复杂冲突、虐待或危机需要专业与安全支持，不能由一次对话推断关系质量。'
  },
  {
    domainId: 'society',
    hookTitle: '从一条公共问题找到行动者',
    hook: '找两条关于身边公共问题（垃圾、噪音、无障碍或信息误导）的公开说法。用 2 分钟写“谁发布、说了什么证据”，再用 5 分钟找一个独立来源，最后写下对社区决定有何影响。',
    choice: '可以从社区公告、新闻、机构网页或社交平台开始；不必转发或争辩，只做来源、证据和相互印证的记录。',
    feedback: '哪条信息改变了你的判断？如果没有独立来源，你会怎样诚实地写出“还不知道”？',
    retry: '只替换一个来源或一个关键词，再做一次横向查找，比较结论是否变得更具体或更谨慎。',
    transfer: '把“谁发布—有什么证据—其他来源怎么说”带到公共通知、消费决定、班级议题和社区行动前的核验。',
    ageSupport: {
      early: '照护者和孩子共同观察公共空间的一处变化，孩子可以看、指、停下或离开；成人负责安全，不要求理解制度。',
      preschool: '用玩偶和图卡演“谁需要什么”，孩子选择一个让空间更容易使用的小改动。',
      child: '从一条校园或小区消息开始，圈出发布者、证据和还没核对的地方，不要求孩子公开转发。',
      teen: '用公开信息核对一个公共主张，练习横向查找和区分事实、观点、广告与未知。',
      adult: '为一次社区或工作决定建立来源—证据表，记录利益相关者、分歧和不能确认的部分。',
      later: '从熟悉的社区通知或口述消息开始，可由伙伴协助放大文字、打开来源和记录；保留不转发、不参与的选择。'
    },
    sourceIds: ['dig-reading-like-a-historian'],
    evidenceNote: 'Digital Inquiry Group 的历史与公民探究工作强调来源、证据和相互印证；这里将其迁移到公共信息核验，不能据此推断一个人的公民素养、立场或现实行动效果。'
  },
  {
    domainId: 'movement',
    hookTitle: '找到身体愿意重复的一分钟',
    hook: '先做 30 秒轻松走、坐站、伸展或手臂动作，停下感受呼吸和舒适度；再做一轮 30–60 秒，只改变速度、幅度或姿势中的一个，记录“更容易、一样或不舒服”。',
    choice: '可站、坐、躺、扶墙或只做手指动作；不追求气喘、疼痛或标准姿势，使用稳固空间并保留停止和求助信号。',
    feedback: '哪个改变让你更愿意明天再做？身体给出的停止或调整信号是什么？',
    retry: '把动作缩短或改成坐姿，再做一次比较；如果仍不舒服，结束本次活动，不通过更用力或换动作继续挑战；下次可只做环境观察和活动安排。',
    transfer: '把短时、可调和自我反馈带到通勤、久坐间歇、家务、团队热身或社区活动设计。',
    ageSupport: {
      early: '照护者跟随孩子自然踢腿、伸手、转头或爬行，确保空间安全并及时停下；不比较次数、力量或发育。',
      preschool: '孩子选择动物走、拍手、推墙或坐姿动作，做短片段后说或画“想继续/想停”。',
      child: '设计三种同一动作的难度版本，邀请家人选择舒服的一种，记录如何调整才公平参与。',
      teen: '试一个 1–5 分钟的运动小片段，记录强度、恢复和环境限制；把身体反馈放在计划前。',
      adult: '把 Stanford exercise snack 改成符合自身条件的短活动，观察一天中何时最容易安排，避免把网页建议当医疗处方。',
      later: '可选择熟悉活动，是否坐姿、分段或寻求协助由本人决定；记录舒服节奏，不要求达到统一次数或幅度，有不适时结束活动。'
    },
    sourceIds: ['stanford-exercise-snacks'],
    evidenceNote: 'Stanford Lifestyle Medicine 将 exercise snack 定义为 30 秒至 5 分钟的短时活动，并引用综述与队列研究；页面不是针对个体的运动处方，年龄、疾病、疼痛和环境需要单独调整。'
  }
];

export const domainSources = [
  {
    id: 'pz-see-think-wonder',
    title: 'See, Think, Wonder',
    provider: 'Harvard Graduate School of Education Project Zero',
    url: 'https://www.pz.harvard.edu/resources/see-think-wonder',
    type: 'framework',
    whatItSupports: '用“看见—解释—疑问”三步把观察与推断分开，支持作品、图像、物件和现象的短时探究。',
    limits: '是研究中心开发的教学例程，不是天赋量表或因果干预；材料、语言和引导方式会影响参与。',
    checkedOn: '2026-10-23'
  },
  {
    id: 'iapc-community',
    title: 'IAPC Curriculum',
    provider: 'Institute for the Advancement of Philosophy for Children, Montclair State University',
    url: 'https://digitalcommons.montclair.edu/iapc_curriculum_earlychildhood_curriculum/',
    type: 'practice-guide',
    whatItSupports: '从故事或经验提出问题，组成探究共同体，用澄清、理由、例子、倾听和相互修正推进哲学对话。',
    limits: '课程和教师引导是方法核心；对话质量受安全、语言、权力和主持经验影响，不能把一次表达等同哲学能力。',
    checkedOn: '2026-10-23'
  },
  {
    id: 'dig-reading-like-a-historian',
    title: 'History Lessons: Reading Like a Historian',
    provider: 'Digital Inquiry Group, Stanford history education tradition',
    url: 'https://www.inquirygroup.org/history-lessons',
    type: 'framework',
    whatItSupports: '围绕历史问题使用一手材料，练习来源判断、语境化、相互印证和细读，并用文献证据提出主张。',
    limits: '是课堂历史探究课程；材料选择、阅读能力和历史争议需要额外支架，不能据此判断记忆或推理天赋。',
    checkedOn: '2026-10-23'
  },
  {
    id: 'nrich-lthc',
    title: 'Low Threshold High Ceiling: An Introduction',
    provider: 'NRICH, University of Cambridge',
    url: 'https://nrich.maths.org/articles/low-threshold-high-ceiling-introduction',
    type: 'framework',
    whatItSupports: '设计人人能开始、可持续扩展并允许遇到卡点的数学任务，鼓励多条路径和对卡点的反思。',
    limits: '“低门槛”随年龄和先备经验而变；文章是任务设计框架，不是数学能力评估或长期效果研究。',
    checkedOn: '2026-10-23'
  },
  {
    id: 'harvard-creative-computing',
    title: 'Creative Computing Curriculum',
    provider: 'Creative Computing Lab, Harvard Graduate School of Education',
    url: 'https://creativecomputing.gse.harvard.edu/creative-computing-curriculum/',
    type: 'practice-guide',
    whatItSupports: '以兴趣、表达和逐步熟练为入口，用 Scratch 活动练习计算思维、创作、分享和修改。',
    limits: '面向入门计算创作的课程资源，不是编程能力测验；设备、语言和同伴反馈会影响作品表现。',
    checkedOn: '2026-10-23'
  },
  {
    id: 'exploratorium-tinkering',
    title: 'Science Learning in Everyday Life: Making and Tinkering in a Tinkering Studio',
    provider: 'Exploratorium / museum learning research',
    url: 'https://www.exploratorium.edu/sites/default/files/pdfs/stem-rich-tinkering.pdf',
    type: 'paper',
    whatItSupports: '把动手试做中的主动性、坚持、提问、材料推理和社会支架作为可观察过程来记录。',
    limits: '研究描述特定博物馆环境和学习框架，仍需要更多情境、学科和评价研究；不能把作品完成度当作固定创造力。',
    checkedOn: '2026-10-23'
  },
  {
    id: 'osu-vegetable-gardening',
    title: "An Educator's Guide to Vegetable Gardening",
    provider: 'Oregon State University Extension Service',
    url: 'https://extension.oregonstate.edu/sites/default/files/documents/em9032.pdf',
    type: 'practice-guide',
    whatItSupports: '按当地条件选择作物，使用观察日志、日期和简单测量记录植物生长，并将园艺连接到科学、数学和食物。',
    limits: '园艺建议受地区、季节、土壤和品种影响；活动资源不证明某人具备农业天赋或长期生产效果。',
    checkedOn: '2026-10-23'
  },
  {
    id: 'usu-family-meals',
    title: 'Create Family Meals: Curriculum & Handouts',
    provider: 'Utah State University Extension',
    url: 'https://extension.usu.edu/fscreate/create-family-meals',
    type: 'practice-guide',
    whatItSupports: '按年龄分配备餐、采购、计划和收尾任务，让家庭在真实生活中练习分工与共同计划。',
    limits: '面向家庭营养教育和生活技能；饮食文化、过敏、预算和安全条件需要本地化，家庭参与不等于家庭功能测量。',
    checkedOn: '2026-10-23'
  },
  {
    id: 'stanford-exercise-snacks',
    title: 'What Are Exercise Snacks and Why Are They Important?',
    provider: 'Stanford Lifestyle Medicine, Stanford University',
    url: 'https://lifestylemedicine.stanford.edu/what-are-exercise-snacks-and-why-are-they-important/',
    type: 'practice-guide',
    whatItSupports: '把短时、可重复的身体活动嵌入日常，并观察强度、恢复和是否能打断久坐。',
    limits: '页面综合综述和观察性研究，短活动不能替代个体化运动指导；疾病、疼痛、年龄和环境需要专业或照护调整。',
    checkedOn: '2026-10-23'
  },
  {
    id: 'berklee-groove',
    title: 'Create Your Own Afro-Latin Groove',
    provider: 'Berklee College of Music PULSE',
    url: 'https://pulse.berklee.edu/?id=4&lesson=15',
    type: 'practice-guide',
    whatItSupports: '通过聆听、模仿、身体或打击乐表现、节奏组合和即兴创作理解节拍与结构。',
    limits: '材料聚焦特定音乐传统和课程顺序；不代表全部音乐文化，也不能用一次节奏表现预测音乐潜能。',
    checkedOn: '2026-10-23'
  }
];
